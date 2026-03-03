'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppSettings, SchoolBranding, GeofencingSettings } from '@/types';
import { ref, onValue, set } from 'firebase/database';
import { database } from '@/lib/firebase';

// Default settings
const DEFAULT_SETTINGS: AppSettings = {
  confidenceThreshold: 0.6,
  attendanceStartTime: '07:00',
  attendanceEndTime: '08:00',
  lateThresholdMinutes: 15,
  autoLogoutMinutes: 30,
  audioEnabled: true,
  voiceAnnouncement: true,
  multiAngleEnrollment: true,
  maskDetectionEnabled: false,
  geofencing: {
    enabled: false,
    latitude: 0,
    longitude: 0,
    radiusMeters: 100,
  },
  branding: {
    schoolName: 'FaceAbsen School',
    primaryColor: '#3b82f6',
    secondaryColor: '#1e40af',
    address: '',
    phone: '',
    email: '',
    website: '',
  }
};

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  updateBranding: (branding: Partial<SchoolBranding>) => Promise<void>;
  updateGeofencing: (geofencing: Partial<GeofencingSettings>) => Promise<void>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from Firebase
  useEffect(() => {
    const settingsRef = ref(database, 'settings/app');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    try {
      const settingsRef = ref(database, 'settings/app');
      const updatedSettings = { ...settings, ...newSettings };
      await set(settingsRef, updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }, [settings]);

  // Update branding
  const updateBranding = useCallback(async (branding: Partial<SchoolBranding>) => {
    try {
      const settingsRef = ref(database, 'settings/app');
      const updatedBranding = { ...settings.branding, ...branding };
      const updatedSettings = { ...settings, branding: updatedBranding };
      await set(settingsRef, updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating branding:', error);
      throw error;
    }
  }, [settings]);

  // Update geofencing
  const updateGeofencing = useCallback(async (geofencing: Partial<GeofencingSettings>) => {
    try {
      const settingsRef = ref(database, 'settings/app');
      const updatedGeofencing = { ...settings.geofencing, ...geofencing };
      const updatedSettings = { ...settings, geofencing: updatedGeofencing };
      await set(settingsRef, updatedSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating geofencing:', error);
      throw error;
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ 
      settings, 
      updateSettings, 
      updateBranding, 
      updateGeofencing, 
      isLoading 
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
