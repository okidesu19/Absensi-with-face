'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isActive: boolean;
  isLoading: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => void;
  facingMode: 'user' | 'environment';
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const abortControllerRef = useRef<AbortController | null>(null);

  const startCamera = useCallback(async () => {
    // Abort any previous camera request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      setError(null);
      setIsLoading(true);
      
      // Stop existing stream
      setStream(prevStream => {
        if (prevStream) {
          prevStream.getTracks().forEach(track => track.stop());
        }
        return null;
      });

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Check if aborted
      if (abortController.signal.aborted) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // Set video source
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error('Video element not found'));
            return;
          }
          
          video.onloadedmetadata = () => {
            video.play()
              .then(() => resolve())
              .catch(reject);
          };
          
          video.onerror = () => reject(new Error('Video load error'));
          
          // Timeout after 10 seconds
          setTimeout(() => reject(new Error('Video load timeout')), 10000);
        });
      }

      // Check again if aborted after async operations
      if (abortController.signal.aborted) {
        mediaStream.getTracks().forEach(track => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      setStream(mediaStream);
      setIsActive(true);
      setIsLoading(false);
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        // Ignore errors from aborted requests
        return;
      }
      
      console.error('Camera error:', err);
      setIsLoading(false);
      setIsActive(false);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Akses kamera ditolak. Mohon izinkan akses kamera di browser Anda.');
        } else if (err.name === 'NotFoundError') {
          setError('Kamera tidak ditemukan. Pastikan perangkat memiliki kamera.');
        } else if (err.name === 'AbortError') {
          setError('Permintaan kamera dibatalkan.');
        } else {
          setError(`Gagal mengakses kamera: ${err.message}`);
        }
      } else {
        setError('Gagal mengakses kamera');
      }
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    // Abort any ongoing camera request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setStream(prevStream => {
      if (prevStream) {
        prevStream.getTracks().forEach(track => track.stop());
      }
      return null;
    });
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsActive(false);
    setIsLoading(false);
  }, []);

  const switchCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  // Restart camera when facing mode changes
  useEffect(() => {
    // This effect handles facing mode changes by triggering a camera restart
    // The actual restart logic is inside the effect to avoid dependency issues
    if (isActive) {
      let aborted = false;
      
      const restartCamera = async () => {
        try {
          // Stop existing stream
          setStream(prevStream => {
            if (prevStream) {
              prevStream.getTracks().forEach(track => track.stop());
            }
            return null;
          });

          const constraints: MediaStreamConstraints = {
            video: {
              facingMode: facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          };

          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          
          if (aborted) {
            mediaStream.getTracks().forEach(track => track.stop());
            return;
          }
          
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            await videoRef.current.play();
          }

          setStream(mediaStream);
        } catch (err) {
          if (!aborted) {
            console.error('Camera restart error:', err);
          }
        }
      };
      
      restartCamera();
      
      return () => {
        aborted = true;
      };
    }
  }, [facingMode, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStream(prevStream => {
        if (prevStream) {
          prevStream.getTracks().forEach(track => track.stop());
        }
        return prevStream;
      });
    };
  }, []);

  return {
    videoRef,
    stream,
    isActive,
    isLoading,
    error,
    startCamera,
    stopCamera,
    switchCamera,
    facingMode
  };
}
