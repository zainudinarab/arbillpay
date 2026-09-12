// Centralized API Base URL Resolver
export const getApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Jika diakses via IP server (seperti 30.30.2.53), domain (seperti arbill.arabpay.my.id), localhost, dsb
    if (host !== 'arbillpay.web.app' && host !== 'arbillpay.firebaseapp.com') {
      return window.location.origin;
    }
  }

  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Fallback relative path kosong agar otomatis memanggil origin domain saat ini
  return '';
};
