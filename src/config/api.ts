// Centralized API Base URL Resolver
export const getApiUrl = (): string | null => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Jika diakses via IP server (seperti 30.30.2.53), localhost, tunnel, atau custom domain
    if (host !== 'arbillpay.web.app' && host !== 'arbillpay.firebaseapp.com') {
      return window.location.origin;
    }
  }

  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // On live cloud production hosting (e.g. arbillpay.web.app), operate in Direct Cloud Firestore mode
  return null;
};
