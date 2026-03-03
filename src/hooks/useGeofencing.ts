'use client';

import { useState, useEffect, useCallback } from 'react';
import { GeofencingSettings } from '@/types';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  isLoading: boolean;
}

interface UseGeofencingReturn {
  currentLocation: LocationState;
  isWithinGeofence: boolean | null;
  distanceFromCenter: number | null;
  requestLocation: () => void;
  checkGeofence: (settings: GeofencingSettings) => boolean;
}

// Calculate distance between two points using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

export function useGeofencing(): UseGeofencingReturn {
  const [currentLocation, setCurrentLocation] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    isLoading: false,
  });

  const [isWithinGeofence, setIsWithinGeofence] = useState<boolean | null>(null);
  const [distanceFromCenter, setDistanceFromCenter] = useState<number | null>(null);

  // Request current location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setCurrentLocation((prev) => ({
        ...prev,
        error: 'Geolokasi tidak didukung oleh browser ini',
        isLoading: false,
      }));
      return;
    }

    setCurrentLocation((prev) => ({ ...prev, isLoading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          isLoading: false,
        });
      },
      (error) => {
        let errorMessage = 'Gagal mendapatkan lokasi';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Akses lokasi ditolak oleh pengguna';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Informasi lokasi tidak tersedia';
            break;
          case error.TIMEOUT:
            errorMessage = 'Permintaan lokasi timeout';
            break;
        }
        setCurrentLocation((prev) => ({
          ...prev,
          error: errorMessage,
          isLoading: false,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Cache for 1 minute
      }
    );
  }, []);

  // Check if current location is within geofence
  const checkGeofence = useCallback((settings: GeofencingSettings): boolean => {
    if (!settings.enabled) {
      return true; // Geofencing disabled, always return true
    }

    if (!currentLocation.latitude || !currentLocation.longitude) {
      return false; // No location data
    }

    const distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      settings.latitude,
      settings.longitude
    );

    setDistanceFromCenter(distance);
    const isWithin = distance <= settings.radiusMeters;
    setIsWithinGeofence(isWithin);
    return isWithin;
  }, [currentLocation]);

  // Update geofence status when location changes
  useEffect(() => {
    if (currentLocation.latitude && currentLocation.longitude) {
      // Geofence status will be checked when checkGeofence is called
    }
  }, [currentLocation]);

  return {
    currentLocation,
    isWithinGeofence,
    distanceFromCenter,
    requestLocation,
    checkGeofence,
  };
}

// Format distance for display
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
