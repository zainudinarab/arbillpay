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
  Users
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { encodeIso8601, parseIso8601 } from '../utils/iso8601';

export interface PackageItem {
  id: string;
  name: string;
  type: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher' | string;
  price: number;
  speed_limit: string;
  validity_days: number;
  validity_unit?: 'month' | 'day' | 'hour' | 'minute' | string;
  validity_value?: number;
  validity_iso?: string;
  grace_period_days?: number;
  grace_period_iso?: string;
  only_one_user?: boolean;
  uptime_limit?: string;
  quota_mb?: number;
  mikrotik_profile?: string;
  shared_users?: number;
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

  // Hotspot extras
  const [uptimeLimit, setUptimeLimit] = useState<string>('3h');
  const [quotaMb, setQuotaMb] = useState<string>('');
  const [sharedUsers, setSharedUsers] = useState<string>('1');

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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/packages`);
      const data = await parseJsonResponse(res);

      if (data.success && Array.isArray(data.packages)) {
        setPackages(data.packages);
      }
    } catch (err: any) {
      console.error('Failed to fetch packages:', err);
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memuat paket internet.' });
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
    setUptimeLimit('3h');
    setQuotaMb('');
    setSharedUsers('1');
  };

  const handleTypeChange = (newType: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher') => {
    setType(newType);
    if (newType === 'pppoe') {
      setValidityValue('1');
      setValidityUnit('month');
      setValidityIso('P1M');
      setGracePeriodValue('15');
      setGracePeriodUnit('day');
      setOnlyOneUser(true);
      setSharedUsers('1');
    } else if (newType === 'hotspot_monthly') {
      setValidityValue('1');
      setValidityUnit('month');
      setValidityIso('P1M');
      setGracePeriodValue('5');
      setGracePeriodUnit('day');
      setUptimeLimit('30d');
      setOnlyOneUser(false);
      setSharedUsers('1');
    } else {
      setValidityValue('3');
      setValidityUnit('hour');
      setValidityIso('PT3H');
      setPrice('5000');
      setUptimeLimit('3h');
      setOnlyOneUser(false);
      setSharedUsers('1');
    }
  };

  const handleCreatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price || !type) {
      setToastMsg({ type: 'error', text: 'Nama paket, tipe, dan harga wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          price: parseFloat(price),
          speed_limit: speedLimit.trim(),
          validity_value: parseInt(validityValue) || 1,
          validity_unit: validityUnit,
          validity_iso: validityIso,
          grace_period_days: parseInt(gracePeriodValue) || 5,
          grace_period_iso: gracePeriodIso,
          only_one_user: onlyOneUser,
          uptime_limit: uptimeLimit.trim() || null,
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

    const parsedIso = parseIso8601(pkg.validity_iso || encodeIso8601(pkg.validity_value || 1, pkg.validity_unit || 'month'));
    setValidityValue((pkg.validity_value || parsedIso.val || 1).toString());
    setValidityUnit((pkg.validity_unit as any) || parsedIso.unit || 'month');
    setValidityIso(pkg.validity_iso || parsedIso.raw);
    setIsAdvancedIso(parsedIso.unit === 'custom');

    const parsedGrace = parseIso8601(pkg.grace_period_iso || `P${pkg.grace_period_days || 15}D`);
    setGracePeriodValue((pkg.grace_period_days || parsedGrace.val || 15).toString());
    setGracePeriodUnit((parsedGrace.unit === 'hour' ? 'hour' : 'day') as any);
    setGracePeriodIso(pkg.grace_period_iso || parsedGrace.raw);

    setOnlyOneUser(Boolean(pkg.only_one_user));
    setUptimeLimit(pkg.uptime_limit || '3h');
    setQuotaMb(pkg.quota_mb ? pkg.quota_mb.toString() : '');
    setSharedUsers((pkg.shared_users || 1).toString());
    setShowEditModal(true);
  };

  const handleUpdatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage || !name.trim() || !price || !type) {
      setToastMsg({ type: 'error', text: 'Nama paket, tipe, dan harga wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/packages/${editingPackage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          price: parseFloat(price),
          speed_limit: speedLimit.trim(),
          validity_value: parseInt(validityValue) || 1,
          validity_unit: validityUnit,
          validity_iso: validityIso,
          grace_period_days: parseInt(gracePeriodValue) || 5,
          grace_period_iso: gracePeriodIso,
          only_one_user: onlyOneUser,
          uptime_limit: uptimeLimit.trim() || null,
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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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
                          <span className="font-bold text-slate-800 font-mono">{pkg.uptime_limit || 'Tanpa Limit'}</span>
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
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Tambah Paket Internet Baru (Hybrid ISO-8601) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Buat Paket Internet Baru</h3>
                  <p className="text-xs text-slate-400">Model Hybrid: UI Mudah + Format Standar ISO-8601 (P1M, P30D, PT12H)</p>
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

              {/* MASA AKTIF HYBRID (UI DROPDOWN + ISO-8601 DURATION) */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-600" />
                    Masa Aktif (Format ISO-8601 Duration):
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsAdvancedIso(!isAdvancedIso)}
                    className="text-[10px] font-extrabold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                  >
                    <Code size={12} />
                    <span>{isAdvancedIso ? 'Kembali ke Dropdown' : 'Mode ISO Lanjutan'}</span>
                  </button>
                </div>

                {!isAdvancedIso ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Jumlah Durasi</label>
                      <input
                        type="number"
                        required
                        min="1"
                        placeholder="1"
                        value={validityValue}
                        onChange={(e) => setValidityValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Satuan Masa Aktif</label>
                      <select
                        value={validityUnit}
                        onChange={(e) => setValidityUnit(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                      >
                        <option value="month">📅 Bulan Kalender (ISO: P1M)</option>
                        <option value="day">📆 Hari (ISO: P30D)</option>
                        <option value="hour">⏱️ Jam (ISO: PT12H)</option>
                        <option value="minute">⚡ Menit (ISO: PT30M)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Format ISO-8601 (Kombinasi Bebas)</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: P1M, P30D, PT12H, P1DT6H"
                      value={validityIso}
                      onChange={(e) => setValidityIso(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 bg-white border border-blue-300 rounded-xl text-xs font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                    <span className="text-[10px] text-blue-700 mt-1 block">Contoh: P30D (30 hari), P1M (1 bulan), PT12H (12 jam), P1DT6H (1 hari 6 jam)</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs font-mono text-blue-900 bg-white/80 p-2.5 rounded-xl border border-blue-200/60">
                  <span>Hasil Format ISO: <strong className="text-blue-700">{validityIso}</strong></span>
                  <span className="text-[11px] font-sans text-slate-600">({parseIso8601(validityIso).human})</span>
                </div>
              </div>

              {/* MASA TENGGANG ISOLIR ISO-8601 FOR PPPOE / RUMAHAN */}
              {(type === 'pppoe' || type === 'hotspot_monthly') && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                  <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Hourglass size={15} className="text-amber-600" />
                    Masa Tenggang Toleransi Isolir (ISO-8601):
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Durasi Toleransi</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="15"
                        value={gracePeriodValue}
                        onChange={(e) => setGracePeriodValue(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Satuan Toleransi</label>
                      <select
                        value={gracePeriodUnit}
                        onChange={(e) => setGracePeriodUnit(e.target.value as any)}
                        className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-xs font-sans font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                      >
                        <option value="day">📆 Hari (Misal: P15D, P3D)</option>
                        <option value="hour">⏱️ Jam (Misal: PT6H, PT12H)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-amber-900 bg-white/80 p-2.5 rounded-xl border border-amber-200/60">
                    <span>Hasil Masa Tenggang ISO: <strong className="text-amber-800">{gracePeriodIso}</strong></span>
                    <span className="text-[11px] font-sans text-slate-600">({parseIso8601(gracePeriodIso).human})</span>
                  </div>
                </div>
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

              {/* UPTIME, QUOTA & SHARED USERS LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
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
                      <Clock size={13} className="text-emerald-600" />
                      Limit Uptime / Masa Pakai
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 3h, 12h, 1d, 30d"
                      value={uptimeLimit}
                      onChange={(e) => setUptimeLimit(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
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
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Paket Internet</h3>
                  <p className="text-xs text-slate-500">Perbarui durasi ISO-8601, masa tenggang, atau status single user</p>
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

              {/* MASA AKTIF HYBRID (UI DROPDOWN + ISO-8601 DURATION) */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-600" />
                    Masa Aktif (Format ISO-8601 Duration):
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsAdvancedIso(!isAdvancedIso)}
                    className="text-[10px] font-extrabold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                  >
                    <Code size={12} />
                    <span>{isAdvancedIso ? 'Kembali ke Dropdown' : 'Mode ISO Lanjutan'}</span>
                  </button>
                </div>

                {!isAdvancedIso ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Jumlah Durasi</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={validityValue}
                        onChange={(e) => setValidityValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Satuan Masa Aktif</label>
                      <select
                        value={validityUnit}
                        onChange={(e) => setValidityUnit(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      >
                        <option value="month">📅 Bulan Kalender (ISO: P1M)</option>
                        <option value="day">📆 Hari (ISO: P30D)</option>
                        <option value="hour">⏱️ Jam (ISO: PT12H)</option>
                        <option value="minute">⚡ Menit (ISO: PT30M)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Format ISO-8601 (Kombinasi Bebas)</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: P1M, P30D, PT12H, P1DT6H"
                      value={validityIso}
                      onChange={(e) => setValidityIso(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 bg-white border border-blue-300 rounded-xl text-xs font-mono font-bold text-blue-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs font-mono text-blue-900 bg-white/80 p-2.5 rounded-xl border border-blue-200/60">
                  <span>Hasil Format ISO: <strong className="text-blue-700">{validityIso}</strong></span>
                  <span className="text-[11px] font-sans text-slate-600">({parseIso8601(validityIso).human})</span>
                </div>
              </div>

              {/* MASA TENGGANG ISOLIR ISO-8601 FOR PPPOE / RUMAHAN */}
              {(type === 'pppoe' || type === 'hotspot_monthly') && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                  <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Hourglass size={15} className="text-amber-600" />
                    Masa Tenggang Toleransi Isolir (ISO-8601):
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Durasi Toleransi</label>
                      <input
                        type="number"
                        min="1"
                        value={gracePeriodValue}
                        onChange={(e) => setGracePeriodValue(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Satuan Toleransi</label>
                      <select
                        value={gracePeriodUnit}
                        onChange={(e) => setGracePeriodUnit(e.target.value as any)}
                        className="w-full px-3.5 py-2 bg-white border border-amber-200 rounded-xl text-xs font-sans font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                      >
                        <option value="day">📆 Hari (ISO: P15D, P3D)</option>
                        <option value="hour">⏱️ Jam (ISO: PT6H, PT12H)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-amber-900 bg-white/80 p-2.5 rounded-xl border border-amber-200/60">
                    <span>Hasil Masa Tenggang ISO: <strong className="text-amber-800">{gracePeriodIso}</strong></span>
                    <span className="text-[11px] font-sans text-slate-600">({parseIso8601(gracePeriodIso).human})</span>
                  </div>
                </div>
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

              {/* UPTIME, QUOTA & SHARED USERS LIMIT FOR HOTSPOT */}
              {(type === 'hotspot_voucher' || type === 'hotspot_monthly') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
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
                      <Clock size={13} className="text-emerald-600" />
                      Limit Uptime / Masa Pakai
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 3h, 12h, 1d, 30d"
                      value={uptimeLimit}
                      onChange={(e) => setUptimeLimit(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
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
