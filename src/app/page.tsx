'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { useOptimizedFaceRecognition } from '@/hooks/face/useOptimizedFaceRecognition';
import { useCamera } from '@/hooks/face/useCamera';
import { useAudio, useTTSApi } from '@/hooks/useAudio';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { useThrottledToast } from '@/hooks/useThrottledToast';
import { useServiceWorker, usePWA } from '@/hooks/useServiceWorker';
import { VirtualList, Skeleton, CardSkeleton, ListItemSkeleton, TableSkeleton, ChartSkeleton, CameraSkeleton, PageSkeleton } from '@/components/ui/virtual-list';
import { Student, Attendance, HourlyStats, AppSettings, AuditLog, SystemHealth, BulkImportResult } from '@/types';
import { ref, set, push, onValue, get, remove } from 'firebase/database';
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { database, storage, enableOfflinePersistence, onConnectionChange, createBatchWriter } from '@/lib/firebase-optimized';
import { getStudentsFromIndexedDB, saveStudentsToIndexedDB, getLastSyncTime, setLastSyncTime } from '@/lib/indexeddb-storage';
import { format, parse, differenceInMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ============== LOGIN PAGE ==============
function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch {
      // Error handled by context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold">FaceAbsen</h1>
            <p className="text-muted-foreground">Sistem Absensi Berbasis Pengenalan Wajah</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="admin@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Memproses...' : isLogin ? 'Masuk' : 'Daftar'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? 'Belum punya akun?' : 'Sudah punya akun?'}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                clearError();
              }}
              className="ml-1 text-primary font-medium hover:underline"
            >
              {isLogin ? 'Daftar' : 'Masuk'}
            </button>
          </p>

          <div className="p-4 rounded-lg bg-muted text-sm">
            <p className="font-medium mb-2">📋 Demo Mode:</p>
            <p className="text-muted-foreground">
              Aplikasi ini memerlukan konfigurasi Firebase. Silakan buat project Firebase dan masukkan kredensial di file .env.local
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== TYPES ==============
interface MultiFaceDetection {
  box: { x: number; y: number; width: number; height: number };
  descriptor: number[];
  student?: Student;
  status: 'detected' | 'matched' | 'not_registered' | 'already_attended';
  confidence: number;
}

interface ProcessedAttendance {
  student: Student;
  status: 'success' | 'already_attended' | 'late';
  time?: string;
  isLate?: boolean;
}

// ============== SETTINGS COMPONENT ==============
function SettingsPage() {
  const { settings, updateSettings, isLoading } = useSettings();
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const { playSuccessSound } = useAudio();

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

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

  if (isLoading) {
    return <div className="p-8 text-center">Memuat pengaturan...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Pengaturan</h2>
        <p className="text-muted-foreground">Konfigurasi sistem absensi</p>
      </div>

      {/* Face Recognition Settings */}
      <div className="bg-card rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          Pengenalan Wajah
        </h3>
        
        <div className="space-y-4">
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
        </div>
      </div>

      {/* Attendance Schedule Settings */}
      <div className="bg-card rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Jadwal Absensi
        </h3>
        
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

      {/* Audio Settings */}
      <div className="bg-card rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          Audio & Suara
        </h3>
        
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
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.audioEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
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
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  formData.voiceAnnouncement ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-card rounded-xl border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Keamanan
        </h3>
        
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

      {/* Save Button */}
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
  );
}

// ============== SYSTEM HEALTH MONITOR ==============
function SystemHealthMonitor() {
  const [health, setHealth] = useState<SystemHealth>({
    camera: 'checking',
    firebase: 'checking',
    models: 'checking',
    internet: 'checking',
  });
  const { isLoaded: modelsLoaded, isLoading: modelsLoading } = useOptimizedFaceRecognition();

  useEffect(() => {
    let isMounted = true;
    
    const runHealthChecks = async () => {
      if (!isMounted) return;
      
      setHealth({
        camera: 'checking',
        firebase: 'checking',
        models: 'checking',
        internet: 'checking',
      });

      // Check internet
      try {
        await fetch('https://www.google.com', { mode: 'no-cors', cache: 'no-store' });
        if (isMounted) setHealth(prev => ({ ...prev, internet: 'ok' }));
      } catch {
        if (isMounted) setHealth(prev => ({ ...prev, internet: 'error' }));
      }

      // Check camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        if (isMounted) setHealth(prev => ({ ...prev, camera: 'ok' }));
      } catch {
        if (isMounted) setHealth(prev => ({ ...prev, camera: 'error' }));
      }

      // Check Firebase
      try {
        const connectedRef = ref(database, '.info/connected');
        const snapshot = await get(connectedRef);
        if (isMounted) setHealth(prev => ({ ...prev, firebase: snapshot.exists() ? 'ok' : 'error' }));
      } catch {
        if (isMounted) setHealth(prev => ({ ...prev, firebase: 'error' }));
      }

      // Check models
      if (isMounted) {
        setHealth(prev => ({ ...prev, models: modelsLoaded ? 'ok' : modelsLoading ? 'checking' : 'error' }));
      }
    };

    runHealthChecks();
    
    return () => {
      isMounted = false;
    };
  }, [modelsLoaded, modelsLoading]);

  const checkHealth = useCallback(() => {
    // Trigger re-run by updating a dummy state or just run directly
    const runChecks = async () => {
      setHealth({
        camera: 'checking',
        firebase: 'checking',
        models: 'checking',
        internet: 'checking',
      });

      try {
        await fetch('https://www.google.com', { mode: 'no-cors', cache: 'no-store' });
        setHealth(prev => ({ ...prev, internet: 'ok' }));
      } catch {
        setHealth(prev => ({ ...prev, internet: 'error' }));
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setHealth(prev => ({ ...prev, camera: 'ok' }));
      } catch {
        setHealth(prev => ({ ...prev, camera: 'error' }));
      }

      try {
        const connectedRef = ref(database, '.info/connected');
        const snapshot = await get(connectedRef);
        setHealth(prev => ({ ...prev, firebase: snapshot.exists() ? 'ok' : 'error' }));
      } catch {
        setHealth(prev => ({ ...prev, firebase: 'error' }));
      }

      setHealth(prev => ({ ...prev, models: modelsLoaded ? 'ok' : modelsLoading ? 'checking' : 'error' }));
    };
    
    runChecks();
  }, [modelsLoaded, modelsLoading]);

  const statusColors = {
    ok: 'text-green-500 bg-green-500/10',
    error: 'text-red-500 bg-red-500/10',
    checking: 'text-yellow-500 bg-yellow-500/10',
  };

  const statusLabels = {
    ok: 'OK',
    error: 'Error',
    checking: 'Checking...',
  };

  return (
    <div className="bg-card rounded-xl border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          System Health
        </h3>
        <button
          onClick={checkHealth}
          className="p-2 hover:bg-muted rounded-lg transition"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(health).map(([key, value]) => (
          <div key={key} className={`p-3 rounded-lg ${statusColors[value]}`}>
            <div className="text-xs uppercase font-medium mb-1">{key}</div>
            <div className="text-sm font-semibold">{statusLabels[value]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== AUDIT LOG COMPONENT ==============
function AuditLogComponent() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const logsRef = ref(database, 'auditLog');
    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logList = Object.entries(data)
          .map(([id, value]) => ({
            id,
            ...(value as Omit<AuditLog, 'id'>)
          }))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50); // Last 50 entries
        setLogs(logList);
      } else {
        setLogs([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const actionColors: Record<string, string> = {
    'LOGIN': 'bg-blue-500/10 text-blue-600',
    'LOGOUT': 'bg-gray-500/10 text-gray-600',
    'ADD_STUDENT': 'bg-green-500/10 text-green-600',
    'EDIT_STUDENT': 'bg-yellow-500/10 text-yellow-600',
    'DELETE_STUDENT': 'bg-red-500/10 text-red-600',
    'ATTENDANCE': 'bg-purple-500/10 text-purple-600',
    'SETTINGS_CHANGE': 'bg-orange-500/10 text-orange-600',
  };

  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Log Aktivitas Admin</h3>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Memuat log...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Belum ada aktivitas tercatat</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">Waktu</th>
                <th className="px-4 py-2 text-left">Aksi</th>
                <th className="px-4 py-2 text-left">Detail</th>
                <th className="px-4 py-2 text-left">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 text-muted-foreground">
                    {format(new Date(log.timestamp), 'dd/MM HH:mm')}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${actionColors[log.action] || 'bg-muted'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2">{log.details}</td>
                  <td className="px-4 py-2 text-muted-foreground">{log.adminEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============== ATTENDANCE PAGE ==============
function AttendancePage() {
  const { videoRef, isActive, error: cameraError, startCamera, stopCamera } = useCamera();
  const {
    isLoaded: modelsLoaded,
    isLoading: modelsLoading,
    detectFaces,
    recognizeMultipleFaces,
    startDetectionLoop,
    stopDetectionLoop,
    preloadDescriptorsFromCache,
    syncStudentsToCache,
    getCacheStats
  } = useOptimizedFaceRecognition();
  const { settings } = useSettings();
  const { playSuccessSound, playErrorSound, playWarningSound, speak } = useAudio();
  const { speakWithApi } = useTTSApi();
  const { showThrottledToast } = useThrottledToast(2000);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [faceDetections, setFaceDetections] = useState<MultiFaceDetection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedAttendances, setProcessedAttendances] = useState<ProcessedAttendance[]>([]);
  const [lastAttendanceTime, setLastAttendanceTime] = useState<{ [key: string]: number }>({});
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [countdown, setCountdown] = useState<string>('');
  const [isOnline, setIsOnline] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const COOLDOWN_MS = 3000;
  const batchWriterRef = useRef(createBatchWriter<{ siswaId: string; nama: string; kelas: string; timestamp: string; date: string; status: string; isLate: boolean }>('absensi/' + format(new Date(), 'yyyy-MM-dd'), 1000));

  // Enable Firebase offline persistence
  useEffect(() => {
    enableOfflinePersistence();
    
    // Listen for connection changes
    const unsubscribe = onConnectionChange((online) => {
      setIsOnline(online);
      if (!online) {
        showThrottledToast({
          title: 'Mode Offline',
          description: 'Data akan disinkronkan saat koneksi kembali',
          variant: 'warning'
        });
      }
    });
    
    return unsubscribe;
  }, [showThrottledToast]);

  // Check if within attendance time
  const checkAttendanceTime = useCallback(() => {
    const now = new Date();
    const currentTime = format(now, 'HH:mm');
    const { attendanceStartTime, attendanceEndTime } = settings;
    
    return currentTime >= attendanceStartTime && currentTime <= attendanceEndTime;
  }, [settings]);

  // Calculate countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const { attendanceStartTime, attendanceEndTime } = settings;
      
      const startTime = parse(attendanceStartTime, 'HH:mm', now);
      const endTime = parse(attendanceEndTime, 'HH:mm', now);
      
      if (now < startTime) {
        const diff = differenceInMinutes(startTime, now);
        setCountdown(`Absensi dimulai dalam ${diff} menit`);
      } else if (now > endTime) {
        setCountdown('Waktu absensi telah berakhir');
      } else {
        const remaining = differenceInMinutes(endTime, now);
        setCountdown(`Sisa waktu absensi: ${remaining} menit`);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [settings]);

  // Load students with IndexedDB caching
  useEffect(() => {
    let isMounted = true;
    
    const loadStudents = async () => {
      setIsLoadingStudents(true);
      
      // Try loading from cache first
      try {
        const cachedStudents = await preloadDescriptorsFromCache();
        if (cachedStudents.length > 0 && isMounted) {
          setStudents(cachedStudents);
          setIsLoadingStudents(false);
        }
      } catch (err) {
        console.warn('Could not load from cache:', err);
      }
      
      // Load from Firebase
      const studentsRef = ref(database, 'siswa');
      const unsubscribe = onValue(studentsRef, async (snapshot) => {
        if (!isMounted) return;
        
        const data = snapshot.val();
        if (data) {
          const studentList = Object.entries(data).map(([id, value]) => ({
            id,
            ...(value as Omit<Student, 'id'>)
          }));
          setStudents(studentList);
          
          // Sync to IndexedDB cache
          await syncStudentsToCache(studentList);
        } else {
          setStudents([]);
        }
        setIsLoadingStudents(false);
      });

      return () => {
        isMounted = false;
        unsubscribe();
      };
    };
    
    loadStudents();
  }, [preloadDescriptorsFromCache, syncStudentsToCache]);

  // Start/stop optimized detection loop
  useEffect(() => {
    if (isActive && modelsLoaded && !isLoadingStudents) {
      startDetectionLoop(videoRef.current!, (detections) => {
        const recognizedDetections = recognizeMultipleFaces(detections, students, settings.confidenceThreshold);
        setFaceDetections(recognizedDetections);
      });
    }

    return () => {
      stopDetectionLoop();
    };
  }, [isActive, modelsLoaded, isLoadingStudents, students, settings.confidenceThreshold, startDetectionLoop, stopDetectionLoop, recognizeMultipleFaces, videoRef]);

  // Draw face boxes on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    faceDetections.forEach((detection) => {
      const { x, y, width, height } = detection.box;
      
      let boxColor = '#3b82f6';
      let labelColor = '#3b82f6';
      let label = 'Mendeteksi...';
      
      switch (detection.status) {
        case 'matched':
          boxColor = '#22c55e';
          labelColor = '#22c55e';
          label = detection.student?.nama || 'Terdaftar';
          break;
        case 'already_attended':
          boxColor = '#f59e0b';
          labelColor = '#f59e0b';
          label = `${detection.student?.nama} (Sudah Absen)`;
          break;
        case 'not_registered':
          boxColor = '#ef4444';
          labelColor = '#ef4444';
          label = 'Tidak Terdaftar';
          break;
        default:
          boxColor = '#3b82f6';
          labelColor = '#3b82f6';
          label = 'Mendeteksi...';
      }

      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = labelColor;
      const labelWidth = ctx.measureText(label).width + 16;
      ctx.fillRect(x, y - 32, Math.max(width, labelWidth), 32);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(label, x + 8, y - 10);
      
      if (detection.confidence && detection.status === 'matched') {
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(`${(detection.confidence * 100).toFixed(0)}%`, x + 8, y - 46);
      }
    });

    if (faceDetections.length > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, 10, 150, 36);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`${faceDetections.length} orang terdeteksi`, 20, 34);
    }
  }, [faceDetections]);

  // Check if time is late
  const isLate = useCallback((time: Date) => {
    const { attendanceStartTime, lateThresholdMinutes } = settings;
    const startTime = parse(attendanceStartTime, 'HH:mm', time);
    const threshold = new Date(startTime.getTime() + lateThresholdMinutes * 60000);
    return time > threshold;
  }, [settings]);

  // Log audit
  const logAudit = useCallback(async (action: string, details: string) => {
    try {
      const logsRef = ref(database, 'auditLog');
      const newLogRef = push(logsRef);
      await set(newLogRef, {
        action,
        details,
        adminEmail: 'admin@example.com', // Get from auth context
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }, []);

  const processAttendance = useCallback(async () => {
    if (!videoRef.current || isProcessing || !modelsLoaded) return;

    const video = videoRef.current;
    if (video.readyState !== 4) return;

    if (faceDetections.length < 1) {
      setStatusMessage('Tidak ada wajah terdeteksi');
      return;
    }

    setIsProcessing(true);
    setProcessedAttendances([]);
    setStatusMessage(`${faceDetections.length} orang terdeteksi - Memproses...`);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const currentTime = new Date();
      const now = Date.now();
      const lateStatus = isLate(currentTime);
      
      const results: ProcessedAttendance[] = [];
      const matchedDetections = faceDetections.filter(d => d.status === 'matched' && d.student);

      for (const detection of matchedDetections) {
        if (!detection.student) continue;

        const studentId = detection.student.id;
        
        const lastTime = lastAttendanceTime[studentId] || 0;
        if (now - lastTime < COOLDOWN_MS) {
          results.push({
            student: detection.student,
            status: 'already_attended',
            time: format(new Date(lastTime), 'HH:mm:ss')
          });
          continue;
        }

        const existingAttendanceRef = ref(database, `absensi/${today}/${studentId}`);
        const existingSnapshot = await get(existingAttendanceRef);
        
        if (existingSnapshot.exists()) {
          const existingData = existingSnapshot.val();
          const previousTime = format(new Date(existingData.timestamp), 'HH:mm:ss');
          
          results.push({
            student: detection.student,
            status: 'already_attended',
            time: previousTime
          });
          
          setFaceDetections(prev => 
            prev.map(d => 
              d.student?.id === studentId 
                ? { ...d, status: 'already_attended' as const }
                : d
            )
          );
        } else {
          const attendanceStatus = lateStatus ? 'Terlambat' : 'Hadir';
          
          const attendanceData = {
            siswaId: studentId,
            nama: detection.student.nama,
            kelas: detection.student.kelas,
            timestamp: currentTime.toISOString(),
            date: today,
            status: attendanceStatus,
            isLate: lateStatus
          };

          await set(existingAttendanceRef, attendanceData);
          
          results.push({
            student: detection.student,
            status: lateStatus ? 'late' : 'success',
            time: format(currentTime, 'HH:mm:ss'),
            isLate: lateStatus
          });

          // Play audio feedback
          if (settings.audioEnabled) {
            if (lateStatus) {
              playWarningSound();
            } else {
              playSuccessSound();
            }
          }

          // Voice announcement
          if (settings.voiceAnnouncement) {
            const announcement = lateStatus 
              ? `${detection.student.nama}, Anda terlambat` 
              : `Absensi berhasil, ${detection.student.nama}`;
            speak(announcement);
          }
          
          setLastAttendanceTime(prev => ({
            ...prev,
            [studentId]: now
          }));

          // Log audit
          await logAudit('ATTENDANCE', `${detection.student.nama} - ${attendanceStatus}`);
        }
      }

      setProcessedAttendances(results);

      const successCount = results.filter(r => r.status === 'success').length;
      const lateCount = results.filter(r => r.status === 'late').length;
      const alreadyCount = results.filter(r => r.status === 'already_attended').length;
      const notRegisteredCount = faceDetections.filter(d => d.status === 'not_registered').length;

      const messages: string[] = [];
      
      if (successCount > 0) {
        messages.push(`✅ ${successCount} absensi berhasil`);
      }
      
      if (lateCount > 0) {
        messages.push(`⚠️ ${lateCount} terlambat`);
      }
      
      if (alreadyCount > 0) {
        messages.push(`📋 ${alreadyCount} sudah absen`);
      }
      
      if (notRegisteredCount > 0) {
        messages.push(`❌ ${notRegisteredCount} tidak terdaftar`);
      }

      setStatusMessage(messages.join(' | '));

    } catch (error) {
      console.error('Attendance error:', error);
      setStatusMessage('Terjadi kesalahan saat memproses absensi');
      if (settings.audioEnabled) {
        playErrorSound();
      }
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  }, [isProcessing, modelsLoaded, faceDetections, lastAttendanceTime, videoRef, settings, playSuccessSound, playErrorSound, playWarningSound, speak, isLate, logAudit]);

  useEffect(() => {
    if (processedAttendances.length > 0) {
      const timer = setTimeout(() => {
        setProcessedAttendances([]);
        setStatusMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [processedAttendances]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Absensi dengan Face Recognition</h2>
          <p className="text-muted-foreground">Multi-deteksi wajah untuk pencatatan absensi massal</p>
        </div>
      </div>

      {/* Countdown & Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-lg bg-card border md:col-span-2">
          <div className="text-sm text-muted-foreground mb-1">Status Waktu</div>
          <div className="font-medium">{countdown}</div>
        </div>
        <div className="p-4 rounded-lg bg-card border">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${modelsLoaded ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-sm">
              {modelsLoading ? 'Memuat model...' : modelsLoaded ? 'Model siap' : 'Model belum dimuat'}
            </span>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card border">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm">{isActive ? 'Kamera aktif' : 'Kamera tidak aktif'}</span>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-card border">
          <span className="text-sm">Siswa: <strong>{students.length}</strong> | Deteksi: <strong className="text-primary">{faceDetections.length}</strong></span>
        </div>
      </div>

      {/* System Health */}
      <SystemHealthMonitor />

      {/* Camera View */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {!isActive && (
            <div className="text-center text-white p-8">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-muted-foreground">Klik tombol di bawah untuk mengaktifkan kamera</p>
            </div>
          )}
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

          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
                <p>Memproses {faceDetections.length} wajah...</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-wrap gap-3 justify-center border-t">
          {!isActive ? (
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Aktifkan Kamera
            </button>
          ) : (
            <>
              <button
                onClick={processAttendance}
                disabled={isProcessing || !modelsLoaded || faceDetections.length === 0}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Catat Absensi ({faceDetections.length} orang)
              </button>
              <button
                onClick={stopCamera}
                className="px-6 py-3 bg-destructive text-destructive-foreground rounded-lg font-medium hover:opacity-90 transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Matikan Kamera
              </button>
            </>
          )}
        </div>

        {cameraError && (
          <div className="p-4 bg-destructive/10 text-destructive text-sm">
            ⚠️ {cameraError}
          </div>
        )}
      </div>

      {/* Detection Results */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border ${
          statusMessage.includes('✅') 
            ? 'bg-green-500/10 border-green-500' 
            : statusMessage.includes('❌')
              ? 'bg-red-500/10 border-red-500'
              : 'bg-yellow-500/10 border-yellow-500'
        }`}>
          <p className="font-medium">{statusMessage}</p>
        </div>
      )}

      {/* Processed Attendances List */}
      {processedAttendances.length > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Hasil Absensi</h3>
          </div>
          <div className="divide-y max-h-60 overflow-y-auto">
            {processedAttendances.map((result, index) => (
              <div key={index} className={`p-4 flex items-center gap-4 ${
                result.status === 'success' ? 'bg-green-500/5' : 
                result.status === 'late' ? 'bg-orange-500/5' : 'bg-yellow-500/5'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  result.status === 'success' ? 'bg-green-500' : 
                  result.status === 'late' ? 'bg-orange-500' : 'bg-yellow-500'
                } text-white`}>
                  {result.status === 'success' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : result.status === 'late' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{result.student.nama}</div>
                  <div className="text-sm text-muted-foreground">
                    {result.student.kelas} • {result.status === 'success' ? `Absen jam ${result.time}` : 
                    result.status === 'late' ? `Terlambat jam ${result.time}` : `Sudah absen jam ${result.time}`}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  result.status === 'success' 
                    ? 'bg-green-500/10 text-green-600' :
                  result.status === 'late'
                    ? 'bg-orange-500/10 text-orange-600'
                    : 'bg-yellow-500/10 text-yellow-600'
                }`}>
                  {result.status === 'success' ? 'Berhasil' : result.status === 'late' ? 'Terlambat' : 'Sudah Absen'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== STUDENT MANAGEMENT WITH BULK IMPORT ==============
function StudentManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({ nama: '', nis: '', kelas: '', jurusan: '' });
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  
  const { videoRef, isActive, isLoading: cameraLoading, error: cameraError, startCamera, stopCamera } = useCamera();
  const { isLoaded, extractDescriptor, captureImage } = useOptimizedFaceRecognition();
  const { playSuccessSound, playErrorSound } = useAudio();

  useEffect(() => {
    const studentsRef = ref(database, 'siswa');
    const unsubscribe = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const studentList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Student, 'id'>)
        }));
        setStudents(studentList);
      } else {
        setStudents([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredStudents = students.filter(student =>
    student.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.nis.includes(searchTerm) ||
    student.kelas.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFormData({ nama: student.nama, nis: student.nis, kelas: student.kelas, jurusan: student.jurusan });
      setCapturedImage(student.fotoUrl || null);
      setFaceDescriptor(student.faceDescriptor || null);
    } else {
      setEditingStudent(null);
      setFormData({ nama: '', nis: '', kelas: '', jurusan: '' });
      setCapturedImage(null);
      setFaceDescriptor(null);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingStudent(null);
    setFormData({ nama: '', nis: '', kelas: '', jurusan: '' });
    setCapturedImage(null);
    setFaceDescriptor(null);
    setIsSaving(false);
    stopCamera();
  };

  const handleCapturePhoto = async () => {
    if (!videoRef.current || !isActive || !isLoaded) return;

    setIsCapturing(true);
    try {
      const imageData = captureImage(videoRef.current);
      if (imageData) {
        setCapturedImage(imageData);
        const descriptor = await extractDescriptor(videoRef.current);
        if (descriptor) {
          setFaceDescriptor(descriptor);
        } else {
          alert('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas.');
        }
      }
    } finally {
      setIsCapturing(false);
      stopCamera();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      let imageUrl = capturedImage || '';

      if (editingStudent) {
        const studentRef = ref(database, `siswa/${editingStudent.id}`);
        
        if (capturedImage && capturedImage.startsWith('data:')) {
          const imgRef = storageRef(storage, `students/${editingStudent.id}`);
          await uploadString(imgRef, capturedImage, 'data_url');
          imageUrl = await getDownloadURL(imgRef);
        }

        await set(studentRef, {
          nama: formData.nama,
          nis: formData.nis,
          kelas: formData.kelas,
          jurusan: formData.jurusan,
          fotoUrl: imageUrl,
          faceDescriptor: faceDescriptor || editingStudent.faceDescriptor,
          createdAt: editingStudent.createdAt,
          updatedAt: new Date().toISOString()
        });

        playSuccessSound();
      } else {
        const studentsRef = ref(database, 'siswa');
        const newStudentRef = push(studentsRef);
        const newId = newStudentRef.key;

        if (capturedImage && capturedImage.startsWith('data:')) {
          const imgRef = storageRef(storage, `students/${newId}`);
          await uploadString(imgRef, capturedImage, 'data_url');
          imageUrl = await getDownloadURL(imgRef);
        }

        await set(newStudentRef, {
          nama: formData.nama,
          nis: formData.nis,
          kelas: formData.kelas,
          jurusan: formData.jurusan,
          fotoUrl: imageUrl,
          faceDescriptor: faceDescriptor,
          createdAt: new Date().toISOString()
        });

        playSuccessSound();
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Error saving student:', error);
      playErrorSound();
      alert('Gagal menyimpan data siswa');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!confirm(`Yakin ingin menghapus ${student.nama}?`)) return;

    try {
      await remove(ref(database, `siswa/${student.id}`));

      if (student.fotoUrl) {
        try {
          const imgRef = storageRef(storage, `students/${student.id}`);
          await deleteObject(imgRef);
        } catch { }
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Gagal menghapus siswa');
    }
  };

  // Bulk Import Handler
  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkImporting(true);
    setImportResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<Record<string, unknown>>;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const row of jsonData) {
        try {
          const nama = String(row['Nama'] || row['nama'] || '');
          const nis = String(row['NIS'] || row['nis'] || '');
          const kelas = String(row['Kelas'] || row['kelas'] || '');
          const jurusan = String(row['Jurusan'] || row['jurusan'] || '');

          if (!nama || !nis || !kelas || !jurusan) {
            failed++;
            errors.push(`Baris ${jsonData.indexOf(row) + 2}: Data tidak lengkap`);
            continue;
          }

          const studentsRef = ref(database, 'siswa');
          const newStudentRef = push(studentsRef);
          await set(newStudentRef, {
            nama,
            nis,
            kelas,
            jurusan,
            fotoUrl: '',
            faceDescriptor: null,
            createdAt: new Date().toISOString()
          });

          success++;
        } catch {
          failed++;
          errors.push(`Baris ${jsonData.indexOf(row) + 2}: Gagal menyimpan`);
        }
      }

      setImportResult({ success, failed, errors });
      playSuccessSound();
    } catch (error) {
      console.error('Bulk import error:', error);
      playErrorSound();
      setImportResult({ success: 0, failed: 0, errors: ['Gagal membaca file'] });
    } finally {
      setBulkImporting(false);
      setShowBulkImport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Data Siswa</h2>
          <p className="text-muted-foreground">Kelola data siswa dan Face ID</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBulkImport(true)}
            className="px-4 py-2 border rounded-lg font-medium hover:bg-muted transition"
          >
            📥 Import
          </button>
          <button
            onClick={() => handleOpenDialog()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            + Tambah Siswa
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Cari siswa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
        />
        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className={`p-4 rounded-lg border ${importResult.failed > 0 ? 'bg-yellow-500/10 border-yellow-500' : 'bg-green-500/10 border-green-500'}`}>
          <p className="font-medium">
            Import selesai: {importResult.success} berhasil, {importResult.failed} gagal
          </p>
          {importResult.errors.length > 0 && (
            <ul className="text-sm mt-2 text-muted-foreground">
              {importResult.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Students Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Foto</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Nama</th>
                <th className="px-4 py-3 text-left text-sm font-medium">NIS</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Kelas</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Face ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Memuat data...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    {searchTerm ? 'Tidak ada siswa yang cocok' : 'Belum ada data siswa'}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                        {student.fotoUrl ? (
                          <img src={student.fotoUrl} alt={student.nama} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{student.nama}</td>
                    <td className="px-4 py-3 text-muted-foreground">{student.nis}</td>
                    <td className="px-4 py-3 text-muted-foreground">{student.kelas}</td>
                    <td className="px-4 py-3">
                      {student.faceDescriptor ? (
                        <span className="px-2 py-1 bg-green-500/10 text-green-600 text-xs rounded-full">
                          Terdaftar
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-yellow-500/10 text-yellow-600 text-xs rounded-full">
                          Belum ada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenDialog(student)}
                          className="p-2 hover:bg-muted rounded-lg transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(student)}
                          className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-lg transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Import Dialog */}
      {showBulkImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Import Data Siswa</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload file Excel/CSV dengan kolom: Nama, NIS, Kelas, Jurusan
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleBulkImport}
              disabled={bulkImporting}
              className="w-full p-4 border-2 border-dashed rounded-lg text-center"
            />
            {bulkImporting && (
              <div className="mt-4 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-sm mt-2">Mengimport...</p>
              </div>
            )}
            <button
              onClick={() => setShowBulkImport(false)}
              className="mt-4 w-full py-2 border rounded-lg hover:bg-muted transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Student Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">
                {editingStudent ? 'Edit Siswa' : 'Tambah Siswa Baru'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Nama Lengkap *</label>
                <input
                  type="text"
                  value={formData.nama}
                  onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">NIS *</label>
                <input
                  type="text"
                  value={formData.nis}
                  onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Kelas *</label>
                  <input
                    type="text"
                    value={formData.kelas}
                    onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none"
                    placeholder="XII"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Jurusan *</label>
                  <input
                    type="text"
                    value={formData.jurusan}
                    onChange={(e) => setFormData({ ...formData, jurusan: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none"
                    placeholder="IPA"
                    required
                  />
                </div>
              </div>

              {/* Photo Capture */}
              <div>
                <label className="block text-sm font-medium mb-2">Foto Wajah (Face ID)</label>
                
                {capturedImage ? (
                  <div className="space-y-3">
                    <div className="relative inline-block mx-auto">
                      <img 
                        src={capturedImage} 
                        alt="Captured" 
                        className="w-40 h-40 object-cover rounded-lg mx-auto"
                      />
                      <button
                        type="button"
                        onClick={() => { setCapturedImage(null); setFaceDescriptor(null); }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full text-sm"
                      >
                        ×
                      </button>
                    </div>
                    {faceDescriptor && (
                      <p className="text-sm text-green-600 text-center">✓ Face ID terdeteksi</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <video
                      ref={videoRef}
                      className={`w-full aspect-video bg-black rounded-lg ${isActive ? 'block' : 'hidden'}`}
                      playsInline
                      muted
                    />
                    
                    {isActive ? (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={handleCapturePhoto}
                          disabled={isCapturing || !isLoaded}
                          className="w-full py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {isCapturing ? 'Memproses...' : 'Ambil Foto'}
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="w-full py-2 border rounded-lg text-muted-foreground hover:bg-muted"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <button
                          type="button"
                          onClick={startCamera}
                          disabled={cameraLoading}
                          className="w-full py-8 border-2 border-dashed rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition disabled:opacity-50"
                        >
                          {cameraLoading ? (
                            <div className="flex flex-col items-center gap-2">
                              <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
                              <span>Memuat kamera...</span>
                            </div>
                          ) : (
                            <>
                              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              Buka Kamera
                            </>
                          )}
                        </button>
                        {cameraError && (
                          <p className="text-sm text-destructive text-center">{cameraError}</p>
                        )}
                        {!isLoaded && (
                          <p className="text-sm text-yellow-600 text-center">
                            Model Face Recognition sedang dimuat...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseDialog}
                  disabled={isSaving}
                  className="flex-1 py-3 border rounded-lg font-medium hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== STATISTICS PAGE ==============
function StatisticsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const studentsRef = ref(database, 'siswa');
    const unsubscribeStudents = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStudents(Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Student, 'id'>)
        })));
      }
    });

    return () => unsubscribeStudents();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const attendanceRef = ref(database, `absensi/${selectedDate}`);
    const unsubscribe = onValue(attendanceRef, (snapshot) => {
      if (!isMounted) return;
      const data = snapshot.val();
      if (data) {
        const attendanceList = Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Attendance, 'id'>)
        }));
        setAttendance(attendanceList.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      } else {
        setAttendance([]);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedDate]);

  const stats = {
    terdaftar: students.length,
    hadir: attendance.filter(a => a.status === 'Hadir').length,
    terlambat: attendance.filter(a => a.status === 'Terlambat').length,
    tidakHadir: students.length - attendance.length,
    persentase: students.length > 0 ? ((attendance.length / students.length) * 100).toFixed(1) : '0'
  };

  const hourlyStats: HourlyStats[] = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    const count = attendance.filter(a => {
      const date = new Date(a.timestamp);
      return date.getHours() === i;
    }).length;
    return { hour: `${hour}:00`, count };
  }).filter(h => h.count > 0 || parseInt(h.hour.split(':')[0]) >= 6 && parseInt(h.hour.split(':')[0]) <= 18);

  const pieData = [
    { name: 'Hadir', value: stats.hadir, color: '#22c55e' },
    { name: 'Terlambat', value: stats.terlambat, color: '#f59e0b' },
    { name: 'Tidak Hadir', value: stats.tidakHadir, color: '#ef4444' },
  ];

  const exportToExcel = () => {
    const exportData = attendance.map(a => ({
      'Nama': a.nama,
      'Kelas': a.kelas,
      'Waktu': format(new Date(a.timestamp), 'HH:mm:ss'),
      'Status': a.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Absensi');
    XLSX.writeFile(wb, `absensi-${selectedDate}.xlsx`);
  };

  const exportToPDF = () => {
    // For PDF export, we'll create a printable HTML
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Laporan Absensi - ${selectedDate}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
            .stats { margin-bottom: 20px; }
            .stat-item { display: inline-block; margin-right: 20px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Laporan Absensi</h1>
          <p>Tanggal: ${format(new Date(selectedDate), 'EEEE, d MMMM yyyy', { locale: id })}</p>
          <div class="stats">
            <div class="stat-item">Total Siswa: ${stats.terdaftar}</div>
            <div class="stat-item">Hadir: ${stats.hadir}</div>
            <div class="stat-item">Terlambat: ${stats.terlambat}</div>
            <div class="stat-item">Tidak Hadir: ${stats.tidakHadir}</div>
            <div class="stat-item">Persentase: ${stats.persentase}%</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama</th>
                <th>Kelas</th>
                <th>Waktu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${attendance.map((a, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${a.nama}</td>
                  <td>${a.kelas}</td>
                  <td>${format(new Date(a.timestamp), 'HH:mm:ss')}</td>
                  <td>${a.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            Dicetak pada: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}
          </p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Statistik Absensi</h2>
          <p className="text-muted-foreground">Ringkasan dan laporan absensi</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 rounded-lg border bg-background"
          />
          <button
            onClick={exportToPDF}
            disabled={attendance.length === 0}
            className="px-4 py-2 border rounded-lg font-medium hover:bg-muted disabled:opacity-50"
          >
            📄 Export PDF
          </button>
          <button
            onClick={exportToExcel}
            disabled={attendance.length === 0}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-6 rounded-xl bg-card border">
          <div className="text-sm text-muted-foreground mb-1">Total Siswa</div>
          <div className="text-3xl font-bold">{stats.terdaftar}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="text-sm text-muted-foreground mb-1">Hadir</div>
          <div className="text-3xl font-bold text-green-600">{stats.hadir}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="text-sm text-muted-foreground mb-1">Terlambat</div>
          <div className="text-3xl font-bold text-orange-600">{stats.terlambat}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="text-sm text-muted-foreground mb-1">Tidak Hadir</div>
          <div className="text-3xl font-bold text-red-600">{stats.tidakHadir}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="text-sm text-muted-foreground mb-1">Persentase</div>
          <div className="text-3xl font-bold text-primary">{stats.persentase}%</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Absensi per Jam</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#22c55e" name="Jumlah" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border p-6">
          <h3 className="font-semibold mb-4">Distribusi Kehadiran</h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Riwayat Absensi - {format(new Date(selectedDate), 'EEEE, d MMMM yyyy', { locale: id })}</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
          ) : attendance.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Tidak ada data absensi pada tanggal ini</div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">No</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Nama</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Kelas</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Waktu</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendance.map((a, index) => (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-medium">{a.nama}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.kelas}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(a.timestamp), 'HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        a.status === 'Hadir' 
                          ? 'bg-green-500/10 text-green-600'
                          : a.status === 'Terlambat'
                            ? 'bg-orange-500/10 text-orange-600'
                            : 'bg-yellow-500/10 text-yellow-600'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <AuditLogComponent />
    </div>
  );
}

// ============== DASHBOARD ==============
function Dashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    const studentsRef = ref(database, 'siswa');
    const unsubscribeStudents = onValue(studentsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStudents(Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Student, 'id'>)
        })));
      } else {
        setStudents([]);
      }
    });

    const attendanceRef = ref(database, `absensi/${today}`);
    const unsubscribeAttendance = onValue(attendanceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTodayAttendance(Object.entries(data).map(([id, value]) => ({
          id,
          ...(value as Omit<Attendance, 'id'>)
        })));
      } else {
        setTodayAttendance([]);
      }
      setLoading(false);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeAttendance();
    };
  }, [today]);

  const stats = {
    terdaftar: students.length,
    hadir: todayAttendance.length,
    belumHadir: students.length - todayAttendance.length,
    persentase: students.length > 0 ? ((todayAttendance.length / students.length) * 100).toFixed(1) : '0'
  };

  const recentAttendance = todayAttendance.slice(-5).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground">Ringkasan absensi hari ini - {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 rounded-xl bg-card border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Total Siswa Terdaftar</div>
          <div className="text-2xl font-bold">{stats.terdaftar}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Hadir Hari Ini</div>
          <div className="text-2xl font-bold text-green-600">{stats.hadir}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Belum Hadir</div>
          <div className="text-2xl font-bold text-red-600">{stats.belumHadir}</div>
        </div>
        <div className="p-6 rounded-xl bg-card border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Persentase Kehadiran</div>
          <div className="text-2xl font-bold text-primary">{stats.persentase}%</div>
        </div>
      </div>

      {/* Recent Attendance */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Absensi Terbaru</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Memuat data...</div>
        ) : recentAttendance.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Belum ada absensi hari ini</div>
        ) : (
          <div className="divide-y">
            {recentAttendance.map((a) => (
              <div key={a.id} className="p-4 flex items-center gap-4 hover:bg-muted/30">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{a.nama}</div>
                  <div className="text-sm text-muted-foreground">{a.kelas}</div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(new Date(a.timestamp), 'HH:mm:ss')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Health */}
      <SystemHealthMonitor />
    </div>
  );
}

// ============== MAIN CONTENT WRAPPER ==============
function MainContent() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const page = searchParams.get('page') || 'dashboard';
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  // Auto logout on idle
  const handleIdle = useCallback(() => {
    logout();
  }, [logout]);

  const handleIdleWarning = useCallback(() => {
    setShowIdleWarning(true);
  }, []);

  const { formatTimeRemaining, resetTimer } = useIdleTimeout({
    timeout: settings.autoLogoutMinutes * 60 * 1000,
    onIdle: handleIdle,
    onWarning: handleIdleWarning,
  });

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      
      {/* Main content area with margin for sidebar on desktop */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Top padding for mobile header */}
        <div className="pt-14 lg:pt-0 flex flex-col min-h-screen">
          {/* Idle Warning Banner */}
          {showIdleWarning && (
            <div className="bg-yellow-500/10 border-b border-yellow-500 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm text-yellow-600">
                  Session akan berakhir dalam 1 menit karena tidak ada aktivitas. Waktu tersisa: {formatTimeRemaining()}
                </span>
              </div>
              <button
                onClick={() => { setShowIdleWarning(false); resetTimer(); }}
                className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700"
              >
                Lanjutkan
              </button>
            </div>
          )}

          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {page === 'dashboard' && <Dashboard />}
            {page === 'attendance' && <AttendancePage />}
            {page === 'students' && <StudentManagement />}
            {page === 'statistics' && <StatisticsPage />}
            {page === 'settings' && <SettingsPage />}
          </main>

          {/* Footer */}
          <footer className="py-4 px-6 border-t bg-card text-center text-sm text-muted-foreground">
            FaceAbsen © {new Date().getFullYear()} - Sistem Absensi Berbasis Pengenalan Wajah
          </footer>
        </div>
      </div>
    </div>
  );
}

// ============== APP EXPORT ==============
export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <MainContent />
      </SettingsProvider>
    </AuthProvider>
  );
}
