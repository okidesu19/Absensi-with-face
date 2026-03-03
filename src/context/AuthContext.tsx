'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { auth, database } from '@/lib/firebase';
import { Admin } from '@/types';

interface AuthContextType {
  user: FirebaseUser | null;
  admin: Admin | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch admin data from database
        const adminRef = ref(database, `admin/${firebaseUser.uid}`);
        const snapshot = await get(adminRef);
        
        if (snapshot.exists()) {
          setAdmin(snapshot.val() as Admin);
        } else {
          // Create admin record if not exists
          const newAdmin: Admin = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: 'admin',
            createdAt: new Date().toISOString()
          };
          await set(adminRef, newAdmin);
          setAdmin(newAdmin);
        }
      } else {
        setAdmin(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create admin record
      const newAdmin: Admin = {
        uid: userCredential.user.uid,
        email: userCredential.user.email || '',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      
      await set(ref(database, `admin/${userCredential.user.uid}`), newAdmin);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setAdmin(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Logout failed';
      setError(errorMessage);
      throw err;
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ 
      user, 
      admin, 
      loading, 
      error, 
      login, 
      register, 
      logout, 
      clearError 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
