import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Globe, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Zap, 
  Clock, 
  Tag, 
  ShieldCheck, 
  Layers,
  Calendar,
  Hourglass,
  HardDrive,
  Info,
  Code,
  UserCheck,
  ToggleLeft,
  ToggleRight,
  Users,
  Server,
  ShieldAlert
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { encodeIso8601, parseIso8601, isoToMikrotikTime, mikrotikTimeToIso, formatUptimeDisplay, isValidIso8601Duration } from '../utils/iso8601';
import { getPackagesFromFirestore } from '../services/firebaseService';
import { getApiUrl } from '../config/api';
import { IsoDurationInput } from './IsoDurationInput';

export interface PackageItem {
  id: string;
  name: string;
  type: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher' | string;
  price: number;
  speed_limit: string;
  validity_days?: number;
  validity_unit?: 'month' | 'day' | 'hour' | 'minute' | string;
  validity_value?: number;
  validity_iso?: string;
  grace_period_days?: number;
  grace_period_iso?: string;
  only_one_user?: boolean;
  lock_server?: boolean;
  expired_mode?: string;
  uptime_limit?: string;
  quota_mb?: number;
  mikrotik_profile?: string;
  shared_users?: number;
  is_active?: boolean;
  created_at?: string;
}

interface PackageManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function PackageManagement({ profile, t, onLogout }: PackageManagementProps) {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State (Hybrid Model)
  const [name, setName] = useState('');
  const [type, setType] = useState<'pppoe' | 'hotspot_monthly' | 'hotspot_voucher'>('pppoe');
  const [price, setPrice] = useState<string>('150000');
  const [speedLimit, setSpeedLimit] = useState('10M/10M');

  // Validity Duration
  const [validityValue, setValidityValue] = useState<string>('1');
  const [validityUnit, setValidityUnit] = useState<'month' | 'day' | 'hour' | 'minute'>('month');
  const [validityIso, setValidityIso] = useState<string>('P1M');
  const [isAdvancedIso, setIsAdvancedIso] = useState<boolean>(false);

  // Grace Period & Options
  const [gracePeriodValue, setGracePeriodValue] = useState<string>('15');
  const [gracePeriodUnit, setGracePeriodUnit] = useState<'day' | 'hour'>('day');
  const [gracePeriodIso, setGracePeriodIso] = useState<string>('P15D');
  const [onlyOneUser, setOnlyOneUser] = useState<boolean>(false);
  const [lockServer, setLockServer] = useState<boolean>(false);
  const [expiredMode, setExpiredMode] = useState<string>('rem');

  // Hotspot extras
  const [uptimeLimit, setUptimeLimit] = useState<string>('3h');
  const [quotaMb, setQuotaMb] = useState<string>('');
  const [sharedUsers, setSharedUsers] = useState<string>('1');

  // Validation States for Durations
  const [validityValid, setValidityValid] = useState<boolean>(true);
  const [gracePeriodValid, setGracePeriodValid] = useState<boolean>(true);
  const [uptimeValid, setUptimeValid] = useState<boolean>(true);

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

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl() || getApiUrl();
      let fetched = false;

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/packages`);
          const data = await parseJsonResponse(res);
          if (data.success && Array.isArray(data.packages)) {
            setPackages(data.packages);
            fetched = true;
          }
        } catch (apiErr) {
          console.warn('Backend API fetch failed, falling back to direct Firebase Firestore:', apiErr);
        }
      }

      if (!fetched) {
        const fbData = await getPackagesFromFirestore();
        if (fbData.success && Array.isArray(fbData.packages)) {
          setPackages(fbData.packages as any);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch packages:', err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchPackages();
  }, []);

  // Sync ISO-8601 live when standard inputs change
  useEffect(() => {
    if (!isAdvancedIso) {
      const computed = encodeIso8601(parseInt(validityValue) || 1, validityUnit);
      setValidityIso(computed);
    }
  }, [validityValue, validityUnit, isAdvancedIso]);

  useEffect(() => {
    const computedGrace = gracePeriodUnit === 'day' 
      ? `P${parseInt(gracePeriodValue) || 5}D` 
      : `PT${parseInt(gracePeriodValue) || 6}H`;
    setGracePeriodIso(computedGrace);
  }, [gracePeriodValue, gracePeriodUnit]);

  const resetForm = () => {
    setName('');
    setType('pppoe');
    setPrice('150000');
    setSpeedLimit('10M/10M');
    setValidityValue('1');
    setValidityUnit('month');
    setValidityIso('P1M');
    setIsAdvancedIso(false);
    setGracePeriodValue('15');
    setGracePeriodUnit('day');
    setGracePeriodIso('P15D');
    setOnlyOneUser(false);
    setLockServer(false);
    setExpiredMode('rem');
    setUptimeLimit('');
    setQuotaMb('');
    setSharedUsers('1');
    setValidityValid(true);
    setGracePeriodValid(true);
    setUptimeValid(true);
  };

  const handleTypeChange = (newType: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher') => {
    setType(newType);
    if (newType === 'pppoe') {
      setValidityIso('P1M');
      setGracePeriodIso('P15D');
      setPrice('150000');
      setSpeedLimit('10M/10M');
      setOnlyOneUser(false);
      setLockServer(false);
      setExpiredMode('rem');
      setUptimeLimit('');
      setSharedUsers('1');
    } else if (newType === 'hotspot_monthly') {
      setValidityIso('P1M');
      setGracePeriodIso('P5D');
      setPrice('50000');
      setSpeedLimit('5M/5M');
      setUptimeLimit('');
      setOnlyOneUser(false);
      setLockServer(false);
      setExpiredMode('rem');
      setSharedUsers('1');
    } else {
      setValidityIso('PT3H');
      setGracePeriodIso('P1D');
      setPrice('5000');
      setSpeedLimit('3M/3M');
      setUptimeLimit('PT3H');
      setOnlyOneUser(true);
      setLockServer(true);
      setExpiredMode('rem');
      setSharedUsers('1');
    }
    setValidityValid(true);
    setGracePeriodValid(true);
    setUptimeValid(true);
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price || !type) {
      setToastMsg({ type: 'error', text: 'Nama paket, tipe, dan harga wajib diisi!' });
      return;
    }

    // Validasi ketat format ISO-8601 Duration
    if (!validityValid || !isValidIso8601Duration(validityIso)) {
      setToastMsg({ type: 'error', text: 'Format Masa Aktif ISO-8601 tidak valid! Contoh: PT1H, P1D, P1DT6H' });
      return;
    }

    if ((type === 'pppoe' || type === 'hotspot_monthly') && (!gracePeriodValid || !isValidIso8601Duration(gracePeriodIso))) {
      setToastMsg({ type: 'error', text: 'Format Masa Tenggang ISO-8601 tidak valid! Contoh: P15D, P5D' });
      return;
    }

    const cleanUptime = uptimeLimit?.trim() ? (mikrotikTimeToIso(uptimeLimit.trim()) || uptimeLimit.trim()) : null;
    if ((type === 'hotspot_voucher' || type === 'hotspot_monthly') && cleanUptime && (!uptimeValid || !isValidIso8601Duration(cleanUptime))) {
      setToastMsg({ type: 'error', text: 'Format Limit Uptime ISO-8601 tidak valid! Contoh: PT3H, 3h, PT30M' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error('Fitur ini memerlukan koneksi API Server.');
      const res = await fetch(`${apiUrl}/api/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          price: parseFloat(price),
          speed_limit: speedLimit.trim(),
          validity_iso: validityIso,
          grace_period_iso: (type === 'pppoe' || type === 'hotspot_monthly') ? gracePeriodIso : 'P1D',
          only_one_user: onlyOneUser,
          lock_server: lockServer,
          expired_mode: expiredMode,
          uptime_limit: cleanUptime,
          quota_mb: quotaMb ? parseInt(quotaMb) : null,
          shared_users: parseInt(sharedUsers) || 1
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || `Paket "${name}" berhasil dibuat!` });
        setShowAddModal(false);
        resetForm();
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat paket internet.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal membuat paket: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (pkg: PackageItem) => {
    setEditingPackage(pkg);
    setName(pkg.name);
    setType(pkg.type as any);
    setPrice(pkg.price.toString());
    setSpeedLimit(pkg.speed_limit);

    setValidityIso(pkg.validity_iso || 'P1M');
    setGracePeriodIso(pkg.grace_period_iso || 'P15D');
    setUptimeLimit(pkg.uptime_limit || '');

    setOnlyOneUser(Boolean(pkg.only_one_user));
    setLockServer(Boolean(pkg.lock_server));
    setExpiredMode(pkg.expired_mode || 'rem');
    setQuotaMb(pkg.quota_mb ? pkg.quota_mb.toString() : '');
    setSharedUsers((pkg.shared_users || 1).toString());

    setValidityValid(true);
    setGracePeriodValid(true);
    setUptimeValid(true);
    setShowEditModal(true);
  };

  const handleUpdatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage || !name.trim() || !price || !type) {
      setToastMsg({ type: 'error', text: 'Nama paket, tipe, dan harga wajib diisi!' });
      return;
    }

    // Validasi ketat format ISO-8601 Duration
    if (!validityValid || !isValidIso8601Duration(validityIso)) {
      setToastMsg({ type: 'error', text: 'Format Masa Aktif ISO-8601 tidak valid! Contoh: PT1H, P1D, P1DT6H' });
      return;
    }

    if ((type === 'pppoe' || type === 'hotspot_monthly') && (!gracePeriodValid || !isValidIso8601Duration(gracePeriodIso))) {
      setToastMsg({ type: 'error', text: 'Format Masa Tenggang ISO-8601 tidak valid! Contoh: P15D, P5D' });
      return;
    }

    const cleanUptime = uptimeLimit?.trim() ? (mikrotikTimeToIso(uptimeLimit.trim()) || uptimeLimit.trim()) : null;
    if ((type === 'hotspot_voucher' || type === 'hotspot_monthly') && cleanUptime && (!uptimeValid || !isValidIso8601Duration(cleanUptime))) {
      setToastMsg({ type: 'error', text: 'Format Limit Uptime ISO-8601 tidak valid! Contoh: PT3H, 3h, PT30M' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error('Fitur ini memerlukan koneksi API Server.');
      const res = await fetch(`${apiUrl}/api/packages/${editingPackage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          price: parseFloat(price),
          speed_limit: speedLimit.trim(),
          validity_iso: validityIso,
          grace_period_iso: (type === 'pppoe' || type === 'hotspot_monthly') ? gracePeriodIso : 'P1D',
          only_one_user: onlyOneUser,
          lock_server: lockServer,
          expired_mode: expiredMode,
          uptime_limit: cleanUptime,
          quota_mb: quotaMb ? parseInt(quotaMb) : null,
          shared_users: parseInt(sharedUsers) || 1
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || `Paket "${name}" berhasil diperbarui!` });
        setShowEditModal(false);
        setEditingPackage(null);
        resetForm();
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui paket.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal memperbarui paket: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeletePackage = async (pkg: PackageItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus Paket Internet "${pkg.name}"?`)) return;

    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error('Fitur ini memerlukan koneksi API Server.');
      const res = await fetch(`${apiUrl}/api/packages/${pkg.id}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || 'Paket berhasil dihapus.' });
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus paket.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus paket.' });
    }
  };

  const handleTogglePackageStatus = async (pkg: PackageItem) => {
    const newStatus = pkg.is_active === false ? true : false;
    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error('Fitur ini memerlukan koneksi API Server.');
      const res = await fetch(`${apiUrl}/api/packages/${pkg.id}/toggle-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_active: newStatus } : p));
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengubah status paket.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal mengubah status paket.' });
    }
  };

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          pkg.speed_limit.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || pkg.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Manajemen Paket Internet (Hybrid ISO-8601 Model)"
        subtitle={`Pengaturan Paket Internet: UI Mudah + Standar ISO-8601 (P1M, P30D, PT12H, P1DT6H) & Only-One User Lock`}
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

        {/* Action & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama paket, speed limit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Tipe Paket</option>
              <option value="pppoe">🌐 PPPoE Bulanan</option>
              <option value="hotspot_monthly">📶 Hotspot Bulanan Member</option>
              <option value="hotspot_voucher">🎟️ Hotspot Voucher Jam/Hari</option>
            </select>

            <button
              onClick={fetchPackages}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Paket"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} />
              <span>+ Buat Paket Internet Baru</span>
            </button>
          </div>
        </div>

        {/* Package Grid */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil daftar paket internet...</span>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada paket internet terdaftar. Klik "+ Buat Paket Internet Baru" untuk menambahkan paket.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPackages.map((pkg) => {
              const parsedV = parseIso8601(pkg.validity_iso || encodeIso8601(pkg.validity_value || 1, pkg.validity_unit || 'month'));
              const parsedG = parseIso8601(pkg.grace_period_iso || `P${pkg.grace_period_days || 15}D`);

              return (
                <div 
                  key={pkg.id}
                  className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
                >
                  <div>
                    {/* Category Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${
                        pkg.type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                        pkg.type === 'hotspot_monthly' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {pkg.type === 'pppoe' ? <Globe size={12} /> : <Wifi size={12} />}
                        <span>
                          {pkg.type === 'pppoe' ? 'PPPoE Bulanan' : 
                           pkg.type === 'hotspot_monthly' ? 'Hotspot Member' : 
                           'Hotspot Voucher'}
                        </span>
                      </span>

                      <span className="text-xs font-mono font-extrabold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                        {pkg.speed_limit}
                      </span>
                    </div>

                    <h3 className="font-sans font-bold text-slate-800 text-lg group-hover:text-[#2563EB] transition-colors">{pkg.name}</h3>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      Rp {Number(pkg.price).toLocaleString('id-ID')}
                      <span className="text-xs font-normal text-slate-400 ml-1">/ {parsedV.human}</span>
                    </div>
                  </div>

                  {/* Details Box */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
                    {/* ISO-8601 Duration Badge */}
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Calendar size={14} className="text-blue-500" />
                        Masa Aktif (ISO)
                      </span>
                      <span className="font-mono font-extrabold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                        {parsedV.raw} ({parsedV.human})
                      </span>
                    </div>

                    {/* Only One User Lock Badge */}
                    {pkg.only_one_user && (
                      <div className="flex items-center justify-between text-indigo-800 bg-indigo-50/90 px-2.5 py-1 rounded-xl border border-indigo-200">
                        <span className="flex items-center gap-1.5 font-bold text-[11px]">
                          <UserCheck size={13} className="text-indigo-600" />
                          Single User Lock
                        </span>
                        <span className="font-extrabold text-[10px] text-indigo-900 uppercase tracking-wider bg-indigo-100 px-2 py-0.5 rounded">
                          Only One Active
                        </span>
                      </div>
                    )}

                    {/* Grace Period for PPPoE / Rumahan */}
                    {(pkg.type === 'pppoe' || pkg.type === 'hotspot_monthly') && (
                      <div className="flex items-center justify-between text-amber-700 bg-amber-50/80 px-2.5 py-1.5 rounded-xl border border-amber-200/80">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Hourglass size={14} className="text-amber-600" />
                          Masa Tenggang (ISO)
                        </span>
                        <span className="font-mono font-extrabold text-amber-900">{parsedG.raw} ({parsedG.human})</span>
                      </div>
                    )}

                    {/* Uptime Limit, Quota & Shared Users for Hotspot */}
                    {(pkg.type === 'hotspot_voucher' || pkg.type === 'hotspot_monthly') && (
                      <>
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Users size={14} className="text-sky-500" />
                            Shared Users (Multi-User)
                          </span>
                          <span className="font-extrabold text-sky-700 font-mono bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                            {pkg.shared_users || 1} User
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Clock size={14} className="text-emerald-500" />
                            Limit Uptime / Masa Pakai
                          </span>
                          <span className="font-bold text-slate-800 font-mono">{formatUptimeDisplay(pkg.uptime_limit)}</span>
                        </div>

                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center gap-1.5 font-medium">
                            <HardDrive size={14} className="text-purple-500" />
                            Limit Kuota Data
                          </span>
                          <span className={`font-extrabold font-mono ${pkg.quota_mb ? 'text-purple-700' : 'text-emerald-600'}`}>
                            {pkg.quota_mb ? `${pkg.quota_mb} MB` : 'Unlimited'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleTogglePackageStatus(pkg)}
                      className={`px-3 py-1.5 font-bold text-xs rounded-xl transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                        pkg.is_active !== false
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-300'
                      }`}
                      title={pkg.is_active !== false ? 'Klik untuk menonaktifkan paket ini (semua profil terkait akan disembunyikan dari user)' : 'Klik untuk mengaktifkan paket ini'}
                    >
                      {pkg.is_active !== false ? (
                        <>
                          <CheckCircle2 size={13} className="text-emerald-600" />
                          <span>Paket Aktif</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={13} className="text-slate-400" />
                          <span>Nonaktif</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(pkg)}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1.5"
                      >
                        <Edit size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDeletePackage(pkg)}
                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-rose-200 inline-flex items-center gap-1.5"
                      >
                        <Trash2 size={13} />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Tambah Paket Internet Baru (Hybrid ISO-8601) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Buat Paket Internet Baru</h3>
                  <p className="text-xs text-slate-400">Pilihan Lengkap: Satuan Tunggal, Komposit (Hari + Jam), & ISO Manual</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreatePackage} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Paket Internet *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('pppoe')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      type === 'pppoe' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Globe size={14} />
                    <span>PPPoE Bulanan</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('hotspot_monthly')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      type === 'hotspot_monthly' ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Wifi size={14} />
                    <span>Hotspot Member</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('hotspot_voucher')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      type === 'hotspot_voucher' ? 'bg-amber-600 text-white border-amber-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Zap size={14} />
                    <span>Voucher Jam/Hari</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Paket Internet *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Paket Home Unlimited 10Mbps"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Harga Paket (Rp) *</label>
                  <input
                    type="number"
                    required
                    placeholder="150000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Speed Limit / Bandwidth *</label>
                  <input
                    type="text"
                    required
                    placeholder="10M/10M"
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Format Mikrotik: Rx/Tx (Contoh: 10M/10M)</span>
                </div>
              </div>

              {/* MASA AKTIF ISO-8601 */}
              <IsoDurationInput
                label="Masa Aktif Paket Internet (ISO-8601)"
                icon={Calendar}
                value={validityIso}
                themeColor="blue"
                allowMonth={type !== 'hotspot_voucher'}
                onChange={(val, valid) => {
                  setValidityIso(val);
                  setValidityValid(valid);
                }}
              />

              {/* MASA TENGGANG ISOLIR ISO-8601 FOR PPPOE / RUMAHAN */}
              {(type === 'pppoe' || type === 'hotspot_monthly') && (
                <IsoDurationInput
                  label="Masa Tenggang Toleransi Isolir (ISO-8601)"
                  icon={Hourglass}
                  value={gracePeriodIso}
                  themeColor="amber"
                  allowMonth={false}
                  onChange={(val, valid) => {
                    setGracePeriodIso(val);
                    setGracePeriodValid(valid);
                  }}
                />
              )}

              {/* ONLY ONE USER LOCK OPTION */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <UserCheck size={15} className="text-indigo-600" />
                    Only One User Lock (Satu User Aktif)
                  </span>
                  <p className="text-[11px] text-indigo-700">
                    Hanya 1 perangkat/user aktif yang diizinkan mengkoneksikan paket ini secara bersamaan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyOneUser(!onlyOneUser)}
                  className={`p-1 transition-colors rounded-xl cursor-pointer ${onlyOneUser ? 'text-indigo-600' : 'text-slate-300'}`}
                >
                  {onlyOneUser ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>

              {/* LOCK SERVER OPTION (HOTSPOT) */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                      <Server size={15} className="text-sky-600" />
                      Lock Server (Kunci Server Hotspot)
                    </span>
                    <p className="text-[11px] text-sky-700">
                      Kunci voucher hanya dapat digunakan pada server hotspot tempat pertama kali login.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLockServer(!lockServer)}
                    className={`p-1 transition-colors rounded-xl cursor-pointer ${lockServer ? 'text-sky-600' : 'text-slate-300'}`}
                  >
                    {lockServer ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              )}

              {/* EXPIRED MODE DROPDOWN (HOTSPOT) */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                  <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <ShieldAlert size={15} className="text-amber-600" />
                    Pilihan Expired Mode (Masa Aktif Habis):
                  </label>
                  <select
                    value={expiredMode}
                    onChange={(e) => setExpiredMode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs font-sans font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                  >
                    <option value="rem">🗑️ Remove (Otomatis hapus user voucher dari Mikrotik saat expired)</option>
                    <option value="ntf">⚠️ Notice (Kunci user limit-uptime=1s agar muncul notifikasi expired)</option>
                    <option value="remc">📋 Remove & Record (Hapus user dan catat ke system script Mikrotik)</option>
                    <option value="ntfc">📝 Notice & Record (Kunci notice dan catat ke system script Mikrotik)</option>
                    <option value="0">♾️ Tanpa Expired / Unlimited (Tidak ada kadaluarsa)</option>
                  </select>
                  <p className="text-[10px] text-amber-700">
                    Aksi yang dieksekusi otomatis oleh skrip scheduler Mikrotik saat voucher mencapai batas waktu.
                  </p>
                </div>
              )}

              {/* UPTIME LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <IsoDurationInput
                  label="Limit Uptime / Masa Pakai Voucher (MikroTik)"
                  icon={Clock}
                  value={uptimeLimit}
                  themeColor="emerald"
                  allowEmpty={true}
                  emptyLabel="Tanpa Batas Masa Pakai (Mengikuti Masa Aktif)"
                  allowMonth={false}
                  onChange={(val, valid) => {
                    setUptimeLimit(val);
                    setUptimeValid(valid);
                  }}
                />
              )}

              {/* SHARED USERS & QUOTA LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Users size={13} className="text-sky-600" />
                      Shared Users (Mikrotik) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={sharedUsers}
                      onChange={(e) => setSharedUsers(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Batas user bersamaan</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <HardDrive size={13} className="text-purple-600" />
                      Limit Kuota Data (MB)
                    </label>
                    <input
                      type="number"
                      placeholder="Contoh: 1000 (1 GB)"
                      value={quotaMb}
                      onChange={(e) => setQuotaMb(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Kosongkan jika unlimited</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Paket Internet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Paket Internet (Hybrid ISO-8601) */}
      {showEditModal && editingPackage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Paket Internet</h3>
                  <p className="text-xs text-slate-500">Pilihan Lengkap: Satuan Tunggal, Komposit (Hari + Jam), & ISO Manual</p>
                </div>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditingPackage(null); }} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleUpdatePackage} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Paket Internet *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Harga Paket (Rp) *</label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Speed Limit / Bandwidth *</label>
                  <input
                    type="text"
                    required
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* MASA AKTIF ISO-8601 */}
              <IsoDurationInput
                label="Masa Aktif Paket Internet (ISO-8601)"
                icon={Calendar}
                value={validityIso}
                themeColor="indigo"
                allowMonth={type !== 'hotspot_voucher'}
                onChange={(val, valid) => {
                  setValidityIso(val);
                  setValidityValid(valid);
                }}
              />

              {/* MASA TENGGANG ISOLIR ISO-8601 FOR PPPOE / RUMAHAN */}
              {(type === 'pppoe' || type === 'hotspot_monthly') && (
                <IsoDurationInput
                  label="Masa Tenggang Toleransi Isolir (ISO-8601)"
                  icon={Hourglass}
                  value={gracePeriodIso}
                  themeColor="amber"
                  allowMonth={false}
                  onChange={(val, valid) => {
                    setGracePeriodIso(val);
                    setGracePeriodValid(valid);
                  }}
                />
              )}

              {/* ONLY ONE USER LOCK OPTION */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <UserCheck size={15} className="text-indigo-600" />
                    Only One User Lock (Satu User Aktif)
                  </span>
                  <p className="text-[11px] text-indigo-700">
                    Hanya 1 perangkat/user aktif yang diizinkan mengkoneksikan paket ini secara bersamaan.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyOneUser(!onlyOneUser)}
                  className={`p-1 transition-colors rounded-xl cursor-pointer ${onlyOneUser ? 'text-indigo-600' : 'text-slate-300'}`}
                >
                  {onlyOneUser ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>

              {/* LOCK SERVER OPTION (HOTSPOT) */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                      <Server size={15} className="text-sky-600" />
                      Lock Server (Kunci Server Hotspot)
                    </span>
                    <p className="text-[11px] text-sky-700">
                      Kunci voucher hanya dapat digunakan pada server hotspot tempat pertama kali login.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLockServer(!lockServer)}
                    className={`p-1 transition-colors rounded-xl cursor-pointer ${lockServer ? 'text-sky-600' : 'text-slate-300'}`}
                  >
                    {lockServer ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                  </button>
                </div>
              )}

              {/* EXPIRED MODE DROPDOWN (HOTSPOT) */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                  <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <ShieldAlert size={15} className="text-amber-600" />
                    Pilihan Expired Mode (Masa Aktif Habis):
                  </label>
                  <select
                    value={expiredMode}
                    onChange={(e) => setExpiredMode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-xs font-sans font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                  >
                    <option value="rem">🗑️ Remove (Otomatis hapus user voucher dari Mikrotik saat expired)</option>
                    <option value="ntf">⚠️ Notice (Kunci user limit-uptime=1s agar muncul notifikasi expired)</option>
                    <option value="remc">📋 Remove & Record (Hapus user dan catat ke system script Mikrotik)</option>
                    <option value="ntfc">📝 Notice & Record (Kunci notice dan catat ke system script Mikrotik)</option>
                    <option value="0">♾️ Tanpa Expired / Unlimited (Tidak ada kadaluarsa)</option>
                  </select>
                  <p className="text-[10px] text-amber-700">
                    Aksi yang dieksekusi otomatis oleh skrip scheduler Mikrotik saat voucher mencapai batas waktu.
                  </p>
                </div>
              )}

              {/* UPTIME LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <IsoDurationInput
                  label="Limit Uptime / Masa Pakai Voucher (MikroTik)"
                  icon={Clock}
                  value={uptimeLimit}
                  themeColor="emerald"
                  allowEmpty={true}
                  emptyLabel="Tanpa Batas Masa Pakai (Mengikuti Masa Aktif)"
                  allowMonth={false}
                  onChange={(val, valid) => {
                    setUptimeLimit(val);
                    setUptimeValid(valid);
                  }}
                />
              )}

              {/* SHARED USERS & QUOTA LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Users size={13} className="text-sky-600" />
                      Shared Users (Mikrotik) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={sharedUsers}
                      onChange={(e) => setSharedUsers(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Batas user bersamaan</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <HardDrive size={13} className="text-purple-600" />
                      Limit Kuota Data (MB)
                    </label>
                    <input
                      type="number"
                      placeholder="Contoh: 1000 (1 GB)"
                      value={quotaMb}
                      onChange={(e) => setQuotaMb(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Kosongkan jika unlimited</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => { setShowEditModal(false); setEditingPackage(null); }} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
