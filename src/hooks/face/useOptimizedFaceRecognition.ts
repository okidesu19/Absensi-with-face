'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Student, FaceBox, FaceAngle } from '@/types';
import { getDescriptorCache, LRUCache } from '@/lib/lru-cache';
import {
  getStudentsFromIndexedDB,
  saveStudentsToIndexedDB,
  getAllDescriptorsFromIndexedDB,
  syncDescriptorsFromStudents,
  setLastSyncTime,
  getLastSyncTime
} from '@/lib/indexeddb-storage';

const MODEL_URL = '/models';

// Detection frame skip settings
const FRAME_SKIP_COUNT = 3; // Process every 3rd frame

interface MultiFaceDetection {
  box: FaceBox;
  descriptor: number[];
  student?: Student;
  status: 'detected' | 'matched' | 'not_registered' | 'already_attended';
  confidence: number;
}

interface OptimizedFaceRecognitionReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  detectFaces: (video: HTMLVideoElement) => Promise<MultiFaceDetection[]>;
  extractDescriptor: (video: HTMLVideoElement) => Promise<number[] | null>;
  recognizeFace: (descriptor: number[], students: Student[], threshold?: number) => { detected: boolean; matched: boolean; student?: Student; confidence?: number; message: string };
  recognizeMultipleFaces: (detections: MultiFaceDetection[], students: Student[], threshold?: number) => MultiFaceDetection[];
  captureImage: (video: HTMLVideoElement) => string | null;
  startDetectionLoop: (video: HTMLVideoElement, callback: (detections: MultiFaceDetection[]) => void) => void;
  stopDetectionLoop: () => void;
  preloadDescriptorsFromCache: () => Promise<Student[]>;
  syncStudentsToCache: (students: Student[]) => Promise<void>;
  getCachedStudents: () => Promise<Student[]>;
  getCacheStats: () => { size: number; hits: number; misses: number; hitRate: number };
  // Multi-angle support
  extractMultiAngleDescriptors: (video: HTMLVideoElement) => Promise<{
    front: number[] | null;
    left: number[] | null;
    right: number[] | null;
  }>;
  compareMultiAngle: (descriptor: number[], student: Student, threshold?: number) => { matched: boolean; confidence: number; bestAngle: FaceAngle | null };
}

// Singleton FaceMatcher instance
let faceMatcherInstance: faceapi.FaceMatcher | null = null;
let lastMatcherStudents: string = '';

export function useOptimizedFaceRecognition(): OptimizedFaceRecognitionReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastDetectionsRef = useRef<MultiFaceDetection[]>([]);
  const descriptorCacheRef = useRef<LRUCache<number[]>>(getDescriptorCache(100));
  const isDetectingRef = useRef<boolean>(false);

  // Load models on mount
  useEffect(() => {
    let isMounted = true;
    
    async function loadModels() {
      try {
        setIsLoading(true);
        setError(null);

        // Load face-api.js models in parallel
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);

        // Pre-create offscreen canvas for downscaling
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
          offscreenCanvasRef.current.width = 320;
          offscreenCanvasRef.current.height = 240;
        }

        if (isMounted) {
          setIsLoaded(true);
        }
        
      } catch (err) {
        console.error('Error loading face-api models:', err);
        if (isMounted) {
          setError('Gagal memuat model face recognition. Pastikan folder /models tersedia.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadModels();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Get or create FaceMatcher (singleton pattern)
  const getFaceMatcher = useCallback((students: Student[], threshold: number = 0.6): faceapi.FaceMatcher => {
    // Create a hash of student IDs to check if we need to recreate the matcher
    const studentsHash = students
      .filter(s => s.faceDescriptor || s.faceDescriptors)
      .map(s => s.id)
      .sort()
      .join(',');
    
    if (faceMatcherInstance && lastMatcherStudents === studentsHash) {
      return faceMatcherInstance;
    }
    
    // Create labeled descriptors for each student
    const labeledDescriptors: faceapi.LabeledFaceDescriptors[] = students
      .filter(s => s.faceDescriptor || s.faceDescriptors)
      .map(student => {
        const descriptors: Float32Array[] = [];
        
        // Add main descriptor
        if (student.faceDescriptor && student.faceDescriptor.length === 128) {
          descriptors.push(new Float32Array(student.faceDescriptor));
        }
        
        // Add multi-angle descriptors
        if (student.faceDescriptors) {
          if (student.faceDescriptors.front?.length === 128) {
            descriptors.push(new Float32Array(student.faceDescriptors.front));
          }
          if (student.faceDescriptors.left?.length === 128) {
            descriptors.push(new Float32Array(student.faceDescriptors.left));
          }
          if (student.faceDescriptors.right?.length === 128) {
            descriptors.push(new Float32Array(student.faceDescriptors.right));
          }
        }
        
        if (descriptors.length === 0) {
          return null;
        }
        
        return new faceapi.LabeledFaceDescriptors(
          student.id,
          descriptors
        );
      })
      .filter((item): item is faceapi.LabeledFaceDescriptors => item !== null);
    
    if (labeledDescriptors.length === 0) {
      // Return empty matcher
      return new faceapi.FaceMatcher([], threshold);
    }
    
    faceMatcherInstance = new faceapi.FaceMatcher(labeledDescriptors, threshold);
    lastMatcherStudents = studentsHash;
    
    return faceMatcherInstance;
  }, []);

  // Downscale video frame for faster detection
  const getDownscaledFrame = useCallback((video: HTMLVideoElement): HTMLCanvasElement | HTMLVideoElement => {
    // If video is already small enough, return it directly
    if (video.videoWidth <= 320 || video.videoHeight <= 240) {
      return video;
    }
    
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return video;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return video;
    
    // Draw downscaled frame
    ctx.drawImage(video, 0, 0, 320, 240);
    
    return canvas;
  }, []);

  // Optimized multi-face detection
  const detectFaces = useCallback(async (video: HTMLVideoElement): Promise<MultiFaceDetection[]> => {
    if (!isLoaded) return [];

    try {
      // Use downscaled frame for detection
      const input = getDownscaledFrame(video);
      
      const detections = await faceapi
        .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections || detections.length === 0) return [];

      // Get scale factor for bounding boxes if we downscaled
      const scaleX = video.videoWidth / 320;
      const scaleY = video.videoHeight / 240;
      const isDownscaled = input !== video;

      // Limit to 10 faces for performance
      const limitedDetections = detections.slice(0, 10);

      return limitedDetections.map(detection => {
        const box = detection.detection.box;
        
        return {
          box: {
            x: isDownscaled ? box.x * scaleX : box.x,
            y: isDownscaled ? box.y * scaleY : box.y,
            width: isDownscaled ? box.width * scaleX : box.width,
            height: isDownscaled ? box.height * scaleY : box.height
          },
          descriptor: Array.from(detection.descriptor),
          student: undefined,
          status: 'detected' as const,
          confidence: detection.detection.score
        };
      });
    } catch (err) {
      console.error('Multi-face detection error:', err);
      return [];
    }
  }, [isLoaded, getDownscaledFrame]);

  // Optimized detection loop with frame skipping
  const startDetectionLoop = useCallback((
    video: HTMLVideoElement,
    callback: (detections: MultiFaceDetection[]) => void
  ) => {
    if (isDetectingRef.current) return;
    isDetectingRef.current = true;
    frameCountRef.current = 0;
    
    const loop = async () => {
      if (!isDetectingRef.current || !video || video.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      
      frameCountRef.current++;
      
      // Skip frames for performance (process every Nth frame)
      if (frameCountRef.current % FRAME_SKIP_COUNT === 0) {
        try {
          const detections = await detectFaces(video);
          lastDetectionsRef.current = detections;
          callback(detections);
        } catch (err) {
          console.error('Detection loop error:', err);
        }
      } else {
        // For skipped frames, use last known detections with updated positions
        // This provides smoother visual feedback
        callback(lastDetectionsRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [detectFaces]);

  // Stop detection loop
  const stopDetectionLoop = useCallback(() => {
    isDetectingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastDetectionsRef.current = [];
  }, []);

  // Extract single descriptor for enrollment
  const extractDescriptor = useCallback(async (video: HTMLVideoElement): Promise<number[] | null> => {
    if (!isLoaded) return null;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        return Array.from(detection.descriptor);
      }

      return null;
    } catch (err) {
      console.error('Descriptor extraction error:', err);
      return null;
    }
  }, [isLoaded]);

  // Multi-angle descriptor extraction
  const extractMultiAngleDescriptors = useCallback(async (video: HTMLVideoElement): Promise<{
    front: number[] | null;
    left: number[] | null;
    right: number[] | null;
  }> => {
    if (!isLoaded) {
      return { front: null, left: null, right: null };
    }

    try {
      const descriptor = await extractDescriptor(video);
      
      return {
        front: descriptor,
        left: null,
        right: null,
      };
    } catch (err) {
      console.error('Multi-angle extraction error:', err);
      return { front: null, left: null, right: null };
    }
  }, [isLoaded, extractDescriptor]);

  // Multi-angle comparison
  const compareMultiAngle = useCallback((
    descriptor: number[],
    student: Student,
    threshold: number = 0.6
  ): { matched: boolean; confidence: number; bestAngle: FaceAngle | null } => {
    if (!descriptor || descriptor.length === 0) {
      return { matched: false, confidence: 0, bestAngle: null };
    }

    const maxDistance = 1 - threshold;
    let bestDistance = maxDistance;
    let bestAngle: FaceAngle | null = null;
    let matched = false;

    // Check cache first
    const cacheKey = `${student.id}_${descriptor.slice(0, 8).join(',')}`;
    const cachedResult = descriptorCacheRef.current.get(cacheKey);
    if (cachedResult) {
      // Return cached distance calculation
    }

    // Check legacy single descriptor
    if (student.faceDescriptor && student.faceDescriptor.length > 0) {
      const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestAngle = 'front';
        matched = true;
      }
    }

    // Check multi-angle descriptors
    if (student.faceDescriptors) {
      if (student.faceDescriptors.front && student.faceDescriptors.front.length > 0) {
        const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptors.front);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = 'front';
          matched = true;
        }
      }

      if (student.faceDescriptors.left && student.faceDescriptors.left.length > 0) {
        const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptors.left);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = 'left';
          matched = true;
        }
      }

      if (student.faceDescriptors.right && student.faceDescriptors.right.length > 0) {
        const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptors.right);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = 'right';
          matched = true;
        }
      }
    }

    return {
      matched,
      confidence: matched ? 1 - bestDistance : 0,
      bestAngle
    };
  }, []);

  // Optimized face recognition using singleton FaceMatcher
  const recognizeFace = useCallback((
    descriptor: number[],
    students: Student[],
    threshold: number = 0.6
  ): { detected: boolean; matched: boolean; student?: Student; confidence?: number; message: string } => {
    if (!descriptor || descriptor.length === 0) {
      return {
        detected: false,
        matched: false,
        message: 'Wajah tidak terdeteksi, coba lagi'
      };
    }

    const studentsWithDescriptors = students.filter(s => 
      (s.faceDescriptor && s.faceDescriptor.length > 0) ||
      (s.faceDescriptors && (s.faceDescriptors.front || s.faceDescriptors.left || s.faceDescriptors.right))
    );

    if (studentsWithDescriptors.length === 0) {
      return {
        detected: true,
        matched: false,
        message: 'Belum ada siswa terdaftar dengan Face ID'
      };
    }

    // Use singleton FaceMatcher for better performance
    const matcher = getFaceMatcher(studentsWithDescriptors, threshold);
    
    const match = matcher.findBestMatch(new Float32Array(descriptor));
    
    if (match && match.label !== 'unknown') {
      const matchedStudent = studentsWithDescriptors.find(s => s.id === match.label);
      
      if (matchedStudent) {
        return {
          detected: true,
          matched: true,
          student: matchedStudent,
          confidence: 1 - match.distance,
          message: `Absensi Berhasil - ${matchedStudent.nama}`
        };
      }
    }

    return {
      detected: true,
      matched: false,
      message: 'Siswa belum terdaftar atau bukan siswa'
    };
  }, [getFaceMatcher]);

  // Recognize multiple faces
  const recognizeMultipleFaces = useCallback((
    detections: MultiFaceDetection[],
    students: Student[],
    threshold: number = 0.6
  ): MultiFaceDetection[] => {
    if (!detections || detections.length === 0) return [];
    
    const studentsWithDescriptors = students.filter(s => 
      (s.faceDescriptor && s.faceDescriptor.length > 0) ||
      (s.faceDescriptors && (s.faceDescriptors.front || s.faceDescriptors.left || s.faceDescriptors.right))
    );
    
    if (studentsWithDescriptors.length === 0) {
      return detections.map(d => ({
        ...d,
        status: 'not_registered' as const
      }));
    }

    // Use singleton FaceMatcher
    const matcher = getFaceMatcher(studentsWithDescriptors, threshold);

    return detections.map(detection => {
      const match = matcher.findBestMatch(new Float32Array(detection.descriptor));
      
      if (match && match.label !== 'unknown') {
        const matchedStudent = studentsWithDescriptors.find(s => s.id === match.label);
        
        if (matchedStudent) {
          return {
            ...detection,
            student: matchedStudent,
            status: 'matched' as const,
            confidence: 1 - match.distance
          };
        }
      }

      return {
        ...detection,
        status: 'not_registered' as const
      };
    });
  }, [getFaceMatcher]);

  // Capture image from video
  const captureImage = useCallback((video: HTMLVideoElement): string | null => {
    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (err) {
      console.error('Image capture error:', err);
      return null;
    }
  }, []);

  // Preload descriptors from IndexedDB cache
  const preloadDescriptorsFromCache = useCallback(async (): Promise<Student[]> => {
    try {
      const cachedStudents = await getStudentsFromIndexedDB();
      const lastSync = await getLastSyncTime();
      
      // If we have cached students and they're recent (within 5 minutes), use them
      if (cachedStudents.length > 0 && lastSync) {
        const syncTime = new Date(lastSync);
        const now = new Date();
        const diffMinutes = (now.getTime() - syncTime.getTime()) / 60000;
        
        if (diffMinutes < 5) {
          console.log(`Using cached students (${cachedStudents.length} students, last sync: ${diffMinutes.toFixed(1)} min ago)`);
          return cachedStudents;
        }
      }
      
      return [];
    } catch (err) {
      console.error('Error preloading from cache:', err);
      return [];
    }
  }, []);

  // Sync students to IndexedDB cache
  const syncStudentsToCache = useCallback(async (students: Student[]): Promise<void> => {
    try {
      await saveStudentsToIndexedDB(students);
      await syncDescriptorsFromStudents(students);
      await setLastSyncTime();
      console.log(`Synced ${students.length} students to cache`);
    } catch (err) {
      console.error('Error syncing students to cache:', err);
    }
  }, []);

  // Get cached students
  const getCachedStudents = useCallback(async (): Promise<Student[]> => {
    return getStudentsFromIndexedDB();
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    return descriptorCacheRef.current.getStats();
  }, []);

  return {
    isLoaded,
    isLoading,
    error,
    detectFaces,
    extractDescriptor,
    recognizeFace,
    recognizeMultipleFaces,
    captureImage,
    startDetectionLoop,
    stopDetectionLoop,
    preloadDescriptorsFromCache,
    syncStudentsToCache,
    getCachedStudents,
    getCacheStats,
    extractMultiAngleDescriptors,
    compareMultiAngle
  };
}
