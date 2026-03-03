/**
 * Face Preprocessing Utilities for Improved Accuracy
 * Includes histogram equalization, face alignment, cropping, and resizing
 */

// ============== IMAGE PREPROCESSING ==============

/**
 * Apply histogram equalization for better contrast
 * Works on grayscale images
 */
export function histogramEqualization(imageData: ImageData): ImageData {
  const data = imageData.data;
  const grayData = new Uint8Array(data.length / 4);
  
  // Convert to grayscale and build histogram
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayData[i / 4] = gray;
    histogram[gray]++;
  }
  
  // Calculate CDF (Cumulative Distribution Function)
  const cdf = new Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  
  // Normalize CDF
  const cdfMin = cdf.find(v => v > 0) || 0;
  const totalPixels = data.length / 4;
  const equalized = new Array(256);
  
  for (let i = 0; i < 256; i++) {
    equalized[i] = Math.round(((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255);
  }
  
  // Apply equalization
  for (let i = 0; i < data.length; i += 4) {
    const equalizedValue = equalized[grayData[i / 4]];
    data[i] = equalizedValue;
    data[i + 1] = equalizedValue;
    data[i + 2] = equalizedValue;
  }
  
  return imageData;
}

/**
 * Calculate face alignment angle based on eye positions
 */
export function calculateFaceAlignmentAngle(
  leftEye: { x: number; y: number },
  rightEye: { x: number; y: number }
): number {
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Rotate canvas context for face alignment
 */
export function rotateForAlignment(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  angle: number,
  centerX: number,
  centerY: number
): void {
  ctx.translate(centerX, centerY);
  ctx.rotate(angle * Math.PI / 180);
  ctx.translate(-centerX, -centerY);
}

/**
 * Crop face region with margin (20% on each side)
 */
export function cropFaceWithMargin(
  sourceCanvas: HTMLCanvasElement,
  faceBox: { x: number; y: number; width: number; height: number },
  marginPercent: number = 0.2
): HTMLCanvasElement {
  const marginX = faceBox.width * marginPercent;
  const marginY = faceBox.height * marginPercent;
  
  const cropX = Math.max(0, faceBox.x - marginX);
  const cropY = Math.max(0, faceBox.y - marginY);
  const cropWidth = Math.min(sourceCanvas.width - cropX, faceBox.width + 2 * marginX);
  const cropHeight = Math.min(sourceCanvas.height - cropY, faceBox.height + 2 * marginY);
  
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  
  const ctx = croppedCanvas.getContext('2d');
  if (!ctx) return croppedCanvas;
  
  ctx.drawImage(
    sourceCanvas,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );
  
  return croppedCanvas;
}

/**
 * Resize image to target dimensions
 */
export function resizeImage(
  source: HTMLCanvasElement | HTMLVideoElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = targetWidth;
  resizedCanvas.height = targetHeight;
  
  const ctx = resizedCanvas.getContext('2d');
  if (!ctx) return resizedCanvas;
  
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  
  return resizedCanvas;
}

/**
 * Convert to grayscale
 */
export function convertToGrayscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Full preprocessing pipeline for face recognition
 */
export function preprocessFace(
  video: HTMLVideoElement,
  faceBox: { x: number; y: number; width: number; height: number },
  landmarks?: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number } },
  options: {
    targetSize?: { width: number; height: number };
    equalizeHistogram?: boolean;
    alignFace?: boolean;
  } = {}
): HTMLCanvasElement {
  const {
    targetSize = { width: 150, height: 150 },
    equalizeHistogram = true,
    alignFace = true
  } = options;
  
  // Step 1: Capture frame
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = video.videoWidth;
  frameCanvas.height = video.videoHeight;
  const frameCtx = frameCanvas.getContext('2d');
  if (!frameCtx) return frameCanvas;
  
  frameCtx.drawImage(video, 0, 0);
  
  // Step 2: Align face if landmarks available
  let processedCanvas = frameCanvas;
  
  if (alignFace && landmarks) {
    const angle = calculateFaceAlignmentAngle(landmarks.leftEye, landmarks.rightEye);
    
    if (Math.abs(angle) > 1) { // Only rotate if angle > 1 degree
      const centerX = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
      const centerY = (landmarks.leftEye.y + landmarks.rightEye.y) / 2;
      
      const rotatedCanvas = document.createElement('canvas');
      rotatedCanvas.width = frameCanvas.width;
      rotatedCanvas.height = frameCanvas.height;
      const rotatedCtx = rotatedCanvas.getContext('2d');
      
      if (rotatedCtx) {
        rotateForAlignment(rotatedCtx, rotatedCanvas, angle, centerX, centerY);
        rotatedCtx.drawImage(frameCanvas, 0, 0);
        processedCanvas = rotatedCanvas;
      }
    }
  }
  
  // Step 3: Crop face with margin
  const croppedCanvas = cropFaceWithMargin(processedCanvas, faceBox, 0.2);
  
  // Step 4: Resize to target size
  const resizedCanvas = resizeImage(croppedCanvas, targetSize.width, targetSize.height);
  
  // Step 5: Apply histogram equalization for better contrast
  if (equalizeHistogram) {
    const ctx = resizedCanvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, resizedCanvas.width, resizedCanvas.height);
      const equalizedData = histogramEqualization(imageData);
      ctx.putImageData(equalizedData, 0, 0);
    }
  }
  
  return resizedCanvas;
}

// ============== QUALITY VALIDATION ==============

export interface FaceQualityResult {
  isValid: boolean;
  brightness: number;
  sharpness: number;
  faceSize: { width: number; height: number };
  poseAngle: { yaw: number; pitch: number };
  eyesOpen: boolean;
  isBlurry: boolean;
  issues: string[];
}

/**
 * Check image brightness (should be 40-200)
 */
export function checkBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let totalBrightness = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  
  return totalBrightness / (data.length / 4);
}

/**
 * Check image sharpness using Laplacian variance
 */
export function checkSharpness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  
  // Convert to grayscale first
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }
  
  // Apply Laplacian kernel
  let variance = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian = 
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - width] +
        gray[idx + width];
      
      variance += laplacian * laplacian;
      count++;
    }
  }
  
  return Math.sqrt(variance / count) / 255;
}

/**
 * Estimate face pose from landmarks
 */
export function estimatePose(
  landmarks: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number }; nose: { x: number; y: number } }
): { yaw: number; pitch: number } {
  const eyeDistance = Math.sqrt(
    Math.pow(landmarks.rightEye.x - landmarks.leftEye.x, 2) +
    Math.pow(landmarks.rightEye.y - landmarks.leftEye.y, 2)
  );
  
  const eyeCenter = {
    x: (landmarks.leftEye.x + landmarks.rightEye.x) / 2,
    y: (landmarks.leftEye.y + landmarks.rightEye.y) / 2
  };
  
  // Yaw: horizontal angle (based on nose position relative to eyes)
  const noseOffset = (landmarks.nose.x - eyeCenter.x) / (eyeDistance / 2);
  const yaw = Math.abs(noseOffset) * 45; // Approximate degrees
  
  // Pitch: vertical angle (based on nose-eyes vertical ratio)
  const eyeToNoseY = landmarks.nose.y - eyeCenter.y;
  const pitch = Math.abs(eyeToNoseY / eyeDistance - 0.6) * 30; // Approximate degrees
  
  return { yaw, pitch };
}

/**
 * Check if eyes are open (simplified check)
 */
export function checkEyesOpen(
  landmarks: { 
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    leftEyeTop?: { x: number; y: number };
    leftEyeBottom?: { x: number; y: number };
    rightEyeTop?: { x: number; y: number };
    rightEyeBottom?: { x: number; y: number };
  }
): boolean {
  // If we have detailed eye landmarks, check eye openness
  if (landmarks.leftEyeTop && landmarks.leftEyeBottom && 
      landmarks.rightEyeTop && landmarks.rightEyeBottom) {
    const leftEyeOpen = Math.abs(landmarks.leftEyeBottom.y - landmarks.leftEyeTop.y) > 5;
    const rightEyeOpen = Math.abs(landmarks.rightEyeBottom.y - landmarks.rightEyeTop.y) > 5;
    return leftEyeOpen && rightEyeOpen;
  }
  
  // Default to true if we don't have detailed landmarks
  return true;
}

/**
 * Comprehensive face quality validation
 */
export function validateFaceQuality(
  video: HTMLVideoElement,
  faceBox: { x: number; y: number; width: number; height: number },
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
  }
): FaceQualityResult {
  const issues: string[] = [];
  
  // Create canvas from video
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return {
      isValid: false,
      brightness: 0,
      sharpness: 0,
      faceSize: { width: 0, height: 0 },
      poseAngle: { yaw: 0, pitch: 0 },
      eyesOpen: false,
      isBlurry: true,
      issues: ['Cannot access video frame']
    };
  }
  
  ctx.drawImage(video, 0, 0);
  
  // Extract face region
  const faceCanvas = cropFaceWithMargin(canvas, faceBox, 0);
  const faceCtx = faceCanvas.getContext('2d');
  
  if (!faceCtx) {
    return {
      isValid: false,
      brightness: 0,
      sharpness: 0,
      faceSize: { width: 0, height: 0 },
      poseAngle: { yaw: 0, pitch: 0 },
      eyesOpen: false,
      isBlurry: true,
      issues: ['Cannot process face region']
    };
  }
  
  const faceImageData = faceCtx.getImageData(0, 0, faceCanvas.width, faceCanvas.height);
  
  // Check brightness (40-200)
  const brightness = checkBrightness(faceImageData);
  if (brightness < 40) {
    issues.push('Wajah terlalu gelap');
  } else if (brightness > 200) {
    issues.push('Wajah terlalu terang');
  }
  
  // Check sharpness (>0.5)
  const sharpness = checkSharpness(faceCanvas);
  const isBlurry = sharpness < 0.5;
  if (isBlurry) {
    issues.push('Wajah blur, mohon tetap diam');
  }
  
  // Check face size (minimum 100x100)
  const faceSize = { width: faceBox.width, height: faceBox.height };
  if (faceBox.width < 100 || faceBox.height < 100) {
    issues.push('Wajah terlalu kecil, mendekatlah ke kamera');
  }
  
  // Check pose angles
  let poseAngle = { yaw: 0, pitch: 0 };
  if (landmarks) {
    poseAngle = estimatePose(landmarks);
    if (poseAngle.yaw > 30) {
      issues.push('Wajah terlalu miring ke samping');
    }
    if (poseAngle.pitch > 20) {
      issues.push('Wajah terlalu menengadah/menunduk');
    }
  }
  
  const isValid = issues.length === 0;
  
  return {
    isValid,
    brightness,
    sharpness,
    faceSize,
    poseAngle,
    eyesOpen: true, // Simplified
    isBlurry,
    issues
  };
}

// ============== LIVENESS DETECTION ==============

export interface LivenessResult {
  isLive: boolean;
  blinkCount: number;
  movementScore: number;
  challengesPassed: string[];
  issues: string[];
}

/**
 * Detect blink from eye aspect ratio changes
 */
export function detectBlink(
  currentEAR: number,
  previousEARs: number[],
  threshold: number = 0.2
): boolean {
  if (previousEARs.length < 3) return false;
  
  const avgPrevious = previousEARs.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, previousEARs.length);
  
  // Blink detected if current EAR drops significantly below average
  return currentEAR < avgPrevious * (1 - threshold) && avgPrevious > 0.15;
}

/**
 * Calculate Eye Aspect Ratio (EAR)
 */
export function calculateEAR(
  eyeLandmarks: { top: { x: number; y: number }; bottom: { x: number; y: number }; left: { x: number; y: number }; right: { x: number; y: number } }
): number {
  const vertical = Math.sqrt(
    Math.pow(eyeLandmarks.bottom.x - eyeLandmarks.top.x, 2) +
    Math.pow(eyeLandmarks.bottom.y - eyeLandmarks.top.y, 2)
  );
  
  const horizontal = Math.sqrt(
    Math.pow(eyeLandmarks.right.x - eyeLandmarks.left.x, 2) +
    Math.pow(eyeLandmarks.right.y - eyeLandmarks.left.y, 2)
  );
  
  return vertical / horizontal;
}

/**
 * Detect face movement between frames
 */
export function detectMovement(
  currentBox: { x: number; y: number; width: number; height: number },
  previousBox: { x: number; y: number; width: number; height: number } | null
): number {
  if (!previousBox) return 0;
  
  const dx = currentBox.x - previousBox.x;
  const dy = currentBox.y - previousBox.y;
  const dw = currentBox.width - previousBox.width;
  const dh = currentBox.height - previousBox.height;
  
  return Math.sqrt(dx * dx + dy * dy + dw * dw + dh * dh);
}

/**
 * Simple texture analysis for anti-spoofing
 * Real faces have more texture variation than photos
 */
export function analyzeTexture(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Calculate local binary pattern-like texture measure
  let textureSum = 0;
  const blockSize = 8;
  
  for (let by = 0; by < canvas.height - blockSize; by += blockSize) {
    for (let bx = 0; bx < canvas.width - blockSize; bx += blockSize) {
      let blockVariance = 0;
      let blockMean = 0;
      let count = 0;
      
      // Calculate block mean
      for (let y = by; y < by + blockSize; y++) {
        for (let x = bx; x < bx + blockSize; x++) {
          const idx = (y * canvas.width + x) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          blockMean += gray;
          count++;
        }
      }
      blockMean /= count;
      
      // Calculate block variance
      for (let y = by; y < by + blockSize; y++) {
        for (let x = bx; x < bx + blockSize; x++) {
          const idx = (y * canvas.width + x) * 4;
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          blockVariance += Math.pow(gray - blockMean, 2);
        }
      }
      
      textureSum += Math.sqrt(blockVariance / count);
    }
  }
  
  return textureSum / ((canvas.width / blockSize) * (canvas.height / blockSize));
}

/**
 * Comprehensive liveness check
 */
export function performLivenessCheck(
  video: HTMLVideoElement,
  faceBox: { x: number; y: number; width: number; height: number },
  history: {
    earHistory: number[];
    boxHistory: { x: number; y: number; width: number; height: number }[];
  },
  options: {
    minBlinks?: number;
    minMovement?: number;
    minTexture?: number;
  } = {}
): LivenessResult {
  const {
    minBlinks = 1,
    minMovement = 10,
    minTexture = 5
  } = options;
  
  const challengesPassed: string[] = [];
  const issues: string[] = [];
  
  // Check blink count
  let blinkCount = 0;
  for (let i = 2; i < history.earHistory.length; i++) {
    if (detectBlink(history.earHistory[i], history.earHistory.slice(0, i))) {
      blinkCount++;
    }
  }
  
  if (blinkCount >= minBlinks) {
    challengesPassed.push('Blink detected');
  } else {
    issues.push('Kedipan tidak terdeteksi');
  }
  
  // Check movement
  let totalMovement = 0;
  for (let i = 1; i < history.boxHistory.length; i++) {
    totalMovement += detectMovement(history.boxHistory[i], history.boxHistory[i - 1]);
  }
  
  if (totalMovement >= minMovement) {
    challengesPassed.push('Movement detected');
  } else {
    issues.push('Gerakan wajah minimal diperlukan');
  }
  
  // Check texture (anti-spoofing)
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  let textureScore = 0;
  if (ctx) {
    ctx.drawImage(video, 0, 0);
    const faceCanvas = cropFaceWithMargin(canvas, faceBox, 0.1);
    textureScore = analyzeTexture(faceCanvas);
    
    if (textureScore >= minTexture) {
      challengesPassed.push('Texture check passed');
    } else {
      issues.push('Tekstur wajah tidak normal');
    }
  }
  
  const isLive = challengesPassed.length >= 2;
  
  return {
    isLive,
    blinkCount,
    movementScore: totalMovement,
    challengesPassed,
    issues: isLive ? [] : issues
  };
}
