'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseIdleTimeoutOptions {
  timeout?: number; // in milliseconds
  onIdle: () => void;
  onWarning?: () => void; // called 1 minute before timeout
  events?: string[];
}

export function useIdleTimeout({
  timeout = 30 * 60 * 1000, // Default 30 minutes
  onIdle,
  onWarning,
  events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'],
}: UseIdleTimeoutOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(timeout);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsIdle(false);
    setTimeRemaining(timeout);

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Set warning timeout (1 minute before timeout)
    if (onWarning && timeout > 60000) {
      warningTimeoutRef.current = setTimeout(() => {
        onWarning();
      }, timeout - 60000);
    }

    // Set idle timeout
    timeoutRef.current = setTimeout(() => {
      setIsIdle(true);
      onIdle();
    }, timeout);
  }, [timeout, onIdle, onWarning]);

  // Update remaining time display
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeout - elapsed);
      setTimeRemaining(remaining);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [timeout]);

  // Set up event listeners
  useEffect(() => {
    // Initial timer
    resetTimer();

    // Add event listeners
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      // Clean up
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [events, resetTimer]);

  // Format remaining time as mm:ss
  const formatTimeRemaining = useCallback(() => {
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  return {
    isIdle,
    timeRemaining,
    formatTimeRemaining,
    resetTimer,
  };
}
