'use client';

import { useCallback, useRef } from 'react';

// Audio feedback types
type SoundType = 'success' | 'error' | 'warning' | 'beep';

// Sound frequencies for different feedback types
const SOUND_FREQUENCIES: Record<SoundType, { frequency: number; duration: number; type: OscillatorType }> = {
  success: { frequency: 880, duration: 150, type: 'sine' }, // High pitched, short
  error: { frequency: 220, duration: 300, type: 'sawtooth' }, // Low pitched, longer
  warning: { frequency: 440, duration: 200, type: 'square' }, // Medium
  beep: { frequency: 600, duration: 100, type: 'sine' }, // Simple beep
};

export function useAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current && typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play synthesized sound
  const playSound = useCallback((type: SoundType) => {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const { frequency, duration, type: oscillatorType } = SOUND_FREQUENCIES[type];
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = oscillatorType;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    // Envelope for smoother sound
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  }, [getAudioContext]);

  // Play success sound (double beep)
  const playSuccessSound = useCallback(() => {
    playSound('success');
    setTimeout(() => playSound('success'), 200);
  }, [playSound]);

  // Play error sound
  const playErrorSound = useCallback(() => {
    playSound('error');
  }, [playSound]);

  // Play warning sound
  const playWarningSound = useCallback(() => {
    playSound('warning');
  }, [playSound]);

  // Text-to-Speech using Web Speech API
  const speak = useCallback((text: string, options?: { rate?: number; pitch?: number; lang?: string }) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate ?? 1;
    utterance.pitch = options?.pitch ?? 1;
    utterance.lang = options?.lang ?? 'id-ID';
    utterance.volume = 1;

    // Try to use Indonesian voice if available
    const voices = window.speechSynthesis.getVoices();
    const indonesianVoice = voices.find(voice => voice.lang.includes('id'));
    if (indonesianVoice) {
      utterance.voice = indonesianVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // Stop any ongoing speech
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
    playSound,
    playSuccessSound,
    playErrorSound,
    playWarningSound,
    speak,
    stopSpeaking,
  };
}

// Hook for TTS via API (higher quality voice)
export function useTTSApi() {
  const speakWithApi = useCallback(async (text: string) => {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('TTS API failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('TTS API error:', error);
      // Fallback to Web Speech API
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  return { speakWithApi };
}
