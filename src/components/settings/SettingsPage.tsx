'use client';

import React, { useState, useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useAudio } from '@/hooks/useAudio';
import { useGeofencing, formatDistance } from '@/hooks/useGeofencing';
import { AppSettings } from '@/types';

// Settings Page Component
export function SettingsPage() {
  const { settings, updateSettings, updateBranding, updateGeofencing, isLoading } = useSettings();
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'attendance' | 'face' | 'security' | 'branding' | 'geofencing'>('general');
  const { playSuccessSound } = useAudio();
  const { currentLocation, requestLocation, checkGeofence, isWithinGeofence, distanceFromCenter } = useGeofencing();

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  // Request location on mount for geofencing settings
  useEffect(() => {
    if (formData.geofencing?.enabled) {
      requestLocation();
    }
  }, [formData.geofencing?.enabled, requestLocation]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(formData);
      playSuccessSound();
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBranding = async () => {
    setSaving(true);
    try {
      await updateBranding(formData.branding);
      playSuccessSound();
    } catch (error) {
      console.error('Error saving branding:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGeofencing = async () => {
    setSaving(true);
    try {
      await updateGeofencing(formData.geofencing);
      playSuccessSound();
    } catch (error) {
      console.error('Error saving geofencing:', error);
    } finally {
      setSaving(false);
    }
  };

  // Set current location as geofence center
  const setCurrentLocationAsCenter = () => {
    if (currentLocation.latitude && currentLocation.longitude) {
      setFormData({
        ...formData,
        geofencing: {
          ...formData.geofencing,
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }
      });
    }
  };

  // Test geofence
  const testGeofence = () => {
    if (formData.geofencing.enabled) {
      const result = checkGeofence(formData.geofencing);
      alert(result 
        ? `✅ Lokasi Anda dalam radius ${formatDistance(formData.geofencing.radiusMeters)} dari sekolah`
        : `❌ Lokasi Anda di luar radius! Jarak: ${distanceFromCenter ? formatDistance(distanceFromCenter) : 'Tidak diketahui'}`
      );
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Memuat pengaturan...</div>;
  }

  const tabs = [
    { id: 'general', label: 'Umum', icon: '⚙️' },
    { id: 'attendance', label: 'Absensi', icon: '⏰' },
    { id: 'face', label: 'Face ID', icon: '👤' },
    { id: 'security', label: 'Keamanan', icon: '🔐' },
    { id: 'branding', label: 'Branding', icon: '🎨' },
    { id: 'geofencing', label: 'Geofencing', icon: '📍' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Pengaturan</h2>
        <p className="text-muted-foreground">Konfigurasi sistem absensi</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === tab.id 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Audio & Suara</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Efek Suara</div>
                  <div className="text-sm text-muted-foreground">Bunyi beep saat absensi berhasil/gagal</div>
                </div>
                <button
                  onClick={() => setFormData({ ...formData, audioEnabled: !formData.audioEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.audioEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.audioEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Pengumuman Suara</div>
                  <div className="text-sm text-muted-foreground">Sebut nama siswa saat absensi berhasil</div>
                </div>
                <button
                  onClick={() => setFormData({ ...formData, voiceAnnouncement: !formData.voiceAnnouncement })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.voiceAnnouncement ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.voiceAnnouncement ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      )}

      {/* Attendance Settings */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Jadwal Absensi</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Waktu Mulai</label>
                <input
                  type="time"
                  value={formData.attendanceStartTime}
                  onChange={(e) => setFormData({ ...formData, attendanceStartTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Waktu Selesai</label>
                <input
                  type="time"
                  value={formData.attendanceEndTime}
                  onChange={(e) => setFormData({ ...formData, attendanceEndTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Toleransi Keterlambatan (menit)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={formData.lateThresholdMinutes}
                  onChange={(e) => setFormData({ ...formData, lateThresholdMinutes: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      )}

      {/* Face ID Settings */}
      {activeTab === 'face' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Pengenalan Wajah</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Threshold Kepercayaan: {(formData.confidenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.05"
                  value={formData.confidenceThreshold}
                  onChange={(e) => setFormData({ ...formData, confidenceThreshold: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lebih tinggi = lebih ketat, Lebih rendah = lebih toleran
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Multi-Angle Enrollment</div>
                  <div className="text-sm text-muted-foreground">
                    Daftarkan wajah dari 3 sudut untuk akurasi lebih tinggi
                  </div>
                </div>
                <button
                  onClick={() => setFormData({ ...formData, multiAngleEnrollment: !formData.multiAngleEnrollment })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.multiAngleEnrollment ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.multiAngleEnrollment ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Keamanan</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Auto-Logout (menit idle)</label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={formData.autoLogoutMinutes}
                  onChange={(e) => setFormData({ ...formData, autoLogoutMinutes: parseInt(e.target.value) || 30 })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Session akan otomatis logout setelah tidak ada aktivitas
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </div>
      )}

      {/* Branding Settings */}
      {activeTab === 'branding' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-4">Informasi Sekolah</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Nama Sekolah</label>
                <input
                  type="text"
                  value={formData.branding?.schoolName || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, schoolName: e.target.value }
                  })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                  placeholder="Nama Sekolah"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Warna Primer</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.branding?.primaryColor || '#3b82f6'}
                    onChange={(e) => setFormData({
                      ...formData,
                      branding: { ...formData.branding, primaryColor: e.target.value }
                    })}
                    className="w-14 h-11 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.branding?.primaryColor || '#3b82f6'}
                    onChange={(e) => setFormData({
                      ...formData,
                      branding: { ...formData.branding, primaryColor: e.target.value }
                    })}
                    className="flex-1 px-4 py-3 rounded-lg border bg-background"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Warna Sekunder</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.branding?.secondaryColor || '#1e40af'}
                    onChange={(e) => setFormData({
                      ...formData,
                      branding: { ...formData.branding, secondaryColor: e.target.value }
                    })}
                    className="w-14 h-11 rounded border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.branding?.secondaryColor || '#1e40af'}
                    onChange={(e) => setFormData({
                      ...formData,
                      branding: { ...formData.branding, secondaryColor: e.target.value }
                    })}
                    className="flex-1 px-4 py-3 rounded-lg border bg-background"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Alamat</label>
                <textarea
                  value={formData.branding?.address || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, address: e.target.value }
                  })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                  rows={2}
                  placeholder="Alamat sekolah"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Telepon</label>
                <input
                  type="tel"
                  value={formData.branding?.phone || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, phone: e.target.value }
                  })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                  placeholder="(021) 1234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={formData.branding?.email || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, email: e.target.value }
                  })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                  placeholder="info@sekolah.sch.id"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">Website</label>
                <input
                  type="url"
                  value={formData.branding?.website || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    branding: { ...formData.branding, website: e.target.value }
                  })}
                  className="w-full px-4 py-3 rounded-lg border bg-background"
                  placeholder="https://www.sekolah.sch.id"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveBranding}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Branding'}
            </button>
          </div>
        </div>
      )}

      {/* Geofencing Settings */}
      {activeTab === 'geofencing' && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Geofencing (Batas Lokasi)</h3>
              <button
                onClick={() => setFormData({
                  ...formData,
                  geofencing: { ...formData.geofencing, enabled: !formData.geofencing?.enabled }
                })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.geofencing?.enabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.geofencing?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {formData.geofencing?.enabled && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-3">
                    Absensi hanya bisa dilakukan dalam radius tertentu dari lokasi sekolah
                  </p>
                  
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
                  >
                    📍 Dapatkan Lokasi Saat Ini
                  </button>

                  {currentLocation.latitude && (
                    <div className="mt-3 text-sm">
                      <p>Lokasi Anda: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}</p>
                      {currentLocation.accuracy && (
                        <p className="text-muted-foreground">Akurasi: ±{currentLocation.accuracy.toFixed(0)}m</p>
                      )}
                    </div>
                  )}
                  
                  {currentLocation.error && (
                    <p className="mt-2 text-sm text-destructive">{currentLocation.error}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.geofencing?.latitude || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        geofencing: { ...formData.geofencing, latitude: parseFloat(e.target.value) || 0 }
                      })}
                      className="w-full px-4 py-3 rounded-lg border bg-background"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.geofencing?.longitude || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        geofencing: { ...formData.geofencing, longitude: parseFloat(e.target.value) || 0 }
                      })}
                      className="w-full px-4 py-3 rounded-lg border bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Radius (meter)</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={formData.geofencing?.radiusMeters || 100}
                    onChange={(e) => setFormData({
                      ...formData,
                      geofencing: { ...formData.geofencing, radiusMeters: parseInt(e.target.value) || 100 }
                    })}
                    className="w-full px-4 py-3 rounded-lg border bg-background"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Radius absensi dari titik pusat sekolah
                  </p>
                </div>

                <button
                  type="button"
                  onClick={setCurrentLocationAsCenter}
                  disabled={!currentLocation.latitude}
                  className="w-full px-4 py-3 border rounded-lg hover:bg-muted transition disabled:opacity-50"
                >
                  🎯 Gunakan Lokasi Saat Ini Sebagai Pusat
                </button>

                <button
                  type="button"
                  onClick={testGeofence}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  🧪 Test Geofencing
                </button>

                {isWithinGeofence !== null && (
                  <div className={`p-4 rounded-lg ${isWithinGeofence ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                    {isWithinGeofence 
                      ? `✅ Anda berada dalam radius ${formatDistance(formData.geofencing?.radiusMeters || 100)}`
                      : `❌ Anda di luar radius! Jarak: ${distanceFromCenter ? formatDistance(distanceFromCenter) : 'Tidak diketahui'}`
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSaveGeofencing}
              disabled={saving}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Geofencing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
