/**
 * Attendance Validation and Fraud Detection System
 * Handles daily limits, rate limiting, cooldown, and fraud detection
 */

import { ref, get, set, push, serverTimestamp, runTransaction } from 'firebase/database';
import { database } from '@/lib/firebase';
import { 
  AttendanceRecord, 
  AttendanceStatus, 
  RateLimitState, 
  FailedAttempt,
  DB_PATHS 
} from '@/types/database';
import { format } from 'date-fns';

// ============== CONFIGURATION ==============

const VALIDATION_CONFIG = {
  // Cooldown
  cooldownMs: 3000,           // 3 seconds between attendance
  
  // Rate limiting
  maxAttemptsPerMinute: 5,    // Max 5 attempts per minute
  blockDurationMs: 15 * 60 * 1000,  // 15 minutes block
  suspiciousThreshold: 10,    // Attempts before marking suspicious
  
  // Fraud detection
  minFaceDistance: 50,        // Min pixels between faces
  faceMatchThreshold: 0.6,    // Threshold for same face detection
  
  // Edit window
  editWindowMs: 60 * 60 * 1000,  // 1 hour to edit/delete
};

// ============== RATE LIMITING ==============

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  blockedUntil?: Date;
  reason?: string;
}

/**
 * Check if device is rate limited
 */
export async function checkRateLimit(deviceId: string): Promise<RateLimitResult> {
  const rateLimitRef = ref(database, DB_PATHS.RATE_LIMIT(deviceId));
  const snapshot = await get(rateLimitRef);
  
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  
  if (snapshot.exists()) {
    const state = snapshot.val() as RateLimitState;
    
    // Check if blocked
    if (state.blockedUntil && new Date(state.blockedUntil).getTime() > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        blockedUntil: new Date(state.blockedUntil),
        reason: 'Perangkat diblokir sementara karena terlalu banyak percobaan gagal'
      };
    }
    
    // Reset if last attempt was more than a minute ago
    if (new Date(state.lastAttemptAt).getTime() < oneMinuteAgo) {
      return {
        allowed: true,
        remainingAttempts: VALIDATION_CONFIG.maxAttemptsPerMinute
      };
    }
    
    // Check remaining attempts
    const remaining = VALIDATION_CONFIG.maxAttemptsPerMinute - state.attemptCount;
    return {
      allowed: remaining > 0,
      remainingAttempts: Math.max(0, remaining),
      reason: remaining <= 0 ? 'Terlalu banyak percobaan, coba lagi dalam 1 menit' : undefined
    };
  }
  
  return {
    allowed: true,
    remainingAttempts: VALIDATION_CONFIG.maxAttemptsPerMinute
  };
}

/**
 * Record an attempt (success or failure)
 */
export async function recordAttempt(
  deviceId: string,
  success: boolean,
  reason: string,
  metadata?: {
    faceDetected?: boolean;
    matchedStudentId?: string;
    ipAddress?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const rateLimitRef = ref(database, DB_PATHS.RATE_LIMIT(deviceId));
  
  // Update rate limit state
  await runTransaction(rateLimitRef, (current) => {
    const state: RateLimitState = current || {
      deviceId,
      attemptCount: 0,
      lastAttemptAt: now
    };
    
    const currentTime = Date.now();
    const lastAttemptTime = new Date(state.lastAttemptAt).getTime();
    
    // Reset if more than a minute has passed
    if (currentTime - lastAttemptTime > 60000) {
      state.attemptCount = 1;
    } else {
      state.attemptCount += 1;
    }
    
    state.lastAttemptAt = now;
    
    // Check if should block
    if (!success && state.attemptCount >= VALIDATION_CONFIG.maxAttemptsPerMinute) {
      state.blockedUntil = new Date(currentTime + VALIDATION_CONFIG.blockDurationMs).toISOString();
    }
    
    // Check for suspicious pattern
    if (state.attemptCount >= VALIDATION_CONFIG.suspiciousThreshold) {
      state.suspiciousPattern = true;
    }
    
    return state;
  });
  
  // Log failed attempt
  if (!success) {
    const failedAttemptRef = ref(database, DB_PATHS.FAILED_ATTEMPTS);
    await push(failedAttemptRef, {
      timestamp: now,
      deviceId,
      reason,
      ...metadata
    });
  }
}

// ============== DAILY LIMITS ==============

export interface DailyLimitResult {
  canAttend: boolean;
  existingRecord?: AttendanceRecord;
  message?: string;
}

/**
 * Check if student already attended today
 */
export async function checkDailyLimit(
  studentId: string,
  date?: string
): Promise<DailyLimitResult> {
  const today = date || format(new Date(), 'yyyy-MM-dd');
  const attendanceRef = ref(database, DB_PATHS.ATTENDANCE_RECORD(today, studentId));
  const snapshot = await get(attendanceRef);
  
  if (snapshot.exists()) {
    const record = snapshot.val() as AttendanceRecord;
    
    // Check if deleted (soft delete)
    if (record.deleted) {
      return {
        canAttend: true,
        message: 'Absensi sebelumnya dibatalkan, dapat absen kembali'
      };
    }
    
    return {
      canAttend: false,
      existingRecord: record,
      message: `Sudah absen jam ${format(new Date(record.timestamp), 'HH:mm:ss')}, tidak bisa absen lagi`
    };
  }
  
  return {
    canAttend: true
  };
}

/**
 * Check cooldown period
 */
export function checkCooldown(
  lastAttendanceTime: number,
  cooldownMs: number = VALIDATION_CONFIG.cooldownMs
): { inCooldown: boolean; remainingMs: number } {
  const now = Date.now();
  const elapsed = now - lastAttendanceTime;
  
  return {
    inCooldown: elapsed < cooldownMs,
    remainingMs: Math.max(0, cooldownMs - elapsed)
  };
}

// ============== FRAUD DETECTION ==============

export interface FraudDetectionResult {
  isFraud: boolean;
  type?: 'duplicate_face' | 'titip_absen' | 'suspicious_pattern';
  confidence: number;
  matchedStudents?: string[];
  message?: string;
}

/**
 * Check for duplicate face in same session
 * Detects if same face appears with different student IDs
 */
export function detectDuplicateFace(
  currentDescriptor: number[],
  recentDetections: Array<{
    studentId: string;
    descriptor: number[];
    confidence: number;
  }>,
  threshold: number = 0.6
): FraudDetectionResult {
  // Compare with recent detections
  for (const detection of recentDetections) {
    const distance = euclideanDistance(currentDescriptor, detection.descriptor);
    const similarity = 1 - distance;
    
    if (similarity >= threshold) {
      return {
        isFraud: true,
        type: 'duplicate_face',
        confidence: similarity,
        matchedStudents: [detection.studentId],
        message: `Wajah yang sama terdeteksi dengan ID berbeda (${detection.studentId})`
      };
    }
  }
  
  return {
    isFraud: false,
    confidence: 0
  };
}

/**
 * Detect "titip absen" - same face enrolled for multiple students
 */
export async function detectTitipAbsen(
  descriptor: number[],
  excludeStudentId: string,
  threshold: number = 0.7
): Promise<FraudDetectionResult> {
  // This would compare against all enrolled face descriptors
  // For now, return a placeholder implementation
  // In production, you'd query all student descriptors and compare
  
  return {
    isFraud: false,
    confidence: 0
  };
}

/**
 * Calculate Euclidean distance between descriptors
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 1;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

// ============== ATTENDANCE WRITE ==============

export interface WriteAttendanceResult {
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
  alreadyAttended?: boolean;
}

/**
 * Write attendance with atomic transaction
 * Prevents race conditions and duplicates
 */
export async function writeAttendance(
  studentId: string,
  studentData: {
    nama: string;
    kelas: string;
    jurusan: string;
  },
  options: {
    status?: AttendanceStatus;
    method?: 'face' | 'manual';
    evidenceUrl?: string;
    shiftId?: string;
    shiftName?: string;
    isLate?: boolean;
    lateMinutes?: number;
  } = {}
): Promise<WriteAttendanceResult> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date().toISOString();
  
  const {
    status = 'Hadir',
    method = 'face',
    evidenceUrl,
    shiftId,
    shiftName,
    isLate = false,
    lateMinutes = 0
  } = options;
  
  const attendanceRef = ref(database, DB_PATHS.ATTENDANCE_RECORD(today, studentId));
  
  try {
    // Use transaction for atomic write
    const result = await runTransaction(attendanceRef, (current) => {
      // Check if already exists
      if (current && !current.deleted) {
        return { ...current, alreadyExists: true };
      }
      
      // Create new record
      const record: AttendanceRecord = {
        id: `${today}_${studentId}`,
        siswaId: studentId,
        nama: studentData.nama,
        kelas: studentData.kelas,
        jurusan: studentData.jurusan,
        timestamp: now,
        date: today,
        status: isLate ? 'Terlambat' : status,
        method,
        evidenceUrl,
        shiftId,
        shiftName,
        isLate,
        lateMinutes
      };
      
      return record;
    });
    
    if (result.snapshot.exists()) {
      const record = result.snapshot.val();
      
      if (record.alreadyExists) {
        return {
          success: false,
          error: 'Sudah absen hari ini',
          alreadyAttended: true
        };
      }
      
      // Log the attendance creation
      await logAttendanceChange(studentId, today, null, record.status, 'create');
      
      return {
        success: true,
        record
      };
    }
    
    return {
      success: false,
      error: 'Gagal menyimpan absensi'
    };
  } catch (error) {
    console.error('Error writing attendance:', error);
    return {
      success: false,
      error: 'Terjadi kesalahan saat menyimpan absensi'
    };
  }
}

// ============== ATTENDANCE EDIT/DELETE ==============

export interface EditAttendanceResult {
  success: boolean;
  record?: AttendanceRecord;
  error?: string;
}

/**
 * Edit attendance record
 */
export async function editAttendance(
  date: string,
  studentId: string,
  changes: {
    status?: AttendanceStatus;
    reason?: string;
  },
  editedBy: string
): Promise<EditAttendanceResult> {
  const attendanceRef = ref(database, DB_PATHS.ATTENDANCE_RECORD(date, studentId));
  const snapshot = await get(attendanceRef);
  
  if (!snapshot.exists()) {
    return {
      success: false,
      error: 'Data absensi tidak ditemukan'
    };
  }
  
  const currentRecord = snapshot.val() as AttendanceRecord;
  
  // Check edit window
  const recordTime = new Date(currentRecord.timestamp).getTime();
  const editDeadline = recordTime + VALIDATION_CONFIG.editWindowMs;
  
  if (Date.now() > editDeadline) {
    return {
      success: false,
      error: 'Batas waktu edit (1 jam) telah lewat'
    };
  }
  
  // Update record
  const updates: Partial<AttendanceRecord> = {
    ...changes,
    editedBy,
    editedAt: new Date().toISOString(),
    originalStatus: currentRecord.status
  };
  
  await set(attendanceRef, { ...currentRecord, ...updates });
  
  // Log the change
  await logAttendanceChange(
    studentId,
    date,
    currentRecord.status,
    changes.status || currentRecord.status,
    'edit',
    changes.reason,
    editedBy
  );
  
  return {
    success: true,
    record: { ...currentRecord, ...updates }
  };
}

/**
 * Soft delete attendance record
 */
export async function deleteAttendance(
  date: string,
  studentId: string,
  deletedBy: string,
  reason: string
): Promise<EditAttendanceResult> {
  const attendanceRef = ref(database, DB_PATHS.ATTENDANCE_RECORD(date, studentId));
  const snapshot = await get(attendanceRef);
  
  if (!snapshot.exists()) {
    return {
      success: false,
      error: 'Data absensi tidak ditemukan'
    };
  }
  
  const currentRecord = snapshot.val() as AttendanceRecord;
  
  // Soft delete
  const updates: Partial<AttendanceRecord> = {
    deleted: true,
    deletedAt: new Date().toISOString(),
    deletedBy,
    deleteReason: reason
  };
  
  await set(attendanceRef, { ...currentRecord, ...updates });
  
  // Log the deletion
  await logAttendanceChange(
    studentId,
    date,
    currentRecord.status,
    undefined,
    'delete',
    reason,
    deletedBy
  );
  
  return {
    success: true,
    record: { ...currentRecord, ...updates }
  };
}

/**
 * Restore deleted attendance
 */
export async function restoreAttendance(
  date: string,
  studentId: string,
  restoredBy: string
): Promise<EditAttendanceResult> {
  const attendanceRef = ref(database, DB_PATHS.ATTENDANCE_RECORD(date, studentId));
  const snapshot = await get(attendanceRef);
  
  if (!snapshot.exists()) {
    return {
      success: false,
      error: 'Data absensi tidak ditemukan'
    };
  }
  
  const currentRecord = snapshot.val() as AttendanceRecord;
  
  if (!currentRecord.deleted) {
    return {
      success: false,
      error: 'Data tidak dalam status terhapus'
    };
  }
  
  // Restore
  const updates: Partial<AttendanceRecord> = {
    deleted: false,
    deletedAt: undefined,
    deletedBy: undefined,
    deleteReason: undefined
  };
  
  await set(attendanceRef, { ...currentRecord, ...updates });
  
  // Log the restoration
  await logAttendanceChange(
    studentId,
    date,
    undefined,
    currentRecord.status,
    'restore',
    'Pemulihan data absensi',
    restoredBy
  );
  
  return {
    success: true,
    record: { ...currentRecord, ...updates }
  };
}

// ============== HELPER FUNCTIONS ==============

/**
 * Log attendance changes for audit trail
 */
async function logAttendanceChange(
  studentId: string,
  date: string,
  oldStatus: AttendanceStatus | undefined,
  newStatus: AttendanceStatus | undefined,
  changeType: 'create' | 'edit' | 'delete' | 'restore',
  reason?: string,
  changedBy?: string
): Promise<void> {
  const logRef = ref(database, DB_PATHS.ATTENDANCE_LOGS);
  
  await push(logRef, {
    siswaId: studentId,
    tanggal: date,
    oldStatus,
    newStatus,
    changeType,
    changedBy: changedBy || 'system',
    changedAt: new Date().toISOString(),
    reason
  });
}

/**
 * Get device fingerprint for rate limiting
 */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server';
  
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || '',
    // @ts-expect-error - deviceMemory may not exist
    navigator.deviceMemory || '',
  ];
  
  // Simple hash
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `device_${Math.abs(hash).toString(36)}`;
}

/**
 * Check if current time is within allowed attendance window
 */
export function isWithinAttendanceWindow(
  startTime: string,
  endTime: string
): { withinWindow: boolean; message: string } {
  const now = new Date();
  const currentTime = format(now, 'HH:mm');
  
  if (currentTime < startTime) {
    return {
      withinWindow: false,
      message: `Absensi belum dibuka. Dibuka jam ${startTime}`
    };
  }
  
  if (currentTime > endTime) {
    return {
      withinWindow: false,
      message: `Absensi sudah ditutup jam ${endTime}`
    };
  }
  
  return {
    withinWindow: true,
    message: ''
  };
}

/**
 * Calculate late minutes
 */
export function calculateLateMinutes(
  arrivalTime: Date,
  shiftStartTime: string
): number {
  const [hours, minutes] = shiftStartTime.split(':').map(Number);
  const shiftStart = new Date(arrivalTime);
  shiftStart.setHours(hours, minutes, 0, 0);
  
  const diffMs = arrivalTime.getTime() - shiftStart.getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}
