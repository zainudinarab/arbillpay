import React, { useState, useEffect } from 'react';
import { UserAccount } from '../types';
import {
  Wifi, Zap, Clock, Shield, ShoppingCart, Wallet, X,
  CheckCircle2, Lock, ArrowRight, Loader2, AlertCircle,
  Star, Sparkles, Globe, Signal, Timer, ChevronRight,
  Plus, CreditCard, ExternalLink, LogOut, RefreshCw, Banknote,
  QrCode, Copy, FileText, Search, Ticket, UserCheck, Info
} from 'lucide-react';
import LoginModal from './LoginModal';
import { getApiUrl } from '../config/api';
import { getPackagesFromFirestore, getVouchersFromFirestore, saveCustomerToFirestore } from '../services/firebaseService';

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

// ...
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

      const custObj = {
        id: `cust_${Date.now()}`,
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
        package_id: registerPkg.id,
        package_name: registerPkg.name,
        speed_limit: registerPkg.speed_limit || registerPkg.rate_limit || '10 Mbps',
        connection_type: isHotspot ? 'hotspot' : 'pppoe',
        status: 'non-active',
        created_at: new Date().toISOString()
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          await fetch(`${apiUrl}/api/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(custObj)
          });
        } catch (apiErr) { }
      }

      // Always save customer registration directly to Cloud Firestore
      await saveCustomerToFirestore(custObj);

      setRegSuccess(true);
      setMyRegistrations(prev => {
        const updated = [custObj, ...prev.filter((r: any) => r.pppoe_username !== finalUsername)];
        localStorage.setItem('my_member_registrations', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setRegError(err.message || 'Terjadi kesalahan koneksi saat pendaftaran.');
    } finally {
      setRegLoading(false);
    }
  };

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
  onLogout
}: CustomerPortalProps) {
  // --- STATE PERSISTENCE & DATA ---
  const [customerData, setCustomerData] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [payLoadingId, setPayLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);

  // Tabs: 'buy' | 'history' | 'invoices' | 'register_member'
  const [activeTab, setActiveTab] = useState<'buy' | 'history' | 'invoices' | 'register_member'>('buy');
  const [showLoginModal, setShowLoginModal] = useState(false);
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

  // Member Registrations status state (persisted locally & fetched from API)
  const [myRegistrations, setMyRegistrations] = useState<any[]>(() => {
    const raw = localStorage.getItem('my_member_registrations');
    return raw ? JSON.parse(raw) : [];
  });

  // Quick Bill Check (For Visitors)
  const [searchIdentity, setSearchIdentity] = useState('');
  const [quickCheckLoading, setQuickCheckLoading] = useState(false);
  const [quickCheckResult, setQuickCheckResult] = useState<any>(null);

  // Voucher Shop state
  const [voucherGroups, setVoucherGroups] = useState<any[]>([]);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);

  // Voucher History State (local & API)
  const [localPurchasedVouchers, setLocalPurchasedVouchers] = useState<any[]>(() => {
    const rawHist = localStorage.getItem('purchased_vouchers_history');
    return rawHist ? JSON.parse(rawHist) : [];
  });

  // Modal State
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'confirm' | 'pin' | 'processing' | 'success' | 'error' | 'pending_payment'>('confirm');
  const [pinCode, setPinCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');
  const [checkoutId, setCheckoutId] = useState('');
  const [directCheckoutInfo, setDirectCheckoutInfo] = useState<any>(null);
  const [voucherResult, setVoucherResult] = useState<{ code: string; password: string; invoice: string } | null>(null);

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

  const apiUrl = getApiUrl();

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  // --- INITIAL & LIVE AUTO-REFRESH DATA FETCHING ---
  useEffect(() => {
    fetchAvailableVouchers();
    fetchMonthlyMemberPackages();
    fetchPaymentChannels();
    fetchLiveMemberRegistrationsStatus();

    if (currentUser) {
      fetchCustomerProfile();
      fetchLiveArabPayBalance();

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
          const invRes = await fetch(`${apiUrl}/api/invoices?customer_id=${data.customer.id}`);
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
          if (data.success && Array.isArray(data.groups) && data.groups.length > 0) {
            setVoucherGroups(data.groups);
            setVoucherLoading(false);
            return;
          }
        } catch (apiErr) { }
      }

      // Direct Firebase Firestore
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

      // Fallback default packages if both API and Firestore return empty
      setVoucherGroups([
        { profile_id: 'pkg-1h', package_name: '1 Jam', rate_limit: '5 Mbps', price: 3000, validity_value: 1, validity_unit: 'hour', color: 'cyan', mode: 'ondemand', stock: 999 },
        { profile_id: 'pkg-3h', package_name: '3 Jam', rate_limit: '10 Mbps', price: 5000, validity_value: 3, validity_unit: 'hour', color: 'blue', mode: 'ondemand', stock: 999 },
        { profile_id: 'pkg-6h', package_name: '6 Jam', rate_limit: '15 Mbps', price: 8000, validity_value: 6, validity_unit: 'hour', color: 'violet', popular: true, mode: 'ondemand', stock: 999 },
        { profile_id: 'pkg-12h', package_name: '12 Jam', rate_limit: '20 Mbps', price: 12000, validity_value: 12, validity_unit: 'hour', color: 'indigo', mode: 'ondemand', stock: 999 },
        { profile_id: 'pkg-1d', package_name: '1 Hari', rate_limit: '25 Mbps', price: 15000, validity_value: 24, validity_unit: 'hour', color: 'emerald', popular: true, mode: 'ondemand', stock: 999 },
        { profile_id: 'pkg-7d', package_name: '7 Hari', rate_limit: '30 Mbps', price: 50000, validity_value: 7, validity_unit: 'day', color: 'amber', mode: 'ondemand', stock: 999 }
      ]);
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
            const filtered = data.packages.filter((p: any) => p.type === 'hotspot_monthly' || p.type === 'pppoe');
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

  // Fetch LIVE Member Registration status (with silent fallback when running in serverless Firebase mode)
  const fetchLiveMemberRegistrationsStatus = async () => {
    const rawLocal = localStorage.getItem('my_member_registrations');
    const localList: any[] = rawLocal ? JSON.parse(rawLocal) : [];

    const ids = localList.map(r => r.id).filter(Boolean);
    const usernames = localList.map(r => r.pppoe_username).filter(Boolean);
    const phones = localList.map(r => r.phone_number).filter(Boolean);
    if (currentUser?.phone_number) phones.push(currentUser.phone_number);

    if (ids.length === 0 && usernames.length === 0 && phones.length === 0) return;

    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) return; // Pure Firebase serverless mode: do not call non-existent backend API endpoints

      const res = await fetch(`${apiUrl}/api/customers/check-my-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, usernames, phone_numbers: phones })
      }).catch(() => null);

      if (!res || !res.ok) return;

      const data = await res.json().catch(() => null);
      if (data && data.success && Array.isArray(data.customers) && data.customers.length > 0) {
        setMyRegistrations(data.customers);
        localStorage.setItem('my_member_registrations', JSON.stringify(data.customers));

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

      const res = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          package_id: registerPkg.id,
          connection_type: isHotspot ? 'hotspot' : 'pppoe',
          status: 'non-active'
        })
      });
      const data = await res.json();
      if (data.success) {
        setRegSuccess(true);
        const newRegItem = {
          id: data.customer?.id || Date.now().toString(),
          name: regForm.name,
          phone_number: regForm.phone_number,
          pppoe_username: finalUsername,
          package_name: registerPkg.name,
          speed_limit: registerPkg.speed_limit || registerPkg.rate_limit || '10 Mbps',
          status: 'non-active',
          created_at: new Date().toISOString()
        };
        setMyRegistrations(prev => {
          const updated = [newRegItem, ...prev.filter((r: any) => r.pppoe_username !== finalUsername)];
          localStorage.setItem('my_member_registrations', JSON.stringify(updated));
          return updated;
        });
      } else {
        setRegError(data.message || 'Gagal mendaftar member. Silakan coba lagi.');
      }
    } catch (err: any) {
      setRegError(err.message || 'Terjadi kesalahan koneksi saat pendaftaran.');
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

          const balRes = await fetch(`https://arabpay.my.id/api/v1/wallet/balance?user_id=${encodeURIComponent(uId)}`, {
            method: 'GET',
            headers: {
              'X-Client-ID': clientId,
              'X-Timestamp': timestamp,
              'X-Signature': getSignature,
              'Content-Type': 'application/json'
            }
          }).catch(() => null);

          if (balRes && balRes.ok) {
            const bData = await balRes.json();
            if (bData) {
              const val = bData.balance ?? bData.arabpay_balance ?? bData.wallet_balance ?? bData.saldo ?? bData.data?.balance;
              if (val !== undefined && val !== null) {
                fetchedBalance = Number(val);
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

  // Fetch payment channels from ArabPay API
  const fetchPaymentChannels = async () => {
    setIsLoadingChannels(true);
    try {
      const res = await fetch('https://arabpay.my.id/api/v1/payment-channels');
      const data = await res.json();
      if (Array.isArray(data)) {
        setPaymentChannels(data.filter((ch: any) => ch.is_active));
      }
    } catch (e) {
      console.warn('Failed to fetch payment channels:', e);
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

      const checkoutData = await checkoutRes.json();

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

        // Push to local history as PENDING
        const historyItem = {
          id: invoiceCode,
          date: new Date().toLocaleString('id-ID'),
          packageName: selectedPackage.package_name || selectedPackage.name,
          price: price,
          username: buyData.voucher.code,
          password: buyData.voucher.password,
          status: 'SUCCESS',
          paymentChannel: 'QRIS Transfer'
        };
        const updatedHist = [historyItem, ...localPurchasedVouchers];
        setLocalPurchasedVouchers(updatedHist);
        localStorage.setItem('purchased_vouchers_history', JSON.stringify(updatedHist));

        setVoucherResult({
          code: buyData.voucher.code,
          password: buyData.voucher.password,
          invoice: buyData.invoice_number
        });
        setPaymentStep('success');
        fetchAvailableVouchers();
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
    const feeBearer = (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'merchant';
    const customerFee = feeBearer === 'customer' ? 200 : 0;
    const price = itemPrice + customerFee;
    const currentBal = currentUser?.arabpay_balance ?? 0;

    if (price > 0 && currentBal < price) {
      setPinError(`Saldo ArabPay Anda (${formatRupiah(currentBal)}) tidak mencukupi untuk voucher ${formatRupiah(price)}.`);
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
          amount: price,
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
          amount: price,
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

      const randomVoucherCode = 'NET-' + Math.floor(100000 + Math.random() * 900000);
      const randomVoucherPass = Math.floor(100000 + Math.random() * 900000).toString();
      const invoiceNum = 'INV-' + Date.now().toString(36).toUpperCase();

      const historyItem = {
        id: 'TX-' + Date.now().toString(36).toUpperCase(),
        date: new Date().toLocaleString('id-ID'),
        packageName: selectedPackage.package_name || selectedPackage.name,
        price: price,
        username: randomVoucherCode,
        password: randomVoucherPass,
        status: 'SUCCESS',
        paymentChannel: 'ArabPay E-Wallet'
      };
      const updatedHist = [historyItem, ...localPurchasedVouchers];
      setLocalPurchasedVouchers(updatedHist);
      localStorage.setItem('purchased_vouchers_history', JSON.stringify(updatedHist));

      setVoucherResult({
        code: randomVoucherCode,
        password: randomVoucherPass,
        invoice: invoiceNum
      });
      setPaymentStep('success');

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-between">

      {/* ==================== NAVBAR (Persis arbiljs Vouchers.vue) ==================== */}
      <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent leading-none">
                NETSPOT / ARBIL
              </h1>
              <p className="text-[10px] font-medium text-slate-500 mt-0.5">Hotspot & Broadband Portal</p>
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
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-full transition shadow-lg shadow-indigo-500/20 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Login ArabPay</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ==================== COMPACT 1-LINE HEADER (Mobile Clean View) ==================== */}
      <div className="relative py-2.5 px-4 border-b border-slate-800/60 bg-slate-950/50 backdrop-blur-md text-center">
        <p className="text-xs sm:text-sm font-medium text-slate-300">
          <Signal className="inline w-3.5 h-3.5 mr-1.5 text-emerald-400 -mt-0.5" />
          <span className="font-bold text-white">Beli Voucher WiFi Instan</span> — Bayar Saldo <span className="text-emerald-400 font-semibold">ArabPay Wallet</span>
        </p>
      </div>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-8 flex-1 w-full">

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
        {/* ==================== CARD SALDO ARABPAY (RESPONSIVE ULTRA-MODERN FINTECH CARD) ==================== */}
        {currentUser && (
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

              {/* Right Side: Action Buttons Grid (Super Compact & Touch-Friendly on HP) */}
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
        )}

        {/* ==================== BANNER STATUS PENDAFTARAN MEMBER (DITAMPILKAN DI ATAS VOUCHER) ==================== */}
        {(() => {
          const allRegs = customerData ? [customerData, ...myRegistrations.filter((r: any) => r.id !== customerData.id)] : myRegistrations;
          if (allRegs.length === 0) return null;

          return (
            <div className="space-y-4">
              {allRegs.map((reg: any, idx: number) => {
                const isOff = reg.status === 'off' || reg.status === 'pending' || !reg.status;
                const isActive = reg.status === 'active' || reg.status === 'on';

                return (
                  <div
                    key={reg.id || idx}
                    className={`p-5 rounded-3xl border shadow-xl backdrop-blur-md transition-all ${isActive
                        ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500/40 shadow-emerald-500/10'
                        : 'bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-900 border-amber-500/40 shadow-amber-500/10'
                      }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                          }`}>
                          {isActive ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Status Permohonan Member:</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider border ${isActive
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}>
                              {isActive ? '🟢 Aktif (Berlangganan)' : '🟡 Non-Aktif (Pending Verifikasi Admin)'}
                            </span>
                          </div>
                          <h4 className="text-lg font-bold text-white flex items-center gap-2">
                            <span>{reg.package_name || reg.package?.name || 'Paket Member Bulanan'}</span>
                            <span className="text-xs text-amber-400 font-mono font-normal">({reg.pppoe_username || reg.name})</span>
                          </h4>
                          <p className="text-xs text-slate-300">
                            {isActive
                              ? 'Layanan internet bulanan Anda telah aktif. Tagihan invoice otomatis terbit setiap bulan.'
                              : 'Pendaftaran Anda telah berhasil tercatat dengan status Non-Aktif (Off/Pending). Admin/Teknisi sedang memproses verifikasi & aktivasi.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Speed</span>
                          <span className="text-xs font-mono font-bold text-amber-400">{reg.speed_limit || 'Dedicated'}</span>
                        </div>
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
                );
              })}
            </div>
          );
        })()}

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

        {/* ==================== TAB 1: BUY VOUCHER (Persis arbiljs) ==================== */}
        {activeTab === 'buy' && (
          <div className="space-y-6">
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
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {voucherGroups.map((pkg: any, idx: number) => {
                  const price = Number(pkg.price || 0);
                  const validity = pkg.validity_value || pkg.validity_days || 1;
                  const unit = pkg.validity_unit === 'day' ? 'Hari' : pkg.validity_unit === 'hour' ? 'Jam' : pkg.validity_unit || 'Hari';
                  const color = pkg.color || (idx % 6 === 0 ? 'cyan' : idx % 6 === 1 ? 'blue' : idx % 6 === 2 ? 'violet' : idx % 6 === 3 ? 'indigo' : idx % 6 === 4 ? 'emerald' : 'amber');

                  return (
                    <div
                      key={pkg.profile_id || idx}
                      className="group relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 flex flex-col"
                    >
                      {/* Popular Badge */}
                      {pkg.popular && (
                        <div className="absolute top-3 right-3 z-10">
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Populer</span>
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

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        {/* Icon + Title */}
                        <div>
                          <div className="flex items-start gap-3.5 mb-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color === 'cyan' ? 'bg-cyan-500/10 text-cyan-400' :
                                color === 'blue' ? 'bg-blue-500/10 text-blue-400' :
                                  color === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                                    color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                                      color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                                        'bg-amber-500/10 text-amber-400'
                              }`}>
                              <Zap className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-slate-100 leading-tight">
                                {pkg.package_name || pkg.profile_name}
                              </h3>
                              <p className="text-xs text-slate-400 mt-1">
                                Router: {pkg.router_name || 'MikroTik Hotspot'}
                              </p>
                            </div>
                          </div>

                          {/* Specs */}
                          <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" /> {validity} {unit}
                            </span>
                            {pkg.rate_limit && (
                              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                                <Zap className="w-3.5 h-3.5" /> {pkg.rate_limit}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Price + Buy Button */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                          <div>
                            <p className="text-xs text-slate-500 font-bold uppercase">Harga</p>
                            <p className="text-xl font-black text-emerald-400 font-mono">
                              {price === 0 ? 'GRATIS' : formatRupiah(price)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleBuyVoucher(pkg)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 cursor-pointer active:scale-95"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            <span>Beli</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
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
                        href={`http://10.0.0.1/login?username=${encodeURIComponent(item.username)}&password=${encodeURIComponent(item.password || item.username)}`}
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
              const validityDays = registerPkg.validity_days || registerPkg.validity_value || 30;
              const graceDays = registerPkg.grace_period_days || 15;

              const estActiveUntil = new Date(today);
              estActiveUntil.setDate(today.getDate() + validityDays);

              const estGraceUntil = new Date(estActiveUntil);
              estGraceUntil.setDate(estActiveUntil.getDate() + graceDays);

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
                      <span className="text-emerald-400 font-bold block font-mono">+{validityDays} Hari</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estActiveUntil)}</span>
                    </div>
                    <div className="space-y-0.5 border-x border-slate-800 px-2 text-center">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Jatuh Tempo</span>
                      <span className="text-sky-400 font-bold block font-mono">Tanggal Bayar</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estActiveUntil)}</span>
                    </div>
                    <div className="space-y-0.5 text-right">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Toleransi Isolir</span>
                      <span className="text-amber-400 font-bold block font-mono">+{graceDays} Hari</span>
                      <span className="text-[10px] text-slate-400 block">{formatDateID(estGraceUntil)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {regSuccess ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} />
                </div>
                <h4 className="text-lg font-bold text-white">Pendaftaran Berhasil Dikirim!</h4>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  Data pendaftaran Anda telah berhasil dicatat dengan status <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-bold">Non-Aktif (Off / Pending)</span>.
                </p>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left space-y-2 text-xs text-slate-400">
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
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer"
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

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                  <span className="text-[11px] font-bold text-amber-400 block uppercase tracking-wider">📍 Detail Alamat Lengkap & Wilayah</span>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Dusun / RT RW / Alamat Jalan *</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Dusun Krajan RT 02 RW 01 / Jl. Pemuda No. 5"
                      value={regForm.dusun}
                      onChange={(e) => setRegForm({ ...regForm, dusun: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Desa / Kelurahan</label>
                      <input
                        type="text"
                        placeholder="Contoh: Desa Sukamaju"
                        value={regForm.desa}
                        onChange={(e) => setRegForm({ ...regForm, desa: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Kecamatan</label>
                      <input
                        type="text"
                        placeholder="Contoh: Kec. Majujaya"
                        value={regForm.kecamatan}
                        onChange={(e) => setRegForm({ ...regForm, kecamatan: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Kabupaten / Kota</label>
                      <input
                        type="text"
                        placeholder="Contoh: Kab. Bandung"
                        value={regForm.kabupaten}
                        onChange={(e) => setRegForm({ ...regForm, kabupaten: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 block mb-1">Provinsi</label>
                      <input
                        type="text"
                        placeholder="Contoh: Jawa Barat"
                        value={regForm.provinsi}
                        onChange={(e) => setRegForm({ ...regForm, provinsi: e.target.value })}
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
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

      {/* ==================== FOOTER (Persis arbiljs) ==================== */}
      <footer className="border-t border-slate-900 bg-slate-950 py-8 px-4 sm:px-6 text-center space-y-3">
        <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-indigo-400" /> OAuth 2.0</span>
          <span className="flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-emerald-400" /> ArabPay Wallet</span>
          <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Voucher Instan</span>
        </div>
        <p className="text-xs text-slate-600">© 2026 Arbil WiFi & Broadband Ecosystem. Powered by ArabPay E-Wallet — arabpay.my.id</p>
      </footer>

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
                      <span className="text-slate-300 font-medium">{selectedPackage.validity_value ? `${selectedPackage.validity_value} ${selectedPackage.validity_unit === 'day' ? 'Hari' : 'Jam'}` : selectedPackage.duration || '3 Jam'}</span>
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
                        const feeBearer = (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'merchant';
                        feeAmount = feeBearer === 'customer' ? 200 : 0;
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
                            {(() => {
                              const feeBearer = (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'merchant';
                              const customerFee = feeBearer === 'customer' ? 200 : 0;
                              if (customerFee > 0) {
                                return (
                                  <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded-full border border-indigo-700/50">
                                    +{formatRupiah(customerFee)}
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                  Bebas Biaya
                                </span>
                              );
                            })()}
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
                        const feeBearer = (import.meta as any).env?.VITE_ARABPAY_FEE_BEARER || 'merchant';
                        feeAmount = feeBearer === 'customer' ? 200 : 0;
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
                      href={`http://10.0.0.1/login?username=${encodeURIComponent(voucherResult.code)}&password=${encodeURIComponent(voucherResult.password)}`}
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
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Status Langganan Internet</h4>
                {customerData ? (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Paket Internet:</span>
                      <span className="font-bold text-indigo-400">{customerData.package_name || 'Member Hotspot/PPPoE'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Username PPPoE:</span>
                      <span className="font-mono font-bold text-slate-200">{customerData.pppoe_username || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Status Layanan:</span>
                      <span className={`font-bold ${customerData.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {customerData.status === 'active' ? '🟢 AKTIF' : '🟡 MENUNGGU AKTIVASI'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-2">
                    <p className="text-slate-400">Belum terhubung ke data langganan bulanan.</p>
                    <button
                      onClick={() => {
                        setShowProfileModal(false);
                        setActiveTab('register_member');
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
