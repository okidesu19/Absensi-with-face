'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCamera } from '@/hooks/face/useCamera';
import { useAdvancedFaceRecognition, EnrollmentState, FaceQualityResult } from '@/hooks/face/useAdvancedFaceRecognition';
import { FaceAngle } from '@/types';

interface MultiAngleEnrollmentProps {
  onComplete: (descriptors: { front: number[] | null; left: number[] | null; right: number[] | null }) => void;
  onCancel: () => void;
}

export function MultiAngleEnrollment({ onComplete, onCancel }: MultiAngleEnrollmentProps) {
  const { videoRef, isActive, error: cameraError, startCamera, stopCamera } = useCamera();
  const {
    isLoaded: modelsLoaded,
    isLoading: modelsLoading,
    startEnrollment,
    captureAngle,
    getEnrollmentState,
    resetEnrollment,
    completeEnrollment
  } = useAdvancedFaceRecognition();
  
  const [capturing, setCapturing] = useState(false);
  const [lastQuality, setLastQuality] = useState<FaceQualityResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Start camera on mount
  useEffect(() => {
    startCamera();
    startEnrollment();
    
    return () => {
      stopCamera();
    };
  }, [startCamera, startEnrollment, stopCamera]);

  // Handle capture
  const handleCapture = useCallback(async () => {
    if (!isActive || capturing) return;
    
    setCapturing(true);
    setErrorMessage(null);
    
    const state = getEnrollmentState();
    
    try {
      const result = await captureAngle(videoRef.current!, state.currentAngle);
      
      if (result.success) {
        setLastQuality(result.quality || null);
        
        // Check if enrollment is complete
        const newState = getEnrollmentState();
        if (newState.isComplete) {
          const descriptors = completeEnrollment();
          onComplete(descriptors);
        }
      } else {
        setErrorMessage(result.error || 'Gagal menangkap wajah');
        setLastQuality(result.quality || null);
      }
    } catch (err) {
      console.error('Capture error:', err);
      setErrorMessage('Terjadi kesalahan saat menangkap wajah');
    } finally {
      setCapturing(false);
    }
  }, [isActive, capturing, captureAngle, getEnrollmentState, completeEnrollment, onComplete, videoRef]);

  // Get angle icon
  const getAngleIcon = (angle: FaceAngle, captured: boolean) => {
    const baseClasses = captured 
      ? 'bg-green-500 text-white' 
      : 'bg-muted text-muted-foreground';
    
    switch (angle) {
      case 'front':
        return (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${baseClasses}`}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" strokeWidth="2"/>
              <path strokeWidth="2" d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
            </svg>
          </div>
        );
      case 'left':
        return (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${baseClasses}`}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="2" d="M15 8a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeWidth="2" d="M12 14c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
              <path strokeWidth="2" d="M19 12l-2-2"/>
            </svg>
          </div>
        );
      case 'right':
        return (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${baseClasses}`}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="2" d="M15 8a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeWidth="2" d="M12 14c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z"/>
              <path strokeWidth="2" d="M5 12l2-2"/>
            </svg>
          </div>
        );
    }
  };

  const state = getEnrollmentState();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Pendaftaran Wajah Multi-Angle</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Tangkap wajah dari 3 sudut berbeda untuk akurasi maksimal
          </p>
        </div>

        {/* Progress */}
        <div className="p-4 bg-muted/30">
          <div className="flex items-center justify-center gap-8">
            {(['front', 'left', 'right'] as FaceAngle[]).map((angle) => (
              <div key={angle} className="flex flex-col items-center gap-2">
                {getAngleIcon(angle, state.capturedAngles.includes(angle))}
                <span className={`text-sm font-medium ${
                  state.capturedAngles.includes(angle) 
                    ? 'text-green-600' 
                    : state.currentAngle === angle 
                      ? 'text-primary' 
                      : 'text-muted-foreground'
                }`}>
                  {angle === 'front' ? 'Depan' : angle === 'left' ? 'Kiri' : 'Kanan'}
                </span>
              </div>
            ))}
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(state.capturedAngles.length / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Camera view */}
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${isActive ? 'block' : 'hidden'}`}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
          />

          {/* Overlay instructions */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 text-white px-6 py-3 rounded-xl text-center">
              <p className="font-medium">{state.instructions}</p>
              {state.currentAngle !== 'front' && (
                <p className="text-sm opacity-75 mt-1">
                  Putar kepala ±15°
                </p>
              )}
            </div>
          </div>

          {/* Capturing overlay */}
          {capturing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
                <p>Memproses...</p>
              </div>
            </div>
          )}
        </div>

        {/* Quality feedback */}
        {lastQuality && (
          <div className="p-4 bg-muted/30">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className={`p-2 rounded-lg text-center ${
                lastQuality.brightness >= 40 && lastQuality.brightness <= 200 
                  ? 'bg-green-500/10 text-green-600' 
                  : 'bg-red-500/10 text-red-600'
              }`}>
                <div className="font-medium">Kecerahan</div>
                <div>{Math.round(lastQuality.brightness)}</div>
              </div>
              <div className={`p-2 rounded-lg text-center ${
                lastQuality.sharpness >= 0.5 
                  ? 'bg-green-500/10 text-green-600' 
                  : 'bg-red-500/10 text-red-600'
              }`}>
                <div className="font-medium">Ketajaman</div>
                <div>{lastQuality.sharpness.toFixed(2)}</div>
              </div>
              <div className={`p-2 rounded-lg text-center ${
                lastQuality.poseAngle.yaw <= 30 
                  ? 'bg-green-500/10 text-green-600' 
                  : 'bg-red-500/10 text-red-600'
              }`}>
                <div className="font-medium">Sudut Yaw</div>
                <div>{Math.round(lastQuality.poseAngle.yaw)}°</div>
              </div>
              <div className={`p-2 rounded-lg text-center ${
                !lastQuality.isBlurry 
                  ? 'bg-green-500/10 text-green-600' 
                  : 'bg-red-500/10 text-red-600'
              }`}>
                <div className="font-medium">Fokus</div>
                <div>{lastQuality.isBlurry ? 'Blur' : 'Jelas'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm">
            ⚠️ {cameraError}
          </div>
        )}

        {/* Actions */}
        <div className="p-4 flex justify-between items-center border-t">
          <button
            onClick={() => {
              resetEnrollment();
              setErrorMessage(null);
              setLastQuality(null);
            }}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            Reset
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border rounded-lg hover:bg-muted transition"
            >
              Batal
            </button>
            <button
              onClick={handleCapture}
              disabled={!isActive || !modelsLoaded || capturing}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {capturing ? 'Memproses...' : `Tangkap ${state.currentAngle === 'front' ? 'Depan' : state.currentAngle === 'left' ? 'Kiri' : 'Kanan'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
