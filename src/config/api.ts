// Centralized API Base URL Resolver
export const getApiUrl = (): string | null => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // If running on local development (localhost, 127.0.0.1, or local LAN IPs)
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.') || host.startsWith('30.30.')) {
      return `http://${host}:3006`;
    }
  }

  // On live cloud production hosting (e.g. arbillpay.web.app), operate in Direct Cloud Firestore mode
  return null;
};
