'use client';

import { useCallback, useRef } from 'react';

interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning';
}

interface ThrottledToastReturn {
  showThrottledToast: (options: ToastOptions) => void;
  clearQueue: () => void;
  pendingCount: number;
}

/**
 * Hook for throttled toast notifications
 * Ensures maximum 1 toast per 2 seconds even with many events
 */
export function useThrottledToast(minInterval: number = 2000): ThrottledToastReturn {
  const lastToastTime = useRef<number>(0);
  const pendingQueue = useRef<ToastOptions[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingCountRef = useRef<number>(0);

  const showToast = useCallback((options: ToastOptions) => {
    // Implementation depends on your toast library
    // This is a placeholder that logs to console
    const variant = options.variant || 'default';
    const prefix = {
      default: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    }[variant];
    
    console.log(`${prefix} ${options.title}${options.description ? `: ${options.description}` : ''}`);
    
    // If you have a toast library, use it here:
    // toast[variant](options.title, { description: options.description });
  }, []);

  const processQueue = useCallback(() => {
    if (pendingQueue.current.length === 0) {
      pendingCountRef.current = 0;
      return;
    }

    const now = Date.now();
    const timeSinceLastToast = now - lastToastTime.current;

    if (timeSinceLastToast >= minInterval) {
      const nextToast = pendingQueue.current.shift();
      if (nextToast) {
        showToast(nextToast);
        lastToastTime.current = now;
        pendingCountRef.current = pendingQueue.current.length;
      }
    }

    // Schedule next check
    if (pendingQueue.current.length > 0) {
      const delay = Math.max(0, minInterval - (Date.now() - lastToastTime.current));
      timeoutRef.current = setTimeout(processQueue, delay);
    }
  }, [minInterval, showToast]);

  const showThrottledToast = useCallback((options: ToastOptions) => {
    const now = Date.now();
    
    // If no toast shown recently and no queue, show immediately
    if (lastToastTime.current === 0 || (now - lastToastTime.current >= minInterval && pendingQueue.current.length === 0)) {
      showToast(options);
      lastToastTime.current = now;
      return;
    }

    // Add to queue
    pendingQueue.current.push(options);
    pendingCountRef.current = pendingQueue.current.length;

    // Schedule processing if not already scheduled
    if (!timeoutRef.current) {
      const delay = Math.max(0, minInterval - (now - lastToastTime.current));
      timeoutRef.current = setTimeout(processQueue, delay);
    }
  }, [minInterval, showToast, processQueue]);

  const clearQueue = useCallback(() => {
    pendingQueue.current = [];
    pendingCountRef.current = 0;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return {
    showThrottledToast,
    clearQueue,
    get pendingCount() {
      return pendingCountRef.current;
    }
  };
}

/**
 * Hook for throttling any function calls
 */
export function useThrottle<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number = 1000
): T {
  const lastCall = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall.current;

      if (timeSinceLastCall >= delay) {
        callback(...args);
        lastCall.current = now;
      } else {
        // Schedule for later
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          callback(...args);
          lastCall.current = Date.now();
        }, delay - timeSinceLastCall);
      }
    }) as T,
    [callback, delay]
  );
}

/**
 * Hook for debouncing function calls
 */
export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number = 300
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay]
  );
}

/**
 * Rate limiter for batch operations
 */
export function useRateLimiter(maxOps: number = 10, windowMs: number = 1000) {
  const operations = useRef<number[]>([]);

  const canExecute = useCallback((): boolean => {
    const now = Date.now();
    
    // Remove old operations outside the window
    operations.current = operations.current.filter(time => now - time < windowMs);
    
    if (operations.current.length < maxOps) {
      operations.current.push(now);
      return true;
    }
    
    return false;
  }, [maxOps, windowMs]);

  const getWaitTime = useCallback((): number => {
    const now = Date.now();
    operations.current = operations.current.filter(time => now - time < windowMs);
    
    if (operations.current.length < maxOps) {
      return 0;
    }
    
    const oldestOp = Math.min(...operations.current);
    return windowMs - (now - oldestOp);
  }, [maxOps, windowMs]);

  const reset = useCallback(() => {
    operations.current = [];
  }, []);

  return { canExecute, getWaitTime, reset };
}
