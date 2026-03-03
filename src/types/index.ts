// Re-export all types from database.ts
export * from './database';

// Keep existing types for backward compatibility

// Student/Siswa types (extended)
export interface Student {
  id: string;
  nama: string;
  nis: string;
  kelas: string;
  jurusan: string;
  fotoUrl?: string;
  faceDescriptor?: number[];
  // Multi-angle face descriptors
  faceDescriptors?: {
    front?: number[];   // Front view
    left?: number[];    // Left angle (30-45 degrees)
    right?: number[];   // Right angle (30-45 degrees)
  };
  createdAt: string;
  updatedAt?: string;
}

// Attendance/Absensi types
export interface Attendance {
  id: string;
  siswaId: string;
  nama: string;
  kelas: string;
  jurusan: string;
  timestamp: string;
  date: string;
  status: 'Hadir' | 'Tidak Hadir' | 'Izin' | 'Sakit' | 'Terlambat';
  metode?: 'Face Recognition' | 'Manual';
  isLate?: boolean;
  // Location data
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  // Mask detection
  maskDetected?: boolean;
}

// Admin type
export interface Admin {
  uid: string;
  email: string;
  role: 'admin' | 'superadmin';
  createdAt: string;
}

// Statistics type
export interface AttendanceStats {
  totalSiswa: number;
  hadir: number;
  tidakHadir: number;
  terdaftar: number;
}

// Hourly stats for chart
export interface HourlyStats {
  hour: string;
  count: number;
}

// Form types
export interface StudentFormData {
  nama: string;
  nis: string;
  kelas: string;
  jurusan: string;
}

// Detection result
export interface DetectionResult {
  detected: boolean;
  matched: boolean;
  student?: Student;
  confidence?: number;
  message: string;
  alreadyAttended?: boolean;
  maskDetected?: boolean;
}

// Auth state
export interface AuthState {
  user: Admin | null;
  loading: boolean;
  error: string | null;
}

// Face detection box
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// School Branding Settings
export interface SchoolBranding {
  schoolName: string;
  schoolLogo?: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

// Geofencing Settings
export interface GeofencingSettings {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

// App Settings
export interface AppSettings {
  confidenceThreshold: number; // 0.0 - 1.0
  attendanceStartTime: string; // HH:mm format
  attendanceEndTime: string; // HH:mm format
  lateThresholdMinutes: number; // minutes after start time to be considered late
  autoLogoutMinutes: number; // idle timeout in minutes
  audioEnabled: boolean;
  voiceAnnouncement: boolean;
  // Multi-angle enrollment
  multiAngleEnrollment: boolean;
  // Mask detection
  maskDetectionEnabled: boolean;
  // Geofencing
  geofencing: GeofencingSettings;
  // School branding
  branding: SchoolBranding;
}

// System Health
export interface SystemHealth {
  camera: 'ok' | 'error' | 'checking';
  firebase: 'ok' | 'error' | 'checking';
  models: 'ok' | 'error' | 'checking';
  internet: 'ok' | 'error' | 'checking';
  location: 'ok' | 'error' | 'checking' | 'disabled';
}

// Attendance Schedule
export interface AttendanceSchedule {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  lateAfterMinutes: number;
}

// Bulk Import Result
export interface BulkImportResult {
  success: number;
  failed: number;
  errors: string[];
}

// Academic Year
export interface AcademicYear {
  id: string;
  name: string; // e.g., "2024/2025"
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

// Holiday
export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'national' | 'school' | 'regional';
  createdAt: string;
}

// Class/Grade Configuration
export interface ClassConfig {
  id: string;
  name: string; // e.g., "XII"
  order: number;
}

// Major/Department Configuration
export interface MajorConfig {
  id: string;
  name: string; // e.g., "IPA", "IPS"
  code: string;
}

// Camera Device
export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput';
}

// Face enrollment angle
export type FaceAngle = 'front' | 'left' | 'right';

// Face enrollment status
export interface FaceEnrollmentStatus {
  front: boolean;
  left: boolean;
  right: boolean;
}
