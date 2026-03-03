/**
 * Firebase Database Schema and Types for Face Recognition Attendance System
 * Comprehensive data structure for multi-detection attendance
 */

// ============== CORE TYPES ==============

export interface FaceDescriptor {
  frontal: number[];    // 128-dimensional face descriptor
  left: number[];       // Left angle (~15°)
  right: number[];      // Right angle (~15°)
}

export interface Student {
  id: string;
  nama: string;
  nis: string;
  kelas: string;
  jurusan: string;
  fotoUrl?: string;
  
  // Face descriptors (can be single legacy or multi-angle)
  faceDescriptor?: number[];           // Legacy single descriptor
  faceDescriptorFrontal?: number[];    // Multi-angle frontal
  faceDescriptorLeft?: number[];       // Multi-angle left
  faceDescriptorRight?: number[];      // Multi-angle right
  
  // Status
  status: 'active' | 'inactive' | 'graduated' | 'transferred';
  
  // Metadata
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  
  // Parent/Guardian info
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  
  // Consent
  consentGiven?: boolean;
  consentTimestamp?: string;
}

export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpha' | 'Terlambat';
export type AttendanceMethod = 'face' | 'manual';

export interface AttendanceRecord {
  id: string;
  siswaId: string;
  nama: string;
  kelas: string;
  jurusan: string;
  
  // Timestamp
  timestamp: string;
  date: string;           // YYYY-MM-DD format
  
  // Status
  status: AttendanceStatus;
  method: AttendanceMethod;
  
  // Evidence
  evidenceUrl?: string;   // Photo evidence URL
  
  // Shift info
  shiftId?: string;
  shiftName?: string;
  isLate?: boolean;
  lateMinutes?: number;
  
  // Edit tracking
  editedBy?: string;
  editedAt?: string;
  editReason?: string;
  originalStatus?: AttendanceStatus;
  
  // Soft delete
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface AttendanceLog {
  id: string;
  siswaId: string;
  tanggal: string;
  
  // Change tracking
  oldStatus?: AttendanceStatus;
  newStatus: AttendanceStatus;
  
  // Who made the change
  changedBy: string;
  changedAt: string;
  reason?: string;
  
  // Type of change
  changeType: 'create' | 'edit' | 'delete' | 'restore';
  
  // Additional context
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  
  // Who
  userId: string;
  userEmail: string;
  userRole: string;
  
  // What
  action: AuditAction;
  targetType: 'student' | 'attendance' | 'settings' | 'shift' | 'user';
  targetId?: string;
  
  // Details
  details: string;
  previousValue?: unknown;
  newValue?: unknown;
  
  // Context
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

export type AuditAction = 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'ADD_STUDENT' 
  | 'EDIT_STUDENT' 
  | 'DELETE_STUDENT'
  | 'RESTORE_STUDENT'
  | 'ATTENDANCE_CREATE'
  | 'ATTENDANCE_EDIT'
  | 'ATTENDANCE_DELETE'
  | 'ATTENDANCE_RESTORE'
  | 'SETTINGS_CHANGE'
  | 'SHIFT_CREATE'
  | 'SHIFT_EDIT'
  | 'SHIFT_DELETE'
  | 'USER_CREATE'
  | 'USER_EDIT'
  | 'USER_DELETE'
  | 'EXPORT_DATA'
  | 'IMPORT_DATA'
  | 'FAILED_ATTEMPT'
  | 'SUSPICIOUS_ACTIVITY';

// ============== SHIFT & SCHEDULE ==============

export interface Shift {
  id: string;
  name: string;
  startTime: string;      // HH:mm format
  endTime: string;        // HH:mm format
  lateThreshold: number;  // Minutes after start to be considered late
  
  // Days active (0 = Sunday, 6 = Saturday)
  activeDays: number[];
  
  // Applicable classes (empty = all)
  applicableClasses: string[];
  
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface SchoolSchedule {
  id: string;
  date: string;           // YYYY-MM-DD
  type: 'holiday' | 'exam' | 'event' | 'special';
  name: string;
  description?: string;
  
  // If type is special, might have modified schedule
  modifiedShifts?: string[];
  isAttendanceRequired?: boolean;
}

// ============== USER & AUTHENTICATION ==============

export type UserRole = 'superadmin' | 'admin' | 'operator' | 'waliKelas' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  
  // Permissions
  permissions: Permission[];
  
  // Assigned classes (for waliKelas)
  assignedClasses?: string[];
  
  // Status
  isActive: boolean;
  
  // Security
  twoFactorEnabled?: boolean;
  lastLogin?: string;
  loginCount?: number;
  
  // Metadata
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface Permission {
  action: 'create' | 'read' | 'update' | 'delete' | 'export';
  resource: 'students' | 'attendance' | 'reports' | 'settings' | 'users' | 'audit';
}

export interface UserSession {
  id: string;
  userId: string;
  deviceInfo: string;
  ipAddress: string;
  loginAt: string;
  lastActivity: string;
  expiresAt: string;
  isActive: boolean;
}

// ============== SETTINGS ==============

export interface AppSettings {
  // Face Recognition
  confidenceThreshold: number;
  livenessCheckEnabled: boolean;
  multiAngleEnrollment: boolean;
  
  // Attendance
  attendanceStartTime: string;
  attendanceEndTime: string;
  lateThresholdMinutes: number;
  cooldownSeconds: number;
  maxRetryPerMinute: number;
  
  // Security
  autoLogoutMinutes: number;
  twoFactorRequired: boolean;
  sessionTimeoutMinutes: number;
  
  // Notifications
  audioEnabled: boolean;
  voiceAnnouncement: boolean;
  pushNotifications: boolean;
  emailNotifications: boolean;
  
  // School Info
  schoolName: string;
  schoolLogo?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  
  // Retention
  dataRetentionDays: number;
  auditRetentionDays: number;
  
  // Backup
  autoBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lastBackupAt?: string;
}

// ============== STATISTICS ==============

export interface DailyStats {
  date: string;
  totalStudents: number;
  hadir: number;
  sakit: number;
  izin: number;
  alpha: number;
  terlambat: number;
  
  // Per class breakdown
  classStats?: { [kelas: string]: ClassStats };
  
  // Per shift breakdown
  shiftStats?: { [shiftId: string]: ShiftStats };
}

export interface ClassStats {
  kelas: string;
  jurusan: string;
  total: number;
  hadir: number;
  sakit: number;
  izin: number;
  alpha: number;
}

export interface ShiftStats {
  shiftId: string;
  shiftName: string;
  total: number;
  hadir: number;
  terlambat: number;
  avgArrivalTime: string;
}

// ============== NOTIFICATION ==============

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  
  // Target
  targetUsers?: string[];   // Empty = all
  targetRoles?: UserRole[];
  
  // Status
  read: boolean;
  readAt?: string;
  readBy?: string[];
  
  // Action
  actionUrl?: string;
  actionLabel?: string;
  
  // Timestamps
  createdAt: string;
  expiresAt?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  type: 'alpha_streak' | 'late_streak' | 'attendance_drop' | 'anomaly';
  
  // Conditions
  condition: {
    threshold: number;
    period: number;        // Days
    comparison?: 'greater' | 'less' | 'equal';
  };
  
  // Actions
  actions: AlertAction[];
  
  // Targets
  targetRoles: UserRole[];
  targetUsers?: string[];
  
  isActive: boolean;
  createdAt: string;
}

export interface AlertAction {
  type: 'email' | 'push' | 'sms' | 'in_app';
  template: string;
  recipients: 'admin' | 'waliKelas' | 'parent' | 'all';
}

// ============== EXPORT & REPORTS ==============

export interface ExportJob {
  id: string;
  type: 'excel' | 'pdf' | 'csv';
  requestedBy: string;
  requestedAt: string;
  
  // Parameters
  dateRange: {
    start: string;
    end: string;
  };
  filters: {
    kelas?: string[];
    status?: AttendanceStatus[];
  };
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
}

// ============== RATE LIMITING ==============

export interface RateLimitState {
  deviceId: string;
  attemptCount: number;
  lastAttemptAt: string;
  blockedUntil?: string;
  suspiciousPattern?: boolean;
}

export interface FailedAttempt {
  id: string;
  timestamp: string;
  deviceId: string;
  ipAddress: string;
  reason: string;
  faceDetected?: boolean;
  matchedStudentId?: string;
}

// ============== DATABASE PATHS ==============

export const DB_PATHS = {
  // Students
  STUDENTS: 'siswa',
  STUDENT: (id: string) => `siswa/${id}`,
  
  // Attendance
  ATTENDANCE: 'absensi',
  ATTENDANCE_DATE: (date: string) => `absensi/${date}`,
  ATTENDANCE_RECORD: (date: string, studentId: string) => `absensi/${date}/${studentId}`,
  
  // Attendance logs
  ATTENDANCE_LOGS: 'absensiLog',
  ATTENDANCE_LOG: (id: string) => `absensiLog/${id}`,
  
  // Audit
  AUDIT: 'audit',
  AUDIT_LOG: (timestamp: string) => `audit/${timestamp}`,
  
  // Shifts
  SHIFTS: 'shifts',
  SHIFT: (id: string) => `shifts/${id}`,
  
  // Schedule
  SCHEDULES: 'schedules',
  SCHEDULE: (date: string) => `schedules/${date}`,
  
  // Users
  USERS: 'users',
  USER: (id: string) => `users/${id}`,
  
  // Sessions
  SESSIONS: 'sessions',
  SESSION: (id: string) => `sessions/${id}`,
  
  // Settings
  SETTINGS: 'settings',
  APP_SETTINGS: 'settings/app',
  
  // Stats
  STATS: 'stats',
  DAILY_STATS: (date: string) => `stats/daily/${date}`,
  
  // Notifications
  NOTIFICATIONS: 'notifications',
  NOTIFICATION: (id: string) => `notifications/${id}`,
  
  // Alert rules
  ALERT_RULES: 'alertRules',
  ALERT_RULE: (id: string) => `alertRules/${id}`,
  
  // Export jobs
  EXPORT_JOBS: 'exportJobs',
  EXPORT_JOB: (id: string) => `exportJobs/${id}`,
  
  // Rate limiting
  RATE_LIMITS: 'rateLimits',
  RATE_LIMIT: (deviceId: string) => `rateLimits/${deviceId}`,
  
  // Failed attempts
  FAILED_ATTEMPTS: 'failedAttempts',
  FAILED_ATTEMPT: (id: string) => `failedAttempts/${id}`,
  
  // Metadata
  META: 'meta',
  LAST_SYNC: 'meta/lastSync',
  LAST_BACKUP: 'meta/lastBackup',
} as const;

// ============== DEFAULT VALUES ==============

export const DEFAULT_SETTINGS: AppSettings = {
  confidenceThreshold: 0.6,
  livenessCheckEnabled: true,
  multiAngleEnrollment: true,
  
  attendanceStartTime: '07:00',
  attendanceEndTime: '08:00',
  lateThresholdMinutes: 15,
  cooldownSeconds: 3,
  maxRetryPerMinute: 5,
  
  autoLogoutMinutes: 15,
  twoFactorRequired: false,
  sessionTimeoutMinutes: 60,
  
  audioEnabled: true,
  voiceAnnouncement: true,
  pushNotifications: false,
  emailNotifications: false,
  
  schoolName: 'FaceAbsen School',
  schoolAddress: '',
  schoolPhone: '',
  schoolEmail: '',
  
  dataRetentionDays: 365,
  auditRetentionDays: 365,
  
  autoBackupEnabled: true,
  backupFrequency: 'weekly',
};

export const DEFAULT_PERMISSIONS: { [key in UserRole]: Permission[] } = {
  superadmin: [
    { action: 'create', resource: 'students' },
    { action: 'read', resource: 'students' },
    { action: 'update', resource: 'students' },
    { action: 'delete', resource: 'students' },
    { action: 'create', resource: 'attendance' },
    { action: 'read', resource: 'attendance' },
    { action: 'update', resource: 'attendance' },
    { action: 'delete', resource: 'attendance' },
    { action: 'create', resource: 'users' },
    { action: 'read', resource: 'users' },
    { action: 'update', resource: 'users' },
    { action: 'delete', resource: 'users' },
    { action: 'read', resource: 'reports' },
    { action: 'export', resource: 'reports' },
    { action: 'update', resource: 'settings' },
    { action: 'read', resource: 'audit' },
    { action: 'export', resource: 'audit' },
  ],
  admin: [
    { action: 'create', resource: 'students' },
    { action: 'read', resource: 'students' },
    { action: 'update', resource: 'students' },
    { action: 'delete', resource: 'students' },
    { action: 'create', resource: 'attendance' },
    { action: 'read', resource: 'attendance' },
    { action: 'update', resource: 'attendance' },
    { action: 'delete', resource: 'attendance' },
    { action: 'read', resource: 'reports' },
    { action: 'export', resource: 'reports' },
    { action: 'read', resource: 'audit' },
  ],
  operator: [
    { action: 'create', resource: 'attendance' },
    { action: 'read', resource: 'attendance' },
    { action: 'update', resource: 'attendance' },
    { action: 'read', resource: 'students' },
    { action: 'read', resource: 'reports' },
  ],
  waliKelas: [
    { action: 'read', resource: 'attendance' },
    { action: 'update', resource: 'attendance' },
    { action: 'read', resource: 'students' },
    { action: 'read', resource: 'reports' },
    { action: 'export', resource: 'reports' },
  ],
  viewer: [
    { action: 'read', resource: 'attendance' },
    { action: 'read', resource: 'students' },
    { action: 'read', resource: 'reports' },
  ],
};
