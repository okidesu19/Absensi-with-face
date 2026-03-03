'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Student, DetectionResult, FaceBox, FaceAngle } from '@/types';

const MODEL_URL = '/models';

interface MultiFaceDetection {
  box: FaceBox;
  descriptor: number[];
  student?: Student;
  status: 'detected' | 'matched' | 'not_registered' | 'already_attended';
  confidence: number;
}

interface UseFaceRecognitionReturn {
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  detectFaces: (video: HTMLVideoElement) => Promise<MultiFaceDetection[]>;
  extractDescriptor: (video: HTMLVideoElement) => Promise<number[] | null>;
  recognizeFace: (descriptor: number[], students: Student[], threshold?: number) => DetectionResult;
  recognizeMultipleFaces: (detections: MultiFaceDetection[], students: Student[], threshold?: number) => MultiFaceDetection[];
  captureImage: (video: HTMLVideoElement) => string | null;
  // Multi-angle support
  extractMultiAngleDescriptors: (video: HTMLVideoElement) => Promise<{
    front: number[] | null;
    left: number[] | null;
    right: number[] | null;
  }>;
  compareMultiAngle: (descriptor: number[], student: Student, threshold?: number) => { matched: boolean; confidence: number; bestAngle: FaceAngle | null };
}

export function useFaceRecognition(): UseFaceRecognitionReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    async function loadModels() {
      try {
        setIsLoading(true);
        setError(null);

        // Load face-api.js models
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);

        setIsLoaded(true);
      } catch (err) {
        console.error('Error loading face-api models:', err);
        setError('Gagal memuat model face recognition. Pastikan folder /models tersedia.');
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, []);

  const detectFaces = useCallback(async (video: HTMLVideoElement): Promise<MultiFaceDetection[]> => {
    if (!isLoaded) return [];

    try {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 416, 
          scoreThreshold: 0.5 
        }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!detections || detections.length === 0) return [];

      // Limit to 10 faces for performance
      const limitedDetections = detections.slice(0, 10);

      return limitedDetections.map(detection => ({
        box: {
          x: detection.detection.box.x,
          y: detection.detection.box.y,
          width: detection.detection.box.width,
          height: detection.detection.box.height
        },
        descriptor: Array.from(detection.descriptor),
        student: undefined,
        status: 'detected' as const,
        confidence: detection.detection.score
      }));
    } catch (err) {
      console.error('Multi-face detection error:', err);
      return [];
    }
  }, [isLoaded]);

  const extractDescriptor = useCallback(async (video: HTMLVideoElement): Promise<number[] | null> => {
    if (!isLoaded) return null;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
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

  // Extract descriptors for multi-angle enrollment
  const extractMultiAngleDescriptors = useCallback(async (video: HTMLVideoElement): Promise<{
    front: number[] | null;
    left: number[] | null;
    right: number[] | null;
  }> => {
    if (!isLoaded) {
      return { front: null, left: null, right: null };
    }

    try {
      // For now, we'll extract the front descriptor
      // In a real implementation, you'd guide the user to turn their head
      const descriptor = await extractDescriptor(video);
      
      // Return the same descriptor for all angles for now
      // In production, you'd capture different angles by asking user to turn
      return {
        front: descriptor,
        left: null, // Will be captured when user turns left
        right: null, // Will be captured when user turns right
      };
    } catch (err) {
      console.error('Multi-angle extraction error:', err);
      return { front: null, left: null, right: null };
    }
  }, [isLoaded, extractDescriptor]);

  // Compare a descriptor against all stored angles of a student
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
      // Front angle
      if (student.faceDescriptors.front && student.faceDescriptors.front.length > 0) {
        const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptors.front);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = 'front';
          matched = true;
        }
      }

      // Left angle
      if (student.faceDescriptors.left && student.faceDescriptors.left.length > 0) {
        const distance = faceapi.euclideanDistance(descriptor, student.faceDescriptors.left);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = 'left';
          matched = true;
        }
      }

      // Right angle
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

  const recognizeFace = useCallback((descriptor: number[], students: Student[], threshold: number = 0.6): DetectionResult => {
    if (!descriptor || descriptor.length === 0) {
      return {
        detected: false,
        matched: false,
        message: 'Wajah tidak terdeteksi, coba lagi'
      };
    }

    // Filter students with face descriptors
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

    // Find best match using multi-angle comparison
    let bestMatch: Student | null = null;
    let bestConfidence = 0;
    let bestAngle: FaceAngle | null = null;

    for (const student of studentsWithDescriptors) {
      const result = compareMultiAngle(descriptor, student, threshold);
      if (result.matched && result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        bestMatch = student;
        bestAngle = result.bestAngle;
      }
    }

    if (bestMatch) {
      return {
        detected: true,
        matched: true,
        student: bestMatch,
        confidence: bestConfidence,
        message: `Absensi Berhasil - ${bestMatch.nama}${bestAngle !== 'front' ? ` (terdeteksi dari sudut ${bestAngle})` : ''}`
      };
    }

    return {
      detected: true,
      matched: false,
      message: 'Siswa belum terdaftar atau bukan siswa'
    };
  }, [compareMultiAngle]);

  const recognizeMultipleFaces = useCallback((detections: MultiFaceDetection[], students: Student[], threshold: number = 0.6): MultiFaceDetection[] => {
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

    return detections.map(detection => {
      const result = compareMultiAngle(detection.descriptor, studentsWithDescriptors[0], threshold);
      
      // Find best match among all students
      let bestMatch: Student | null = null;
      let bestConfidence = 0;
      
      for (const student of studentsWithDescriptors) {
        const studentResult = compareMultiAngle(detection.descriptor, student, threshold);
        if (studentResult.matched && studentResult.confidence > bestConfidence) {
          bestConfidence = studentResult.confidence;
          bestMatch = student;
        }
      }

      if (bestMatch) {
        return {
          ...detection,
          student: bestMatch,
          status: 'matched' as const,
          confidence: bestConfidence
        };
      }

      return {
        ...detection,
        status: 'not_registered' as const
      };
    });
  }, [compareMultiAngle]);

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
    captureImage,
    extractMultiAngleDescriptors,
    compareMultiAngle
  };
}
