/**
 * IndexedDB Storage Utility for Face Recognition Data
 * Provides persistent caching for face descriptors and student data
 */

import { Student } from '@/types';

const DB_NAME = 'FaceAbsenDB';
const DB_VERSION = 1;

// Store names
const STORES = {
  STUDENTS: 'students',
  DESCRIPTORS: 'descriptors',
  ATTENDANCE: 'attendance',
  SYNC_QUEUE: 'syncQueue',
  METADATA: 'metadata'
} as const;

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize and get the IndexedDB instance
 */
export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Students store - for caching student data
      if (!db.objectStoreNames.contains(STORES.STUDENTS)) {
        const studentStore = db.createObjectStore(STORES.STUDENTS, { keyPath: 'id' });
        studentStore.createIndex('kelas', 'kelas', { unique: false });
        studentStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }
      
      // Descriptors store - for quick access to face descriptors
      if (!db.objectStoreNames.contains(STORES.DESCRIPTORS)) {
        const descriptorStore = db.createObjectStore(STORES.DESCRIPTORS, { keyPath: 'studentId' });
        descriptorStore.createIndex('lastSync', 'lastSync', { unique: false });
      }
      
      // Attendance store - for offline attendance records
      if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
        const attendanceStore = db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'id' });
        attendanceStore.createIndex('date', 'date', { unique: false });
        attendanceStore.createIndex('studentId', 'studentId', { unique: false });
      }
      
      // Sync queue - for pending operations when offline
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Metadata store - for storing last sync times, etc.
      if (!db.objectStoreNames.contains(STORES.METADATA)) {
        db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
      }
    };
  });
}

// ============== STUDENT OPERATIONS ==============

/**
 * Save all students to IndexedDB
 */
export async function saveStudentsToIndexedDB(students: Student[]): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.STUDENTS], 'readwrite');
    const store = transaction.objectStore(STORES.STUDENTS);
    
    // Clear existing data
    store.clear();
    
    // Add all students
    students.forEach(student => {
      store.put({
        ...student,
        lastUpdated: new Date().toISOString()
      });
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all students from IndexedDB
 */
export async function getStudentsFromIndexedDB(): Promise<Student[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.STUDENTS], 'readonly');
    const store = transaction.objectStore(STORES.STUDENTS);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const students = request.result.map((s: { id: string; nama: string; nis: string; kelas: string; jurusan: string; fotoUrl?: string; faceDescriptor?: number[]; faceDescriptors?: { front?: number[]; left?: number[]; right?: number[] }; createdAt: string; updatedAt?: string }) => ({
        id: s.id,
        nama: s.nama,
        nis: s.nis,
        kelas: s.kelas,
        jurusan: s.jurusan,
        fotoUrl: s.fotoUrl,
        faceDescriptor: s.faceDescriptor,
        faceDescriptors: s.faceDescriptors,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }));
      resolve(students);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a single student to IndexedDB
 */
export async function saveStudentToIndexedDB(student: Student): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.STUDENTS], 'readwrite');
    const store = transaction.objectStore(STORES.STUDENTS);
    
    store.put({
      ...student,
      lastUpdated: new Date().toISOString()
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Delete a student from IndexedDB
 */
export async function deleteStudentFromIndexedDB(studentId: string): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.STUDENTS, STORES.DESCRIPTORS], 'readwrite');
    
    transaction.objectStore(STORES.STUDENTS).delete(studentId);
    transaction.objectStore(STORES.DESCRIPTORS).delete(studentId);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============== DESCRIPTOR OPERATIONS ==============

interface DescriptorEntry {
  studentId: string;
  descriptor: number[];
  multiAngleDescriptors?: {
    front?: number[];
    left?: number[];
    right?: number[];
  };
  lastSync: string;
}

/**
 * Get all face descriptors from IndexedDB for quick loading
 */
export async function getAllDescriptorsFromIndexedDB(): Promise<DescriptorEntry[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DESCRIPTORS], 'readonly');
    const store = transaction.objectStore(STORES.DESCRIPTORS);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save descriptors for a student
 */
export async function saveDescriptorToIndexedDB(
  studentId: string,
  descriptor: number[],
  multiAngleDescriptors?: { front?: number[]; left?: number[]; right?: number[] }
): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DESCRIPTORS], 'readwrite');
    const store = transaction.objectStore(STORES.DESCRIPTORS);
    
    store.put({
      studentId,
      descriptor,
      multiAngleDescriptors,
      lastSync: new Date().toISOString()
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Sync descriptors from students array
 */
export async function syncDescriptorsFromStudents(students: Student[]): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DESCRIPTORS], 'readwrite');
    const store = transaction.objectStore(STORES.DESCRIPTORS);
    
    // Clear and rebuild
    store.clear();
    
    students.forEach(student => {
      if (student.faceDescriptor || student.faceDescriptors) {
        store.put({
          studentId: student.id,
          descriptor: student.faceDescriptor,
          multiAngleDescriptors: student.faceDescriptors,
          lastSync: new Date().toISOString()
        });
      }
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============== SYNC QUEUE OPERATIONS ==============

interface SyncQueueItem {
  id?: number;
  type: 'attendance' | 'student_add' | 'student_update' | 'student_delete';
  data: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
}

/**
 * Add an operation to the sync queue
 */
export async function addToSyncQueue(
  type: SyncQueueItem['type'],
  data: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    
    store.put({
      type,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0
    });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get all pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove a sync item after successful sync
 */
export async function removeSyncItem(id: number): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    
    store.delete(id);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============== METADATA OPERATIONS ==============

interface MetadataEntry {
  key: string;
  value: string | number | boolean;
}

/**
 * Set metadata value
 */
export async function setMetadata(key: string, value: string | number | boolean): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.METADATA], 'readwrite');
    const store = transaction.objectStore(STORES.METADATA);
    
    store.put({ key, value });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get metadata value
 */
export async function getMetadata(key: string): Promise<string | number | boolean | null> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.METADATA], 'readonly');
    const store = transaction.objectStore(STORES.METADATA);
    const request = store.get(key);
    
    request.onsuccess = () => {
      resolve(request.result?.value ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  return getMetadata('lastSyncTime') as Promise<string | null>;
}

/**
 * Set last sync timestamp
 */
export async function setLastSyncTime(time: string = new Date().toISOString()): Promise<void> {
  return setMetadata('lastSyncTime', time);
}

// ============== UTILITY FUNCTIONS ==============

/**
 * Clear all IndexedDB data
 */
export async function clearAllIndexedDB(): Promise<void> {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.STUDENTS, STORES.DESCRIPTORS, STORES.ATTENDANCE, STORES.SYNC_QUEUE, STORES.METADATA],
      'readwrite'
    );
    
    transaction.objectStore(STORES.STUDENTS).clear();
    transaction.objectStore(STORES.DESCRIPTORS).clear();
    transaction.objectStore(STORES.ATTENDANCE).clear();
    transaction.objectStore(STORES.SYNC_QUEUE).clear();
    transaction.objectStore(STORES.METADATA).clear();
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get storage usage estimate
 */
export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0
    };
  }
  return null;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
