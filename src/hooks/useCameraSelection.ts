'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraDevice } from '@/types';

interface UseCameraSelectionReturn {
  devices: CameraDevice[];
  selectedDevice: string | null;
  selectDevice: (deviceId: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  refreshDevices: () => Promise<void>;
}

export function useCameraSelection(): UseCameraSelectionReturn {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get available camera devices
  const refreshDevices = useCallback(async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = deviceList
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Kamera ${device.deviceId.slice(0, 8)}`,
          kind: 'videoinput' as const
        }));
      
      setDevices(videoDevices);
      
      // Auto-select first device if none selected
      if (!selectedDevice && videoDevices.length > 0) {
        setSelectedDevice(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
      setError('Gagal mendapatkan daftar kamera');
    }
  }, [selectedDevice]);

  // Select a specific camera
  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
    // Restart camera with new device if currently active
    if (isActive) {
      stopCamera();
      // Will auto-restart with new device
      setTimeout(() => {
        startCameraInternal(deviceId);
      }, 100);
    }
  }, [isActive]);

  // Internal function to start camera
  const startCameraInternal = useCallback(async (deviceId?: string) => {
    const deviceToUse = deviceId || selectedDevice;
    
    if (!deviceToUse) {
      setError('Tidak ada kamera yang dipilih');
      return;
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceToUse },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: deviceToUse.includes('front') ? 'user' : 'environment'
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsActive(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (!abortControllerRef.current?.signal.aborted) {
        setError('Gagal mengakses kamera. Pastikan izin kamera diberikan.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedDevice]);

  // Start camera
  const startCamera = useCallback(async () => {
    await startCameraInternal();
  }, [startCameraInternal]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
    setIsLoading(false);
  }, []);

  // Initialize devices on mount
  useEffect(() => {
    refreshDevices();
    
    return () => {
      stopCamera();
    };
  }, [refreshDevices, stopCamera]);

  return {
    devices,
    selectedDevice,
    selectDevice,
    videoRef,
    isActive,
    isLoading,
    error,
    startCamera,
    stopCamera,
    refreshDevices
  };
}

// Camera selection dropdown component helper
export function getCameraTypeLabel(deviceId: string, label: string): string {
  const lowerLabel = label.toLowerCase();
  
  if (lowerLabel.includes('front') || lowerLabel.includes('user')) {
    return '📸 Kamera Depan';
  }
  if (lowerLabel.includes('back') || lowerLabel.includes('rear') || lowerLabel.includes('environment')) {
    return '📷 Kamera Belakang';
  }
  if (lowerLabel.includes('usb') || lowerLabel.includes('external')) {
    return '🔌 Kamera USB';
  }
  if (lowerLabel.includes('integrated') || lowerLabel.includes('built-in')) {
    return '💻 Kamera Terintegrasi';
  }
  
  return `📹 ${label || 'Kamera'}`;
}
