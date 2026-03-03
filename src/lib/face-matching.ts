/**
 * Advanced Face Matching Algorithm
 * Combines Euclidean distance and Cosine similarity with weighted voting
 */

import * as faceapi from 'face-api.js';
import { Student, FaceAngle } from '@/types';

// ============== DISTANCE METRICS ==============

/**
 * Calculate Euclidean distance between two descriptors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

/**
 * Calculate Cosine similarity between two descriptors
 * Returns value between -1 and 1 (1 = identical, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return -1;
  
  return dotProduct / denominator;
}

/**
 * Convert Euclidean distance to similarity score (0-1)
 * Uses exponential decay: higher distance = lower similarity
 */
export function euclideanToSimilarity(distance: number, maxDistance: number = 1.0): number {
  return Math.exp(-distance / maxDistance);
}

/**
 * Convert Cosine similarity to distance (0-1)
 * Maps -1 to 1 range to 0 to 2 range, then normalizes
 */
export function cosineToDistance(similarity: number): number {
  return (1 - similarity) / 2;
}

// ============== WEIGHTED MATCHING ==============

export interface WeightedMatchResult {
  matched: boolean;
  studentId: string | null;
  student?: Student;
  confidence: number;
  euclideanScore: number;
  cosineScore: number;
  weightedScore: number;
  bestAngle: FaceAngle | null;
  distance: number;
  isAmbiguous: boolean;
  topMatches: Array<{
    studentId: string;
    student?: Student;
    score: number;
    distance: number;
  }>;
}

/**
 * Calculate weighted combined score
 * Default: 70% Euclidean, 30% Cosine
 */
export function calculateWeightedScore(
  euclideanDist: number,
  cosineSim: number,
  weights: { euclidean: number; cosine: number } = { euclidean: 0.7, cosine: 0.3 }
): number {
  // Convert both to similarity scores (0-1 range where 1 is perfect match)
  const euclideanSim = euclideanToSimilarity(euclideanDist);
  const cosineNorm = (cosineSim + 1) / 2; // Normalize from [-1,1] to [0,1]
  
  return weights.euclidean * euclideanSim + weights.cosine * cosineNorm;
}

/**
 * Dynamic threshold based on face angle
 * Frontal faces use stricter threshold, angled faces use more lenient
 */
export function getDynamicThreshold(angle: FaceAngle | null, baseThreshold: number = 0.6): number {
  if (!angle) return baseThreshold;
  
  switch (angle) {
    case 'front':
      return baseThreshold; // Stricter for frontal
    case 'left':
    case 'right':
      return baseThreshold - 0.05; // More lenient for angled
    default:
      return baseThreshold;
  }
}

/**
 * Check if match is ambiguous (second best too close)
 */
export function isAmbiguousMatch(
  bestScore: number,
  secondBestScore: number,
  minGap: number = 0.1
): boolean {
  return (bestScore - secondBestScore) < minGap;
}

// ============== MULTI-ANGLE MATCHING ==============

interface DescriptorMatch {
  studentId: string;
  student: Student;
  distance: number;
  cosineSim: number;
  weightedScore: number;
  angle: FaceAngle;
}

/**
 * Compare input descriptor against all stored descriptors for a student
 */
export function compareAgainstStudent(
  inputDescriptor: number[],
  student: Student,
  weights: { euclidean: number; cosine: number }
): DescriptorMatch | null {
  const results: DescriptorMatch[] = [];
  
  // Check legacy single descriptor
  if (student.faceDescriptor && student.faceDescriptor.length === 128) {
    const distance = euclideanDistance(inputDescriptor, student.faceDescriptor);
    const cosineSim = cosineSimilarity(inputDescriptor, student.faceDescriptor);
    const weightedScore = calculateWeightedScore(distance, cosineSim, weights);
    
    results.push({
      studentId: student.id,
      student,
      distance,
      cosineSim,
      weightedScore,
      angle: 'front'
    });
  }
  
  // Check multi-angle descriptors
  if (student.faceDescriptors) {
    const angleMap: { angle: FaceAngle; descriptor?: number[] }[] = [
      { angle: 'front', descriptor: student.faceDescriptors.front },
      { angle: 'left', descriptor: student.faceDescriptors.left },
      { angle: 'right', descriptor: student.faceDescriptors.right }
    ];
    
    for (const { angle, descriptor } of angleMap) {
      if (descriptor && descriptor.length === 128) {
        const distance = euclideanDistance(inputDescriptor, descriptor);
        const cosineSim = cosineSimilarity(inputDescriptor, descriptor);
        const weightedScore = calculateWeightedScore(distance, cosineSim, weights);
        
        results.push({
          studentId: student.id,
          student,
          distance,
          cosineSim,
          weightedScore,
          angle
        });
      }
    }
  }
  
  // Return best match for this student
  if (results.length === 0) return null;
  
  return results.reduce((best, current) => 
    current.weightedScore > best.weightedScore ? current : best
  );
}

/**
 * Find best match among all students with Top-3 nearest neighbors
 */
export function findBestMatch(
  inputDescriptor: number[],
  students: Student[],
  options: {
    baseThreshold?: number;
    weights?: { euclidean: number; cosine: number };
    minConfidence?: number;
    minGap?: number;
    topK?: number;
  } = {}
): WeightedMatchResult {
  const {
    baseThreshold = 0.6,
    weights = { euclidean: 0.7, cosine: 0.3 },
    minConfidence = 0.65,
    minGap = 0.1,
    topK = 3
  } = options;
  
  // Filter students with descriptors
  const studentsWithDescriptors = students.filter(s => 
    (s.faceDescriptor && s.faceDescriptor.length === 128) ||
    (s.faceDescriptors && (s.faceDescriptors.front || s.faceDescriptors.left || s.faceDescriptors.right))
  );
  
  if (studentsWithDescriptors.length === 0) {
    return {
      matched: false,
      studentId: null,
      confidence: 0,
      euclideanScore: 0,
      cosineScore: 0,
      weightedScore: 0,
      bestAngle: null,
      distance: 1,
      isAmbiguous: false,
      topMatches: []
    };
  }
  
  // Compare against all students
  const allMatches: DescriptorMatch[] = [];
  
  for (const student of studentsWithDescriptors) {
    const match = compareAgainstStudent(inputDescriptor, student, weights);
    if (match) {
      allMatches.push(match);
    }
  }
  
  // Sort by weighted score (descending)
  allMatches.sort((a, b) => b.weightedScore - a.weightedScore);
  
  // Get top K matches
  const topMatches = allMatches.slice(0, topK).map(m => ({
    studentId: m.studentId,
    student: m.student,
    score: m.weightedScore,
    distance: m.distance
  }));
  
  if (allMatches.length === 0) {
    return {
      matched: false,
      studentId: null,
      confidence: 0,
      euclideanScore: 0,
      cosineScore: 0,
      weightedScore: 0,
      bestAngle: null,
      distance: 1,
      isAmbiguous: false,
      topMatches: []
    };
  }
  
  const bestMatch = allMatches[0];
  const secondBest = allMatches[1];
  
  // Get dynamic threshold based on angle
  const threshold = getDynamicThreshold(bestMatch.angle, baseThreshold);
  
  // Calculate confidence (convert weighted score to 0-1 confidence)
  const confidence = bestMatch.weightedScore;
  
  // Check if match is ambiguous
  const ambiguous = secondBest ? isAmbiguousMatch(bestMatch.weightedScore, secondBest.weightedScore, minGap) : false;
  
  // Determine if match is valid
  // Conditions:
  // 1. Confidence must exceed minimum
  // 2. Distance must be below threshold
  // 3. Match must not be ambiguous (or we require higher confidence)
  const isValidDistance = bestMatch.distance < (1 - threshold);
  const isValidConfidence = confidence >= minConfidence;
  const isValidAmbiguity = !ambiguous || confidence >= minConfidence + 0.1;
  
  const matched = isValidDistance && isValidConfidence && isValidAmbiguity;
  
  return {
    matched,
    studentId: matched ? bestMatch.studentId : null,
    student: matched ? bestMatch.student : undefined,
    confidence,
    euclideanScore: euclideanToSimilarity(bestMatch.distance),
    cosineScore: (bestMatch.cosineSim + 1) / 2,
    weightedScore: bestMatch.weightedScore,
    bestAngle: bestMatch.angle,
    distance: bestMatch.distance,
    isAmbiguous: ambiguous,
    topMatches
  };
}

// ============== CONTINUOUS LEARNING ==============

/**
 * Calculate updated descriptor using exponential moving average
 * Only update when confidence is in sweet spot (0.8-0.9)
 */
export function calculateUpdatedDescriptor(
  currentDescriptor: number[],
  newDescriptor: number[],
  alpha: number = 0.1 // Weight for new descriptor (10%)
): number[] {
  if (currentDescriptor.length !== newDescriptor.length) {
    return currentDescriptor;
  }
  
  return currentDescriptor.map((val, i) => {
    return val * (1 - alpha) + newDescriptor[i] * alpha;
  });
}

/**
 * Check if descriptor should be updated
 */
export function shouldUpdateDescriptor(
  confidence: number,
  minConfidence: number = 0.8,
  maxConfidence: number = 0.95
): boolean {
  // Only update when confidence is high but not perfect
  // This indicates a good match with room for improvement
  return confidence >= minConfidence && confidence <= maxConfidence;
}

/**
 * Feedback-based threshold adjustment
 */
export function adjustThreshold(
  currentThreshold: number,
  wasCorrect: boolean,
  confidence: number,
  adjustmentRate: number = 0.01
): number {
  if (wasCorrect) {
    // If correct but low confidence, be slightly more lenient
    if (confidence < currentThreshold + 0.1) {
      return Math.max(0.4, currentThreshold - adjustmentRate);
    }
  } else {
    // If incorrect, be stricter
    return Math.min(0.8, currentThreshold + adjustmentRate * 2);
  }
  
  return currentThreshold;
}

// ============== FACE-API.JS INTEGRATION ==============

/**
 * Create optimized face matcher with multi-angle support
 */
export function createOptimizedFaceMatcher(
  students: Student[],
  threshold: number = 0.6
): faceapi.FaceMatcher {
  const labeledDescriptors: faceapi.LabeledFaceDescriptors[] = [];
  
  for (const student of students) {
    const descriptors: Float32Array[] = [];
    
    // Add all available descriptors
    if (student.faceDescriptor && student.faceDescriptor.length === 128) {
      descriptors.push(new Float32Array(student.faceDescriptor));
    }
    
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
    
    if (descriptors.length > 0) {
      labeledDescriptors.push(
        new faceapi.LabeledFaceDescriptors(student.id, descriptors)
      );
    }
  }
  
  return new faceapi.FaceMatcher(labeledDescriptors, threshold);
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Normalize descriptor to unit length (for better cosine similarity)
 */
export function normalizeDescriptor(descriptor: number[]): number[] {
  const norm = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return descriptor;
  return descriptor.map(val => val / norm);
}

/**
 * Calculate descriptor quality score
 * Higher variance typically indicates better quality
 */
export function calculateDescriptorQuality(descriptor: number[]): number {
  const mean = descriptor.reduce((sum, val) => sum + val, 0) / descriptor.length;
  const variance = descriptor.reduce((sum, val) => sum + (val - mean) ** 2, 0) / descriptor.length;
  return Math.sqrt(variance);
}

/**
 * Compress descriptor for storage (reduce precision)
 * Converts float64 to float16 approximation
 */
export function compressDescriptor(descriptor: number[]): number[] {
  return descriptor.map(val => {
    // Keep only 4 decimal places
    return Math.round(val * 10000) / 10000;
  });
}

/**
 * Decompress descriptor (restore full precision representation)
 */
export function decompressDescriptor(compressed: number[]): number[] {
  // Just return as-is since we only reduced precision
  return [...compressed];
}
