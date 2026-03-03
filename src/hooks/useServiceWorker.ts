'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceWorkerStatus {
  isRegistered: boolean;
  isUpdating: boolean;
  hasUpdate: boolean;
  error: string | null;
}

interface UseServiceWorkerReturn extends ServiceWorkerStatus {
  register: () => Promise<void>;
  update: () => Promise<void>;
  unregister: () => Promise<void>;
  clearCache: () => Promise<void>;
  cacheModels: () => Promise<void>;
}

/**
 * Hook for Service Worker management
 * Handles registration, updates, and cache management
 */
export function useServiceWorker(): UseServiceWorkerReturn {
  const [status, setStatus] = useState<ServiceWorkerStatus>({
    isRegistered: false,
    isUpdating: false,
    hasUpdate: false,
    error: null
  });

  // Register service worker
  const register = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setStatus(prev => ({ ...prev, error: 'Service Worker not supported' }));
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('Service Worker registered:', registration.scope);
      
      setStatus(prev => ({
        ...prev,
        isRegistered: true,
        error: null
      }));

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setStatus(prev => ({ ...prev, hasUpdate: true }));
            }
          });
        }
      });

    } catch (err) {
      console.error('Service Worker registration failed:', err);
      setStatus(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Registration failed'
      }));
    }
  }, []);

  // Update service worker
  const update = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    setStatus(prev => ({ ...prev, isUpdating: true }));

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      
      if (registration) {
        await registration.update();
        
        // If there's a waiting worker, activate it
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      setStatus(prev => ({
        ...prev,
        isUpdating: false,
        hasUpdate: false
      }));

      // Reload to get the new version
      window.location.reload();

    } catch (err) {
      console.error('Service Worker update failed:', err);
      setStatus(prev => ({
        ...prev,
        isUpdating: false,
        error: err instanceof Error ? err.message : 'Update failed'
      }));
    }
  }, []);

  // Unregister service worker
  const unregister = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      
      if (registration) {
        await registration.unregister();
        console.log('Service Worker unregistered');
      }

      setStatus(prev => ({
        ...prev,
        isRegistered: false,
        hasUpdate: false
      }));

    } catch (err) {
      console.error('Service Worker unregistration failed:', err);
      setStatus(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Unregistration failed'
      }));
    }
  }, []);

  // Clear all caches
  const clearCache = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // Clear Cache Storage API
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));

      // Clear IndexedDB
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('FaceAbsenDB');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Tell service worker to clear its caches
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      }

      console.log('All caches cleared');

    } catch (err) {
      console.error('Failed to clear caches:', err);
      setStatus(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to clear cache'
      }));
    }
  }, []);

  // Cache model files
  const cacheModels = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CACHE_MODELS' });
        console.log('Model caching initiated');
      }
    } catch (err) {
      console.error('Failed to cache models:', err);
    }
  }, []);

  // Register on mount
  useEffect(() => {
    register();

    // Listen for controlling service worker changes
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_ATTENDANCE') {
          // Dispatch custom event for app to handle
          window.dispatchEvent(new CustomEvent('syncAttendance'));
        }
      });
    }
  }, [register]);

  return {
    ...status,
    register,
    update,
    unregister,
    clearCache,
    cacheModels
  };
}

/**
 * Hook to check if app is running as PWA
 */
export function usePWA() {
  const [isPWA, setIsPWA] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    // Check if running as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error - iOS Safari
      window.navigator.standalone === true;
    
    setIsPWA(isStandalone);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    // @ts-expect-error - prompt method exists
    deferredPrompt.prompt();
    
    // @ts-expect-error - userChoice exists
    const { outcome } = await deferredPrompt.userChoice;
    
    setDeferredPrompt(null);
    setIsInstallable(false);
    
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    isPWA,
    isInstallable,
    install
  };
}
