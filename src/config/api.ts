// Centralized API Base URL Resolver
export const getApiUrl = (): string | null => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // Only fallback to localhost if running in local browser environment
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:3006';
  }
  // On production live web hosting (e.g. arbillpay.web.app), return null to use direct Firebase Client SDK
  return null;
};
