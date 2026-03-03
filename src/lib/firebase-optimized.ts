import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase, goOnline, goOffline } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// Firebase configuration - Users should replace with their own config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://demo-project-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abc123"
};

// Initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);
export const storage = getStorage(app);

// Enable offline persistence for Realtime Database
// Note: This needs to be done before any database operations
let persistenceEnabled = false;

export async function enableOfflinePersistence(): Promise<void> {
  if (persistenceEnabled) return;
  
  try {
    // @ts-expect-error - enablePersistence exists but may not be in types
    if (typeof database.enablePersistence === 'function') {
      // @ts-expect-error
      await database.enablePersistence({ synchronizeTabs: true });
      persistenceEnabled = true;
      console.log('Firebase offline persistence enabled');
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Already enabled or not supported
    if (error.code === 'failed-precondition') {
      console.warn('Firebase persistence already enabled in another tab');
      persistenceEnabled = true;
    } else if (error.code === 'unimplemented') {
      console.warn('Firebase persistence not supported in this browser');
    } else {
      console.error('Error enabling Firebase persistence:', err);
    }
  }
}

// Connection management
let isOnline = true;
let connectionListeners: ((online: boolean) => void)[] = [];

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true;
    goOnline(database);
    connectionListeners.forEach(cb => cb(true));
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    goOffline(database);
    connectionListeners.forEach(cb => cb(false));
  });
}

// Subscribe to connection state changes
export function onConnectionChange(callback: (online: boolean) => void): () => void {
  connectionListeners.push(callback);
  // Immediately notify of current state
  callback(isOnline);
  
  // Return unsubscribe function
  return () => {
    connectionListeners = connectionListeners.filter(cb => cb !== callback);
  };
}

// Get current connection state
export function isConnected(): boolean {
  return isOnline;
}

// Force reconnect
export function reconnect(): void {
  if (!isOnline) {
    goOnline(database);
    isOnline = true;
  }
}

// Batch write helper - debounces multiple writes into a single update
export function createBatchWriter<T extends Record<string, unknown>>(
  path: string,
  delay: number = 1000
): {
  add: (key: string, data: T) => void;
  flush: () => Promise<void>;
  clear: () => void;
} {
  let batch: Record<string, T> = {};
  let timeoutId: NodeJS.Timeout | null = null;

  const flush = async (): Promise<void> => {
    if (Object.keys(batch).length === 0) return;
    
    const currentBatch = { ...batch };
    batch = {};
    
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // Import set and ref dynamically to avoid circular dependencies
    const { ref, update } = await import('firebase/database');
    
    try {
      const updates: Record<string, T> = {};
      Object.entries(currentBatch).forEach(([key, data]) => {
        updates[`${path}/${key}`] = data;
      });
      
      await update(ref(database), updates);
    } catch (err) {
      console.error('Batch write error:', err);
      // Re-add failed items to batch for retry
      batch = { ...currentBatch, ...batch };
    }
  };

  const scheduleFlush = (): void => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(flush, delay);
  };

  const add = (key: string, data: T): void => {
    batch[key] = data;
    scheduleFlush();
  };

  const clear = (): void => {
    batch = {};
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { add, flush, clear };
}

// Connection pooling - keep a single reference
let databaseRef: ReturnType<typeof getDatabase> | null = null;

export function getDatabaseInstance(): ReturnType<typeof getDatabase> {
  if (!databaseRef) {
    databaseRef = getDatabase(app);
  }
  return databaseRef;
}

export default app;
