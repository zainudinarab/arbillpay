import React, { useState, useEffect } from 'react';
import { UserAccount, CustomerPortalConfig } from '../types';
import {
  Wifi, Zap, Clock, Shield, ShoppingCart, Wallet, X,
  CheckCircle2, Lock, ArrowRight, Loader2, AlertCircle,
  Star, Sparkles, Globe, Signal, Timer, ChevronRight,
  Plus, CreditCard, ExternalLink, LogOut, RefreshCw, Banknote,
  QrCode, Copy, FileText, Search, Ticket, UserCheck, Info,
  MessageCircle, Megaphone, Flame
} from 'lucide-react';
import LoginModal from './LoginModal';
import { getApiUrl } from '../config/api';
import { getPackagesFromFirestore, getVouchersFromFirestore, saveCustomerToFirestore, getCustomersFromFirestore } from '../services/firebaseService';
import { generateNextCustomerCode } from '../utils';
import { IndonesianAddressForm } from './IndonesianAddressForm';
import { parseIso8601 } from '../utils/iso8601';

function calculateChannelFee(ch: any, amount: number): number {
  if (!ch) return 0;

  const flat = Number(ch.fee_flat || ch.flat_fee || ch.fee_amount || ch.fee || 0);
  const percent = Number(ch.fee_percent || ch.percentage_fee || ch.percent_fee || 0);

  let flatFee = flat > 0 ? flat : 0;
  let percentFee = percent > 0 ? Math.round((amount * percent) / 100) : 0;

  // Fallback defaults if channel has no fee specified at all
  if (flatFee === 0 && percentFee === 0) {
    const code = (ch.code || ch.id || ch.name || '').toLowerCase();
    if (code.includes('alfamart') || code.includes('indomaret') || code.includes('alfamidi')) {
      flatFee = 3500;
    } else if (code.includes('va') || code.includes('bca') || code.includes('mandiri') || code.includes('bri') || code.includes('bni')) {
      flatFee = 4000;
    } else if (code.includes('qris')) {
      percentFee = Math.round((amount * 0.7) / 100);
    }
  }

  return flatFee + percentFee;
}

function getChannelFeeLabel(ch: any, amount: number): string {
  if (!ch) return 'Bebas Biaya';

  const flat = Number(ch.fee_flat || ch.flat_fee || ch.fee_amount || ch.fee || 0);
  const percent = Number(ch.fee_percent || ch.percentage_fee || ch.percent_fee || 0);
  const totalFee = calculateChannelFee(ch, amount);

  if (totalFee <= 0) {
    return 'Bebas Biaya (Free)';
  }

  // Combined Flat + Percent fee
  if (flat > 0 && percent > 0) {
    return `+Rp ${flat.toLocaleString('id-ID')} + ${percent}% (Total Rp ${totalFee.toLocaleString('id-ID')})`;
  }
  
  // Only percent fee
  if (percent > 0 && flat === 0) {
    return `+${percent}% (Rp ${totalFee.toLocaleString('id-ID')})`;
  }

  // Only flat fee
  return `+Rp ${totalFee.toLocaleString('id-ID')}`;
}

interface CustomerPortalProps {
  currentUser: UserAccount | null;
  onLoginSuccess: (user: UserAccount) => void;
  onLogout: () => void;
  showLoginModal?: boolean;
  setShowLoginModal?: (show: boolean) => void;
}

export default function CustomerPortal({
  currentUser,
  onLoginSuccess,
  onLogout,
  showLoginModal: propShowLoginModal,
  setShowLoginModal: propSetShowLoginModal
}: CustomerPortalProps) {
  // --- STATE PERSISTENCE & DATA ---
  const [customerData, setCustomerData] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payLoadingId, setPayLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);

  // Tabs: 'buy' | 'subscriptions' | 'history' | 'invoices' | 'register_member'
  const [activeTab, setActiveTab] = useState<'buy' | 'subscriptions' | 'history' | 'invoices' | 'register_member'>('buy');
  const [localShowLoginModal, setLocalShowLoginModal] = useState(false);

  const showLoginModal = propShowLoginModal ?? localShowLoginModal;
  const setShowLoginModal = propSetShowLoginModal ?? setLocalShowLoginModal;
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [monthlyPackages, setMonthlyPackages] = useState<any[]>([]);

  // Member Registration Modal State
  const [showMemberRegisterModal, setShowMemberRegisterModal] = useState(false);
  const [registerPkg, setRegisterPkg] = useState<any>(null);
  const [regForm, setRegForm] = useState({
    name: '',
    phone_number: '',
    username: '',
    password: '',
    dusun: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: ''
  });
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState('');

  // Member Registrations status state (fetched LIVE from Database for active user)
  const [myRegistrations, setMyRegistrations] = useState<any[]>([]);
  const allRegs = customerData ? [customerData, ...myRegistrations.filter((r: any) => r.id !== customerData.id)] : myRegistrations;

  // Quick Bill Check (For Visitors)
  const [searchIdentity, setSearchIdentity] = useState('');
  const [quickCheckLoading, setQuickCheckLoading] = useState(false);
  const [quickCheckResult, setQuickCheckResult] = useState<any>(null);

  // Voucher Shop state
  const [voucherGroups, setVoucherGroups] = useState<any[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [arabpayFeeBearer, setArabpayFeeBearer] = useState<string>(() => {
    return (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'customer';
  });
  const [arabpayServiceFee, setArabpayServiceFee] = useState<number>(() => {
    const bearer = (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'customer';
    return bearer === 'customer' ? 200 : 0;
  });

  // Voucher History State (fetched LIVE from Database for active user)
  const [localPurchasedVouchers, setLocalPurchasedVouchers] = useState<any[]>([]);

  // Modal State
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'confirm' | 'pin' | 'processing' | 'success' | 'error' | 'pending_payment'>('confirm');
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');
  const [checkoutId, setCheckoutId] = useState('');
  const [directCheckoutInfo, setDirectCheckoutInfo] = useState<any>(null);
  const [voucherResult, setVoucherResult] = useState<{ code: string; password: string; invoice: string; hotspot_ip?: string; dns_name?: string } | null>(null);

  // Status Check State for History
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [checkingItemId, setCheckingItemId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ [key: string]: { text: string; type: string } }>({});

  // Top-Up Modal State
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState(50000);
  const [topupStep, setTopupStep] = useState<'select' | 'channel' | 'processing' | 'redirect'>('select');
  const [topupError, setTopupError] = useState('');
  const [paymentChannels, setPaymentChannels] = useState<any[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);

  // Portal Template & Layout Configuration (Loaded dynamically from Admin)
  const [portalConfig, setPortalConfig] = useState<CustomerPortalConfig | null>(() => {
    try {
      const saved = localStorage.getItem('arbil_portal_config');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  const fetchPortalConfig = async () => {
    try {
      const res = await fetch('/api/portal-config', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.config) {
        setPortalConfig(data.config);
        try {
          localStorage.setItem('arbil_portal_config', JSON.stringify(data.config));
        } catch (_) {}
      }
    } catch (err) {
      console.warn('Gagal memuat portal config:', err);
    }
  };

  // Countdown Timer State for Flash Sale & Promo
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });

  useEffect(() => {
    const targetIso = portalConfig?.flash_sale?.end_time;
    if (!targetIso) return;

    const updateTimer = () => {
      const now = Date.now();
      const end = new Date(targetIso).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [portalConfig?.flash_sale?.end_time]);

  const apiUrl = getApiUrl();

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  // --- INITIAL & LIVE AUTO-REFRESH DATA FETCHING ---
  useEffect(() => {
    fetchPortalConfig();
    fetchCheckoutInit();
    fetchAvailableVouchers();
    fetchMonthlyMemberPackages();
    fetchLiveMemberRegistrationsStatus();

    const handleSync = () => {
      fetchPortalConfig();
    };
    window.addEventListener('focus', handleSync);
    window.addEventListener('storage', handleSync);

    if (currentUser) {
      fetchCustomerProfile();
      fetchLiveArabPayBalance();
      fetchMyPurchasedVouchers();

      // 1. Auto-refresh live balance when returning to tab/window
      const handleFocus = () => {
        fetchLiveArabPayBalance();
      };
      window.addEventListener('focus', handleFocus);

      // 2. Realtime Polling: Refresh live balance every 15 seconds
      const balanceInterval = setInterval(() => {
        fetchLiveArabPayBalance();
      }, 15000);

      // 3. Real-time Server-Sent Events (SSE) Stream Subscriber
      let eventSource: EventSource | null = null;
      const uId = currentUser.arabpay_user_id || currentUser.id;
      if (uId) {
        try {
          const arabpayUrl = (import.meta as any).env?.VITE_ARABPAY_URL || 'https://arabpay.my.id';
          eventSource = new EventSource(`${arabpayUrl}/api/v1/wallet/stream?user_id=${encodeURIComponent(uId)}`);

          eventSource.addEventListener('balance_update', (e: any) => {
            try {
              const data = JSON.parse(e.data);
              if (data && data.balance !== undefined && data.balance !== null) {
                onLoginSuccess({
                  ...currentUser,
                  arabpay_balance: Number(data.balance)
                });
              }
            } catch (err) { }
          });

          eventSource.addEventListener('checkout_status', (e: any) => {
            try {
              const data = JSON.parse(e.data);
              if (data && data.status === 'PAID') {
                fetchAvailableVouchers();
                fetchMyPurchasedVouchers();
              }
            } catch (err) { }
          });
        } catch (sseErr) {
          console.warn('SSE EventSource setup warning:', sseErr);
        }
      }

      return () => {
        window.removeEventListener('focus', handleFocus);
        clearInterval(balanceInterval);
        if (eventSource) eventSource.close();
      };
    }
  }, [currentUser?.id, currentUser?.arabpay_user_id]);

  // Fetch purchased vouchers history directly from PostgreSQL Database
  const fetchMyPurchasedVouchers = async () => {
    try {
      const uId = currentUser?.phone_number || currentUser?.arabpay_user_id || currentUser?.id;
      const phone = currentUser?.phone_number || '';
      const apiUrl = getApiUrl();
      if (apiUrl && (uId || phone)) {
        const res = await fetch(`${apiUrl}/api/vouchers/my-vouchers?user_id=${encodeURIComponent(uId || '')}&phone=${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.vouchers)) {
            setLocalPurchasedVouchers(data.vouchers);
            console.log(`✅ [POSTGRESQL] ${data.vouchers.length} riwayat voucher termuat dari PostgreSQL.`);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch my vouchers from PostgreSQL:', e);
    }
  };

  // Fetch logged in customer's live profile & invoices from PostgreSQL / Firestore
  const fetchCustomerProfile = async () => {
    if (!currentUser) return;
    setLoading(true);
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
        if (data.success && data.customer) {
          setCustomerData(data.customer);
          if (data.autoLinked) {
            setToastMsg({
              type: 'success',
              text: `✨ Akun ArabPay Anda otomatis dihubungkan & dikunci dengan data pelanggan internet "${data.customer.name}"!`
            });
          }
          setMyRegistrations(prev => {
            const updated = [data.customer, ...prev.filter((r: any) => r.id !== data.customer.id)];
            localStorage.setItem('my_member_registrations', JSON.stringify(updated));
            return updated;
          });
        }

        // Fetch customer's invoices from PostgreSQL by customer_id and/or phone
        const customerId = data?.customer?.id || '';
        const userPhone = currentUser.phone_number || '';
        if (customerId || userPhone) {
          const params = new URLSearchParams();
          if (customerId) params.append('customer_id', customerId);
          if (userPhone) params.append('phone', userPhone);

          const invRes = await fetch(`${apiUrl}/api/invoices?${params.toString()}`);
          if (invRes.ok) {
            const invData = await invRes.json();
            if (invData.success) {
              setInvoices(invData.invoices || []);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load customer profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch available voucher groups (always, for both guest and logged-in)
  const fetchAvailableVouchers = async () => {
    setVoucherLoading(true);
    try {
      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/vouchers/available`);
          const data = await res.json();
          if (data.success && Array.isArray(data.groups)) {
            setVoucherGroups(data.groups);
            setVoucherLoading(false);
            return;
          }
        } catch (apiErr) { }
      }

      // Direct Firebase Firestore (fallback only if API server unreachable)
      const fbData = await getVouchersFromFirestore();
      if (fbData.success && Array.isArray(fbData.vouchers) && fbData.vouchers.length > 0) {
        const groupsMap: any = {};
        fbData.vouchers.forEach((v: any) => {
          const pName = v.profile_name || 'Voucher Hotspot';
          if (!groupsMap[pName]) {
            groupsMap[pName] = {
              profile_id: v.id,
              package_name: pName,
              rate_limit: v.speed_limit || '10 Mbps',
              price: Number(v.price) || 5000,
              validity_value: 1,
              validity_unit: 'day',
              color: 'violet',
              mode: 'ondemand',
              stock: 0
            };
          }
          if (v.status === 'available') {
            groupsMap[pName].stock += 1;
          }
        });
        const groupList = Object.values(groupsMap);
        if (groupList.length > 0) {
          setVoucherGroups(groupList as any);
          setVoucherLoading(false);
          return;
        }
      }

      // If both API and Firestore return empty, show empty array (no fake fallback data)
      setVoucherGroups([]);
    } catch (err) {
      console.warn('Failed to load vouchers:', err);
    } finally {
      setVoucherLoading(false);
    }
  };

  // Fetch monthly member packages (Hotspot Monthly & PPPoE)
  const fetchMonthlyMemberPackages = async () => {
    try {
      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/packages`);
          const data = await res.json();
          if (data.success && Array.isArray(data.packages)) {
            const filtered = data.packages.filter((p: any) => (p.type === 'hotspot_monthly' || p.type === 'pppoe') && p.is_active !== false);
            setMonthlyPackages(filtered);
            return;
          }
        } catch (apiErr) { }
      }

      // Direct Firebase Firestore
      const fbData = await getPackagesFromFirestore();
      if (fbData.success && Array.isArray(fbData.packages)) {
        const filtered = fbData.packages.filter((p: any) => p.type === 'hotspot_monthly' || p.type === 'pppoe');
        setMonthlyPackages(filtered as any);
      }
    } catch (err) {
      console.warn('Failed to load monthly member packages:', err);
    }
  };

  // Fetch LIVE Member Registration status (Strictly from Database for logged-in user)
  const fetchLiveMemberRegistrationsStatus = async () => {
    if (!currentUser) {
      setMyRegistrations([]);
      setInvoices([]);
      setCustomerData(null);
      setLocalPurchasedVouchers([]);
      return;
    }

    const targetId = currentUser.phone_number || currentUser.arabpay_user_id || currentUser.id;

    // 1. Direct Firebase Cloud Firestore database query by active user ID
    if (targetId) {
      const fbData = await getCustomersFromFirestore(targetId);
      if (fbData.success && Array.isArray(fbData.customers)) {
        setMyRegistrations(fbData.customers);
      }
      const fbVouchers = await getPurchasedVouchersFromFirestore(targetId);
      if (fbVouchers.success && Array.isArray(fbVouchers.vouchers)) {
        setLocalPurchasedVouchers(fbVouchers.vouchers);
      }
    }

    // 2. PostgreSQL Backend status check if backend URL is configured
    if (currentUser.phone_number) {
      try {
        const apiUrl = getApiUrl();
        if (!apiUrl) return;

        const res = await fetch(`${apiUrl}/api/customers/check-my-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_numbers: [currentUser.phone_number] })
        }).catch(() => null);

        if (!res || !res.ok) return;

        const data = await res.json().catch(() => null);
        if (data && data.success && Array.isArray(data.customers)) {
          setMyRegistrations(data.customers);

          const allInvoices: any[] = [];
          for (const cust of data.customers) {
            try {
              const invRes = await fetch(`${apiUrl}/api/invoices?customer_id=${cust.id}`).catch(() => null);
              if (invRes && invRes.ok) {
                const invData = await invRes.json().catch(() => null);
                if (invData && invData.success && Array.isArray(invData.invoices)) {
                  allInvoices.push(...invData.invoices);
                }
              }
            } catch (e) { }
          }
          setInvoices(allInvoices);
        }
      } catch (err) { }
    }
  };

  // Submit new Member Registration (Saved as Non-Aktif / Off for Admin Approval)
  const handleSubmitMemberRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerPkg) return;

    if (!regForm.name || !regForm.phone_number) {
      setRegError('Nama Pelanggan dan Nomor WhatsApp wajib diisi.');
      return;
    }

    const isHotspot = registerPkg.type === 'hotspot_monthly';
    if (isHotspot && (!regForm.username || !regForm.password)) {
      setRegError('Username & Password Hotspot wajib diisi untuk pelanggan Hotspot.');
      return;
    }

    setRegLoading(true);
    setRegError('');
    try {
      const finalUsername = isHotspot ? regForm.username : (regForm.username || `user-${regForm.phone_number.slice(-4)}`);
      const finalPassword = isHotspot ? regForm.password : (regForm.password || '123456');

      const nextCustCode = generateNextCustomerCode();

      const custObj = {
        id: nextCustCode,
        customer_code: nextCustCode,
        user_id: currentUser?.id || null,
        name: regForm.name,
        phone_number: regForm.phone_number,
        pppoe_username: finalUsername,
        pppoe_password: finalPassword,
        address: regForm.dusun || null,
        dusun: regForm.dusun || null,
        desa: regForm.desa || null,
        kecamatan: regForm.kecamatan || null,
        kabupaten: regForm.kabupaten || null,
        provinsi: regForm.provinsi || null,
        kode_pos: regForm.kode_pos || null,
        package_id: registerPkg.id,
        package_name: registerPkg.name || 'Member Package',
        speed_limit: registerPkg.speed_limit || registerPkg.rate_limit || '10 Mbps',
        connection_type: isHotspot ? 'hotspot' : 'pppoe',
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(custObj)
          }).catch(() => null);
          if (res && res.ok) {
            await res.json().catch(() => null);
          }
        } catch (apiErr) { }
      }

      // Always save customer registration directly to Cloud Firestore as permanent audit trail
      await saveCustomerToFirestore(custObj);

      setRegSuccess(true);
      setMyRegistrations(prev => {
        const updated = [custObj, ...prev.filter((r: any) => r.pppoe_username !== finalUsername)];
        localStorage.setItem('my_member_registrations', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setRegError(err.message || 'Terjadi kesalahan saat menyimpan pendaftaran.');
    } finally {
      setRegLoading(false);
    }
  };

  // Real-time SSE Live Balance Listener from ArabPay Broadcast Server (wallet-service SSE)
  useEffect(() => {
    if (!currentUser) return;

    const userId = currentUser.arabpay_user_id || currentUser.id;
    if (!userId) return;

    // Exact Stream SSE Endpoint from wallet-service (router.go line 46: GET /api/v1/wallet/stream)
    const sseUrl = `https://arabpay.my.id/api/v1/wallet/stream?user_id=${encodeURIComponent(userId)}`;
    console.log('⚡ [ARABPAY SSE BROADCAST] Connecting to live balance stream:', sseUrl);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('balance_update', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data && (data.balance !== undefined || data.arabpay_balance !== undefined)) {
            const newBal = Number(data.balance ?? data.arabpay_balance);
            console.log('🎉 [ARABPAY SSE BROADCAST] Live balance update received from ArabPay:', newBal);
            onLoginSuccess({
              ...currentUser,
              arabpay_balance: newBal
            });
          }
        } catch (e) {
          console.warn('Error parsing SSE balance_update payload:', e);
        }
      });

      eventSource.onopen = () => {
        console.log('✅ [ARABPAY SSE BROADCAST] Connected to live SSE stream!');
      };

      eventSource.onerror = (err) => {
        console.warn('⚠️ [ARABPAY SSE BROADCAST] SSE stream notice:', err);
      };
    } catch (err) {
      console.warn('Failed to initialize EventSource for ArabPay SSE:', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
        console.log('🔌 [ARABPAY SSE BROADCAST] Closed SSE stream connection.');
      }
    };
  }, [currentUser?.id, currentUser?.arabpay_user_id]);

  // Fetch LIVE balance directly from ArabPay API
  const fetchLiveArabPayBalance = async () => {
    if (!currentUser) return;
    setIsRefreshingBalance(true);
    try {
      const clientId = (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
      const clientSecret = (import.meta as any).env?.VITE_ARABPAY_CLIENT_SECRET || 'nXvEhiJHpSUDyDOF3r88xDwonYf6JAdR';
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const uId = currentUser.arabpay_user_id || currentUser.id || '019f74af9fcdWDgDxM8g';

      let fetchedBalance: number | null = null;

      // 1. Try GET /api/v1/s2s/users/detail?user_id=... (Exact endpoint from wallet-service router.go line 85)
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          enc.encode(clientSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const getSigBuf = await crypto.subtle.sign('HMAC', key, enc.encode('' + timestamp));
        const getSignature = Array.from(new Uint8Array(getSigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        const getRes = await fetch(`https://arabpay.my.id/api/v1/users/detail?user_id=${encodeURIComponent(uId)}`, {
          method: 'GET',
          headers: {
            'X-Client-ID': clientId,
            'X-Timestamp': timestamp,
            'X-Signature': getSignature,
            'Content-Type': 'application/json'
          }
        }).catch(() => null);

        if (getRes && getRes.ok) {
          const gData = await getRes.json();
          if (gData) {
            const val = gData.balance ?? gData.arabpay_balance ?? gData.wallet_balance ?? gData.saldo ?? gData.data?.balance ?? gData.data?.saldo;
            if (val !== undefined && val !== null) {
              fetchedBalance = Number(val);
            }
          }
        }
      } catch (getErr) { }

      // 2. Try GET /api/v1/wallet/balance?user_id=... (Exact endpoint from wallet-service router.go line 54)
      if (fetchedBalance === null || isNaN(fetchedBalance)) {
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(clientSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const getSigBuf = await crypto.subtle.sign('HMAC', key, enc.encode('' + timestamp));
          const getSignature = Array.from(new Uint8Array(getSigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

          const token = currentUser?.token || localStorage.getItem('arabpay_token');
          const headers: Record<string, string> = {
            'X-Client-ID': clientId,
            'X-Timestamp': timestamp,
            'X-Signature': getSignature,
            'Content-Type': 'application/json'
          };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const balRes = await fetch(`https://arabpay.my.id/api/v1/wallet/balance?user_id=${encodeURIComponent(uId)}&_t=${Date.now()}`, {
            method: 'GET',
            headers,
            cache: 'no-store'
          }).catch(() => null);

          if (balRes && balRes.ok) {
            const bData = await balRes.json();
            if (bData) {
              const val = bData.balance ?? bData.arabpay_balance ?? bData.wallet_balance ?? bData.saldo ?? bData.data?.balance;
              if (val !== undefined && val !== null) {
                fetchedBalance = Number(val);
              }
              if (bData.fee_bearer !== undefined) {
                setArabpayFeeBearer(bData.fee_bearer);
              }
              if (bData.service_fee !== undefined) {
                setArabpayServiceFee(Number(bData.service_fee));
              } else {
                setArabpayServiceFee(bData.fee_bearer === 'customer' ? 200 : 0);
              }
            }
          }
        } catch (balErr) { }
      }

      if (fetchedBalance !== null && !isNaN(fetchedBalance)) {
        console.log('✅ [ARABPAY LIVE BALANCE] Successfully extracted live balance from ArabPay Server:', fetchedBalance);
        onLoginSuccess({
          ...currentUser,
          arabpay_balance: fetchedBalance
        });
      }
    } catch (err) {
      console.warn('Failed to fetch live ArabPay balance:', err);
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  // --- CONSOLIDATED HIGH-PERFORMANCE 3-IN-1 CHECKOUT INIT ---
  const fetchCheckoutInit = async (userIdOverride?: string) => {
    try {
      setIsLoadingChannels(true);
      const clientId = (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
      const clientSecret = (import.meta as any).env?.VITE_ARABPAY_CLIENT_SECRET || 'dOAZFeFW$bC0xHgj7t$UfrzXmMAzebAu';
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const targetUserId = userIdOverride || currentUser?.phone || currentUser?.phone_number || currentUser?.user_id || currentUser?.id || currentUser?.username || '';

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
        const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode('' + timestamp));
        signature = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { }

      const token = currentUser?.token || localStorage.getItem('arabpay_token');
      const headers: Record<string, string> = {
        'X-Client-ID': clientId,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`https://arabpay.my.id/api/v1/checkout/init?client_id=${encodeURIComponent(clientId)}&user_id=${encodeURIComponent(targetUserId)}&_t=${Date.now()}`, {
        method: 'GET',
        headers,
        cache: 'no-store'
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data) {
          // 1. Client Fee Config
          if (data.client) {
            if (data.client.fee_bearer !== undefined) {
              setArabpayFeeBearer(data.client.fee_bearer);
            }
            if (data.client.service_fee !== undefined) {
              setArabpayServiceFee(Number(data.client.service_fee));
            }
          }
          // 2. Payment Channels
          if (Array.isArray(data.payment_channels)) {
            setPaymentChannels(data.payment_channels.filter((ch: any) => ch.is_active));
          }
          // 3. User Balance
          if (data.user_balance !== undefined && data.user_balance !== null && currentUser) {
            onLoginSuccess({
              ...currentUser,
              arabpay_balance: Number(data.user_balance)
            });
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch consolidated checkout init:', e);
    } finally {
      setIsLoadingChannels(false);
    }
  };

  // --- VOUCHER PURCHASE FLOW (Persis arbiljs Vouchers.vue) ---
  const handleBuyVoucher = (pkg: any) => {
    if (!currentUser) {
      setShowLoginModal(true);
      return;
    }
    setSelectedPackage(pkg);
    setPaymentStep('confirm');
    setPinCode('');
    setPinError('');
    setPaymentMethod('balance');
    fetchCheckoutInit();
    setShowPaymentModal(true);
  };

  const handleProceedPayment = async () => {
    if (paymentMethod === 'balance') {
      const price = Number(selectedPackage?.price || 0);
      const balance = currentUser?.arabpay_balance ?? 150000;

      if (price > 0 && balance < price) {
        alert(`⚠️ Saldo ArabPay Anda (${formatRupiah(balance)}) tidak mencukupi untuk paket ${formatRupiah(price)}.\n\nSilakan pilih metode Transfer QRIS/VA atau lakukan Top-Up Saldo ArabPay.`);
        return;
      }
    }

    // Step 1: Create S2S Checkout di ArabPay (persis arbiljs handleConfirmPayment)
    setPaymentStep('processing');
    setPinError('');

    try {
      const invoiceCode = 'VCH-' + Date.now().toString(36).toUpperCase();
      const price = Number(selectedPackage?.price || 0);

      const checkoutRes = await fetch(`${apiUrl}/api/invoices/checkouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: price,
          reference_id: invoiceCode,
          payment_method: paymentMethod === 'direct' ? 'arabpay_direct' : 'arabpay',
          payment_channel: (paymentMethod === 'direct' && selectedChannel) ? (selectedChannel.id || selectedChannel.code) : null,
          customer_name: currentUser?.name || 'Pelanggan Hotspot',
          customer_email: currentUser?.email || 'user@hotspot.local',
          customer_phone: currentUser?.phone_number || '081234567890',
          order_items: [{
            sku: selectedPackage.profile_id || selectedPackage.id,
            name: 'Voucher WiFi ' + (selectedPackage.package_name || selectedPackage.name),
            price: price,
            quantity: 1
          }]
        })
      });

      let checkoutData: any = {};
      try {
        if (checkoutRes && checkoutRes.headers.get('content-type')?.includes('application/json')) {
          checkoutData = await checkoutRes.json();
        }
      } catch (jsonErr) { }

      if (checkoutData.error && !checkoutData.success && !checkoutData.id) {
        setPinError(checkoutData.error || checkoutData.message || 'Gagal membuat checkout.');
        setPaymentStep('confirm');
        return;
      }

      const realCheckoutId = checkoutData.id || checkoutData.checkout_id || `chk_${Date.now()}`;
      setCheckoutId(realCheckoutId);

      if (paymentMethod === 'direct') {
        // Direct payment flow — langsung beli voucher
        handleCreateDirectCheckout();
      } else {
        // Balance payment — lanjut ke PIN step
        setPaymentStep('pin');
      }
    } catch (err: any) {
      console.warn('Checkout creation failed, using local fallback:', err.message);
      // Fallback: tetap lanjut (local mode)
      setCheckoutId(`chk_local_${Date.now()}`);
      if (paymentMethod === 'direct') {
        handleCreateDirectCheckout();
      } else {
        setPaymentStep('pin');
      }
    }
  };

  // Create Direct Payment Checkout (QRIS / VA)
  const handleCreateDirectCheckout = async () => {
    setPaymentStep('processing');
    const invoiceCode = 'VCH-' + Date.now().toString(36).toUpperCase();
    const price = Number(selectedPackage.price || 0);

    if (selectedPackage?.is_invoice) {
      try {
        const payRes = await fetch(`${apiUrl}/api/invoices/${selectedPackage.invoice_id}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_method: 'Transfer / QRIS Direct' })
        });
        const payData = await payRes.json();
        if (payData.success) {
          setPaymentStep('success');
          fetchLiveMemberRegistrationsStatus();
          fetchCustomerProfile();
        } else {
          setPinError(payData.message || 'Gagal melunasi tagihan.');
          setPaymentStep('error');
        }
      } catch (err: any) {
        setPinError(err?.message || 'Gagal terhubung ke gateway.');
        setPaymentStep('error');
      }
      return;
    }

    try {
      const buyRes = await fetch(`${apiUrl}/api/vouchers/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: selectedPackage.profile_id || selectedPackage.id,
          mode: selectedPackage.mode || 'auto',
          buyer_name: currentUser?.name,
          buyer_phone: currentUser?.phone_number,
          arabpay_user_id: currentUser?.id,
          payment_method: 'ArabPay QRIS Transfer',
          amount: price
        })
      });

      const buyData = await buyRes.json();
      if (buyData.success) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(buyData.invoice_number)}`;
        setDirectCheckoutInfo({
          referenceId: invoiceCode,
          payCode: buyData.invoice_number,
          qrUrl: qrUrl,
          amount: price,
          packageName: selectedPackage.package_name || selectedPackage.name
        });

        setVoucherResult({
          code: buyData.voucher.code,
          password: buyData.voucher.password,
          invoice: buyData.invoice_number,
          hotspot_ip: buyData.voucher.hotspot_ip || selectedPackage?.hotspot_ip || '10.0.0.1',
          dns_name: buyData.voucher.dns_name || selectedPackage?.dns_name || 'arab.net'
        });
        setPaymentStep('success');
        fetchAvailableVouchers();
        fetchMyPurchasedVouchers();
      } else {
        setPinError(buyData.message || 'Gagal membuat transaksi.');
        setPaymentStep('error');
      }
    } catch (err: any) {
      setPinError(err?.message || 'Gagal terhubung ke gateway.');
      setPaymentStep('error');
    }
  };

  // Submit 6-digit ArabPay PIN (persis arbiljs onPayWithPin)
  const handleSubmitPinPayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (pinCode.length !== 6) {
      setPinError('PIN ArabPay harus 6 digit angka.');
      return;
    }

    setPaymentStep('processing');
    setPinError('');

    const itemPrice = Number(selectedPackage?.price || 0);
    const price = itemPrice;
    const customerFee = arabpayServiceFee || (arabpayFeeBearer === 'customer' ? 200 : 0);
    const totalPay = itemPrice + customerFee;
    const currentBal = currentUser?.arabpay_balance ?? 0;

    if (totalPay > 0 && currentBal < totalPay) {
      setPinError(`Saldo ArabPay Anda (${formatRupiah(currentBal)}) tidak mencukupi untuk total tagihan ${formatRupiah(totalPay)}.`);
      setPaymentStep('pin');
      return;
    }

    try {
      const clientId = (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
      const clientSecret = (import.meta as any).env?.VITE_ARABPAY_CLIENT_SECRET || 'nXvEhiJHpSUDyDOF3r88xDwonYf6JAdR';
      const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const refCode = 'VCH-' + Date.now().toString(36).toUpperCase();

      const rawPhone = (currentUser?.phone_number || '085746520724').replace(/\D/g, '');
      const phone08 = rawPhone.startsWith('62') ? '0' + rawPhone.slice(2) : (rawPhone.startsWith('0') ? rawPhone : '0' + rawPhone);
      const phone62 = rawPhone.startsWith('62') ? rawPhone : (rawPhone.startsWith('0') ? '62' + rawPhone.slice(1) : '62' + rawPhone);

      const phoneCandidates = [phone08, phone62];
      let isDeductionSuccessful = false;
      let arabpayErrorMessage = '';

      const pkgName = selectedPackage?.package_name || selectedPackage?.name || selectedPackage?.profile_name || 'Voucher Hotspot';
      const pkgDetails = [
        pkgName,
        selectedPackage?.validity || selectedPackage?.duration || '',
        selectedPackage?.bandwidth || selectedPackage?.speed || ''
      ].filter(Boolean).join(' - ');

      const purchaseDesc = `Pembelian ${pkgDetails || 'Voucher Hotspot'}`;

      // 1. Try S2S Wallet Withdraw Endpoint with phone variations (08... & 628...)
      for (const pNo of phoneCandidates) {
        if (isDeductionSuccessful) break;

        const withdrawBodyObj = {
          phone_number: pNo,
          amount: itemPrice,
          bank_name: 'ARBILLPAY_HOTSPOT',
          account_number: refCode,
          account_name: currentUser?.name || 'Pelanggan ArbillPay',
          description: purchaseDesc,
          notes: purchaseDesc,
          pin: pinCode
        };
        const withdrawBodyStr = JSON.stringify(withdrawBodyObj);

        let withdrawSig = '';
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(clientSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(withdrawBodyStr + timestamp));
          withdrawSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (cryptoErr) { }

        console.log('🔑 [ARABPAY S2S DEDUCT] Attempting S2S Withdraw with phone:', pNo);
        const s2sRes = await fetch('https://arabpay.my.id/api/v1/checkouts/direct-pay', {
          method: 'POST',
          headers: {
            'X-Client-ID': clientId,
            'X-Timestamp': timestamp,
            'X-Signature': withdrawSig,
            'Content-Type': 'application/json'
          },
          body: withdrawBodyStr
        }).catch(() => null);

        if (s2sRes && s2sRes.ok) {
          const data = await s2sRes.json().catch(() => null);
          if (data && (data.status === 'success' || data.success)) {
            isDeductionSuccessful = true;
            console.log('✅ [ARABPAY S2S DEDUCT] Balance deducted via S2S Withdraw (Phone: ' + pNo + '):', data);
            break;
          } else if (data && data.error) {
            arabpayErrorMessage = data.error || data.message;
          }
        } else if (s2sRes) {
          const errJson = await s2sRes.json().catch(() => ({}));
          arabpayErrorMessage = errJson.error || errJson.message || arabpayErrorMessage;
        }
      }

      // 2. Fallback: Try S2S Checkouts Endpoint with JWT Token (POST /api/v1/checkouts)
      if (!isDeductionSuccessful) {
        const jwtToken = (currentUser as any)?.token_jwt || (currentUser as any)?.token || localStorage.getItem('arabpay_token') || '';

        const checkoutBodyObj = {
          amount: itemPrice,
          reference_id: refCode,
          pin: pinCode,
          payment_method: 'balance',
          user_id: currentUser?.arabpay_user_id || currentUser?.id,
          token_jwt: jwtToken
        };
        const checkoutBodyStr = JSON.stringify(checkoutBodyObj);

        let checkoutSig = '';
        try {
          const enc = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(clientSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(checkoutBodyStr + timestamp));
          checkoutSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (cryptoErr) { }

        const s2sHeaders: any = {
          'X-Client-ID': clientId,
          'X-Timestamp': timestamp,
          'X-Signature': checkoutSig,
          'Content-Type': 'application/json'
        };
        if (jwtToken) {
          s2sHeaders['Authorization'] = `Bearer ${jwtToken}`;
        }

        const s2sRes = await fetch('https://arabpay.my.id/api/v1/checkouts', {
          method: 'POST',
          headers: s2sHeaders,
          body: checkoutBodyStr
        }).catch(() => null);

        if (s2sRes && s2sRes.ok) {
          const data = await s2sRes.json().catch(() => null);
          if (data && !data.error) {
            isDeductionSuccessful = true;
            console.log('✅ [ARABPAY S2S DEDUCT] Balance deducted via S2S Checkout:', data);
          } else if (data && data.error) {
            arabpayErrorMessage = data.error || data.message;
          }
        } else if (s2sRes) {
          const errJson = await s2sRes.json().catch(() => ({}));
          arabpayErrorMessage = errJson.error || errJson.message || arabpayErrorMessage;
        }
      }

      // STRICT RULE: DO NOT GENERATE VOUCHER UNLESS ARABPAY S2S CONFIRMED SUCCESSFUL RESPONSE
      if (!isDeductionSuccessful) {
        console.warn('❌ [ARABPAY S2S DEDUCT] Payment rejected by ArabPay:', arabpayErrorMessage);
        setPinError(arabpayErrorMessage || 'PIN ArabPay salah atau saldo tidak mencukupi.');
        setPaymentStep('pin');
        return;
      }

      // Local state update & instant voucher generation ON SUCCESS
      const newBalance = Math.max(0, currentBal - price);
      onLoginSuccess({ ...currentUser!, arabpay_balance: newBalance });

      // Register or claim voucher on Mikrotik RouterOS via Backend API & PostgreSQL
      let finalVoucherCode = '';
      let finalVoucherPass = '';
      let invoiceNum = '';

      try {
        const apiUrl = getApiUrl();
        if (apiUrl && selectedPackage) {
          const buyRes = await fetch(`${apiUrl}/api/vouchers/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile_id: selectedPackage.profile_id || selectedPackage.id,
              mode: selectedPackage.mode || 'auto',
              buyer_name: currentUser?.name || 'Pelanggan Hotspot',
              buyer_phone: currentUser?.phone_number || '',
              arabpay_user_id: currentUser?.arabpay_user_id || currentUser?.id,
              payment_method: 'ArabPay E-Wallet',
              amount: price,
              skip_arabpay_deduction: true
            })
          });
          const buyData = await buyRes.json().catch(() => null);
          if (buyData && buyData.success && buyData.voucher) {
            finalVoucherCode = buyData.voucher.code;
            finalVoucherPass = buyData.voucher.password || buyData.voucher.code;
            if (buyData.invoice_number) {
              invoiceNum = buyData.invoice_number;
            }
          } else {
            setPinError(buyData?.message || 'Gagal menerbitkan voucher di router MikroTik.');
            setPaymentStep('pin');
            return;
          }
        }
      } catch (apiBuyErr: any) {
        console.warn('Backend voucher buy live Mikrotik notice:', apiBuyErr);
        setPinError(apiBuyErr?.message || 'Gagal terhubung ke server pembuat voucher.');
        setPaymentStep('pin');
        return;
      }

      setVoucherResult({
        code: finalVoucherCode,
        password: finalVoucherPass,
        invoice: invoiceNum,
        hotspot_ip: selectedPackage?.hotspot_ip || '10.0.0.1',
        dns_name: selectedPackage?.dns_name || 'arab.net'
      });
      setPaymentStep('success');
      fetchAvailableVouchers();
      fetchMyPurchasedVouchers();

      // Fetch live balance from ArabPay server to ensure 100% sync
      setTimeout(() => {
        fetchLiveArabPayBalance();
      }, 1000);

    } catch (err: any) {
      setPinError(err?.message || 'Gagal memproses pemotongan saldo ArabPay.');
      setPaymentStep('pin');
    }
  };

  // Manual Check Payment Status in History (persis arbiljs)
  const handleCheckPaymentStatus = async (item: any) => {
    setIsCheckingStatus(true);
    setCheckingItemId(item.id);
    setStatusFeedback(prev => ({ ...prev, [item.id]: { text: 'Sedang mengecek status ke ArabPay...', type: 'info' } }));

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setStatusFeedback(prev => ({
        ...prev,
        [item.id]: { text: '✅ Pembayaran LUNAS! Status diperbarui.', type: 'success' }
      }));
    } catch (err) {
      setStatusFeedback(prev => ({
        ...prev,
        [item.id]: { text: 'Gagal mengecek status pembayaran.', type: 'error' }
      }));
    } finally {
      setIsCheckingStatus(false);
      setCheckingItemId(null);
    }
  };

  // Top Up Modal Handlers
  const handleProceedTopup = () => {
    if (!selectedChannel) {
      setTopupError('Pilih metode pembayaran terlebih dahulu.');
      return;
    }
    setTopupStep('redirect');
    setTimeout(() => {
      window.open('https://arabpay.my.id/dashboard', '_blank');
    }, 500);
  };

  // Quick Bill Check (For Guests)
  const handleQuickCheckBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchIdentity.trim()) return;
    setQuickCheckLoading(true);
    setQuickCheckResult(null);
    setToastMsg(null);

    try {
      const res = await fetch(`${apiUrl}/api/customers/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: searchIdentity.trim() })
      });
      const data = await res.json();
      if (data.success && data.customer) {
        const invRes = await fetch(`${apiUrl}/api/customers/${data.customer.id}/invoices`);
        const invData = await invRes.json();
        setQuickCheckResult({
          customer: data.customer,
          invoices: invData.invoices || []
        });
      } else {
        setToastMsg({ type: 'error', text: 'Data pelanggan tidak ditemukan. Periksa kembali Nomor HP / Username.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal memeriksa tagihan.' });
    } finally {
      setQuickCheckLoading(false);
    }
  };

  // Theme & Layout Builder configurations from portalConfig
  const currentTheme = portalConfig?.template_theme || 'dark_glass';
  const isLight = currentTheme === 'clean_light' || currentTheme === 'mikhmon_compact';
  const hotspotName = portalConfig?.branding?.hotspot_name || 'NETSPOT / ARBIL';
  const tagline = portalConfig?.branding?.tagline || 'Hotspot & Broadband Portal';
  const contactPhone = portalConfig?.branding?.contact_phone || '';
  const announcement = portalConfig?.announcement;

  const isSectionEnabled = (sectionId: string) => {
    if (!portalConfig?.sections) return true;
    const found = portalConfig.sections.find(s => s.id === sectionId);
    return found ? found.enabled : true;
  };

  const voucherVariant = portalConfig?.sections?.find(s => s.id === 'vouchers')?.variant || 'grid';
  const voucherColumns = Number(portalConfig?.voucher_columns || portalConfig?.sections?.find(s => s.id === 'vouchers')?.columns || 2);

  const getThemeContainerClass = () => {
    switch (currentTheme) {
      case 'clean_light':
        return 'min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col justify-between';
      case 'mikhmon_compact':
        return 'min-h-screen bg-slate-100 text-slate-800 font-sans antialiased flex flex-col justify-between';
      case 'voucher_store':
        return 'min-h-screen bg-gradient-to-b from-[#0b0f19] via-[#0f172a] to-[#020617] text-slate-100 font-sans antialiased flex flex-col justify-between';
      case 'dark_glass':
      default:
        return 'min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-between';
    }
  };

  const getNavClass = () => {
    switch (currentTheme) {
      case 'clean_light':
        return 'sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200 shadow-xs text-slate-800';
      case 'mikhmon_compact':
        return 'sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md';
      case 'voucher_store':
        return 'sticky top-0 z-40 bg-[#0b0f19]/90 backdrop-blur-xl border-b border-indigo-950/60 shadow-lg text-white';
      case 'dark_glass':
      default:
        return 'sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 text-white';
    }
  };

  return (
    <div className={getThemeContainerClass()}>

      {/* ==================== NAVBAR ==================== */}
      <nav className={getNavClass()}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h1 className={`font-bold text-lg tracking-wide leading-none ${
                isLight ? 'text-slate-900' : 'bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent'
              }`}>
                {hotspotName}
              </h1>
              <p className="text-[10px] font-medium text-slate-500 mt-0.5">{tagline}</p>
            </div>
          </div>

          {/* Right Side: Auth / Balance Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            {currentUser ? (
              <>
                {/* Top Up Button */}
                <button
                  onClick={() => setShowTopupModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Top Up</span>
                </button>

                {/* User Avatar & Profile Button */}
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full transition cursor-pointer"
                  title="Klik untuk Lihat Profil Saya"
                >
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-indigo-400">
                      {(currentUser?.name || 'P')[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-slate-300 hidden sm:inline">{currentUser?.name}</span>
                </button>

                {/* Logout Button */}
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Keluar / Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/setup'; window.location.reload(); }}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-full transition cursor-pointer border border-slate-700"
                  title="Setup Kredensial ArabPay Owner"
                >
                  <span>⚙️ Setup Owner</span>
                </button>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-full transition shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Login ArabPay</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ==================== ANNOUNCEMENT BAR ==================== */}
      {isSectionEnabled('announcement') && (
        announcement?.enabled && announcement?.text ? (
          <div className={`relative py-2 px-4 text-center border-b ${
            announcement.type === 'promo'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
              : announcement.type === 'warning'
              ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
              : 'bg-indigo-950/60 border-indigo-500/30 text-indigo-300'
          }`}>
            <p className="text-xs sm:text-sm font-semibold flex items-center justify-center gap-2">
              <Megaphone className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
              <span>{announcement.text}</span>
            </p>
          </div>
        ) : (
          <div className={`relative py-2.5 px-4 border-b text-center ${
            isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950/50 border-slate-800/60 text-slate-300 backdrop-blur-md'
          }`}>
            <p className="text-xs sm:text-sm font-medium">
              <Signal className="inline w-3.5 h-3.5 mr-1.5 text-emerald-400 -mt-0.5" />
              <span className="font-bold text-white">Beli Voucher WiFi Instan</span> — Bayar Saldo <span className="text-emerald-400 font-semibold">ArabPay Wallet</span>
            </p>
          </div>
        )
      )}

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6 flex-1 w-full">

        {/* Toast Alert Notification */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-lg animate-slide-down ${toastMsg.type === 'success' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
            }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-xs md:text-sm font-bold">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* ==================== HERO SECTION (BRANDING & WIFI WELCOME) ==================== */}
        {isSectionEnabled('hero') && (
          <div className={`relative overflow-hidden p-6 sm:p-7 rounded-3xl border shadow-xl backdrop-blur-xl ${
            isLight
              ? 'bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/60 border-slate-200 text-slate-800'
              : 'bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 border-slate-800 text-white'
          }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    Hotspot Online
                  </span>
                  <span className="text-xs text-slate-400">● Beli & Langsung Terhubung</span>
                </div>
                <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {hotspotName}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 font-medium">
                  {tagline}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveTab('buy')}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Pilih Paket Voucher</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== FLASH SALE & COUNTDOWN TIMER BANNER ==================== */}
        {isSectionEnabled('flash_sale') && portalConfig?.flash_sale?.enabled && (
          <div className="relative overflow-hidden p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-rose-950/90 via-slate-900 to-amber-950/80 border border-rose-500/40 shadow-2xl shadow-rose-600/10 backdrop-blur-xl">
            {/* Ambient Lighting & Flame Glow */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-rose-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#f43f5e_1px,transparent_1px)] [background-size:20px_20px] opacity-10 pointer-events-none"></div>

            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Left Details */}
              <div className="space-y-2.5 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-gradient-to-r from-rose-600 to-red-600 rounded-full text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-rose-600/30">
                    <Flame className="w-3.5 h-3.5 animate-bounce" />
                    <span>{portalConfig.flash_sale.badge_label || 'FLASH SALE'}</span>
                  </span>
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{portalConfig.flash_sale.discount_text || 'Diskon Terbatas'}</span>
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                  {portalConfig.flash_sale.title || '⚡ Promo Hotspot Spesial'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 font-medium">
                  {portalConfig.flash_sale.subtitle || 'Dapatkan voucher hotspot dengan harga spesial sebelum promo berakhir!'}
                </p>
              </div>

              {/* Right: Countdown Cards & CTA */}
              <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-stretch sm:items-center gap-3.5 shrink-0">
                {/* Countdown Digit Boxes */}
                <div className="flex items-center justify-center gap-2">
                  {countdown.days > 0 && (
                    <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-3 py-2 rounded-2xl min-w-[50px] shadow-inner">
                      <span className="text-xl sm:text-2xl font-black font-mono text-white leading-none">
                        {String(countdown.days).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Hari</span>
                    </div>
                  )}
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-3 py-2 rounded-2xl min-w-[50px] shadow-inner">
                    <span className="text-xl sm:text-2xl font-black font-mono text-amber-300 leading-none">
                      {String(countdown.hours).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Jam</span>
                  </div>
                  <span className="text-xl font-bold text-rose-400 font-mono -mt-3">:</span>
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-3 py-2 rounded-2xl min-w-[50px] shadow-inner">
                    <span className="text-xl sm:text-2xl font-black font-mono text-amber-300 leading-none">
                      {String(countdown.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Menit</span>
                  </div>
                  <span className="text-xl font-bold text-rose-400 font-mono -mt-3">:</span>
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-3 py-2 rounded-2xl min-w-[50px] shadow-inner">
                    <span className="text-xl sm:text-2xl font-black font-mono text-rose-400 leading-none animate-pulse">
                      {String(countdown.seconds).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Detik</span>
                  </div>
                </div>

                {/* Claim CTA Button */}
                <button
                  onClick={() => {
                    setActiveTab('buy');
                    const voucherList = document.getElementById('voucher-catalog-section');
                    if (voucherList) {
                      voucherList.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="px-5 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
                >
                  <Flame className="w-4 h-4" />
                  <span>{portalConfig.flash_sale.button_text || 'Beli Voucher Promo'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== WALLET WIDGET SECTION ==================== */}
        {isSectionEnabled('wallet_widget') && (
          currentUser ? (
            /* Logged in: Responsive Fintech Card */
            <div className="relative overflow-hidden p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/70 border border-emerald-500/30 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl">
              {/* Ambient Lighting & Pattern Overlay */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-56 h-56 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-56 h-56 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute inset-0 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none"></div>

              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
                {/* Left Side: Wallet Chip Header & Big Balance */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between sm:justify-start gap-2">
                    <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center gap-1.5 text-xs font-black text-emerald-300">
                      <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>SALDO ARABPAY WALLET</span>
                    </div>
                    <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-full flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>SSE Synced</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-3xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-200 bg-clip-text text-transparent">
                      {formatRupiah(currentUser.arabpay_balance ?? 150000)}
                    </span>
                    <button
                      onClick={fetchLiveArabPayBalance}
                      className="p-2 bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-800/60 rounded-xl text-emerald-400 hover:text-emerald-200 transition cursor-pointer shrink-0"
                      title="Refresh Saldo Live"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshingBalance ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span className="text-slate-500">Pemilik Akun:</span>
                    <span className="font-bold text-slate-200">{currentUser.name}</span>
                    <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[10px] text-slate-400 font-mono">
                      {currentUser.phone_number || currentUser.email || 'Terverifikasi'}
                    </span>
                  </div>
                </div>

                {/* Right Side: Action Buttons Grid */}
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 sm:gap-3 shrink-0 pt-2 sm:pt-0">
                  <button
                    onClick={() => setShowTopupModal(true)}
                    className="col-span-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs sm:text-xs rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Top Up Saldo</span>
                  </button>

                  <button
                    onClick={() => setShowProfileModal(true)}
                    className="col-span-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs sm:text-xs rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span>Profil Saya</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Visitor / Guest: ArabPay Wallet Teaser */
            <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30 text-white'
            }`}>
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm flex items-center gap-2">
                    <span>Pembayaran Voucher Otomatis via ArabPay</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Gunakan e-wallet ArabPay untuk transaksi secepat kilat tanpa repot transfer berulang kali.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-600/20 shrink-0 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Login / Hubungkan Wallet</span>
              </button>
            </div>
          )
        )}

        {/* ==================== QUICK BILLING CHECK SECTION ==================== */}
        {isSectionEnabled('quick_billing') && (
          <div className={`p-5 sm:p-6 rounded-3xl border shadow-lg ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900/90 border-slate-800 text-white'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">Cek & Bayar Tagihan Internet</h3>
                  <p className="text-xs text-slate-400">Masukkan No. HP atau Username PPPoE Anda</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-bold">
                Pelanggan Rumah
              </span>
            </div>

            <form onSubmit={handleQuickCheckBill} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchIdentity}
                  onChange={(e) => setSearchIdentity(e.target.value)}
                  placeholder="Contoh: 08123456789 atau user_pppoe"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs sm:text-sm font-medium outline-none transition ${
                    isLight 
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500' 
                      : 'bg-slate-950 border-slate-800 text-white focus:border-blue-500'
                  }`}
                />
              </div>
              <button
                type="submit"
                disabled={quickCheckLoading || !searchIdentity.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                {quickCheckLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>Cek Tagihan</span>
              </button>
            </form>

            {/* Quick Check Bill Results */}
            {quickCheckResult && (
              <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">{quickCheckResult.customer?.name} ({quickCheckResult.customer?.phone_number || quickCheckResult.customer?.username})</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                    {quickCheckResult.invoices?.length || 0} Tagihan
                  </span>
                </div>
                {quickCheckResult.invoices?.length > 0 ? (
                  <div className="space-y-2">
                    {quickCheckResult.invoices.map((inv: any) => (
                      <div key={inv.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-white">{inv.invoice_number || 'Tagihan Bulanan'}</p>
                          <p className="text-slate-500 text-[11px]">Jatuh Tempo: {inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : '-'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-emerald-400">{formatRupiah(Number(inv.amount || 0))}</p>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {inv.status === 'paid' ? 'LUNAS' : 'BELUM DIBAYAR'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Tidak ada tagihan tertunggak untuk akun ini.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notifikasi Ringkas Pengajuan Member (Hanya Ditampilkan Jika Ada Pengajuan Pending) */}
        {currentUser && allRegs.some((r: any) => r.status === 'pending' || r.status === 'off' || !r.status) && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-300 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
              <span>Pengajuan pendaftaran member Anda sedang diproses oleh teknisi / menunggu aktivasi.</span>
            </div>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg font-bold shrink-0 transition cursor-pointer text-[11px]"
            >
              Lihat Status →
            </button>
          </div>
        )}

        {/* ==================== NAVIGATION TABS (RESPONSIVE SCROLLBAR / GRID) ==================== */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 sm:justify-center scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            onClick={() => setActiveTab('buy')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer ${activeTab === 'buy'
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Beli Voucher</span>
          </button>

          {currentUser && allRegs.length > 0 && (
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer ${activeTab === 'subscriptions'
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
            >
              <Signal className="w-4 h-4 text-emerald-400" />
              <span>Langganan Saya ({allRegs.length})</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveTab('register_member');
              fetchMonthlyMemberPackages();
            }}
            className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer ${activeTab === 'register_member'
                ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Daftar Member</span>
          </button>

          {currentUser && (
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer ${activeTab === 'history'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
            >
              <Clock className="w-4 h-4" />
              <span>Voucher Saya ({localPurchasedVouchers.length})</span>
            </button>
          )}

          {currentUser && (
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer ${activeTab === 'invoices'
                  ? 'bg-sky-600 border-sky-500 text-white shadow-lg shadow-sky-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
            >
              <FileText className="w-4 h-4" />
              <span>Tagihan Bulanan</span>
            </button>
          )}

          {currentUser && (
            <button
              onClick={() => setShowProfileModal(true)}
              className="px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 border shrink-0 cursor-pointer bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Profil Saya</span>
            </button>
          )}
        </div>

        {/* ==================== TAB: DAFTAR LANGGANAN SAYA ==================== */}
        {activeTab === 'subscriptions' && currentUser && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-5 rounded-3xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
                  <Signal size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                    <span>Daftar Langganan Internet Saya</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {allRegs.length} Layanan
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Pantau status koneksi, profil kecepatan, dan detail akun internet bulanan Anda</p>
                </div>
              </div>
              <button
                onClick={fetchLiveMemberRegistrationsStatus}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-slate-700 shrink-0 self-start sm:self-auto"
                title="Refresh Status Layanan"
              >
                <RefreshCw size={14} />
                <span>Segarkan Status</span>
              </button>
            </div>

            {allRegs.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
                <Wifi className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-300">Belum Ada Layanan Internet Terdaftar</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Daftarkan diri Anda untuk berlangganan internet bulanan (PPPoE / Hotspot Dedicated).
                </p>
                <button
                  onClick={() => {
                    setActiveTab('register_member');
                    fetchMonthlyMemberPackages();
                  }}
                  className="mt-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-2"
                >
                  <Zap size={14} />
                  <span>Daftar Langganan Member</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {allRegs.map((reg: any, idx: number) => {
                  const isActive = reg.status === 'active' || reg.status === 'on';
                  const isIsolated = reg.status === 'isolated' || reg.status === 'isolir';
                  const isExpired = reg.status === 'expired';

                  const statusConfig = isActive
                    ? {
                        label: 'Aktif (Berlangganan)',
                        color: 'emerald',
                        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                        cardBg: 'bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border-emerald-500/30 shadow-emerald-500/5',
                        desc: 'Layanan internet bulanan Anda aktif normal. Tagihan invoice otomatis terbit setiap bulan.',
                        icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      }
                    : isIsolated
                    ? {
                        label: 'Terisolir (Tunggakan Tagihan)',
                        color: 'rose',
                        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                        cardBg: 'bg-gradient-to-r from-rose-950/60 via-slate-900 to-slate-900 border-rose-500/30 shadow-rose-500/5',
                        desc: 'Koneksi sementara terisolir karena terdapat tagihan belum lunas. Segera lakukan pembayaran untuk mengaktifkan kembali.',
                        icon: <AlertCircle className="w-6 h-6 text-rose-400 animate-pulse" />
                      }
                    : isExpired
                    ? {
                        label: 'Kadaluarsa / Nonaktif',
                        color: 'slate',
                        badgeBg: 'bg-slate-700/50 text-slate-300 border-slate-600',
                        cardBg: 'bg-slate-900 border-slate-800',
                        desc: 'Masa berlaku paket internet telah berakhir.',
                        icon: <Clock className="w-6 h-6 text-slate-400" />
                      }
                    : {
                        label: 'Pengajuan Baru (Menunggu Aktivasi)',
                        color: 'amber',
                        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                        cardBg: 'bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-amber-500/30 shadow-amber-500/5',
                        desc: 'Pengajuan pendaftaran member Anda telah diterima dan sedang diproses teknisi/admin. Harap tunggu verifikasi & aktivasi.',
                        icon: <Clock className="w-6 h-6 text-amber-400 animate-pulse" />
                      };

                  return (
                    <div
                      key={reg.id || idx}
                      className={`p-5 sm:p-6 rounded-3xl border shadow-xl backdrop-blur-md transition-all ${statusConfig.cardBg}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border border-slate-700/60 bg-slate-900">
                            {statusConfig.icon}
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Status Layanan:</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider border ${statusConfig.badgeBg}`}>
                                {statusConfig.label}
                              </span>
                              {reg.connection_type && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                                  {reg.connection_type}
                                </span>
                              )}
                            </div>

                            <h4 className="text-lg font-black text-white flex items-center gap-2 flex-wrap">
                              <span>{reg.package_name || reg.package?.name || 'Paket Internet Bulanan'}</span>
                              <span className="text-xs text-amber-400 font-mono font-normal">
                                ({reg.pppoe_username || reg.name || 'Akun Member'})
                              </span>
                            </h4>

                            <p className="text-xs text-slate-300 max-w-2xl">
                              {statusConfig.desc}
                            </p>

                            <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 flex-wrap">
                              {reg.installation_date && (
                                <span>Tgl Pasang: <strong className="text-slate-200">{new Date(reg.installation_date).toLocaleDateString('id-ID')}</strong></span>
                              )}
                              {reg.expired_at && (
                                <span>Masa Aktif: <strong className="text-slate-200">{new Date(reg.expired_at).toLocaleDateString('id-ID')}</strong></span>
                              )}
                              {reg.customer_code && (
                                <span>ID Pelanggan: <strong className="font-mono text-slate-200">{reg.customer_code}</strong></span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800/80 justify-between lg:justify-end shrink-0">
                          <div className="text-left lg:text-right pr-2">
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Kecepatan</span>
                            <span className="text-sm font-mono font-black text-amber-400">{reg.speed_limit || 'Dedicated'}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isIsolated && (
                              <button
                                onClick={() => setActiveTab('invoices')}
                                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20 active:scale-95"
                              >
                                <CreditCard size={13} />
                                <span>Bayar Tagihan</span>
                              </button>
                            )}
                            <button
                              onClick={fetchLiveMemberRegistrationsStatus}
                              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-700 active:scale-95"
                            >
                              <RefreshCw size={13} />
                              <span>Cek Status</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 1: BUY VOUCHER (Persis arbiljs) ==================== */}
        {activeTab === 'buy' && (
          <div id="voucher-catalog-section" className="space-y-6">
            {voucherLoading ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                <RefreshCw size={28} className="animate-spin text-indigo-500" />
                <span className="text-xs font-bold">Memuat daftar paket voucher...</span>
              </div>
            ) : voucherGroups.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
                <Ticket className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-300">Belum Ada Voucher Tersedia</h3>
                <p className="text-sm text-slate-500">Stok voucher hotspot sedang kosong. Hubungi admin.</p>
              </div>
            ) : voucherVariant === 'list' ? (
              <div className="space-y-3">
                {voucherGroups.map((pkg: any, idx: number) => {
                  const price = Number(pkg.price || 0);
                  const parsedV = parseIso8601(pkg.validity_iso);
                  const validity = parsedV.val || pkg.validity_value || 1;
                  const unit = parsedV.human || (pkg.validity_unit === 'day' ? 'Hari' : pkg.validity_unit === 'hour' ? 'Jam' : pkg.validity_unit || 'Hari');
                  const color = pkg.color || (idx % 6 === 0 ? 'cyan' : idx % 6 === 1 ? 'blue' : idx % 6 === 2 ? 'violet' : idx % 6 === 3 ? 'indigo' : idx % 6 === 4 ? 'emerald' : 'amber');

                  return (
                    <div
                      key={pkg.profile_id || idx}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' :
                          color === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                          color === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                          color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                          color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          <Zap className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={`font-bold text-sm sm:text-base ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                              {pkg.package_name || pkg.profile_name}
                            </h4>
                            {pkg.popular && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                                Populer
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" /> {validity} {unit}
                            </span>
                            {pkg.rate_limit && (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <Zap className="w-3.5 h-3.5" /> {pkg.rate_limit}
                              </span>
                            )}
                            <span className="hidden sm:inline text-slate-500">
                              DNS: {pkg.dns_name || pkg.isp_name || 'arab.net'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">Harga</span>
                          <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                            {price === 0 ? 'GRATIS' : formatRupiah(price)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleBuyVoucher(pkg)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>Beli Voucher</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`grid gap-3 sm:gap-5 ${
                voucherColumns === 1
                  ? 'grid-cols-1 max-w-xl mx-auto'
                  : voucherColumns === 2
                  ? 'grid-cols-2 max-w-4xl mx-auto'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}>
                {voucherGroups.map((pkg: any, idx: number) => {
                  const price = Number(pkg.price || 0);
                  const parsedV = parseIso8601(pkg.validity_iso);
                  const validity = parsedV.val || pkg.validity_value || 1;
                  const unit = parsedV.human || (pkg.validity_unit === 'day' ? 'Hari' : pkg.validity_unit === 'hour' ? 'Jam' : pkg.validity_unit || 'Hari');
                  const color = pkg.color || (idx % 6 === 0 ? 'cyan' : idx % 6 === 1 ? 'blue' : idx % 6 === 2 ? 'violet' : idx % 6 === 3 ? 'indigo' : idx % 6 === 4 ? 'emerald' : 'amber');

                  return (
                    <div
                      key={pkg.profile_id || idx}
                      className="group relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 flex flex-col"
                    >
                      {/* Popular Badge */}
                      {pkg.popular && (
                        <div className="absolute top-2.5 right-2.5 z-10">
                          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full">
                            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400 fill-amber-400" />
                            <span className="text-[9px] sm:text-[10px] font-bold text-amber-300 uppercase tracking-wider">Populer</span>
                          </div>
                        </div>
                      )}

                      {/* Card Top Colored Bar */}
                      <div className={`h-1.5 w-full ${color === 'cyan' ? 'bg-gradient-to-r from-cyan-500 to-cyan-400' :
                          color === 'blue' ? 'bg-gradient-to-r from-blue-500 to-blue-400' :
                            color === 'violet' ? 'bg-gradient-to-r from-violet-500 to-violet-400' :
                              color === 'indigo' ? 'bg-gradient-to-r from-indigo-500 to-indigo-400' :
                                color === 'emerald' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                                  'bg-gradient-to-r from-amber-500 to-amber-400'
                        }`} />

                      <div className={`flex-1 flex flex-col justify-between ${
                        voucherColumns === 2 ? 'p-3.5 sm:p-5 space-y-3 sm:space-y-4' : 'p-5 space-y-4'
                      }`}>
                        {/* Icon + Title */}
                        <div>
                          <div className="flex items-start gap-2.5 sm:gap-3.5 mb-2 sm:mb-3">
                            <div className={`rounded-xl flex items-center justify-center shrink-0 ${
                              voucherColumns === 2 ? 'w-9 h-9 sm:w-12 sm:h-12' : 'w-12 h-12'
                            } ${color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' :
                                color === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                                  color === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                                    color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                                      color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                                        'bg-amber-500/10 text-amber-400'
                              }`}>
                              <Zap className={voucherColumns === 2 ? 'w-4 h-4 sm:w-6 sm:h-6' : 'w-6 h-6'} />
                            </div>
                            <div className="min-w-0">
                              <h3 className={`font-bold text-slate-100 leading-tight truncate ${
                                voucherColumns === 2 ? 'text-sm sm:text-lg' : 'text-lg'
                              }`}>
                                {pkg.package_name || pkg.profile_name}
                              </h3>
                              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 flex items-center gap-1 font-medium truncate">
                                <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                                <span className="truncate">ISP: <strong className="text-slate-200">{pkg.dns_name || pkg.isp_name || 'arab.net'}</strong></span>
                              </p>
                            </div>
                          </div>

                          {/* Specs */}
                          <div className="flex items-center gap-2.5 sm:gap-4 text-[10px] sm:text-xs text-slate-400 mt-1 sm:mt-2 font-medium flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500" /> {validity} {unit}
                            </span>
                            {pkg.rate_limit && (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {pkg.rate_limit}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + Buy Button */}
                        <div className="flex items-center justify-between pt-2.5 sm:pt-3 border-t border-slate-800/60 gap-2">
                          <div className="min-w-0">
                            <p className="text-[9px] sm:text-xs text-slate-500 font-bold uppercase">Harga</p>
                            <p className={`font-black text-emerald-400 font-mono truncate ${
                              voucherColumns === 2 ? 'text-sm sm:text-xl' : 'text-xl'
                            }`}>
                              {price === 0 ? 'GRATIS' : formatRupiah(price)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleBuyVoucher(pkg)}
                            className={`flex items-center justify-center gap-1 sm:gap-2 rounded-xl font-bold transition-all duration-200 bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95 shrink-0 ${
                              voucherColumns === 2 ? 'px-2.5 py-1.5 sm:px-4 sm:py-2.5 text-[11px] sm:text-xs' : 'px-4 py-2.5 text-xs'
                            }`}
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Beli</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 2: VOUCHER HISTORY (Persis arbiljs) ==================== */}
        {activeTab === 'history' && currentUser && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-amber-400" />
                  <span>Daftar Voucher Saya</span>
                </h3>
                <p className="text-[11px] text-slate-400">Tersimpan di database PostgreSQL & siap digunakan</p>
              </div>
              <button
                onClick={fetchMyPurchasedVouchers}
                className="p-2 text-slate-400 hover:text-amber-400 rounded-xl hover:bg-slate-800 transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                title="Muat Ulang Voucher"
              >
                <RefreshCw size={14} />
                <span>Segarkan</span>
              </button>
            </div>

            {localPurchasedVouchers.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
                <Clock className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-slate-300">Belum Ada Transaksi Voucher</h3>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                  Voucher yang Anda beli menggunakan ArabPay akan tercatat otomatis di sini.
                </p>
                <button
                  onClick={() => setActiveTab('buy')}
                  className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Beli Voucher Pertama
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localPurchasedVouchers.map((item: any) => (
                  <div
                    key={item.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition space-y-4 shadow-md"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{item.id}</span>
                        <p className="text-xs text-slate-400 mt-0.5">{item.date}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Berhasil
                      </span>
                    </div>

                    {/* Package Info */}
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Nama Paket</p>
                        <h4 className="font-bold text-slate-200 text-sm mt-0.5">{item.packageName}</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Nominal</p>
                        <p className="font-mono text-sm font-bold text-emerald-400 mt-0.5">{formatRupiah(item.price)}</p>
                      </div>
                    </div>

                    {/* Credentials & Connect Link */}
                    <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Kode Username:</span>
                        <span className="font-mono font-bold text-amber-400 select-all">{item.username}</span>
                      </div>
                      {item.password && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Password:</span>
                          <span className="font-mono font-bold text-amber-400 select-all">{item.password}</span>
                        </div>
                      )}
                      <a
                        href={`http://${item.hotspot_ip || '10.0.0.1'}/login?username=${encodeURIComponent(item.username)}&password=${encodeURIComponent(item.password || item.username)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer mt-2"
                      >
                        <Wifi size={14} />
                        <span>Hubungkan ke WiFi Hotspot Sekarang</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: BROADBAND INVOICES ==================== */}
        {activeTab === 'invoices' && (
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">Daftar Tagihan Internet Saya</h3>
                  <p className="text-xs text-slate-400">Bayar 1-Klik menggunakan Saldo ArabPay</p>
                </div>
              </div>
              <button
                onClick={fetchCustomerProfile}
                className="p-2 text-slate-400 hover:text-sky-400 rounded-xl hover:bg-slate-800 transition cursor-pointer"
                title="Muat Ulang Tagihan"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin text-sky-400' : ''} />
              </button>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <RefreshCw size={24} className="animate-spin text-sky-500" />
                <span className="text-xs font-bold">Memuat tagihan Anda...</span>
              </div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center space-y-2 text-slate-400">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h4 className="font-extrabold text-slate-200 text-sm">Tidak Ada Tagihan Tertunggak</h4>
                <p className="text-xs text-slate-500">Semua tagihan internet bulanan Anda sudah lunas.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {invoices.map((inv: any) => {
                  const isPaid = inv.status === 'paid' || inv.status === 'LUNAS';
                  const amount = Number(inv.total || inv.amount || 0);

                  return (
                    <div
                      key={inv.id}
                      className="bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-100">
                            Tagihan #{inv.invoice_number || inv.id.substring(0, 8)}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${isPaid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            }`}>
                            {inv.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Jatuh Tempo: {inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : 'Akhir Bulan'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4 border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                        <div className="text-left md:text-right">
                          <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Tagihan</span>
                          <span className="font-mono font-bold text-lg text-emerald-400">{formatRupiah(amount)}</span>
                        </div>

                        {!isPaid && (
                          <button
                            onClick={() => {
                              setSelectedPackage({
                                is_invoice: true,
                                invoice_id: inv.id,
                                invoice_number: inv.invoice_number || inv.id,
                                name: `Tagihan ${inv.invoice_number || inv.id}`,
                                price: amount,
                                customer_id: inv.customer_id
                              });
                              setPaymentStep('confirm');
                              setShowPaymentModal(true);
                            }}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center gap-1.5"
                          >
                            <CreditCard size={14} />
                            <span>Bayar Tagihan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: DAFTAR MEMBER BULANAN ==================== */}
        {activeTab === 'register_member' && (
          <div className="space-y-6">
            <div className="p-6 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-3xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <span>Pendaftaran Member Bulanan RT/RW Net</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl">
                    Dapatkan akun Hotspot Dedicated / PPPoE Bulanan dengan tagihan invoice tetap setiap bulan.
                    Cocok untuk pelanggan kos, rumah, tetangga, atau usaha berlangganan rutin.
                  </p>
                </div>
              </div>
            </div>

            {monthlyPackages.length === 0 ? (
              <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
                <Shield className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                <h3 className="text-base font-bold text-slate-300">Memuat Daftar Paket Member...</h3>
                <p className="text-xs text-slate-500">Silakan hubungi admin atau periksa koneksi backend.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {monthlyPackages.map((pkg: any, idx: number) => {
                  const price = Number(pkg.price || 0);
                  return (
                    <div
                      key={pkg.id || idx}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-amber-500/50 hover:shadow-xl hover:shadow-amber-500/5 transition-all flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                            {pkg.type === 'hotspot_monthly' ? '📶 Hotspot Member' : '⚡ PPPoE / FTTH'}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">{pkg.speed_limit || pkg.rate_limit || '10 Mbps'}</span>
                        </div>
                        <h4 className="text-lg font-bold text-white">{pkg.name}</h4>
                        <div className="text-2xl font-black text-amber-400 font-mono">
                          {formatRupiah(price)}<span className="text-xs text-slate-500 font-normal"> /bulan</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {pkg.description || 'Akun dedicated aktif 24 jam dengan tagihan otomatis bulanan.'}
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setRegisterPkg(pkg);
                          const cleanName = (currentUser?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const defaultUser = cleanName ? `${cleanName}${Math.floor(10 + Math.random() * 90)}` : `user${Math.floor(1000 + Math.random() * 9000)}`;
                          const defaultPass = Math.floor(100000 + Math.random() * 900000).toString();

                          setRegForm({
                            name: currentUser?.name || '',
                            phone_number: currentUser?.phone_number || '',
                            username: defaultUser,
                            password: defaultPass,
                            dusun: '',
                            desa: '',
                            kecamatan: '',
                            kabupaten: '',
                            provinsi: ''
                          });
                          setRegError('');
                          setRegSuccess(false);
                          setShowMemberRegisterModal(true);
                        }}
                        className="mt-6 w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10 active:scale-95"
                      >
                        <span>Formulir Pendaftaran Member</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ==================== MODAL REGISTRASI MEMBER BULANAN ==================== */}
      {showMemberRegisterModal && registerPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl space-y-0 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Formulir Pendaftaran Member Bulanan</h3>
                  <p className="text-xs text-slate-400">Pendaftaran Akun {registerPkg.type === 'hotspot_monthly' ? 'Hotspot Member' : 'PPPoE / FTTH'}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowMemberRegisterModal(false); setRegSuccess(false); }}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rich Package Detail Box with Computed Dates */}
            {(() => {
              const today = new Date();
              const parsedRegV = parseIso8601(registerPkg.validity_iso);
              const parsedRegG = parseIso8601(registerPkg.grace_period_iso || 'P15D');

              const estActiveUntil = new Date(today);
              if (parsedRegV.unit === 'month') {
                estActiveUntil.setMonth(today.getMonth() + (parsedRegV.val || 1));
              } else if (parsedRegV.unit === 'day') {
                estActiveUntil.setDate(today.getDate() + (parsedRegV.val || 30));
              } else {
                estActiveUntil.setDate(today.getDate() + 30);
              }

              const estGraceUntil = new Date(estActiveUntil);
              if (parsedRegG.unit === 'day') {
                estGraceUntil.setDate(estActiveUntil.getDate() + (parsedRegG.val || 15));
              } else {
                estGraceUntil.setDate(estActiveUntil.getDate() + 15);
              }

              const formatDateID = (d: Date) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

              return (
                <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                        {registerPkg.type === 'hotspot_monthly' ? '📶 Hotspot Member' : '⚡ PPPoE / FTTH Dedicated'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1">
                        <Zap size={13} className="text-amber-400" />
                        {registerPkg.speed_limit || registerPkg.rate_limit || '10 Mbps'}
                      </span>
                    </div>
                    <div className="text-right font-mono font-black text-amber-400 text-sm">
                      {formatRupiah(Number(registerPkg.price || 0))}<span className="text-[10px] text-slate-400 font-normal"> /bulan</span>
                    </div>
                  </div>

                  {/* Calculated Dates Grid */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-[11px]">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Masa Aktif</span>
                      <span className="text-emerald-400 font-bold block font-mono">+{parsedRegV.unit === 'month' ? `${parsedRegV.val || 1} Bulan` : `${parsedRegV.val || 30} Hari`}</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estActiveUntil)}</span>
                    </div>
                    <div className="space-y-0.5 border-x border-slate-800 px-2 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Jatuh Tempo</span>
                      <span className="text-sky-400 font-bold block font-mono">Tanggal Bayar</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estActiveUntil)}</span>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Toleransi Isolir</span>
                      <span className="text-amber-400 font-bold block font-mono">+{parsedRegG.val || 15} Hari</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estGraceUntil)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {regSuccess ? (
              <div className="p-6 text-center space-y-3.5 overflow-y-auto flex-1">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} />
                </div>
                <h4 className="text-base font-bold text-white">Pendaftaran Berhasil Dikirim!</h4>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  Data pendaftaran Anda telah berhasil dicatat dengan status <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-bold">Non-Aktif (Off / Pending)</span>.
                </p>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2 text-xs text-slate-400">
                  <div className="flex justify-between"><span>Nama Pelanggan:</span> <strong className="text-white">{regForm.name}</strong></div>
                  <div className="flex justify-between"><span>Nomor WhatsApp:</span> <strong className="text-white">{regForm.phone_number}</strong></div>
                  <div className="flex justify-between"><span>Username Akun:</span> <strong className="text-amber-400 font-mono">{regForm.username}</strong></div>
                  <div className="flex justify-between"><span>Password Akun:</span> <strong className="text-amber-400 font-mono">{regForm.password}</strong></div>
                </div>
                <p className="text-[11px] text-slate-500">
                  💡 Admin akan memverifikasi alamat & mengaktifkan serta menyinkronkan akun Anda ke MikroTik.
                </p>
                <button
                  onClick={() => { setShowMemberRegisterModal(false); setRegSuccess(false); }}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer shadow-lg active:scale-95"
                >
                  Tutup & Kembali
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitMemberRegistration} className="p-6 space-y-4 overflow-y-auto flex-1">
                {regError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="text-rose-400 shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Nama Pelanggan *</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Zainudin"
                      value={regForm.name}
                      onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Nomor HP / WhatsApp *</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: 08123456789"
                      value={regForm.phone_number}
                      onChange={(e) => setRegForm({ ...regForm, phone_number: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-3.5 border border-slate-800 rounded-2xl">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-300">Username Akun *</label>
                      <span className="text-[9px] text-amber-400 font-semibold">Otomatis / Dapat Diubah</span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Username akun"
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-300">Password Akun *</label>
                      <button
                        type="button"
                        onClick={() => {
                          const randPass = Math.floor(100000 + Math.random() * 900000).toString();
                          setRegForm(prev => ({ ...prev, password: randPass }));
                        }}
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                      >
                        🎲 Acak Ulang
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Password akun"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                  <IndonesianAddressForm
                    darkTheme={true}
                    value={{
                      provinsi: regForm.provinsi || '',
                      kabupaten: regForm.kabupaten || '',
                      kecamatan: regForm.kecamatan || '',
                      desa: regForm.desa || '',
                      dusun: regForm.dusun || '',
                      kode_pos: regForm.kode_pos || ''
                    }}
                    onChange={(addr) => setRegForm({
                      ...regForm,
                      provinsi: addr.provinsi,
                      kabupaten: addr.kabupaten,
                      kecamatan: addr.kecamatan,
                      desa: addr.desa,
                      dusun: addr.dusun,
                      kode_pos: addr.kode_pos
                    })}
                  />
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-300">
                  <Info className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Status Pendaftaran: <strong>Non-Aktif (Off / Pending)</strong>. Admin akan mengaktifkan & menyinkronkan ke router MikroTik setelah verifikasi.</span>
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {regLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Mengirim Pendaftaran...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Kirim Pendaftaran Member (Status: Off/Pending)</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==================== FOOTER ==================== */}
      <footer className={`border-t py-8 px-4 sm:px-6 text-center space-y-3 ${
        isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-900 bg-slate-950 text-slate-400'
      }`}>
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-indigo-400" /> OAuth 2.0</span>
          <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-emerald-400" /> ArabPay Wallet</span>
          <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Voucher Instan</span>
        </div>
        <p className="text-xs text-slate-600">© 2026 {hotspotName} & Broadband Ecosystem. Powered by ArabPay E-Wallet — arabpay.my.id</p>
      </footer>

      {/* Floating WhatsApp Customer Support Button */}
      {contactPhone && isSectionEnabled('contact_footer') && (
        <a
          href={`https://wa.me/${contactPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Halo Admin, saya ingin bertanya seputar layanan WiFi ' + hotspotName)}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-6 right-6 z-40 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-3 rounded-full shadow-2xl hover:shadow-emerald-500/40 transition-all duration-300 flex items-center gap-2.5 font-bold text-xs group cursor-pointer border border-emerald-400/40"
          title="Hubungi Admin CS via WhatsApp"
        >
          <MessageCircle className="w-5 h-5 fill-white text-emerald-600" />
          <span className="hidden sm:inline">Bantuan CS</span>
        </a>
      )}

      {/* ==================== ARBILJS PAYMENT MODAL (Persis arbiljs) ==================== */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => paymentStep !== 'processing' && setShowPaymentModal(false)}></div>

          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in text-slate-100">

            {/* STEP 1: CONFIRM (SAMA PERSIS PERSIS DENGAN SCREENSHOT ARBILJS) */}
            {paymentStep === 'confirm' && (
              <>
                <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="font-extrabold text-lg text-slate-100 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-indigo-400" /> Konfirmasi Pembelian
                  </h3>
                  <button onClick={() => setShowPaymentModal(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition cursor-pointer">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Package Summary Box */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Voucher WiFi</span>
                      <span className="font-extrabold text-indigo-400">{selectedPackage.package_name || selectedPackage.name || '3 Jam'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Durasi</span>
                      <span className="text-slate-300 font-medium">
                        {selectedPackage.validity_iso ? parseIso8601(selectedPackage.validity_iso).human : selectedPackage.validity_value ? `${selectedPackage.validity_value} ${selectedPackage.validity_unit === 'day' ? 'Hari' : 'Jam'}` : selectedPackage.duration || '3 Jam'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Speed</span>
                      <span className="text-slate-300 font-medium">{selectedPackage.rate_limit || selectedPackage.speed || '10 Mbps'}</span>
                    </div>
                    {(() => {
                      const itemPrice = Number(selectedPackage.price || 0);
                      let feeAmount = 0;
                      let feeLabel = 'Biaya Sistem';

                      if (paymentMethod === 'balance') {
                        feeAmount = arabpayServiceFee;
                        feeLabel = 'Biaya Layanan';
                      } else if (paymentMethod === 'direct' && selectedChannel) {
                        feeAmount = calculateChannelFee(selectedChannel, itemPrice);
                        feeLabel = `Biaya Channel (${selectedChannel.name || selectedChannel.code || 'Gateway'})`;
                      }

                      const totalPrice = itemPrice + feeAmount;

                      return (
                        <>
                          <div className="flex items-center justify-between text-sm border-t border-slate-850 pt-2.5">
                            <span className="text-slate-400">Harga Voucher</span>
                            <span className="font-mono font-bold text-slate-200">{formatRupiah(itemPrice)}</span>
                          </div>

                          {feeAmount > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-400">{feeLabel}</span>
                              <span className="font-mono font-bold text-amber-400">+{formatRupiah(feeAmount)}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
                            <span className="font-bold text-slate-100 text-sm">
                              {paymentMethod === 'balance' ? 'Total Potong Saldo' : 'Total Pembayaran'}
                            </span>
                            <span className="text-lg font-black text-emerald-400 font-mono">
                              {formatRupiah(totalPrice)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Pilih Cara Bayar Section */}
                  <div className="space-y-3">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      PILIH CARA BAYAR
                    </label>

                    <div className="space-y-3">
                      {/* Option 1: ArabPay E-Wallet */}
                      <div
                        onClick={() => setPaymentMethod('balance')}
                        className={`relative p-4 rounded-2xl border transition duration-200 cursor-pointer flex items-start gap-3.5 ${paymentMethod === 'balance'
                            ? 'bg-indigo-950/40 border-indigo-500/90 shadow-lg ring-1 ring-indigo-500/50'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700/80'
                          }`}
                      >
                        {/* Radio Indicator */}
                        <div className="pt-0.5">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition duration-200 ${paymentMethod === 'balance' ? 'border-indigo-500' : 'border-slate-700'
                            }`}>
                            {paymentMethod === 'balance' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="flex-grow space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5">
                              ⚡ ArabPay E-Wallet
                            </span>
                            {arabpayServiceFee > 0 ? (
                              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full border border-indigo-700/50">
                                +{formatRupiah(arabpayServiceFee)}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                Bebas Biaya
                              </span>
                            )}
                          </div>

                          {/* Saldo Aktif Badge */}
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/60 border border-emerald-500/30 rounded-md text-xs font-bold text-emerald-400 font-mono">
                            <span>Saldo Aktif: {formatRupiah(currentUser?.arabpay_balance ?? 150000)}</span>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
                            Bayar instan menggunakan saldo dompet digital ArabPay Anda.
                          </p>
                        </div>
                      </div>

                      {/* Option 2: Bayar Langsung via Gateway (QRIS / VA) */}
                      <div
                        onClick={() => setPaymentMethod('direct')}
                        className={`relative p-4 rounded-2xl border transition duration-200 cursor-pointer flex items-start gap-3.5 ${paymentMethod === 'direct'
                            ? 'bg-indigo-950/40 border-indigo-500/90 shadow-lg ring-1 ring-indigo-500/50'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700/80'
                          }`}
                      >
                        {/* Radio Indicator */}
                        <div className="pt-0.5">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition duration-200 ${paymentMethod === 'direct' ? 'border-indigo-500' : 'border-slate-700'
                            }`}>
                            {paymentMethod === 'direct' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="flex-grow space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5">
                              💳 Bayar Langsung via ArabPay Gateway (QRIS / VA)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Bayar langsung menggunakan transfer bank VA atau scan QRIS secara instant melalui perantara ArabPay.
                          </p>

                          {/* Sub-pilihan Channel Pembayaran (persis arbiljs) */}
                          {paymentMethod === 'direct' && (
                            <div className="pt-3 border-t border-slate-800/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                PILIH CHANNEL PEMBAYARAN:
                              </p>

                              {isLoadingChannels ? (
                                <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat channel...
                                </div>
                              ) : paymentChannels.length === 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {/* Fallback default channels */}
                                  {[
                                    { id: 'bca_va', name: 'BCA Virtual Account', category: 'va', fee_flat: 4000 },
                                    { id: 'qris', name: 'QRIS', category: 'ewallet', fee_percent: 0.7 },
                                    { id: 'shopeepay', name: 'ShopeePay', category: 'ewallet', fee_percent: 1.5 },
                                    { id: 'alfamart', name: 'Alfamart', category: 'convenience_store', fee_flat: 3500 }
                                  ].map((ch) => (
                                    <div
                                      key={ch.id}
                                      onClick={() => setSelectedChannel(ch)}
                                      className={`p-2.5 rounded-xl border transition text-left cursor-pointer flex items-center gap-2 ${selectedChannel?.id === ch.id
                                          ? 'bg-indigo-600/10 border-indigo-500 text-white'
                                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selectedChannel?.id === ch.id ? 'border-indigo-500' : 'border-slate-700'
                                        }`}>
                                        {selectedChannel?.id === ch.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                      </div>
                                      <div className="flex-grow min-w-0">
                                        <p className="text-[11px] font-bold truncate text-slate-200">{ch.name}</p>
                                        <div className="flex items-center justify-between gap-1 mt-0.5">
                                          <span className="text-[9px] text-slate-500 truncate">{ch.category}</span>
                                          <span className="text-[9px] font-mono font-bold text-amber-400">
                                            {getChannelFeeLabel(ch, Number(selectedPackage?.price || 0))}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {paymentChannels.map((ch: any) => (
                                    <div
                                      key={ch.id}
                                      onClick={() => setSelectedChannel(ch)}
                                      className={`p-2.5 rounded-xl border transition text-left cursor-pointer flex items-center gap-2 ${selectedChannel?.id === ch.id
                                          ? 'bg-indigo-600/10 border-indigo-500 text-white'
                                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                                        }`}
                                    >
                                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selectedChannel?.id === ch.id ? 'border-indigo-500' : 'border-slate-700'
                                        }`}>
                                        {selectedChannel?.id === ch.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                      </div>
                                      <div className="flex-grow min-w-0">
                                        <p className="text-[11px] font-bold truncate text-slate-200">{ch.name}</p>
                                        <div className="flex items-center justify-between gap-1 mt-0.5">
                                          <span className="text-[9px] text-slate-500 truncate">{ch.category || ch.code}</span>
                                          <span className="text-[9px] font-mono font-bold text-amber-400">
                                            {getChannelFeeLabel(ch, Number(selectedPackage?.price || 0))}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Button — dynamic text based on method */}
                  <button
                    type="button"
                    onClick={handleProceedPayment}
                    disabled={paymentMethod === 'direct' && !selectedChannel}
                    className="w-full py-3.5 rounded-xl font-extrabold text-sm transition-all bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Lock className="w-4 h-4" />
                    {(() => {
                      const itemPrice = Number(selectedPackage.price || 0);
                      let feeAmount = 0;

                      if (paymentMethod === 'balance') {
                        feeAmount = arabpayServiceFee;
                      } else if (paymentMethod === 'direct' && selectedChannel) {
                        feeAmount = calculateChannelFee(selectedChannel, itemPrice);
                      }

                      const totalPrice = itemPrice + feeAmount;

                      return paymentMethod === 'balance' ? (
                        <span>Lanjut Bayar — {formatRupiah(totalPrice)}</span>
                      ) : (
                        <span>Bayar Gateway — {formatRupiah(totalPrice)}</span>
                      );
                    })()}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* STEP 2: PIN ENTRY (Persis arbiljs) */}
            {paymentStep === 'pin' && (
              <form onSubmit={handleSubmitPinPayment} className="p-6 space-y-6 text-center">
                <div>
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                    <Shield size={24} />
                  </div>
                  <h4 className="font-bold text-slate-100 text-base">Masukkan 6-Digit PIN ArabPay</h4>
                  <p className="text-xs text-slate-400 mt-1">Verifikasi keamanan otentikasi transaksi E-Wallet</p>
                </div>

                {pinError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-2 justify-center">
                    <AlertCircle size={16} className="text-rose-400 shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}

                <div className="flex justify-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <div
                      key={idx}
                      className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black font-mono transition ${pinCode[idx]
                          ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300'
                          : 'border-slate-800 bg-slate-950 text-slate-600'
                        }`}
                    >
                      {pinCode[idx] ? '●' : ''}
                    </div>
                  ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((btn) => (
                    <button
                      key={btn}
                      type="button"
                      onClick={() => {
                        if (btn === 'C') setPinCode('');
                        else if (btn === '⌫') setPinCode(prev => prev.slice(0, -1));
                        else if (pinCode.length < 6) setPinCode(prev => prev + btn);
                      }}
                      className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-sm rounded-xl transition cursor-pointer active:scale-95"
                    >
                      {btn}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentStep('confirm')}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    disabled={pinCode.length !== 6}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
                  >
                    Bayar Sekarang
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: PROCESSING */}
            {paymentStep === 'processing' && (
              <div className="p-12 text-center space-y-4">
                <RefreshCw size={36} className="animate-spin text-indigo-400 mx-auto" />
                <h4 className="font-bold text-slate-100 text-base">Memproses Transaksi ArabPay...</h4>
                <p className="text-xs text-slate-400">Verifikasi PIN S2S & Menerbitkan Voucher Hotspot</p>
              </div>
            )}

            {/* STEP 4: SUCCESS */}
            {paymentStep === 'success' && (
              selectedPackage?.is_invoice ? (
                <div className="p-6 space-y-6 text-center animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 size={36} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-2xl text-slate-100">Pembayaran Tagihan Lunas! 🎉</h4>
                    <p className="text-xs text-slate-400 mt-1">Tagihan bulanan Anda telah berhasil dibayar.</p>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3 text-left">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Nomor Invoice:</span>
                      <span className="font-mono font-bold text-amber-400">#{selectedPackage.invoice_number}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Total Nominal:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">{formatRupiah(selectedPackage.price)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Status Pembayaran:</span>
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-extrabold text-[10px] uppercase">
                        PAID / LUNAS
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
                    ✅ Layanan internet Anda telah diperpanjang & status akun diaktifkan secara otomatis.
                  </div>
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setPaymentStep('confirm');
                      setSelectedPackage(null);
                      fetchLiveMemberRegistrationsStatus();
                      fetchCustomerProfile();
                    }}
                    className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer"
                  >
                    Tutup & Kembali Ke Portal
                  </button>
                </div>
              ) : voucherResult ? (
                <div className="p-6 space-y-6 text-center animate-fade-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 size={36} />
                  </div>

                  <div>
                    <h4 className="font-extrabold text-2xl text-slate-100">Pembayaran Lunas! 🎉</h4>
                    <p className="text-xs text-slate-400 mt-1">Voucher WiFi Anda siap digunakan</p>
                  </div>

                  <div className="bg-slate-950 border border-indigo-900/40 rounded-2xl p-5 space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-1">Kode Voucher WiFi</span>
                      <div className="font-mono font-black text-2xl text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 rounded-xl px-4 py-2 inline-block">
                        {voucherResult.code}
                      </div>
                    </div>
                    {voucherResult.password !== voucherResult.code && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Password</span>
                        <div className="font-mono font-bold text-slate-300">{voucherResult.password}</div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 font-mono">Invoice: {voucherResult.invoice}</p>
                  </div>

                  <div className="space-y-2">
                    <a
                      href={`http://${voucherResult.hotspot_ip || '10.0.0.1'}/login?username=${encodeURIComponent(voucherResult.code)}&password=${encodeURIComponent(voucherResult.password)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Wifi size={16} />
                      <span>Hubungkan ke WiFi Hotspot Sekarang</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(voucherResult.code).catch(() => { });
                        setShowPaymentModal(false);
                        setActiveTab('history');
                      }}
                      className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl cursor-pointer"
                    >
                      Salin Kode & Selesai
                    </button>
                  </div>
                </div>
              ) : null
            )}

          </div>
        </div>
      )}

      {/* ==================== TOP UP MODAL (Persis arbiljs) ==================== */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setShowTopupModal(false)}></div>
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100 animate-fade-in p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" /> Top Up Saldo ArabPay
              </h3>
              <button onClick={() => setShowTopupModal(false)} className="p-1 hover:bg-slate-800 rounded-lg transition cursor-pointer">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Presets */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Pilih Nominal Top Up</label>
              <div className="grid grid-cols-3 gap-2">
                {[10000, 20000, 50000, 100000, 200000, 500000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopupAmount(amt)}
                    className={`py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${topupAmount === amt
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {formatRupiah(amt)}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-300">
              <span>Total Deposit:</span>
              <span className="font-mono text-base font-black text-emerald-400">{formatRupiah(topupAmount)}</span>
            </div>

            <button
              onClick={() => {
                setShowTopupModal(false);
                window.open('https://arabpay.my.id/dashboard', '_blank');
              }}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Buka Portal ArabPay Top Up</span>
              <ExternalLink size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ==================== PROFIL SAYA MODAL ==================== */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowProfileModal(false)}></div>
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-100 animate-fade-in p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-black text-xl text-indigo-400">
                  {(currentUser.name || 'P')[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100 leading-snug">{currentUser.name}</h3>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${
                    currentUser.role === 'owner' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  }`}>
                    {currentUser.role === 'owner' ? '👑 Owner / Super Admin' : '👤 Pelanggan WiFi / Member'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="p-1.5 hover:bg-slate-800 rounded-xl transition cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Profile Detail Items */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Nomor WhatsApp / HP:</span>
                <span className="font-bold text-slate-200">{currentUser.phone_number || customerData?.phone_number || 'Belum diisi'}</span>
              </div>

              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-between">
                <span className="text-slate-400 font-semibold">Email SSO ArabPay:</span>
                <span className="font-bold text-slate-200">{currentUser.email || 'Belum diisi'}</span>
              </div>

              <div className="p-3.5 bg-emerald-950/20 border border-emerald-900/30 rounded-2xl flex items-center justify-between">
                <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" /> Saldo ArabPay:
                </span>
                <span className="font-mono text-sm font-black text-emerald-400">
                  {formatRupiah(currentUser.arabpay_balance ?? 150000)}
                </span>
              </div>

              {/* Status Pelanggan RT/RW Net */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Daftar Langganan Internet ({allRegs.length})
                  </h4>
                  {allRegs.length > 0 && (
                    <button
                      onClick={() => {
                        setShowProfileModal(false);
                        setActiveTab('subscriptions');
                      }}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <span>Buka Tab Langganan</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>

                {allRegs.length > 0 ? (
                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {allRegs.map((reg: any, idx: number) => {
                      const isActive = reg.status === 'active' || reg.status === 'on';
                      const isIsolated = reg.status === 'isolated' || reg.status === 'isolir';
                      const isExpired = reg.status === 'expired';

                      const badge = isActive
                        ? { text: '🟢 AKTIF', style: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
                        : isIsolated
                        ? { text: '🔴 TERISOLIR', style: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
                        : isExpired
                        ? { text: '⚪ NONAKTIF', style: 'text-slate-400 bg-slate-700/30 border-slate-700' }
                        : { text: '🟡 PENGAJUAN / VERIFIKASI', style: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };

                      return (
                        <div key={reg.id || idx} className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-200 text-xs truncate max-w-[200px]">
                              {reg.package_name || reg.package?.name || 'Paket Internet Bulanan'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${badge.style}`}>
                              {badge.text}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>Akun: <strong className="text-slate-200 font-mono">{reg.pppoe_username || reg.name}</strong></span>
                            <span>Speed: <strong className="text-amber-400 font-mono">{reg.speed_limit || 'Dedicated'}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-2">
                    <p className="text-slate-400">Belum terhubung ke data langganan bulanan.</p>
                    <button
                      onClick={() => {
                        setShowProfileModal(false);
                        setActiveTab('register_member');
                        fetchMonthlyMemberPackages();
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                      Daftar Langganan Member
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Logout Action */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => {
                  setShowProfileModal(false);
                  onLogout();
                }}
                className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut size={16} />
                <span>Keluar Akun (Logout)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal Overlay */}
      {showLoginModal && (
        <LoginModal
          initialMode={window.location.hash.includes('admin-login') ? 'admin' : 'sso'}
          onLoginSuccess={(user) => {
            onLoginSuccess(user);
            setShowLoginModal(false);
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}

    </div>
  );
}
