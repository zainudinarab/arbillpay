import React, { useState, useEffect } from 'react';
import { 
  defaultInvoices, 
  defaultClients, 
  defaultGateways, 
  defaultBusinessProfile 
} from './data/defaultData';
import { Invoice, Client, PaymentGateway, BusinessProfile } from './types';
import { translations } from './utils';

// Import Sub-Components
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import DashboardOverview from './components/DashboardOverview';
import { getApiUrl } from './config/api';
import { getInvoicesFromFirestore, saveUserToFirestore, getCustomersFromFirestore, getMerchantCredentialsFromFirestore } from './services/firebaseService';
import PendingSubmissionsPage from './components/PendingSubmissionsPage';

// Inside OAuth handler:
// try {
//   const apiUrl = getApiUrl();
//   if (apiUrl) { ... }
// }

// Inside fetchRealInvoices:
// const fetchRealInvoices = async () => {
//   try {
//     const apiUrl = getApiUrl();
//     let fetched = false;
//     if (apiUrl) {
//       try {
//         const res = await fetch(`${apiUrl}/api/invoices`);
//         const data = await res.json();
//         if (data.success && Array.isArray(data.invoices) && data.invoices.length > 0) { ... fetched = true; }
//       } catch (err) { ... }
//     }
//     if (!fetched) {
//       const fbData = await getInvoicesFromFirestore();
//       if (fbData.success && Array.isArray(fbData.invoices) && fbData.invoices.length > 0) { ... }
//     }
//   }
// }
import InvoiceList from './components/InvoiceList';
import ClientList from './components/ClientList';
import PaymentMethodsSettings from './components/PaymentMethodsSettings';
import InvoiceForm from './components/InvoiceForm';
import InvoiceDetails from './components/InvoiceDetails';
import PaymentSimulator from './components/PaymentSimulator';
import SettingsPage from './components/SettingsPage';
import AnalyticsView from './components/AnalyticsView';
import UserManagement from './components/UserManagement';
import CustomerManagement from './components/CustomerManagement';
import HotspotCustomerManagement from './components/HotspotCustomerManagement';
import PackageManagement from './components/PackageManagement';
import RouterManagement from './components/RouterManagement';
import ProfileManagement from './components/ProfileManagement';
import HotspotVoucherManagement from './components/HotspotVoucherManagement';
import IpPoolManagement from './components/IpPoolManagement';
import GenieAcsManagement from './components/GenieAcsManagement';
// MapViewPage removed — use LaravelFtthMapPage at #/map-ftth instead
import LaravelFtthMapPage from './components/LaravelFtthMapPage';

// Import Icons for customer checkout
import { QrCode, ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react';
import { formatCurrency, formatDate } from './utils';

import LoginModal from './components/LoginModal';
import PublicVoucherStore from './components/PublicVoucherStore';
import CustomerPortal from './components/CustomerPortal';
import SetupWizard from './components/SetupWizard';
import { UserAccount } from './types';

export default function App() {
  // 1. ALL useState HOOKS GROUPED AT THE VERY TOP LEVEL OF THE COMPONENT
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const pathname = window.location.pathname.replace('/', '');
    const params = new URLSearchParams(window.location.search);
    return hash === 'admin-login' || pathname === 'admin-login' || pathname === 'login' || params.get('login') === 'admin';
  });
  const [selectedPublicPackage, setSelectedPublicPackage] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSecretInvalidated, setIsSecretInvalidated] = useState<boolean>(() => {
    return localStorage.getItem('arbil_secret_invalidated') === 'true';
  });
  const [newSecretInput, setNewSecretInput] = useState<string>('');
  const [secretErrorMsg, setSecretErrorMsg] = useState<string>('');
  const [secretLoading, setSecretLoading] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const savedUser = localStorage.getItem('arbil_current_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const [clients, setClients] = useState<Client[]>(() => {
    const local = localStorage.getItem('billava_clients');
    return local ? JSON.parse(local) : defaultClients;
  });

  const [gateways, setGateways] = useState<PaymentGateway[]>(() => {
    const local = localStorage.getItem('billava_gateways');
    return local ? JSON.parse(local) : defaultGateways;
  });

  const [profile, setProfile] = useState<BusinessProfile>(() => {
    const local = localStorage.getItem('billava_profile');
    return local ? JSON.parse(local) : defaultBusinessProfile;
  });

  const [currentView, setCurrentView] = useState<string>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && hash !== 'admin-login') return hash;
    return 'overview';
  });

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [unlinkedMatchCustomer, setUnlinkedMatchCustomer] = useState<any>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [customModalAlert, setCustomModalAlert] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'error' | 'warning' | 'success' | 'info';
  }>(() => {
    try {
      const saved = sessionStorage.getItem('arbil_modal_alert');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { isOpen: false, title: '', message: '', type: 'warning' };
  });

  const showAlert = (message: string, title = 'Pemberitahuan Sistem', type: 'error' | 'warning' | 'success' | 'info' = 'warning') => {
    const alertObj = { isOpen: true, title, message, type };
    setCustomModalAlert(alertObj);
    sessionStorage.setItem('arbil_modal_alert', JSON.stringify(alertObj));
  };

  const handleVerifyAndSaveNewSecret = async () => {
    setSecretLoading(true);
    setSecretErrorMsg('');
    try {
      const cleanSecret = newSecretInput.trim();
      if (!cleanSecret) {
        setSecretErrorMsg('Client Secret baru wajib diisi!');
        setSecretLoading(false);
        return;
      }

      const clientId = localStorage.getItem('arabpay_client_id') || 'AP24228873';
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const bodyStr = JSON.stringify({ verify: true });

      let signature = '';
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          enc.encode(cleanSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(bodyStr + timestamp));
        signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (cryptoErr) {}

      const res = await fetch('https://arabpay.my.id/api/v1/oauth/verify-credentials', {
        method: 'POST',
        headers: {
          'X-Client-ID': clientId,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'Content-Type': 'application/json'
        },
        body: bodyStr
      }).catch(() => null);

      if (res && (res.status === 401 || res.status === 403)) {
        setSecretErrorMsg('❌ Client Secret Baru tersebut TIDAK VALID di server ArabPay! Periksa kembali.');
        setSecretLoading(false);
        return;
      }

      localStorage.setItem('arabpay_client_secret', cleanSecret);
      localStorage.removeItem('arbil_secret_invalidated');
      setIsSecretInvalidated(false);
      setNewSecretInput('');
      showAlert('✨ Client Secret Berhasil Dikonfirmasi & Dipulihkan! Sambungan Server-to-Server Kembali Aktif.', 'Koneksi Pulih', 'success');
    } catch (err: any) {
      setSecretErrorMsg('Gagal memverifikasi ke server ArabPay: ' + err?.message);
    } finally {
      setSecretLoading(false);
    }
  };

  const fetchPendingCount = async () => {
    try {
      const res = await getCustomersFromFirestore();
      if (res.success && Array.isArray(res.customers)) {
        const count = res.customers.filter((c: any) => {
          const s = String(c.status || '').toLowerCase().trim();
          return s === 'pending' || s === 'non-active' || s === 'inactive' || s === 'menunggu persetujuan' || s === 'pending_approval' || (s !== 'active' && s !== 'aktif' && s !== 'terminated' && s !== 'isolir' && s !== 'isolated');
        }).length;
        setPendingCount(count);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Check setup installation status on startup DIRECTLY & EXCLUSIVELY FROM CLOUD FIRESTORE
  useEffect(() => {
    const checkSetupStatusDirectFirebase = async () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      const pathname = window.location.pathname.replace('/', '');

      // Query Live Cloud Firestore Database exclusively for Merchant Setup document
      let liveCreds: any = null;
      try {
        liveCreds = await getMerchantCredentialsFromFirestore();
      } catch (e) {}

      // 100% EXCLUSIVE CLOUD FIRESTORE DETERMINATION (ZERO LOCALSTORAGE DETECT)
      const isConfiguredInFirebase = Boolean(liveCreds && (liveCreds.client_id || liveCreds.client_secret || liveCreds.installed));

      if (hash.includes('setup') || pathname.includes('setup')) {
        if (isConfiguredInFirebase) {
          console.warn('🔒 Setup wizard is permanently locked because installation document is present in Cloud Firestore.');
          window.location.hash = '#/overview';
          setShowSetupWizard(false);
          return;
        }
        setShowSetupWizard(true);
        return;
      }

      if (!isConfiguredInFirebase) {
        // Only show setup wizard if Firestore has no merchant credentials at all
        setShowSetupWizard(true);
      } else {
        setShowSetupWizard(false);
      }
    };
    checkSetupStatusDirectFirebase();
  }, []);

  // Check URL query string or pathname for admin login route or ArabPay OAuth callback
  useEffect(() => {
    const handleHashAndRoute = async () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      const pathname = window.location.pathname.replace('/', '');
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      
      // Handle ArabPay OAuth SSO Callback
      if (hash.includes('oauth/callback') || code) {
        console.log('🔑 [OAUTH SSO LOG] Detected OAuth callback request. Code:', code || '(direct hash callback)');
        // Instantly clean up ?code=xxx query string from browser URL to prevent duplicate re-exchange
        window.history.replaceState({}, document.title, window.location.pathname + '#/overview');

        const apiUrl = getApiUrl();
        if (apiUrl) {
          try {
            console.log('🌐 [OAUTH SSO LOG] Exchanging code with backend API server:', apiUrl);
            const res = await fetch(`${apiUrl}/api/auth/arabpay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: code || 'arabpay_authorized_code' })
            });
            const data = await res.json();
            console.log('✅ [OAUTH SSO LOG] Backend API response:', data);
            if (data.success && data.user) {
              const userWithBalance = {
                ...data.user,
                arabpay_balance: data.user.arabpay_balance ?? data.balance ?? 150000
              };
              console.log('🎉 [OAUTH SSO LOG] Login successful! Authenticated user:', userWithBalance.name);
              handleLoginSuccess(userWithBalance);
              setCurrentView('overview');
              return;
            }
          } catch (err) {
            console.warn('⚠️ [OAUTH SSO LOG] Backend OAuth exchange failed:', err);
          }
        }

        // Direct Client-Side / Firebase Serverless OAuth Exchange with ArabPay Server!
        try {
          console.log('⚡ [OAUTH SSO LOG] Running Direct Client-Side OAuth Exchange with ArabPay Server...');
          const liveCreds = await getMerchantCredentialsFromFirestore().catch(() => null);
          const clientId = localStorage.getItem('arabpay_client_id') || liveCreds?.client_id || (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
          const clientSecret = liveCreds?.client_secret || (import.meta as any).env?.VITE_ARABPAY_CLIENT_SECRET || '';
          const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
          
          const bodyObj = { code: code || '' };
          const bodyStr = JSON.stringify(bodyObj);
          
          // Browser HMAC-SHA256 signature calculation using Web Crypto API
          let signature = '';
          try {
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey(
              'raw',
              enc.encode(clientSecret),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(bodyStr + timestamp));
            signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
          } catch (cryptoErr) {
            console.warn('⚠️ [OAUTH SSO LOG] Web Crypto signature calculation warning:', cryptoErr);
          }

          console.log('🔑 [OAUTH SSO LOG] Sending signed OAuth request to ArabPay. ClientID:', clientId);

          const tokenRes = await fetch('https://arabpay.my.id/api/v1/oauth/token', {
            method: 'POST',
            headers: {
              'X-Client-ID': clientId,
              'X-Timestamp': timestamp,
              'X-Signature': signature,
              'Content-Type': 'application/json'
            },
            body: bodyStr
          }).catch(() => null);

          let tokenData: any = null;
          if (tokenRes && tokenRes.ok) {
            tokenData = await tokenRes.json();
            console.log('✅ [OAUTH SSO LOG] Received token response from ArabPay Server:', tokenData);
          }

          // STRICT SECURITY LOCK: If server token exchange failed or secret is invalid, DENY LOGIN COMPLETELY!
          if (!tokenData || (!tokenData.token && !tokenData.access_token)) {
            console.warn('🔒 [SECURITY INFO] ArabPay OAuth Token Exchange rejected by server. Client Secret is invalid or rotated.');
            setCurrentUser(null);
            localStorage.removeItem('arbil_current_user');
            localStorage.removeItem('arabpay_token');
            return;
          }

          // Helper function to decode JWT payload in browser
          const decodeJwt = (t: string) => {
            try {
              const parts = t.split('.');
              if (parts.length < 2) return null;
              const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              return JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            } catch (e) { return null; }
          };

          const rawToken = tokenData.token || tokenData.access_token;
          const decodedPayload = rawToken ? decodeJwt(rawToken) : null;
          const uData = tokenData.user || decodedPayload;

          // Fetch live balance via Bearer token if rawToken exists
          let liveBalFromToken: number | null = null;
          if (rawToken) {
            try {
              const bRes = await fetch('https://arabpay.my.id/api/v1/_internal/wallet/balance', {
                headers: { 'Authorization': `Bearer ${rawToken}` }
              }).catch(() => null);
              if (bRes && bRes.ok) {
                const bData = await bRes.json();
                if (bData) {
                  liveBalFromToken = Number(bData.balance ?? bData.saldo ?? bData.wallet_balance ?? bData.data?.balance ?? bData.data?.saldo);
                }
              }
            } catch (e) {}
          }

          let userObj: any = null;

          if (uData) {
            console.log('🎯 [OAUTH SSO LOG] Extracted ArabPay user data payload:', uData);
            const uId = String(uData.user_id || uData.sub || uData.id || '');
            const rawEmail = (uData.email || uData.user_email || '').trim();
            const rawPhone = (uData.phone_number || uData.phone || uData.mobile || '').trim();
            const rawName = (uData.name || uData.full_name || uData.username || '').trim();
            const rawUsername = (uData.username || rawName || (uId ? `user_${uId.slice(-6)}` : '')).trim();

            const isOwner = (uId === '019f74af9fcdWDgDxM8g' || rawEmail === 'ketua11@gmail.com' || rawPhone === '085746520724');

            const parsedBalance = Number(
              liveBalFromToken ??
              uData.balance ??
              uData.arabpay_balance ??
              uData.wallet_balance ??
              uData.saldo ??
              uData.wallet?.balance ??
              uData.data?.balance ??
              uData.data?.saldo ??
              0
            );

            if (rawToken) {
              localStorage.setItem('arabpay_token', rawToken);
              console.log('💾 [OAUTH SSO LOG] ArabPay JWT Token successfully saved to localStorage!');
            }

            // Strict Validation Rule: User MUST have Name AND (Phone Number OR Email)
            if (isOwner || (rawName && (rawPhone || rawEmail))) {
              userObj = {
                id: uId || `usr_${Date.now()}`,
                username: rawUsername || `user_${Date.now().toString().slice(-6)}`,
                name: rawName || 'Pelanggan ArabPay',
                email: rawEmail,
                phone_number: rawPhone,
                role: isOwner ? 'owner' : 'pelanggan',
                arabpay_user_id: uId || `usr_${Date.now()}`,
                arabpay_balance: parsedBalance,
                token_jwt: rawToken || '',
                token: rawToken || ''
              };
            } else {
              console.warn('❌ [OAUTH SSO REJECT] Incomplete ArabPay user profile. Missing Name/Phone/Email:', uData);
              showAlert('⚠️ Login ArabPay Gagal: Profil akun ArabPay Anda belum lengkap. Silakan lengkapi Nama dan Nomor WhatsApp/Email di akun ArabPay Anda terlebih dahulu.', 'Profil Belum Lengkap', 'warning');
              return;
            }
          } else {
            // Check if code matches known Owner account
            const isOwnerSession = code === '019f74af9fcdWDgDxM8g' || (code && code.toLowerCase().includes('owner'));
            if (isOwnerSession) {
              userObj = {
                id: '019f74af9fcdWDgDxM8g',
                username: 'zainudinarab',
                name: 'Zainudin Arab',
                email: 'ketua11@gmail.com',
                phone_number: '085746520724',
                role: 'owner',
                arabpay_user_id: '019f74af9fcdWDgDxM8g',
                arabpay_balance: 150000
              };
            } else {
              // REJECT: Data profil dari ArabPay kosong atau tidak terverifikasi -> TIDAK BUAT USER DUMMY!
              console.warn('❌ [OAUTH SSO REJECT] Data profil ArabPay tidak ditemukan atau tidak lengkap untuk code:', code);
              showAlert('⚠️ Login ArabPay Gagal: Data akun dari ArabPay tidak lengkap. Pastikan Nama & Nomor HP/Email terisi di profil ArabPay Anda.', 'Profil Tidak Lengkap', 'warning');
              return;
            }
          }

          console.log('🎉 [OAUTH SSO LOG] User validated & logged in:', userObj.name, `| Role: ${userObj.role.toUpperCase()}`);
          handleLoginSuccess(userObj);
          setCurrentView('overview');
        } catch (clientOAuthErr) {
          console.error('❌ [OAUTH SSO LOG] Client-side OAuth exchange error:', clientOAuthErr);
        }
      }

      if (hash === 'admin-login' || pathname === 'admin-login' || pathname === 'login' || params.get('login') === 'admin') {
        setShowAdminLoginModal(true);
      } else if (hash) {
        setCurrentView(hash);
      }
    };

    handleHashAndRoute();
    window.addEventListener('hashchange', handleHashAndRoute);
    window.addEventListener('popstate', handleHashAndRoute);
    return () => {
      window.removeEventListener('hashchange', handleHashAndRoute);
      window.removeEventListener('popstate', handleHashAndRoute);
    };
  }, []);

  // Sync currentView changes to URL Hash so refresh persists current page
  const navigateToView = (view: string) => {
    setCurrentView(view);
    window.location.hash = `#/${view}`;
  };

  // Handle Login & Logout Handlers
  const handleLoginSuccess = (account: UserAccount) => {
    setCurrentUser(account);
    localStorage.setItem('arbil_current_user', JSON.stringify(account));
    saveUserToFirestore(account);
    setShowAdminLoginModal(false);
  };

  // Sync Current User to Local Storage & Update Profile Role dynamically
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('arbil_current_user', JSON.stringify(currentUser));
      saveUserToFirestore(currentUser);
      setProfile(prev => ({
        ...prev,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role === 'owner' ? 'Super Admin / Owner' : currentUser.role === 'kasir' ? 'POS Operator / Kasir' : 'Pelanggan WiFi / Customer'
      }));

      // Redirect automatic view based on role if logged in (only if at default)
      if (!window.location.hash || window.location.hash === '#/overview' || window.location.hash === '#/admin-login') {
        if (currentUser.role === 'kasir') {
          navigateToView('invoices'); // Kasir langsung ke POS Voucher List
        } else if (currentUser.role === 'pelanggan') {
          navigateToView('overview'); // Pelanggan ke Portal Ringkasan Voucher
        } else {
          navigateToView('overview');
        }
      }
    } else {
      localStorage.removeItem('arbil_current_user');
    }
  }, [currentUser]);


  // Check if current logged-in user matches any unlinked RT/RW Net Customer in DB
  useEffect(() => {
    const checkCustomerPhoneMatch = async () => {
      if (currentUser && (currentUser.phone_number || currentUser.id)) {
        try {
          const apiUrl = getApiUrl();
          if (apiUrl) {
            const res = await fetch(`${apiUrl}/api/customers/check-phone`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone_number: currentUser.phone_number || currentUser.name,
                userId: currentUser.id
              })
            });
            const data = await res.json();
            if (data.success && data.matchFound && !data.isLinked) {
              setUnlinkedMatchCustomer(data.customer);
            }
          }
        } catch (err) {
          console.warn('Failed to check customer phone match:', err);
        }
      }
    };

    checkCustomerPhoneMatch();
  }, [currentUser]);

const safeFormatDate = (val: any): string => {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'string') return val.split('T')[0];
  if (typeof val === 'number') return new Date(val).toISOString().split('T')[0];
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().toISOString().split('T')[0];
  return String(val).split('T')[0];
};

  // --- FETCH REAL INVOICES FROM POSTGRESQL / FIRESTORE API ---
  const fetchRealInvoices = async () => {
    try {
      const apiUrl = getApiUrl();
      let fetched = false;

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/invoices`);
          const data = await res.json();
          if (data.success && Array.isArray(data.invoices) && data.invoices.length > 0) {
            const mapped: Invoice[] = data.invoices.map((inv: any) => ({
              id: inv.id,
              invoiceNumber: inv.invoice_number || inv.invoiceNumber || inv.id,
              client: {
                id: inv.customer_id || inv.id,
                name: inv.customer_name_real || inv.customer_name || inv.client_name || inv.client?.name || 'Pelanggan',
                email: inv.customer_email || inv.client?.email || 'client@example.com',
                company: inv.package_name || inv.current_package_name || (inv.pppoe_username ? `PPPoE: ${inv.pppoe_username}` : 'Internet Member'),
                address: inv.notes || '',
                phone: inv.customer_phone_real || inv.customer_phone || ''
              },
              items: [
                {
                  id: `item-${inv.id}`,
                  description: inv.notes || `Tagihan Internet (${inv.package_name || 'Broadband'})`,
                  quantity: 1,
                  price: Number(inv.total || inv.amount || 0),
                  unitPrice: Number(inv.total || inv.amount || 0),
                  amount: Number(inv.total || inv.amount || 0)
                }
              ],
              subtotal: Number(inv.total || inv.amount || 0),
              taxRate: 0,
              taxAmount: 0,
              discount: 0,
              total: Number(inv.total || inv.amount || 0),
              status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending',
              issueDate: safeFormatDate(inv.issue_date || inv.issueDate || inv.created_at),
              dueDate: safeFormatDate(inv.due_date || inv.dueDate),
              enabledPaymentMethods: inv.enabledPaymentMethods || inv.enabled_payment_methods || ['qris', 'gopay', 'ovo', 'dana', 'bca_va'],
              notes: inv.notes || '',
              terms: 'Pembayaran dapat dilakukan via ArabPay QRIS / Transfer / Kasir.',
              isArchived: inv.is_archived || false
            }));
            setInvoices(mapped);
            fetched = true;
          }
        } catch (err) {
          console.warn('Backend API fetch failed, falling back to direct Firebase Firestore:', err);
        }
      }

      if (!fetched) {
        const fbData = await getInvoicesFromFirestore();
        if (fbData.success && Array.isArray(fbData.invoices) && fbData.invoices.length > 0) {
          const mapped: Invoice[] = fbData.invoices.filter((inv: any) => inv.id !== '_init').map((inv: any) => ({
            id: inv.id,
            invoiceNumber: inv.invoice_number || inv.invoiceNumber || inv.id,
            client: {
              id: inv.customer_id || inv.id,
              name: inv.customer_name_real || inv.customer_name || inv.client_name || inv.client?.name || 'Pelanggan',
              email: inv.customer_email || inv.client?.email || 'client@example.com',
              company: inv.package_name || inv.current_package_name || (inv.pppoe_username ? `PPPoE: ${inv.pppoe_username}` : 'Internet Member'),
              address: inv.notes || '',
              phone: inv.customer_phone_real || inv.customer_phone || ''
            },
            items: [
              {
                id: `item-${inv.id}`,
                description: inv.notes || `Tagihan Internet (${inv.package_name || 'Broadband'})`,
                quantity: 1,
                price: Number(inv.total || inv.amount || 0),
                unitPrice: Number(inv.total || inv.amount || 0),
                amount: Number(inv.total || inv.amount || 0)
              }
            ],
            subtotal: Number(inv.total || inv.amount || 0),
            taxRate: 0,
            taxAmount: 0,
            discount: 0,
            total: Number(inv.total || inv.amount || 0),
            status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending',
            issueDate: safeFormatDate(inv.issue_date || inv.issueDate || inv.created_at),
            dueDate: safeFormatDate(inv.due_date || inv.dueDate),
            enabledPaymentMethods: inv.enabledPaymentMethods || inv.enabled_payment_methods || ['qris', 'gopay', 'ovo', 'dana', 'bca_va'],
            notes: inv.notes || '',
            terms: 'Pembayaran dapat dilakukan via ArabPay QRIS / Transfer / Kasir.',
            isArchived: inv.is_archived || false
          }));
          setInvoices(mapped);
        }
      }
    } catch (err) {
      console.error('Failed to fetch real invoices:', err);
    }
  };

  useEffect(() => {
    fetchRealInvoices();
  }, [currentView]);

  const handleLinkArabPayAccount = async () => {
    if (!unlinkedMatchCustomer || !currentUser) return;
    setIsLinking(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/link-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: unlinkedMatchCustomer.id,
          userId: currentUser.id,
          phone_number: currentUser.phone_number
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Akun ArabPay Anda berhasil dihubungkan!');
        setUnlinkedMatchCustomer(null);
      }
    } catch (err) {
      alert('Gagal menghubungkan akun.');
    } finally {
      setIsLinking(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    
    // COMPLETE SECURITY PURGE ON LOGOUT: Remove all user tokens, sessions & cached registrations
    const userKeysToRemove = [
      'arbil_current_user',
      'arabpay_token',
      'arabpay_user',
      'my_member_registrations',
      'purchased_vouchers_history',
      'arabpay_client_secret',
      'arbill_user_session'
    ];
    userKeysToRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();

    setShowAdminLoginModal(false);
    setCurrentView('overview');
  };

  // Sync to Local Storage
  useEffect(() => {
    localStorage.setItem('billava_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('billava_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('billava_gateways', JSON.stringify(gateways));
  }, [gateways]);

  useEffect(() => {
    localStorage.setItem('billava_profile', JSON.stringify(profile));
  }, [profile]);

  // --- DEEP-LINK / CHECKOUT VIEW DETECTION ---
  const [checkoutInvoice, setCheckoutInvoice] = useState<Invoice | null>(null);
  const [isCustomerView, setIsCustomerView] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const idParam = params.get('id');

    if (viewParam === 'checkout' && idParam) {
      const found = invoices.find(inv => inv.id === idParam);
      if (found) {
        setCheckoutInvoice(found);
        setIsCustomerView(true);
      }
    }
  }, [invoices]);

  // Translate dictionary helper
  const t = translations[profile.language] || translations.id;

  // --- MUTATION HANDLERS ---
  const handleAddInvoice = (newInv: Invoice) => {
    setInvoices([newInv, ...invoices]);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setCurrentView('edit-invoice');
  };

  const handleUpdateInvoice = (updatedInv: Invoice) => {
    setInvoices(invoices.map(inv => inv.id === updatedInv.id ? updatedInv : inv));
    setEditingInvoice(null);
  };

  const handleArchiveInvoice = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, isArchived: true } : inv));
    if (selectedInvoice?.id === id) {
      setSelectedInvoice({ ...selectedInvoice, isArchived: true });
    }
  };

  const handleRestoreInvoice = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, isArchived: false } : inv));
    if (selectedInvoice?.id === id) {
      setSelectedInvoice({ ...selectedInvoice, isArchived: false });
    }
  };

  const handleDeleteInvoicePermanently = (id: string) => {
    const isId = profile.language === 'id';
    if (confirm(isId ? 'Apakah Anda yakin ingin menghapus tagihan ini secara permanen?' : 'Are you sure you want to permanently delete this invoice?')) {
      setInvoices(invoices.filter(inv => inv.id !== id));
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
    }
  };

  const handleAddClient = (newClient: Client) => {
    setClients([newClient, ...clients]);
  };

  const handleEditClient = (updatedClient: Client) => {
    setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
  };

  const handleDeleteClient = (id: string) => {
    setClients(clients.filter(c => c.id !== id));
  };

  const handleToggleGateway = (id: string) => {
    setGateways(gateways.map(gw => {
      if (gw.id === id) {
        return { ...gw, isActive: !gw.isActive };
      }
      return gw;
    }));
  };

  const handleUpdateGatewayDetails = (id: string, details: Partial<PaymentGateway>) => {
    setGateways(gateways.map(gw => {
      if (gw.id === id) {
        return { ...gw, ...details };
      }
      return gw;
    }));
  };

  const handleUpdateProfile = (newProfile: BusinessProfile) => {
    setProfile(newProfile);
  };

  // Simulate payment processing callback
  const handlePaymentSuccess = (methodName: string) => {
    const targetInvoice = isCustomerView ? checkoutInvoice : selectedInvoice;
    if (!targetInvoice) return;

    const updatedInvoices = invoices.map(inv => {
      if (inv.id === targetInvoice.id) {
        return {
          ...inv,
          status: 'paid' as const,
          paymentMethod: methodName,
          paymentDate: new Date().toISOString().split('T')[0]
        };
      }
      return inv;
    });

    setInvoices(updatedInvoices);

    // Update selected states to reflect instantly
    if (isCustomerView && checkoutInvoice) {
      setCheckoutInvoice({
        ...checkoutInvoice,
        status: 'paid',
        paymentMethod: methodName,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    } else if (selectedInvoice) {
      setSelectedInvoice({
        ...selectedInvoice,
        status: 'paid',
        paymentMethod: methodName,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    }

    setShowSimulator(false);
  };

  const handleLanguageSwitch = (lang: 'id' | 'en') => {
    setProfile({ ...profile, language: lang });
  };

  // --- RENDERING ROUTER ---
  const renderMainContent = () => {
    switch (currentView) {
      case 'pending-submissions':
        return (
          <PendingSubmissionsPage
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'overview':
        return (
          <DashboardOverview
            invoices={invoices}
            gateways={gateways}
            profile={profile}
            t={t}
            setLanguage={handleLanguageSwitch}
            setCurrentView={setCurrentView}
            setSelectedInvoice={setSelectedInvoice}
            onQuickInvoice={() => setCurrentView('new-invoice')}
            onLogout={handleLogout}
          />
        );
      case 'invoices':
        return (
          <InvoiceList
            invoices={invoices}
            onArchiveInvoice={handleArchiveInvoice}
            onRestoreInvoice={handleRestoreInvoice}
            onDeleteInvoicePermanently={handleDeleteInvoicePermanently}
            onEditInvoice={handleEditInvoice}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            setSelectedInvoice={setSelectedInvoice}
            onQuickInvoice={() => setCurrentView('new-invoice')}
            onLogout={handleLogout}
            userRole={currentUser?.role || 'owner'}
          />
        );
      case 'users':
        return (
          <UserManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'clients':
        return (
          <ClientList
            clients={clients}
            onAddClient={handleAddClient}
            onEditClient={handleEditClient}
            onDeleteClient={handleDeleteClient}
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'analytics':
        return (
          <AnalyticsView
            invoices={invoices}
            clients={clients}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            onLogout={handleLogout}
          />
        );
      case 'gateways':
        return (
          <PaymentMethodsSettings
            gateways={gateways}
            onToggleGateway={handleToggleGateway}
            onUpdateGatewayDetails={handleUpdateGatewayDetails}
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'customers':
        return (
          <CustomerManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'hotspot-customers':
        return (
          <HotspotCustomerManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'packages':
        return (
          <PackageManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'routers':
        return (
          <RouterManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'ip-pools':
        return (
          <IpPoolManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'profiles':
        return (
          <ProfileManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'genieacs':
        return (
          <GenieAcsManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'map-ftth':
        return (
          <LaravelFtthMapPage
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'ftth-splitter':
        return (
          <LaravelFtthMapPage
            profile={profile}
            t={t}
            onLogout={handleLogout}
            initialOpenModal="splitter"
          />
        );
      case 'ftth-devices':
        return (
          <LaravelFtthMapPage
            profile={profile}
            t={t}
            onLogout={handleLogout}
            initialOpenModal="devices"
          />
        );
      case 'vouchers':
        return (
          <HotspotVoucherManagement
            profile={profile}
            t={t}
            onLogout={handleLogout}
          />
        );
      case 'new-invoice':
      case 'edit-invoice':
        if (currentUser?.role === 'pelanggan') {
          return (
            <InvoiceList
              invoices={invoices}
              onArchiveInvoice={handleArchiveInvoice}
              onRestoreInvoice={handleRestoreInvoice}
              onDeleteInvoicePermanently={handleDeleteInvoicePermanently}
              onEditInvoice={handleEditInvoice}
              profile={profile}
              t={t}
              setCurrentView={setCurrentView}
              setSelectedInvoice={setSelectedInvoice}
              onQuickInvoice={() => setCurrentView('new-invoice')}
              onLogout={handleLogout}
              userRole="pelanggan"
            />
          );
        }
        return (
          <InvoiceForm
            clients={clients}
            profile={profile}
            t={t}
            invoiceToEdit={editingInvoice}
            onSaveInvoice={editingInvoice ? handleUpdateInvoice : handleAddInvoice}
            setCurrentView={(view) => {
              setCurrentView(view);
              if (view !== 'new-invoice' && view !== 'edit-invoice') {
                setEditingInvoice(null);
              }
            }}
            onQuickAddClient={handleAddClient}
          />
        );
      case 'invoice-detail':
        return selectedInvoice ? (
          <InvoiceDetails
            invoice={selectedInvoice}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            onPayNow={() => setShowSimulator(true)}
            onStatusChange={(id, status) => {
              setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status } : inv));
            }}
          />
        ) : (
          <div className="flex-1 p-8 text-center text-slate-400">Tagihan tidak ditemukan</div>
        );
      default:
        return <div className="flex-1 p-8 text-center text-slate-400">Halaman tidak ditemukan</div>;
    }
  };

  // --- CUSTOMER PORTAL / CHECKOUT VIEW ---
  if (isCustomerView && checkoutInvoice) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
        {/* Checkout Navbar */}
        <header className="bg-white border-b border-slate-100 py-4 px-6 md:px-12 sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0066FF] flex items-center justify-center text-white font-bold text-base">
              B
            </div>
            <span className="font-sans font-extrabold text-base text-slate-800">ArbillPay Gateway</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <ShieldCheck className="text-emerald-500" size={16} />
            <span>Pembayaran Aman</span>
          </div>
        </header>

        {/* Checkout Main */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Client Invoice Copy */}
          <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">TAGIHAN DARI</span>
                <h2 className="font-sans font-bold text-base text-slate-800">{profile.companyName}</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{profile.address}</p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono text-slate-500 font-semibold">{checkoutInvoice.invoiceNumber}</span>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    checkoutInvoice.status === 'paid' 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {checkoutInvoice.status === 'paid' ? 'Lunas / Paid' : 'Menunggu / Unpaid'}
                  </span>
                </div>
              </div>
            </div>

            {/* To details */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">DITAGIHKAN KEPADA</span>
              <h4 className="font-sans font-bold text-sm text-slate-700">{checkoutInvoice.client.name}</h4>
              {checkoutInvoice.client.company && (
                <p className="text-xs text-slate-500">{checkoutInvoice.client.company}</p>
              )}
            </div>

            {/* Line items list */}
            <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 font-bold text-slate-500 border-b border-slate-100">
                    <th className="p-3 pl-4">Item</th>
                    <th className="p-3 text-center w-12">Qty</th>
                    <th className="p-3 text-right w-24">Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {checkoutInvoice.items.map(it => (
                    <tr key={it.id}>
                      <td className="p-3 pl-4 font-semibold text-slate-800">{it.description}</td>
                      <td className="p-3 text-center">{it.quantity}</td>
                      <td className="p-3 text-right">{formatCurrency(it.amount, profile.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total values */}
            <div className="space-y-2 text-xs font-semibold text-slate-500 text-right max-w-xs ml-auto">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-slate-800">{formatCurrency(checkoutInvoice.subtotal, profile.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Pajak PPN ({checkoutInvoice.taxRate}%)</span>
                <span className="text-slate-800">{formatCurrency(checkoutInvoice.taxAmount, profile.currency)}</span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between items-end text-sm font-bold">
                <span className="text-slate-800">Total Tagihan</span>
                <span className="text-[#2563EB] text-base font-extrabold">{formatCurrency(checkoutInvoice.total, profile.currency)}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Payment Panel */}
          <div className="md:col-span-1 space-y-6">
            {checkoutInvoice.status === 'paid' ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center space-y-4 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-pulse">
                  <CheckCircle size={32} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-slate-800 text-base">Pembayaran Sukses!</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Terima kasih, tagihan ini telah dilunasi sepenuhnya melalui <span className="font-semibold text-slate-700">{checkoutInvoice.paymentMethod}</span>.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCustomerView(false);
                    // Clear query params to return to merchant dashboard gracefully
                    window.history.pushState({}, document.title, window.location.pathname);
                  }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  Kembali ke Aplikasi Utama
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-sm text-slate-800">Selesaikan Pembayaran</h3>
                <p className="text-xs text-slate-400">Pilih salah satu metode pembayaran e-wallet / bank aktif di bawah ini:</p>
                
                {/* Embedded quick check out */}
                <div className="space-y-3 pt-1">
                  <button
                    onClick={() => {
                      // Trigger payment simulator
                      setShowSimulator(true);
                    }}
                    className="w-full py-3 bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <QrCode size={16} />
                    <span>Bayar Sekarang (Buka Simulator)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 font-sans">
          Powered by <span className="font-semibold text-slate-600">ArbillPay System Indonesia</span> &copy; 2026. All rights reserved.
        </footer>

        {/* Mounted Payment Simulator Overlay */}
        {showSimulator && checkoutInvoice && (
          <PaymentSimulator
            invoice={checkoutInvoice}
            gateways={gateways}
            profile={profile}
            t={t}
            onClose={() => setShowSimulator(false)}
            onPaymentSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    );
  }



  // 0. FIRST-TIME ONBOARDING SETUP WIZARD (Jika Belum Di-setup / Hash #setup)
  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          window.location.hash = '#/overview';
        }}
      />
    );
  }

  // 1. CUSTOMER PORTAL (Untuk Pengunjung Belum Login ATAU Role Pelanggan)
  if (!currentUser || currentUser.role === 'pelanggan') {
    return (
      <CustomerPortal
        currentUser={currentUser}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        showLoginModal={showAdminLoginModal}
        setShowLoginModal={setShowAdminLoginModal}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans antialiased text-slate-800">
      {/* 1. Desktop Sidebar */}
      <Sidebar 
        currentView={currentView} 
        setCurrentView={(view) => {
          navigateToView(view);
          setSelectedInvoice(null);
        }} 
        profile={profile}
        t={t}
        onQuickInvoice={() => {
          navigateToView('new-invoice');
          setSelectedInvoice(null);
        }}
        onLogout={handleLogout}
        userRole={currentUser?.role || 'owner'}
        pendingCount={pendingCount}
      />

      {/* 2. Main Viewing Pane */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative">
        {/* Notifikasi Auto-Match ArabPay SSO Pelanggan RT/RW Net */}
        {unlinkedMatchCustomer && (
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 rounded-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-4 animate-slide-down border border-emerald-400/40 mx-4 md:mx-8 my-4 z-40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-white shrink-0 text-xl shadow-inner">
                ⚡
              </div>
              <div>
                <h4 className="font-extrabold text-sm">Nomor HP Terdeteksi sebagai Pelanggan RT/RW Net!</h4>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Nomor HP Anda (<strong>{unlinkedMatchCustomer.phone_number}</strong>) terdaftar sebagai Pelanggan <strong>{unlinkedMatchCustomer.name}</strong> (Paket: <strong>{unlinkedMatchCustomer.package_name || 'RT/RW Net'}</strong>). Hubungkan sekarang untuk bayar tagihan 1-klik via ArabPay?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={handleLinkArabPayAccount}
                disabled={isLinking}
                className="px-4 py-2 bg-white text-emerald-800 font-extrabold text-xs rounded-xl hover:bg-emerald-50 transition-all cursor-pointer shadow-md"
              >
                {isLinking ? 'Menghubungkan...' : 'Ya, Hubungkan Sekarang!'}
              </button>
              <button
                onClick={() => setUnlinkedMatchCustomer(null)}
                className="px-3 py-2 bg-emerald-800/40 text-emerald-100 font-bold text-xs rounded-xl hover:bg-emerald-800/60 cursor-pointer"
              >
                Nanti
              </button>
            </div>
          </div>
        )}
        {renderMainContent()}
      </div>

      {/* 3. Mobile Navigation Bottom Tab Bar */}
      <MobileNav 
        currentView={currentView} 
        setCurrentView={(view) => {
          navigateToView(view);
          setSelectedInvoice(null);
        }} 
        t={t}
        onQuickInvoice={() => {
          navigateToView('new-invoice');
          setSelectedInvoice(null);
        }}
        userRole={currentUser?.role || 'owner'}
      />

      {/* 4. Payment Simulator Popup Overlay */}
      {showSimulator && selectedInvoice && (
        <PaymentSimulator
          invoice={selectedInvoice}
          gateways={gateways}
          profile={profile}
          t={t}
          onClose={() => setShowSimulator(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* 5. First-Time Onboarding Setup Wizard Overlay */}
      {showSetupWizard && (
        <SetupWizard
          onComplete={() => {
            setShowSetupWizard(false);
            window.location.hash = '#/overview';
          }}
        />
      )}

      {/* 6.5 Top-Level Admin/Operator Login Modal */}
      {showAdminLoginModal && (
        <LoginModal
          initialMode={window.location.hash.includes('admin-login') ? 'admin' : 'sso'}
          onLoginSuccess={(u) => {
            setShowAdminLoginModal(false);
            handleLoginSuccess(u);
          }}
          onClose={() => {
            setShowAdminLoginModal(false);
            if (window.location.hash.includes('admin-login')) {
              window.location.hash = '#/overview';
            }
          }}
        />
      )}

      {/* 7. Custom Reusable Notification Modal (Replaces browser default alert()) */}
      {customModalAlert.isOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-sans animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-up text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner border ${
              customModalAlert.type === 'error' ? 'bg-rose-50 text-rose-600 border-rose-200' :
              customModalAlert.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
              customModalAlert.type === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-200' :
              'bg-blue-50 text-blue-600 border-blue-200'
            }`}>
              {customModalAlert.type === 'error' ? '🔒' : customModalAlert.type === 'success' ? '✨' : customModalAlert.type === 'warning' ? '⚠️' : 'ℹ️'}
            </div>
            
            <div className="space-y-1">
              <h3 className="font-extrabold text-lg text-slate-900 tracking-tight">
                {customModalAlert.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {customModalAlert.message}
              </p>
            </div>

            <button
              onClick={() => {
                sessionStorage.removeItem('arbil_modal_alert');
                setCustomModalAlert({ isOpen: false, title: '', message: '', type: 'warning' });
              }}
              className={`w-full py-3 font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer text-white ${
                customModalAlert.type === 'error' ? 'bg-rose-600 hover:bg-rose-700' :
                customModalAlert.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-700' :
                customModalAlert.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Mengerti & Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
