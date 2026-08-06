// Firebase Configuration & Initialization helper for ArbilBaru (Project: arbillpay)
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { initializeFirestore } from 'firebase/firestore';

// Environment safe configuration reader (Works in both Vite browser & Node.js scripts)
const getEnvVar = (key: string, fallback: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!;
  }
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch (e) {}
  return fallback;
};

// Real credentials for project: arbillpay
export const firebaseConfig = {
  apiKey: getEnvVar("VITE_FIREBASE_API_KEY", "AIzaSyDTKOdu9vth6hywTM8GqXOSBg8EtXnfH90"),
  authDomain: getEnvVar("VITE_FIREBASE_AUTH_DOMAIN", "arbillpay.firebaseapp.com"),
  projectId: getEnvVar("VITE_FIREBASE_PROJECT_ID", "arbillpay"),
  storageBucket: getEnvVar("VITE_FIREBASE_STORAGE_BUCKET", "arbillpay.firebasestorage.app"),
  messagingSenderId: getEnvVar("VITE_FIREBASE_MESSAGING_SENDER_ID", "953600438953"),
  appId: getEnvVar("VITE_FIREBASE_APP_ID", "1:953600438953:web:5c96e50dfc22ce78162fb8"),
  measurementId: getEnvVar("VITE_FIREBASE_MEASUREMENT_ID", "G-HJX7JWXF9Q")
};

// Singleton Firebase App Initialization
export const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Cloud Firestore Database Instance with robust Long-Polling (Bypasses network & firewall stream blocks)
export const db = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
});

// Analytics Initialization (Browser Safe Check)
export const initAnalytics = async () => {
  if (typeof window !== 'undefined' && await isSupported()) {
    return getAnalytics(firebaseApp);
  }
  return null;
};

export default firebaseApp;
