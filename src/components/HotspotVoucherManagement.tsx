import React, { useState, useEffect, useMemo } from 'react';
import { 
  Ticket, 
  Zap, 
  Search, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  Trash2, 
  Layers, 
  Plus, 
  FileText,
  Calendar,
  DollarSign,
  X,
  Smartphone,
  Eye,
  EyeOff,
  ShieldCheck,
  Globe,
  CreditCard
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { getApiUrl } from '../config/api';
import { getVouchersFromFirestore } from '../services/firebaseService';

interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
}

interface RouterProfileItem {
  id: string;
  router_id: string;
  name: string;
  type: string;
  rate_limit?: string;
  package_name?: string;
  package_price?: number;
}

interface VoucherItem {
  id: string;
  batch_id: string;
  router_id: string;
  router_profile_id: string;
  code: string;
  password: string;
  status: string;
  comment?: string;
  created_at: string;
  router_name?: string;
  router_ip?: string;
  profile_name?: string;
  rate_limit?: string;
  package_name?: string;
  package_price?: number;
  validity_days?: number;
  validity_unit?: string;
  validity_value?: number;
  validity_iso?: string;
  grace_period_iso?: string;
  uptime_limit?: string;
  quota_mb?: number;
  first_login_at?: string;
  mac_address?: string;
  ip_address?: string;
  expired_at?: string;
  sold_to?: string;
  sold_at?: string;
  invoice_id?: string;
  invoice_number?: string;
  is_synced?: boolean;
  last_synced_at?: string;
  sync_error?: string;
}

interface MissingVoucherItem {
  id: string;
  code: string;
  router_id: string;
  router_name: string;
  profile_name: string;
  package_price: number;
  status: string;
  error?: string;
}

interface InspectionResult {
  total_active_db: number;
  found_in_mikrotik: number;
  missing_in_mikrotik: number;
  missing_vouchers: MissingVoucherItem[];
  routers_status: Array<{
    router_id: string;
    router_name: string;
    ip_address: string;
    status: 'online' | 'offline';
    error?: string;
    total_active: number;
    found: number;
    missing: number;
    total_users_in_mikrotik?: number;
  }>;
}

interface HotspotVoucherManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function HotspotVoucherManagement({ profile, t, onLogout }: HotspotVoucherManagementProps) {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs & Modals State
  const [activeTab, setActiveTab] = useState<'vouchers' | 'batches'>('vouchers');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTargetRouterId, setSyncTargetRouterId] = useState<string>('');
  const [inspecting, setInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<InspectionResult | null>(null);
  const [showMissingList, setShowMissingList] = useState(false);

  // Walled Garden State
  const [showWalledGardenModal, setShowWalledGardenModal] = useState(false);
  const [wgRouterId, setWgRouterId] = useState<string>('');
  const [wgLoading, setWgLoading] = useState(false);
  const [wgStatus, setWgStatus] = useState<{ is_configured: boolean; entries: any[]; default_hosts: string[] } | null>(null);
  const [wgActionLoading, setWgActionLoading] = useState(false);
  const [customHost, setCustomHost] = useState('');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRouter, setFilterRouter] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'admin' | 'customer'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'used' | 'sold' | 'available'>('all');
  const [filterSync, setFilterSync] = useState<'all' | 'synced' | 'unsynced'>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [printBatchId, setPrintBatchId] = useState<string>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Generator Form State
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [count, setCount] = useState<string>('10');
  const [codeLength, setCodeLength] = useState<string>('6');
  const [codePrefix, setCodePrefix] = useState<string>('');
  const [charType, setCharType] = useState<'lower' | 'upper' | 'numbers' | 'mixed'>('lower');

  const parseJsonResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error('Server Express (port 3006) belum berjalan. Jalankan `npm run server` di terminal.');
      }
      throw new Error(`Respons server bukan JSON (HTTP ${res.status})`);
    }
    return await res.json();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      let fetched = false;

      if (apiUrl) {
        try {
          const [resVc, resRtr, resProf] = await Promise.all([
            fetch(`${apiUrl}/api/vouchers`),
            fetch(`${apiUrl}/api/routers`),
            fetch(`${apiUrl}/api/router-profiles`)
          ]);

          const dataVc = await parseJsonResponse(resVc);
          const dataRtr = await parseJsonResponse(resRtr);
          const dataProf = await parseJsonResponse(resProf);

          if (dataVc.success && Array.isArray(dataVc.vouchers)) {
            setVouchers(dataVc.vouchers);
            fetched = true;
          }

          if (dataRtr.success && Array.isArray(dataRtr.routers)) {
            setRouters(dataRtr.routers);
            if (dataRtr.routers.length > 0 && !selectedRouterId) {
              setSelectedRouterId(dataRtr.routers[0].id);
            }
          }

          if (dataProf.success && Array.isArray(dataProf.profiles)) {
            setRouterProfiles(dataProf.profiles);
          }
        } catch (apiErr) {
          console.warn('Backend API fetch failed, falling back to direct Firebase Firestore:', apiErr);
        }
      }

      if (!fetched) {
        const fbData = await getVouchersFromFirestore();
        if (fbData.success && Array.isArray(fbData.vouchers)) {
          setVouchers(fbData.vouchers as any);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch vouchers:', err);
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memuat data voucher.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Hotspot Profiles for the selected router (Strictly connected to a package with type 'hotspot_voucher')
  const availableHotspotProfiles = useMemo(() => {
    return routerProfiles.filter(p => {
      const matchRouter = !selectedRouterId || p.router_id === selectedRouterId;
      const matchType = p.type === 'hotspot';
      const hasPackageLinked = Boolean((p as any).package_id || (p as any).package_name);
      const isVoucherPackage = (p as any).package_type === 'hotspot_voucher';
      return matchRouter && matchType && hasPackageLinked && isVoucherPackage;
    });
  }, [routerProfiles, selectedRouterId]);

  // Auto select first profile when router changes
  useEffect(() => {
    if (availableHotspotProfiles.length > 0) {
      setSelectedProfileId(availableHotspotProfiles[0].id);
    } else {
      setSelectedProfileId('');
    }
  }, [selectedRouterId, availableHotspotProfiles]);

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !selectedProfileId || !count) {
      setToastMsg({ type: 'error', text: 'Router, Profile Hotspot, dan Jumlah Voucher wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/vouchers/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: selectedRouterId,
          router_profile_id: selectedProfileId,
          count: parseInt(count) || 10,
          code_length: parseInt(codeLength) || 6,
          code_prefix: codePrefix.trim(),
          char_type: charType,
          admin_id: profile?.id || 'admin'
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setPrintBatchId(data.batch_id);
        setShowGenerateModal(false);
        fetchData();
        // Ask to print batch
        if (confirm('Voucher berhasil di-generate! Apakah Anda ingin mencetak batch voucher ini sekarang?')) {
          setShowPrintModal(true);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal me-generate voucher.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal me-generate voucher: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh voucher dalam batch ini?')) return;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/vouchers/batch/${batchId}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus batch voucher.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus batch voucher.' });
    }
  };

  const inspectMikrotikLive = async (targetRouterId?: string) => {
    setInspecting(true);
    try {
      const apiUrl = getApiUrl();
      const rId = targetRouterId !== undefined ? targetRouterId : syncTargetRouterId;
      const res = await fetch(`${apiUrl}/api/vouchers/inspect-mikrotik`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ router_id: rId !== 'all' ? rId : undefined })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setInspectionResult(data);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memeriksa status router MikroTik.' });
      }
    } catch (err: any) {
      console.error('Inspection error:', err);
    } finally {
      setInspecting(false);
    }
  };

  useEffect(() => {
    if (showSyncModal && syncTargetRouterId) {
      inspectMikrotikLive(syncTargetRouterId);
      setShowMissingList(false);
    } else {
      setInspectionResult(null);
      setShowMissingList(false);
    }
  }, [showSyncModal, syncTargetRouterId]);

  const handleSyncAllActiveVouchers = async () => {
    setSyncing(true);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/vouchers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: syncTargetRouterId !== 'all' ? syncTargetRouterId : undefined
        })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        await inspectMikrotikLive(syncTargetRouterId);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyinkronkan voucher.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal sinkronisasi: ${err.message}` });
    } finally {
      setSyncing(false);
    }
  };

  const fetchWalledGardenStatus = async (routerId: string) => {
    if (!routerId) return;
    setWgLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${routerId}/walled-garden-status`);
      const data = await parseJsonResponse(res);
      if (data.success) {
        setWgStatus(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch WG status:', err);
    } finally {
      setWgLoading(false);
    }
  };

  const handleSetupWalledGarden = async () => {
    if (!wgRouterId) return;
    setWgActionLoading(true);
    try {
      const apiUrl = getApiUrl();
      const hosts = ['*arbill*', '*arabpay.my.id*', '*arabpay*'];
      if (customHost.trim()) {
        hosts.push(customHost.trim());
      }
      const res = await fetch(`${apiUrl}/api/routers/${wgRouterId}/setup-walled-garden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hosts })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setCustomHost('');
        await fetchWalledGardenStatus(wgRouterId);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memasang Walled Garden.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal: ${err.message}` });
    } finally {
      setWgActionLoading(false);
    }
  };

  const handleRemoveWalledGarden = async () => {
    if (!wgRouterId) return;
    if (!confirm('Apakah Anda yakin ingin mencabut seluruh rule bypass Walled Garden di router ini?')) return;
    setWgActionLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${wgRouterId}/remove-walled-garden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        await fetchWalledGardenStatus(wgRouterId);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus Walled Garden.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal: ${err.message}` });
    } finally {
      setWgActionLoading(false);
    }
  };

  useEffect(() => {
    if (showWalledGardenModal && wgRouterId) {
      fetchWalledGardenStatus(wgRouterId);
    }
  }, [showWalledGardenModal, wgRouterId]);

  // Active vouchers eligible for sync
  const eligibleSyncVouchers = useMemo(() => {
    return vouchers.filter(v => {
      if (syncTargetRouterId !== 'all' && v.router_id !== syncTargetRouterId) {
        return false;
      }
      const isActiveOrSold = v.status === 'active' || v.status === 'sold';
      const isUsedNotExpired = v.status === 'used' && (!v.expired_at || new Date(v.expired_at).getTime() > Date.now());
      return isActiveOrSold || isUsedNotExpired;
    });
  }, [vouchers, syncTargetRouterId]);

  const syncStats = useMemo(() => {
    const total = eligibleSyncVouchers.length;
    const unsynced = eligibleSyncVouchers.filter(v => !v.is_synced).length;
    const synced = eligibleSyncVouchers.filter(v => v.is_synced).length;
    return { total, unsynced, synced };
  }, [eligibleSyncVouchers]);

  const handleSyncSingleVoucher = async (voucherId: string) => {
    setSyncingId(voucherId);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/vouchers/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucher_id: voucherId })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyinkronkan voucher.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal sinkronisasi: ${err.message}` });
    } finally {
      setSyncingId(null);
    }
  };

  // Group vouchers by batch_id for Tab 2
  const batchSummaries = useMemo(() => {
    const groups: { [batchId: string]: { batch_id: string; created_at: string; router_name: string; profile_name: string; package_price: number; count: number } } = {};

    vouchers.forEach(v => {
      const bId = v.batch_id || 'unbatched';
      if (!groups[bId]) {
        groups[bId] = {
          batch_id: bId,
          created_at: v.created_at,
          router_name: v.router_name || 'Mikrotik Router',
          profile_name: v.profile_name || 'Hotspot Profile',
          package_price: Number(v.package_price) || 0,
          count: 0
        };
      }
      groups[bId].count += 1;
    });

    return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [vouchers]);

  // Helper parse comment voucher: vc-YYYY-MM-DD 23:59:59-N|<penanda>|<id>|<profil>
  const parseVoucherComment = (comment?: string) => {
    if (!comment) return null;
    const parts = comment.split('|');
    if (parts.length >= 2) {
      const rawDate = parts[0]?.trim();
      const source = parts[1]?.toLowerCase() === 'mandiri' ? 'mandiri' : (parts[1]?.toLowerCase() === 'admin' ? 'admin' : null);
      const creatorId = parts[2]?.trim() || null;
      const profileName = parts[3]?.trim() || null;
      return { rawDate, source, creatorId, profileName };
    }
    return null;
  };

  // Filter Vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const q = searchTerm.toLowerCase();
      const commentMeta = parseVoucherComment(v.comment);
      const matchesSearch = v.code.toLowerCase().includes(q) ||
                            (v.router_name && v.router_name.toLowerCase().includes(q)) ||
                            (v.profile_name && v.profile_name.toLowerCase().includes(q)) ||
                            (v.sold_to && v.sold_to.toLowerCase().includes(q)) ||
                            (v.invoice_number && v.invoice_number.toLowerCase().includes(q)) ||
                            (v.mac_address && v.mac_address.toLowerCase().includes(q)) ||
                            (v.comment && v.comment.toLowerCase().includes(q)) ||
                            (commentMeta?.creatorId && commentMeta.creatorId.toLowerCase().includes(q));

      const matchesRouter = filterRouter === 'all' || v.router_name === filterRouter;

      const isCustomer = commentMeta?.source === 'mandiri' ||
                         v.comment?.includes('|mandiri|') ||
                         v.batch_id === 'vc-instant-ondemand' ||
                         Boolean(v.sold_to) ||
                         Boolean(v.invoice_id);

      const matchesSource = filterSource === 'all' ||
                            (filterSource === 'customer' && isCustomer) ||
                            (filterSource === 'admin' && !isCustomer);

      const isUsed = Boolean(v.first_login_at) || v.status === 'used';
      const isSold = (v.status === 'sold' || isCustomer) && !isUsed;
      const isAvailable = !isUsed && !isSold;

      const matchesStatus = filterStatus === 'all' ||
                            (filterStatus === 'used' && isUsed) ||
                            (filterStatus === 'sold' && isSold) ||
                            (filterStatus === 'available' && isAvailable);

      const matchesSync = filterSync === 'all' ||
                          (filterSync === 'synced' && Boolean(v.is_synced)) ||
                          (filterSync === 'unsynced' && !v.is_synced);

      return matchesSearch && matchesRouter && matchesSource && matchesStatus && matchesSync;
    });
  }, [vouchers, searchTerm, filterRouter, filterSource, filterStatus, filterSync]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRouter, filterSource, filterStatus, filterSync]);

  const totalItems = filteredVouchers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedVouchers = filteredVouchers.slice(startIndex, endIndex);

  const printVouchersList = printBatchId === 'all' 
    ? filteredVouchers 
    : vouchers.filter(v => v.batch_id === printBatchId);

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Voucher Hotspot"
        subtitle="Manajemen Voucher, Cetak Template Mikhmon, dan Batch Generator Mikrotik"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Toast */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Action Header & Tabs Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setActiveTab('vouchers')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'vouchers'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Ticket size={15} className={activeTab === 'vouchers' ? 'text-amber-600' : ''} />
              <span>Daftar Voucher</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">{totalItems}</span>
            </button>

            <button
              onClick={() => setActiveTab('batches')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'batches'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers size={15} className={activeTab === 'batches' ? 'text-indigo-600' : ''} />
              <span>Rekap Batch</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">{batchSummaries.length}</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-amber-200 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Zap size={16} />
              <span>⚡ Generate Voucher Baru</span>
            </button>

            <button
              onClick={() => {
                setSyncTargetRouterId('');
                setInspectionResult(null);
                setShowMissingList(false);
                setShowSyncModal(true);
              }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-200 flex items-center gap-2 transition-all cursor-pointer"
              title="Pilih router dan sinkronkan voucher aktif ke MikroTik"
            >
              <RefreshCw size={15} />
              <span>🔄 Sinkronkan ke MikroTik</span>
            </button>

            <button
              onClick={() => {
                setWgRouterId(routers[0]?.id || '');
                setShowWalledGardenModal(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
              title="Bypass Portal Billing Arbill & E-Wallet ArabPay di Hotspot Walled Garden"
            >
              <ShieldCheck size={15} />
              <span>🛡️ Bypass Portal (Walled Garden)</span>
            </button>

            <button
              onClick={() => { setPrintBatchId('all'); setShowPrintModal(true); }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Printer size={15} />
              <span>🖨️ Cetak Voucher</span>
            </button>

            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all cursor-pointer"
              title="Refresh Data Voucher"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* TAB 1: DAFTAR VOUCHER */}
        {activeTab === 'vouchers' && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode voucher, no hp, invoice, router..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter Sumber */}
                <select
                  value={filterSource}
                  onChange={(e: any) => setFilterSource(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Sumber</option>
                  <option value="admin">🛠️ Generate Admin</option>
                  <option value="customer">📱 Beli Mandiri (Pelanggan)</option>
                </select>

                {/* Filter Status */}
                <select
                  value={filterStatus}
                  onChange={(e: any) => setFilterStatus(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Status</option>
                  <option value="used">🟢 Sedang Dipakai (Login)</option>
                  <option value="sold">🟡 Terjual (Belum Login)</option>
                  <option value="available">⚪ Stok Tersedia</option>
                </select>

                {/* Filter Sinkronisasi MikroTik */}
                <select
                  value={filterSync}
                  onChange={(e: any) => setFilterSync(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Sinkron</option>
                  <option value="synced">🟢 Tersinkron MikroTik</option>
                  <option value="unsynced">🔴 Belum Masuk MikroTik</option>
                </select>

                {/* Filter Router */}
                <select
                  value={filterRouter}
                  onChange={(e) => setFilterRouter(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Router</option>
                  {routers.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voucher Table List */}
            {loading ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
                <RefreshCw size={24} className="animate-spin text-amber-500" />
                <span className="text-xs font-semibold">Mengambil daftar voucher hotspot...</span>
              </div>
            ) : filteredVouchers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-xs font-medium">
                Belum ada voucher hotspot terbuat. Klik tombol <strong className="text-slate-700">"⚡ Generate Voucher Baru"</strong> untuk me-generate voucher baru.
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-3.5 px-4">No</th>
                        <th className="py-3.5 px-4">Kode Voucher</th>
                        <th className="py-3.5 px-4">Sumber & Pembeli</th>
                        <th className="py-3.5 px-4">Router & Profile</th>
                        <th className="py-3.5 px-4">Tarif & Paket</th>
                        <th className="py-3.5 px-4">Status & Sinyal Aktif</th>
                        <th className="py-3.5 px-4">Sinkron MikroTik</th>
                        <th className="py-3.5 px-4">Waktu Buat</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                      {paginatedVouchers.map((v, idx) => {
                        const commentMeta = parseVoucherComment(v.comment);
                        const isCustomerBought = commentMeta?.source === 'mandiri' ||
                                                 v.comment?.includes('|mandiri|') ||
                                                 v.batch_id === 'vc-instant-ondemand' ||
                                                 Boolean(v.sold_to) ||
                                                 Boolean(v.invoice_id);
                        const isUsed = Boolean(v.first_login_at) || v.status === 'used';
                        const isSoldNotUsed = (v.status === 'sold' || isCustomerBought) && !isUsed;

                        return (
                          <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{startIndex + idx + 1}</td>
                            
                            {/* Kode Voucher */}
                            <td className="py-3 px-4">
                              <span className="font-mono font-extrabold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-xs inline-flex items-center gap-1.5">
                                <Ticket size={13} />
                                {v.code}
                              </span>
                              {v.password && v.password !== v.code && (
                                <span className="block text-[10px] font-mono text-slate-400 mt-0.5">
                                  Pass: {v.password}
                                </span>
                              )}
                            </td>

                            {/* Sumber & Pembeli */}
                            <td className="py-3 px-4">
                              {isCustomerBought ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md w-fit">
                                    <Smartphone size={11} className="text-sky-600" />
                                    Beli Mandiri
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-slate-800">
                                    User: {commentMeta?.creatorId || v.sold_to || 'Pelanggan'}
                                  </span>
                                  {v.invoice_number && (
                                    <span className="text-[9px] font-mono text-slate-400">
                                      #{v.invoice_number}
                                    </span>
                                  )}
                                  {v.comment && (
                                    <span className="text-[9px] font-mono text-slate-400 truncate max-w-[190px]" title={v.comment}>
                                      💬 {v.comment}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md w-fit">
                                    <Layers size={11} className="text-indigo-600" />
                                    Generate Admin
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-slate-800">
                                    Admin: {commentMeta?.creatorId || 'admin'}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400">
                                    {v.batch_id || 'Batch'}
                                  </span>
                                  {v.comment && (
                                    <span className="text-[9px] font-mono text-slate-400 truncate max-w-[190px]" title={v.comment}>
                                      💬 {v.comment}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Router & Profile */}
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-800 block text-xs">📡 {v.router_name || '-'}</span>
                              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[10px] mt-0.5 inline-block">
                                {v.profile_name || 'default'}
                              </span>
                            </td>

                            {/* Tarif & Durasi */}
                            <td className="py-3 px-4">
                              {v.package_price ? (
                                <span className="font-bold text-emerald-700 block text-xs">
                                  Rp {Number(v.package_price).toLocaleString('id-ID')}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">{v.rate_limit || '-'}</span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {v.uptime_limit || v.validity_iso || '1 Hari'}
                              </span>
                            </td>

                            {/* Status & Sinyal Aktif / Tanda Pemakaian */}
                            <td className="py-3 px-4">
                              {isUsed ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md w-fit">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Sedang Dipakai
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                                    <Clock size={10} className="text-slate-400" />
                                    Login: {new Date(v.first_login_at!).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                  </span>
                                  {v.mac_address && (
                                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                      <Smartphone size={10} className="text-slate-400" />
                                      MAC: {v.mac_address}
                                    </span>
                                  )}
                                  {v.ip_address && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      IP: {v.ip_address}
                                    </span>
                                  )}
                                  {v.expired_at && (
                                    <span className="text-[10px] text-rose-600 font-mono font-medium">
                                      Exp: {new Date(v.expired_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  )}
                                </div>
                              ) : isSoldNotUsed ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md w-fit">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Terjual (Belum Login)
                                  </span>
                                  {v.sold_at && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      Beli: {new Date(v.sold_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md w-fit">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                  Stok Tersedia
                                </span>
                              )}
                            </td>

                            {/* Status MikroTik */}
                            <td className="py-3 px-4">
                              {v.is_synced ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md w-fit">
                                    <CheckCircle2 size={11} className="text-emerald-600" />
                                    Tersinkron
                                  </span>
                                  {v.last_synced_at && (
                                    <span className="text-[9px] font-mono text-slate-400">
                                      {new Date(v.last_synced_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md w-fit"
                                    title={v.sync_error || 'Belum masuk ke router MikroTik'}
                                  >
                                    <AlertCircle size={11} className="text-rose-600" />
                                    Belum Masuk
                                  </span>
                                  <button
                                    onClick={() => handleSyncSingleVoucher(v.id)}
                                    disabled={syncingId === v.id}
                                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1 cursor-pointer w-fit"
                                    title="Kirim ulang voucher ini ke router MikroTik"
                                  >
                                    <RefreshCw size={9} className={syncingId === v.id ? 'animate-spin' : ''} />
                                    <span>Sync Ulang</span>
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Waktu Buat */}
                            <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                              {new Date(v.created_at).toLocaleString('id-ID')}
                            </td>

                            {/* Aksi */}
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteBatch(v.batch_id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title="Hapus Batch ini"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Pagination Footer */}
                  <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Tampilkan</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-slate-400 font-medium">per halaman</span>
                      <span className="text-slate-400 font-medium ml-2">
                        (Menampilkan <strong className="text-slate-700">{totalItems > 0 ? startIndex + 1 : 0}-{endIndex}</strong> dari <strong className="text-slate-700">{totalItems}</strong> data)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        ‹ Prev
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                          .map((page, idx, arr) => (
                            <React.Fragment key={page}>
                              {idx > 0 && arr[idx - 1] !== page - 1 && (
                                <span className="px-1 text-slate-400 font-bold">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  currentPage === page
                                    ? 'bg-amber-600 text-white shadow-sm'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalItems === 0}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REKAP BATCH VOUCHER */}
        {activeTab === 'batches' && (
          <div className="space-y-4">
            {batchSummaries.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-xs font-medium">
                Belum ada batch voucher yang di-generate.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {batchSummaries.map(b => (
                  <div key={b.batch_id} className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">BATCH ID</span>
                        <h4 className="font-mono font-extrabold text-amber-700 text-sm">{b.batch_id}</h4>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-[11px] text-slate-700">
                        {b.count} Voucher
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Server Router:</span>
                        <span className="font-bold text-slate-800">{b.router_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Profile Hotspot:</span>
                        <span className="font-bold text-indigo-600">{b.profile_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Total Nilai Batch:</span>
                        <span className="font-bold text-emerald-600">Rp {(b.package_price * b.count).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Waktu Generate:</span>
                        <span className="font-mono text-[10px] text-slate-500">{new Date(b.created_at).toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        onClick={() => { setPrintBatchId(b.batch_id); setShowPrintModal(true); }}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Printer size={13} />
                        <span>Cetak Batch</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBatch(b.batch_id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Hapus Batch"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL POPUP: GENERATE VOUCHER BARU */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Generate Voucher Hotspot Baru</h3>
                  <p className="text-xs text-slate-400">Username & Password Sama Auto-Sync ke Mikrotik</p>
                </div>
              </div>
              <button onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleGenerateVouchers} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Server Router Mikrotik *</label>
                  <select
                    value={selectedRouterId}
                    onChange={(e) => setSelectedRouterId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Paket Internet (Voucher) *</label>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {availableHotspotProfiles.length === 0 ? (
                      <option value="">Tidak ada Paket Internet Voucher di Router ini</option>
                    ) : (
                      availableHotspotProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          📦 {p.package_name || p.name} - Rp {p.package_price ? p.package_price.toLocaleString('id-ID') : '0'} ({p.rate_limit || 'Full Speed'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Generate Voucher *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="200"
                  placeholder="10"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Maksimal 200 voucher per 1x generate</span>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="text-[11px] font-bold text-amber-900">Format & Custom Kode Voucher</div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Panjang Kode</label>
                    <select
                      value={codeLength}
                      onChange={(e) => setCodeLength(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold"
                    >
                      <option value="4">4 Karakter</option>
                      <option value="5">5 Karakter</option>
                      <option value="6">6 Karakter</option>
                      <option value="8">8 Karakter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Prefix</label>
                    <input
                      type="text"
                      placeholder="Contoh: VC-"
                      value={codePrefix}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Karakter</label>
                    <select
                      value={charType}
                      onChange={(e) => setCharType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-[11px] font-bold"
                    >
                      <option value="lower">abc123 (Kecil)</option>
                      <option value="upper">ABC123 (Besar)</option>
                      <option value="numbers">123456 (Angka)</option>
                      <option value="mixed">aBc123 (Mix)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setShowGenerateModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" disabled={submitLoading || availableHotspotProfiles.length === 0} className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Generating & Syncing...' : `⚡ Generate ${count} Voucher`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cetak Voucher (Mikhmon Style Template) */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-amber-400" />
                <span className="font-bold text-sm">Cetak Template Voucher Hotspot (Mikhmon Style)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Halaman Ini</span>
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer ml-2">&times;</button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {printVouchersList.map((v) => (
                  <div key={v.id} className="bg-white border-2 border-slate-900 rounded-xl p-3 shadow-md flex flex-col justify-between text-slate-900 font-sans">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 mb-1.5">
                      <span className="font-black text-[11px] text-amber-600 truncate">{profile.companyName || 'WIFI HOTSPOT'}</span>
                      <span className="font-bold text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{v.profile_name || 'Voucher'}</span>
                    </div>

                    <div className="text-center py-2 bg-slate-50 rounded-lg border border-slate-100 my-1">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">KODE VOUCHER / PASSWORD</span>
                      <span className="font-mono font-black text-base text-slate-900 tracking-wider select-all">{v.code}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-[10px]">
                      <span className="font-bold text-emerald-700">
                        {v.package_price ? `Rp ${Number(v.package_price).toLocaleString('id-ID')}` : '-'}
                      </span>
                      <span className="text-slate-400 text-[9px] font-mono">{v.rate_limit || 'Fast'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL POPUP: SINKRONISASI MIKROTIK */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-sm">
                  <RefreshCw size={20} className={syncing || inspecting ? 'animate-spin' : ''} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Sinkronisasi Voucher ke MikroTik</h3>
                  <p className="text-xs text-slate-400">Pemeriksaan live MikroTik & sinkronisasi voucher aktif</p>
                </div>
              </div>
              <button 
                onClick={() => !syncing && setShowSyncModal(false)} 
                disabled={syncing}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer disabled:opacity-40"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Select Router & Live Check Trigger */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Pilih Target Router MikroTik
                  </label>
                  {syncTargetRouterId && (
                    <button
                      type="button"
                      onClick={() => inspectMikrotikLive()}
                      disabled={inspecting || syncing}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Periksa ulang data user langsung di router MikroTik"
                    >
                      <RefreshCw size={12} className={inspecting ? 'animate-spin' : ''} />
                      <span>{inspecting ? 'Memeriksa MikroTik...' : '🔍 Periksa MikroTik'}</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Server size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={syncTargetRouterId}
                    onChange={(e) => setSyncTargetRouterId(e.target.value)}
                    disabled={syncing || inspecting}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none transition-all cursor-pointer"
                  >
                    <option value="">-- Silakan Pilih Router MikroTik --</option>
                    <option value="all">🌐 Semua Router MikroTik ({routers.length} Router)</option>
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>
                        ⚡ {r.name} ({r.ip_address || 'MikroTik'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* State saat router belum dipilih */}
              {!syncTargetRouterId ? (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-2 bg-slate-50/50">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
                    <Server size={22} />
                  </div>
                  <h4 className="font-bold text-sm text-slate-800">Silakan Pilih Router MikroTik</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Pilih target router pada dropdown di atas untuk memulai pemeriksaan kondisi user voucher secara real-time ke MikroTik.
                  </p>
                </div>
              ) : (
                <>
                  {/* Status Loading Pemeriksaan */}
                  {inspecting && !inspectionResult && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-3 text-xs text-slate-600">
                      <RefreshCw size={16} className="animate-spin text-emerald-600" />
                      <span>Menghubungi router MikroTik dan memeriksa voucher aktif...</span>
                    </div>
                  )}

                  {/* Status Koneksi Router Live */}
                  {inspectionResult && inspectionResult.routers_status.length > 0 && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          inspectionResult.routers_status[0]?.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                        }`} />
                        <span className="font-bold text-slate-700">
                          {inspectionResult.routers_status[0]?.status === 'online' ? 'MikroTik Terhubung (Live)' : 'Router Tidak Terjangkau'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {inspectionResult.routers_status[0]?.router_name} • {inspectionResult.routers_status[0]?.total_users_in_mikrotik ?? 0} user di router
                      </span>
                    </div>
                  )}

                  {/* Real-time Comparison Stats Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Aktif di Sistem</span>
                      <span className="text-lg font-black text-slate-800">
                        {inspectionResult ? inspectionResult.total_active_db : syncStats.total}
                      </span>
                      <span className="text-[9px] text-slate-500 block">voucher aktif</span>
                    </div>
                    <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-center">
                      <span className="text-[10px] font-bold text-emerald-600 block uppercase">Ada di MikroTik</span>
                      <span className="text-lg font-black text-emerald-700">
                        {inspectionResult ? inspectionResult.found_in_mikrotik : syncStats.synced}
                      </span>
                      <span className="text-[9px] text-emerald-600/80 block">valid di router</span>
                    </div>
                    <div className={`p-3.5 rounded-2xl text-center border transition-all ${
                      (inspectionResult ? inspectionResult.missing_in_mikrotik : syncStats.unsynced) > 0
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-emerald-50/50 border-slate-100 text-slate-700'
                    }`}>
                      <span className="text-[10px] font-bold block uppercase">
                        {(inspectionResult ? inspectionResult.missing_in_mikrotik : syncStats.unsynced) > 0 ? 'Hilang / Belum Ada' : 'Belum Sync'}
                      </span>
                      <span className={`text-lg font-black ${
                        (inspectionResult ? inspectionResult.missing_in_mikrotik : syncStats.unsynced) > 0 ? 'text-rose-700' : 'text-slate-800'
                      }`}>
                        {inspectionResult ? inspectionResult.missing_in_mikrotik : syncStats.unsynced}
                      </span>
                      <span className="text-[9px] block opacity-80">
                        {(inspectionResult ? inspectionResult.missing_in_mikrotik : syncStats.unsynced) > 0 ? 'perlu disinkronkan' : 'di MikroTik'}
                      </span>
                    </div>
                  </div>

                  {/* Detail Voucher yang Hilang di MikroTik */}
                  {inspectionResult && inspectionResult.missing_in_mikrotik > 0 && (
                    <div className="p-3.5 bg-rose-50/90 border border-rose-200 rounded-2xl space-y-2.5 animate-fade-in">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={16} className="text-rose-600 shrink-0" />
                          <span className="text-xs font-bold text-rose-900">
                            {inspectionResult.missing_in_mikrotik} Voucher Aktif Belum Ada / Hilang di MikroTik!
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMissingList(prev => !prev)}
                          className="px-2.5 py-1 bg-white border border-rose-200 hover:bg-rose-100/50 text-rose-700 text-[11px] font-extrabold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
                        >
                          {showMissingList ? <EyeOff size={13} /> : <Eye size={13} />}
                          <span>{showMissingList ? 'Tutup Daftar' : 'Lihat Daftar Voucher'}</span>
                        </button>
                      </div>

                      {showMissingList && (
                        <div className="max-h-52 overflow-y-auto rounded-xl border border-rose-200 bg-white p-2 shadow-inner">
                          <table className="w-full text-left text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                                <th className="pb-1.5 pl-2">No</th>
                                <th className="pb-1.5">Kode Voucher</th>
                                <th className="pb-1.5">Profil Paket</th>
                                <th className="pb-1.5">Harga</th>
                                <th className="pb-1.5 pr-2">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {inspectionResult.missing_vouchers.map((mv, idx) => (
                                <tr key={mv.id} className="hover:bg-rose-50/40">
                                  <td className="py-1.5 pl-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                                  <td className="py-1.5 font-mono font-bold text-slate-900">{mv.code}</td>
                                  <td className="py-1.5 text-indigo-600 font-semibold">{mv.profile_name}</td>
                                  <td className="py-1.5 text-slate-700 font-mono">Rp {mv.package_price.toLocaleString('id-ID')}</td>
                                  <td className="py-1.5 pr-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                      mv.status === 'active' ? 'bg-amber-100 text-amber-800' :
                                      mv.status === 'sold' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {mv.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* All Synced Green Callout */}
                  {inspectionResult && inspectionResult.missing_in_mikrotik === 0 && inspectionResult.total_active_db > 0 && (
                    <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Semua {inspectionResult.total_active_db} voucher aktif di sistem sudah ada dan cocok di router MikroTik!</span>
                    </div>
                  )}
                </>
              )}

              {/* Info Note */}
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-start gap-2.5">
                <AlertCircle size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-800 leading-relaxed">
                  <p className="font-bold mb-0.5">Ketentuan Sinkronisasi Otomatis:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-[10.5px]">
                    <li>Hanya voucher <strong>aktif</strong> (belum login, terjual, atau sedang aktif belum expired) yang akan dikirim ke MikroTik.</li>
                    <li>Voucher yang sudah <strong>expired</strong> diabaikan dan tidak akan dimasukkan ke MikroTik.</li>
                    <li>Jika user sudah ada di MikroTik, komentar dan profile akan diperbarui tanpa memutus sesi aktif user.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <button
                type="button"
                onClick={() => inspectMikrotikLive()}
                disabled={!syncTargetRouterId || inspecting || syncing}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw size={13} className={inspecting ? 'animate-spin' : ''} />
                <span>Cek Ulang</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  disabled={syncing}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-40"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleSyncAllActiveVouchers}
                  disabled={!syncTargetRouterId || syncing || inspecting || (inspectionResult ? inspectionResult.total_active_db === 0 : syncStats.total === 0)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  <span>
                    {!syncTargetRouterId 
                      ? 'Pilih Router Dahulu' 
                      : syncing 
                        ? 'Sedang Menyinkronkan...' 
                        : (inspectionResult && inspectionResult.missing_in_mikrotik > 0
                            ? `Sinkronkan ${inspectionResult.missing_in_mikrotik} Voucher ke MikroTik`
                            : 'Mulai Sinkronisasi'
                          )
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL POPUP: HOTSPOT WALLED GARDEN (BYPASS BILLING & ARABPAY) */}
      {showWalledGardenModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-xl shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-sm">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Hotspot Walled Garden</h3>
                  <p className="text-xs text-slate-500">Bypass akses Billing Arbill & E-Wallet ArabPay sebelum login</p>
                </div>
              </div>
              <button 
                onClick={() => !wgActionLoading && setShowWalledGardenModal(false)} 
                disabled={wgActionLoading}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer disabled:opacity-40"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Select Router */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Target Router MikroTik
                </label>
                <div className="relative">
                  <Server size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={wgRouterId}
                    onChange={(e) => setWgRouterId(e.target.value)}
                    disabled={wgActionLoading || wgLoading}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all cursor-pointer"
                  >
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>
                        ⚡ {r.name} ({r.ip_address || 'MikroTik'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Box */}
              {wgLoading ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-xs text-slate-500">
                  <RefreshCw size={15} className="animate-spin text-indigo-600" />
                  <span>Memeriksa status Walled Garden di MikroTik...</span>
                </div>
              ) : wgStatus?.is_configured ? (
                <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <div>
                      <h5 className="font-bold text-xs text-emerald-900">Walled Garden Aktif di MikroTik</h5>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        {wgStatus.entries.length} Rule Bypass Terpasang (Domain & IP)
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                    Aktif
                  </span>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <div>
                      <h5 className="font-bold text-xs text-amber-900">Walled Garden Belum Aktif</h5>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Pelanggan Hotspot belum bisa membuka billing & wallet jika belum login
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                    Belum Pasang
                  </span>
                </div>
              )}

              {/* Bypassed Targets Preview */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Daftar Domain & Port yang Di-Bypass (Dinamis dari .env):
                </label>
                <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-xs">
                  <div className="flex items-start gap-2.5">
                    <Globe size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 font-mono text-[11.5px]">
                        {wgStatus?.env_billing_host ? `*${wgStatus.env_billing_host}*` : '*arbill*'}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Portal Web Billing Hotspot & Kasir POS (<code className="text-indigo-600 font-semibold">{wgStatus?.env_billing_host || 'arbill.arabpay.my.id'}</code> dari <span className="font-mono text-[10px] text-slate-600 font-bold">BILLING_SERVER_HOST</span>)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/60">
                    <CreditCard size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 font-mono text-[11.5px]">
                        {wgStatus?.env_wallet_url ? `*${wgStatus.env_wallet_url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}*` : '*arabpay.my.id*'}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Platform E-Wallet ArabPay, Oauth SSO Login, & API Gateway (<code className="text-emerald-600 font-semibold">{wgStatus?.env_wallet_url || 'https://arabpay.my.id'}</code> dari <span className="font-mono text-[10px] text-slate-600 font-bold">ARABPAY_PANEL_URL</span>)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/60">
                    <Zap size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 font-mono text-[11.5px]">*arabpay*</span>
                      <p className="text-[11px] text-slate-500">Wildcard seluruh ekosistem transaksi dompet digital & QRIS</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Custom Host */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tambah Host / IP Kustom (Opsional):
                </label>
                <input
                  type="text"
                  placeholder="Contoh: api.tripay.co.id atau 103.x.x.x"
                  value={customHost}
                  onChange={(e) => setCustomHost(e.target.value)}
                  disabled={wgActionLoading}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
              </div>

              {/* Info Note */}
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-start gap-2.5">
                <AlertCircle size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-800 leading-relaxed">
                  <p className="font-bold mb-0.5">Cara Kerja Walled Garden Hotspot:</p>
                  <p className="text-blue-700 text-[10.5px]">
                    Setelah rule ini dipasang, setiap HP/Laptop yang terhubung ke sinyal WiFi Hotspot dapat langsung membuka website <strong>arbill.arabpay.my.id</strong> dan menggunakan <strong>ArabPay E-Wallet</strong> untuk beli voucher mandiri secara lancar tanpa dicegat/diblokir oleh login page MikroTik.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              {wgStatus?.is_configured ? (
                <button
                  type="button"
                  onClick={handleRemoveWalledGarden}
                  disabled={wgActionLoading || wgLoading}
                  className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                >
                  <Trash2 size={13} />
                  <span>Cabut Bypass</span>
                </button>
              ) : <div />}

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowWalledGardenModal(false)}
                  disabled={wgActionLoading}
                  className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-40"
                >
                  Tutup
                </button>

                <button
                  type="button"
                  onClick={handleSetupWalledGarden}
                  disabled={!wgRouterId || wgActionLoading || wgLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <ShieldCheck size={15} className={wgActionLoading ? 'animate-spin' : ''} />
                  <span>
                    {wgActionLoading 
                      ? 'Sedang Memasang...' 
                      : (wgStatus?.is_configured ? '⚡ Perbarui Rule Bypass' : '⚡ Pasang Walled Garden ke MikroTik')
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

