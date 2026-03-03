'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Student, FaceAngle } from '@/types';
import { 
  euclideanDistance, 
  cosineSimilarity, 
  findBestMatch,
  calculateUpdatedDescriptor,
  shouldUpdateDescriptor,
  WeightedMatchResult
} from '@/lib/face-matching';
import {
  preprocessFace,
  validateFaceQuality,
  performLivenessCheck,
  FaceQualityResult,
  LivenessResult
} from '@/lib/face-preprocessing';
import {
  getDescriptorCache,
  LRUCache
} from '@/lib/lru-cache';

const MODEL_URL = '/models';

// Detection frame skip settings
const FRAME_SKIP_COUNT = 3;

// Quality thresholds
const QUALITY_THRESHOLDS = {
  minBrightness: 40,
  maxBrightness: 200,
  minSharpness: 0.5,
  minFaceSize: 100,
  maxPoseYaw: 30,
  maxPosePitch: 20
};

// Matching thresholds
const MATCHING_CONFIG = {
  baseThreshold: 0.6,
  minConfidence: 0.65,
  minGap: 0.1,
  weights: { euclidean: 0.7, cosine: 0.3 }
};

export interface MultiAngleDescriptor {
  front: number[] | null;
  left: number[] | null;
  right: number[] | null;
}

export interface EnrollmentState {
  currentAngle: FaceAngle;
  capturedAngles: FaceAngle[];
  descriptors: MultiAngleDescriptor;
  qualityResults: { [key in FaceAngle]?: FaceQualityResult };
  instructions: string;
  isComplete: boolean;
}

export interface AdvancedDetectionResult {
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
  student?: Student;
  status: 'detected' | 'matched' | 'not_registered' | 'already_attended' | 'poor_quality' | 'liveness_failed';
  confidence: number;
  quality?: FaceQualityResult;
  liveness?: LivenessResult;
  matchResult?: WeightedMatchResult;
}

interface UseAdvancedFaceRecognitionReturn {
  // Model state
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Detection functions
  detectFaces: (video: HTMLVideoElement) => Promise<AdvancedDetectionResult[]>;
  extractDescriptor: (video: HTMLVideoElement) => Promise<number[] | null>;
  
  // Matching functions
  recognizeFace: (descriptor: number[], students: Student[]) => WeightedMatchResult;
  recognizeMultipleFaces: (detections: AdvancedDetectionResult[], students: Student[]) => AdvancedDetectionResult[];
  
  // Enrollment functions
  startEnrollment: () => void;
  captureAngle: (video: HTMLVideoElement, angle: FaceAngle) => Promise<{ success: boolean; quality?: FaceQualityResult; error?: string }>;
  getEnrollmentState: () => EnrollmentState;
  resetEnrollment: () => void;
  completeEnrollment: () => MultiAngleDescriptor;
  
  // Quality functions
  validateQuality: (video: HTMLVideoElement, faceBox: { x: number; y: number; width: number; height: number }) => Promise<FaceQualityResult>;
  
  // Liveness functions
  performLivenessCheck: (video: HTMLVideoElement, durationMs?: number) => Promise<LivenessResult>;
  
  // Continuous learning
  updateDescriptor: (studentId: string, newDescriptor: number[], currentDescriptor: number[]) => number[];
  
  // Detection loop
  startDetectionLoop: (video: HTMLVideoElement, callback: (detections: AdvancedDetectionResult[]) => void) => void;
  stopDetectionLoop: () => void;
  
  // Cache functions
  getCacheStats: () => { size: number; hits: number; misses: number; hitRate: number };
  
  // Utility
  captureImage: (video: HTMLVideoElement) => string | null;
}

// Singleton instances
let faceMatcherInstance: faceapi.FaceMatcher | null = null;
let lastMatcherStudentsHash: string = '';

export function useAdvancedFaceRecognition(): UseAdvancedFaceRecognitionReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastDetectionsRef = useRef<AdvancedDetectionResult[]>([]);
  const descriptorCacheRef = useRef<LRUCache<number[]>>(getDescriptorCache(100));
  const isDetectingRef = useRef<boolean>(false);
  
  // Enrollment state
  const enrollmentStateRef = useRef<EnrollmentState>({
    currentAngle: 'front',
    capturedAngles: [],
    descriptors: { front: null, left: null, right: null },
    qualityResults: {},
    instructions: 'Hadapkan wajah lurus ke depan',
    isComplete: false
  });
  const [, forceUpdate] = useState({});

  // Load models on mount
  useEffect(() => {
    let isMounted = true;
    
    async function loadModels() {
      try {
        setIsLoading(true);
        setError(null);

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);

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

  // Get downscaled frame
  const getDownscaledFrame = useCallback((video: HTMLVideoElement): HTMLCanvasElement | HTMLVideoElement => {
    if (video.videoWidth <= 320 || video.videoHeight <= 240) {
      return video;
    }
    
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return video;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return video;
    
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas;
  }, []);

  // Detect faces with quality validation
  const detectFaces = useCallback(async (video: HTMLVideoElement): Promise<AdvancedDetectionResult[]> => {
    if (!isLoaded) return [];

    try {
      const input = getDownscaledFrame(video);
      
      const detections = await faceapi
        .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections || detections.length === 0) return [];

      const scaleX = video.videoWidth / 320;
      const scaleY = video.videoHeight / 240;
      const isDownscaled = input !== video;

      const limitedDetections = detections.slice(0, 10);

      const results: AdvancedDetectionResult[] = [];

      for (const detection of limitedDetections) {
        const box = detection.detection.box;
        const faceBox = {
          x: isDownscaled ? box.x * scaleX : box.x,
          y: isDownscaled ? box.y * scaleY : box.y,
          width: isDownscaled ? box.width * scaleX : box.width,
          height: isDownscaled ? box.height * scaleY : box.height
        };

        // Get landmarks for quality check
        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose();

        const landmarkPositions = {
          leftEye: { x: leftEye[0].x * scaleX, y: leftEye[0].y * scaleY },
          rightEye: { x: rightEye[3].x * scaleX, y: rightEye[3].y * scaleY },
          nose: { x: nose[3].x * scaleX, y: nose[3].y * scaleY }
        };

        // Validate quality
        const quality = await validateQuality(video, faceBox);

        results.push({
          box: faceBox,
          descriptor: Array.from(detection.descriptor),
          status: quality.isValid ? 'detected' : 'poor_quality',
          confidence: detection.detection.score,
          quality
        });
      }

      return results;
    } catch (err) {
      console.error('Face detection error:', err);
      return [];
    }
  }, [isLoaded, getDownscaledFrame]);

  // Extract descriptor for enrollment
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

  // Recognize single face
  const recognizeFace = useCallback((descriptor: number[], students: Student[]): WeightedMatchResult => {
    return findBestMatch(descriptor, students, MATCHING_CONFIG);
  }, []);

  // Recognize multiple faces
  const recognizeMultipleFaces = useCallback((
    detections: AdvancedDetectionResult[],
    students: Student[]
  ): AdvancedDetectionResult[] => {
    if (!detections || detections.length === 0) return [];

    return detections.map(detection => {
      if (detection.status === 'poor_quality') {
        return detection;
      }

      const matchResult = recognizeFace(detection.descriptor, students);

      if (matchResult.matched && matchResult.student) {
        return {
          ...detection,
          student: matchResult.student,
          status: 'matched',
          confidence: matchResult.confidence,
          matchResult
        };
      }

      return {
        ...detection,
        status: 'not_registered',
        matchResult
      };
    });
  }, [recognizeFace]);

  // Enrollment functions
  const startEnrollment = useCallback(() => {
    enrollmentStateRef.current = {
      currentAngle: 'front',
      capturedAngles: [],
      descriptors: { front: null, left: null, right: null },
      qualityResults: {},
      instructions: 'Hadapkan wajah lurus ke depan',
      isComplete: false
    };
    forceUpdate({});
  }, []);

  const captureAngle = useCallback(async (
    video: HTMLVideoElement,
    angle: FaceAngle
  ): Promise<{ success: boolean; quality?: FaceQualityResult; error?: string }> => {
    if (!isLoaded) {
      return { success: false, error: 'Model belum siap' };
    }

    try {
      // Detect face first
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        return { success: false, error: 'Wajah tidak terdeteksi' };
      }

      const faceBox = {
        x: detection.detection.box.x,
        y: detection.detection.box.y,
        width: detection.detection.box.width,
        height: detection.detection.box.height
      };

      // Validate quality
      const quality = await validateQuality(video, faceBox);
      
      if (!quality.isValid) {
        return { 
          success: false, 
          quality, 
          error: quality.issues[0] || 'Kualitas wajah tidak memenuhi syarat'
        };
      }

      // Validate pose for angle
      if (angle === 'front' && quality.poseAngle.yaw > 15) {
        return { 
          success: false, 
          quality, 
          error: 'Mohon hadap lurus ke depan'
        };
      }
      
      if (angle === 'left' && quality.poseAngle.yaw < 5) {
        return { 
          success: false, 
          quality, 
          error: 'Mohon hadap sedikit ke kiri'
        };
      }
      
      if (angle === 'right' && quality.poseAngle.yaw < 5) {
        return { 
          success: false, 
          quality, 
          error: 'Mohon hadap sedikit ke kanan'
        };
      }

      // Store descriptor
      const descriptor = Array.from(detection.descriptor);
      enrollmentStateRef.current.descriptors[angle] = descriptor;
      enrollmentStateRef.current.qualityResults[angle] = quality;
      enrollmentStateRef.current.capturedAngles.push(angle);

      // Update instructions
      const remaining: FaceAngle[] = ['front', 'left', 'right'].filter(
        a => !enrollmentStateRef.current.capturedAngles.includes(a as FaceAngle)
      ) as FaceAngle[];

      if (remaining.length === 0) {
        enrollmentStateRef.current.isComplete = true;
        enrollmentStateRef.current.instructions = 'Pendaftaran wajah selesai!';
      } else {
        const nextAngle = remaining[0];
        enrollmentStateRef.current.currentAngle = nextAngle;
        
        switch (nextAngle) {
          case 'left':
            enrollmentStateRef.current.instructions = 'Hadapkan wajah sedikit ke kiri (±15°)';
            break;
          case 'right':
            enrollmentStateRef.current.instructions = 'Hadapkan wajah sedikit ke kanan (±15°)';
            break;
          default:
            enrollmentStateRef.current.instructions = 'Hadapkan wajah lurus ke depan';
        }
      }

      forceUpdate({});
      
      return { success: true, quality };
    } catch (err) {
      console.error('Capture angle error:', err);
      return { success: false, error: 'Terjadi kesalahan saat menangkap wajah' };
    }
  }, [isLoaded]);

  const getEnrollmentState = useCallback((): EnrollmentState => {
    return { ...enrollmentStateRef.current };
  }, []);

  const resetEnrollment = useCallback(() => {
    startEnrollment();
  }, [startEnrollment]);

  const completeEnrollment = useCallback((): MultiAngleDescriptor => {
    return { ...enrollmentStateRef.current.descriptors };
  }, []);

  // Quality validation
  const validateQuality = useCallback(async (
    video: HTMLVideoElement,
    faceBox: { x: number; y: number; width: number; height: number }
  ): Promise<FaceQualityResult> => {
    // Detect landmarks for pose estimation
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      let landmarks = undefined;
      if (detection) {
        const leftEye = detection.landmarks.getLeftEye();
        const rightEye = detection.landmarks.getRightEye();
        const nose = detection.landmarks.getNose();

        landmarks = {
          leftEye: { x: leftEye[0].x, y: leftEye[0].y },
          rightEye: { x: rightEye[3].x, y: rightEye[3].y },
          nose: { x: nose[3].x, y: nose[3].y }
        };
      }

      return validateFaceQuality(video, faceBox, landmarks);
    } catch {
      return validateFaceQuality(video, faceBox);
    }
  }, []);

  // Liveness check
  const performLivenessCheckFn = useCallback(async (
    video: HTMLVideoElement,
    durationMs: number = 3000
  ): Promise<LivenessResult> => {
    const earHistory: number[] = [];
    const boxHistory: { x: number; y: number; width: number; height: number }[] = [];
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < durationMs) {
      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks();

        if (detection) {
          const box = detection.detection.box;
          boxHistory.push({ x: box.x, y: box.y, width: box.width, height: box.height });

          // Calculate EAR
          const leftEye = detection.landmarks.getLeftEye();
          const rightEye = detection.landmarks.getRightEye();
          
          if (leftEye.length >= 6 && rightEye.length >= 6) {
            const leftEAR = calculateEARFromLandmarks(leftEye);
            const rightEAR = calculateEARFromLandmarks(rightEye);
            earHistory.push((leftEAR + rightEAR) / 2);
          }
        }
      } catch (err) {
        console.error('Liveness check error:', err);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Get last face box for texture analysis
    const lastBox = boxHistory[boxHistory.length - 1];
    if (!lastBox) {
      return {
        isLive: false,
        blinkCount: 0,
        movementScore: 0,
        challengesPassed: [],
        issues: ['Wajah tidak terdeteksi']
      };
    }

    return performLivenessCheck(video, lastBox, { earHistory, boxHistory });
  }, []);

  // Continuous learning - update descriptor
  const updateDescriptor = useCallback((
    studentId: string,
    newDescriptor: number[],
    currentDescriptor: number[]
  ): number[] => {
    return calculateUpdatedDescriptor(currentDescriptor, newDescriptor, 0.1);
  }, []);

  // Detection loop
  const startDetectionLoop = useCallback((
    video: HTMLVideoElement,
    callback: (detections: AdvancedDetectionResult[]) => void
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
      
      if (frameCountRef.current % FRAME_SKIP_COUNT === 0) {
        try {
          const detections = await detectFaces(video);
          lastDetectionsRef.current = detections;
          callback(detections);
        } catch (err) {
          console.error('Detection loop error:', err);
        }
      } else {
        callback(lastDetectionsRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [detectFaces]);

  const stopDetectionLoop = useCallback(() => {
    isDetectingRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastDetectionsRef.current = [];
  }, []);

  // Cache stats
  const getCacheStats = useCallback(() => {
    return descriptorCacheRef.current.getStats();
  }, []);

  // Capture image
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

  return {
    isLoaded,
    isLoading,
    error,
    detectFaces,
    extractDescriptor,
    recognizeFace,
    recognizeMultipleFaces,
    startEnrollment,
    captureAngle,
    getEnrollmentState,
    resetEnrollment,
    completeEnrollment,
    validateQuality,
    performLivenessCheck: performLivenessCheckFn,
    updateDescriptor,
    startDetectionLoop,
    stopDetectionLoop,
    getCacheStats,
    captureImage
  };
}

// Helper function to calculate EAR from landmarks
function calculateEARFromLandmarks(eyeLandmarks: faceapi.Point[]): number {
  if (eyeLandmarks.length < 6) return 0.3;
  
  // Vertical distances
  const v1 = distance(eyeLandmarks[1], eyeLandmarks[5]);
  const v2 = distance(eyeLandmarks[2], eyeLandmarks[4]);
  
  // Horizontal distance
  const h = distance(eyeLandmarks[0], eyeLandmarks[3]);
  
  if (h === 0) return 0.3;
  
  return (v1 + v2) / (2 * h);
}

function distance(p1: faceapi.Point, p2: faceapi.Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}
