// Centralized API Base URL Resolver
export const getApiUrl = (): string | null => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;

  // If running on live production hosting (e.g. arbillpay.web.app, firebaseapp.com, etc.)
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    // Ignore any localhost API URL if hardcoded into build environment
    if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl.trim().replace(/\/+$/, '');
    }
    // Return null on production hosting so the app operates 100% in Direct Firebase Cloud Firestore mode!
    return null;
  }

  // If running locally on laptop/desktop browser (localhost)
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:3006';
};
