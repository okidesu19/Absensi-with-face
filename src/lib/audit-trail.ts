/**
 * Audit Trail System
 * Comprehensive logging for compliance and security
 */

import { ref, push, get, set, query, orderByChild, limitToLast, startAt, endAt } from 'firebase/database';
import { database } from '@/lib/firebase';
import { 
  AuditLog, 
  AuditAction, 
  DB_PATHS 
} from '@/types/database';
import { format } from 'date-fns';

// ============== AUDIT LOGGING ==============

interface LogAuditParams {
  userId: string;
  userEmail: string;
  userRole: string;
  action: AuditAction;
  targetType: 'student' | 'attendance' | 'settings' | 'shift' | 'user';
  targetId?: string;
  details: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
}

/**
 * Log an audit event
 */
export async function logAudit(params: LogAuditParams): Promise<string> {
  const timestamp = new Date().toISOString();
  const auditRef = ref(database, DB_PATHS.AUDIT);
  
  const log: Omit<AuditLog, 'id'> = {
    timestamp,
    userId: params.userId,
    userEmail: params.userEmail,
    userRole: params.userRole,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details,
    previousValue: params.previousValue,
    newValue: params.newValue,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    deviceId: params.deviceId
  };
  
  const result = await push(auditRef, log);
  return result.key || timestamp;
}

/**
 * Log login event
 */
export async function logLogin(
  userId: string,
  userEmail: string,
  userRole: string,
  metadata?: { ipAddress?: string; userAgent?: string; deviceId?: string }
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action: 'LOGIN',
    targetType: 'user',
    targetId: userId,
    details: `User logged in: ${userEmail}`,
    ...metadata
  });
}

/**
 * Log logout event
 */
export async function logLogout(
  userId: string,
  userEmail: string,
  userRole: string,
  metadata?: { ipAddress?: string; userAgent?: string; deviceId?: string }
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action: 'LOGOUT',
    targetType: 'user',
    targetId: userId,
    details: `User logged out: ${userEmail}`,
    ...metadata
  });
}

/**
 * Log student-related actions
 */
export async function logStudentAction(
  action: 'ADD_STUDENT' | 'EDIT_STUDENT' | 'DELETE_STUDENT' | 'RESTORE_STUDENT',
  userId: string,
  userEmail: string,
  userRole: string,
  studentId: string,
  studentName: string,
  previousValue?: unknown,
  newValue?: unknown
): Promise<void> {
  const actionMessages: Record<string, string> = {
    ADD_STUDENT: `Added student: ${studentName}`,
    EDIT_STUDENT: `Edited student: ${studentName}`,
    DELETE_STUDENT: `Deleted student: ${studentName}`,
    RESTORE_STUDENT: `Restored student: ${studentName}`
  };
  
  await logAudit({
    userId,
    userEmail,
    userRole,
    action,
    targetType: 'student',
    targetId: studentId,
    details: actionMessages[action],
    previousValue,
    newValue
  });
}

/**
 * Log attendance-related actions
 */
export async function logAttendanceAction(
  action: 'ATTENDANCE_CREATE' | 'ATTENDANCE_EDIT' | 'ATTENDANCE_DELETE' | 'ATTENDANCE_RESTORE',
  userId: string,
  userEmail: string,
  userRole: string,
  studentId: string,
  date: string,
  details: string,
  previousValue?: unknown,
  newValue?: unknown
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action,
    targetType: 'attendance',
    targetId: `${date}_${studentId}`,
    details,
    previousValue,
    newValue
  });
}

/**
 * Log failed attempt
 */
export async function logFailedAttempt(
  userId: string,
  userEmail: string,
  userRole: string,
  reason: string,
  metadata?: { ipAddress?: string; userAgent?: string; deviceId?: string }
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action: 'FAILED_ATTEMPT',
    targetType: 'attendance',
    details: `Failed attendance attempt: ${reason}`,
    ...metadata
  });
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  userId: string,
  userEmail: string,
  userRole: string,
  details: string,
  metadata?: { 
    ipAddress?: string; 
    userAgent?: string; 
    deviceId?: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action: 'SUSPICIOUS_ACTIVITY',
    targetType: 'attendance',
    details: `Suspicious activity detected: ${details}`,
    ...metadata
  });
}

/**
 * Log data export
 */
export async function logExport(
  userId: string,
  userEmail: string,
  userRole: string,
  exportType: string,
  details: string
): Promise<void> {
  await logAudit({
    userId,
    userEmail,
    userRole,
    action: 'EXPORT_DATA',
    targetType: 'attendance',
    details: `Exported ${exportType}: ${details}`
  });
}

// ============== AUDIT QUERIES ==============

export interface AuditQueryParams {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: AuditAction;
  targetType?: 'student' | 'attendance' | 'settings' | 'shift' | 'user';
  limit?: number;
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(params: AuditQueryParams = {}): Promise<AuditLog[]> {
  const auditRef = ref(database, DB_PATHS.AUDIT);
  let auditQuery = query(auditRef, orderByChild('timestamp'));
  
  if (params.startDate) {
    auditQuery = query(auditQuery, startAt(params.startDate.toISOString()));
  }
  
  if (params.endDate) {
    auditQuery = query(auditQuery, endAt(params.endDate.toISOString()));
  }
  
  if (params.limit) {
    auditQuery = query(auditQuery, limitToLast(params.limit));
  }
  
  const snapshot = await get(auditQuery);
  
  if (!snapshot.exists()) return [];
  
  let logs: AuditLog[] = [];
  snapshot.forEach((child) => {
    const log = child.val() as AuditLog;
    log.id = child.key || '';
    logs.push(log);
  });
  
  // Apply additional filters
  if (params.userId) {
    logs = logs.filter(log => log.userId === params.userId);
  }
  
  if (params.action) {
    logs = logs.filter(log => log.action === params.action);
  }
  
  if (params.targetType) {
    logs = logs.filter(log => log.targetType === params.targetType);
  }
  
  // Sort by timestamp descending
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return logs;
}

/**
 * Get recent audit logs
 */
export async function getRecentAuditLogs(count: number = 50): Promise<AuditLog[]> {
  return queryAuditLogs({ limit: count });
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(userId: string, days: number = 30): Promise<AuditLog[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return queryAuditLogs({ userId, startDate });
}

/**
 * Get audit logs for a specific date range
 */
export async function getDateRangeAuditLogs(
  startDate: Date,
  endDate: Date
): Promise<AuditLog[]> {
  return queryAuditLogs({ startDate, endDate });
}

// ============== COMPLIANCE HELPERS ==============

/**
 * Generate compliance report for a date range
 */
export async function generateComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<{
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByUser: Record<string, number>;
  suspiciousActivities: AuditLog[];
  failedAttempts: AuditLog[];
}> {
  const logs = await queryAuditLogs({ startDate, endDate });
  
  const actionsByType: Record<string, number> = {};
  const actionsByUser: Record<string, number> = {};
  const suspiciousActivities: AuditLog[] = [];
  const failedAttempts: AuditLog[] = [];
  
  for (const log of logs) {
    // Count by type
    actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;
    
    // Count by user
    actionsByUser[log.userId] = (actionsByUser[log.userId] || 0) + 1;
    
    // Collect suspicious
    if (log.action === 'SUSPICIOUS_ACTIVITY') {
      suspiciousActivities.push(log);
    }
    
    // Collect failed attempts
    if (log.action === 'FAILED_ATTEMPT') {
      failedAttempts.push(log);
    }
  }
  
  return {
    totalActions: logs.length,
    actionsByType,
    actionsByUser,
    suspiciousActivities,
    failedAttempts
  };
}

/**
 * Check if user consent is valid
 */
export function validateConsent(consentTimestamp?: string): boolean {
  if (!consentTimestamp) return false;
  
  // Consent is valid for 1 year
  const consentDate = new Date(consentTimestamp);
  const expiryDate = new Date(consentDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  
  return new Date() < expiryDate;
}

/**
 * Anonymize personal data for GDPR compliance
 */
export function anonymizeData(data: Record<string, unknown>): Record<string, unknown> {
  const anonymized = { ...data };
  
  const sensitiveFields = [
    'nama', 'name', 'email', 'phone', 'address', 
    'parentName', 'parentPhone', 'parentEmail',
    'ipAddress', 'userAgent', 'faceDescriptor'
  ];
  
  for (const field of sensitiveFields) {
    if (anonymized[field]) {
      anonymized[field] = '[REDACTED]';
    }
  }
  
  return anonymized;
}

// ============== CLEANUP ==============

/**
 * Archive old audit logs (older than retention period)
 */
export async function archiveOldAuditLogs(
  retentionDays: number = 365
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const logs = await queryAuditLogs({ 
    endDate: cutoffDate,
    limit: 1000 
  });
  
  // In production, you would move these to cold storage
  // For now, we just return the count
  return logs.length;
}

/**
 * Get audit statistics
 */
export async function getAuditStats(days: number = 7): Promise<{
  totalLogs: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
  failedLogins: number;
  suspiciousCount: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const logs = await queryAuditLogs({ startDate });
  
  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  let failedLogins = 0;
  let suspiciousCount = 0;
  
  for (const log of logs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
    byUser[log.userEmail] = (byUser[log.userEmail] || 0) + 1;
    
    if (log.action === 'FAILED_ATTEMPT') failedLogins++;
    if (log.action === 'SUSPICIOUS_ACTIVITY') suspiciousCount++;
  }
  
  return {
    totalLogs: logs.length,
    byAction,
    byUser,
    failedLogins,
    suspiciousCount
  };
}
