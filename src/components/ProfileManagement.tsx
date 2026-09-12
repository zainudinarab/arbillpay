import { getApiUrl } from '../config/api';
import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Router as RouterIcon, 
  Server, 
  Globe, 
  Wifi, 
  Tag, 
  Link, 
  Unlink, 
  ShieldCheck, 
  Check, 
  Package,
  Plus,
  Edit,
  Trash2,
  Radio,
  Clock,
  Send,
  Info,
  Network,
  Sliders,
  Database,
  AlertTriangle,
  Users,
  Power,
  X,
  Calendar,
  Hourglass,
  UserCheck,
  ShieldAlert
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { formatUptimeDisplay, parseIso8601 } from '../utils/iso8601';

export interface RouterProfileJoined {
  id: string;
  router_id: string;
  name: string;
  type: 'pppoe' | 'hotspot' | string;
  rate_limit?: string;
  package_id?: string | null;
  local_address_mode?: 'manual' | 'pool' | string;
  local_address?: string | null;
  remote_address?: string | null;
  parent_queue?: string | null;
  dns_server?: string | null;
  synced_at?: string;
  is_synced: boolean;
  on_router?: boolean;
  is_active?: boolean;
  package_is_active?: boolean;
  router_name: string;
  router_ip: string;
  router_port: number;
  package_name?: string | null;
  package_price?: number | null;
  package_type?: string | null;
  package_speed_limit?: string | null;
}

export interface PackageOption {
  id: string;
  name: string;
  price: number;
  type: string;
  speed_limit?: string;
  validity_days?: number;
  validity_unit?: string;
  validity_value?: number;
  validity_iso?: string;
  uptime_limit?: string;
  quota_mb?: number;
  shared_users?: number;
  only_one_user?: boolean;
  lock_server?: boolean;
  expired_mode?: string;
  grace_period_days?: number;
  grace_period_iso?: string;
  is_active?: boolean;
}

export interface RouterOption {
  id: string;
  name: string;
  ip_address: string;
  api_port: number;
}

export interface IpPoolOption {
  id: string;
  router_id: string;
  name: string;
  ranges: string;
  gateway?: string;
}

interface ProfileManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function ProfileManagement({ profile, t, onLogout }: ProfileManagementProps) {
  const [profiles, setProfiles] = useState<RouterProfileJoined[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [routers, setRouters] = useState<RouterOption[]>([]);
  const [ipPools, setIpPools] = useState<IpPoolOption[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRouter, setFilterRouter] = useState<string>('all');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RouterProfileJoined | null>(null);

  // Delete Confirmation Modal State
  const [deletingProfile, setDeletingProfile] = useState<RouterProfileJoined | null>(null);
  const [deleteFromRouterCheckbox, setDeleteFromRouterCheckbox] = useState<boolean>(false);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [activeTab, setActiveTab] = useState<'general' | 'additional'>('general');
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'pppoe' | 'hotspot'>('pppoe');
  const [packageId, setPackageId] = useState<string>('');

  // PPP Specific Form Fields
  const [localAddressMode, setLocalAddressMode] = useState<'manual' | 'pool'>('manual');
  const [localAddressVal, setLocalAddressVal] = useState<string>('192.168.1.1');
  const [remoteAddressPool, setRemoteAddressPool] = useState<string>('');
  const [parentQueue, setParentQueue] = useState<string>('none');
  const [dnsServer, setDnsServer] = useState<string>('8.8.8.8, 8.8.4.4');

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
      const [resProf, resPkg, resRtr, resPool, resCust] = await Promise.all([
        fetch(`${apiUrl}/api/router-profiles`),
        fetch(`${apiUrl}/api/packages`),
        fetch(`${apiUrl}/api/routers`),
        fetch(`${apiUrl}/api/ip-pools`),
        fetch(`${apiUrl}/api/customers`)
      ]);

      const dataProf = await parseJsonResponse(resProf);
      const dataPkg = await parseJsonResponse(resPkg);
      const dataRtr = await parseJsonResponse(resRtr);
      const dataPool = await parseJsonResponse(resPool);
      const dataCust = await parseJsonResponse(resCust);

      if (dataProf.success && Array.isArray(dataProf.profiles)) {
        setProfiles(dataProf.profiles);
      }
      if (dataPkg.success && Array.isArray(dataPkg.packages)) {
        setPackages(dataPkg.packages);
      }
      if (dataRtr.success && Array.isArray(dataRtr.routers)) {
        setRouters(dataRtr.routers);
        if (dataRtr.routers.length > 0 && !selectedRouterId) {
          setSelectedRouterId(dataRtr.routers[0].id);
        }
      }
      if (dataPool.success && Array.isArray(dataPool.pools)) {
        setIpPools(dataPool.pools);
      }
      if (dataCust.success && Array.isArray(dataCust.customers)) {
        setCustomers(dataCust.customers);
      }
    } catch (err: any) {
      console.error('Failed to fetch profiles/packages:', err);
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memuat data profile Mikrotik.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAddModalForType = (targetType: 'pppoe' | 'hotspot') => {
    setActiveTab('general');
    setName('');
    setType(targetType);
    setPackageId('');
    setLocalAddressMode('manual');
    setLocalAddressVal('192.168.1.1');
    setRemoteAddressPool('');
    setParentQueue('none');
    setDnsServer('8.8.8.8, 8.8.4.4');
    if (routers.length > 0) setSelectedRouterId(routers[0].id);
    setShowAddModal(true);
  };

  // Package Filtering by Profile Type (PPP vs Hotspot)
  const availablePackages = packages.filter(pkg => {
    const pkgType = (pkg.type || '').toLowerCase();
    if (type === 'pppoe') {
      return pkgType === 'pppoe' || pkgType === 'subscription';
    } else {
      return pkgType.includes('hotspot') || pkgType.includes('voucher');
    }
  });

  // Filter IP Pools available for selected router
  const routerIpPools = ipPools.filter(p => p.router_id === selectedRouterId);

  // Map paket yang sudah dipakai oleh profile lain di router yang sama (1 Router = 1 Paket per Profile)
  const usedPackagesInSelectedRouter = React.useMemo(() => {
    const map = new Map<string, string>(); // package_id -> profile_name
    profiles.forEach(p => {
      if (p.router_id === selectedRouterId && p.package_id) {
        // Jika sedang edit, jangan hitung profile yang sedang diedit itu sendiri
        if (!editingProfile || p.id !== editingProfile.id) {
          map.set(p.package_id, p.name);
        }
      }
    });
    return map;
  }, [profiles, selectedRouterId, editingProfile]);

  const selectedPkgDetail = packages.find(p => p.id === packageId);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !name.trim() || !type) {
      setToastMsg({ type: 'error', text: 'Router, Nama Profile, dan Tipe wajib diisi!' });
      return;
    }

    if (packageId && usedPackagesInSelectedRouter.has(packageId)) {
      setToastMsg({
        type: 'error',
        text: `Paket ini sudah digunakan oleh profile "${usedPackagesInSelectedRouter.get(packageId)}" pada router ini. Dalam 1 router, satu paket hanya boleh dihubungkan ke 1 profile.`
      });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    const finalLocalAddress = localAddressMode === 'manual' ? localAddressVal.trim() : localAddressVal;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/router-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: selectedRouterId,
          name: name.trim(),
          type,
          package_id: packageId || null,
          local_address_mode: type === 'pppoe' ? localAddressMode : null,
          local_address: type === 'pppoe' ? (finalLocalAddress || null) : null,
          remote_address: type === 'pppoe' ? (remoteAddressPool || null) : null,
          parent_queue: type === 'pppoe' ? (parentQueue || null) : null,
          dns_server: type === 'pppoe' ? (dnsServer || null) : null
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowAddModal(false);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menambahkan profile.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal terhubung ke API Server.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (prof: RouterProfileJoined) => {
    setEditingProfile(prof);
    setSelectedRouterId(prof.router_id);
    setName(prof.name);
    setType(prof.type as any);
    setPackageId(prof.package_id || '');

    setLocalAddressMode((prof.local_address_mode as any) || 'manual');
    setLocalAddressVal(prof.local_address || '192.168.1.1');
    setRemoteAddressPool(prof.remote_address || '');
    setParentQueue(prof.parent_queue || 'none');
    setDnsServer(prof.dns_server || '8.8.8.8, 8.8.4.4');

    setActiveTab('general');
    setShowEditModal(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile || !name.trim() || !type) {
      setToastMsg({ type: 'error', text: 'Nama profile dan Tipe wajib diisi!' });
      return;
    }

    if (packageId && usedPackagesInSelectedRouter.has(packageId)) {
      setToastMsg({
        type: 'error',
        text: `Paket ini sudah digunakan oleh profile "${usedPackagesInSelectedRouter.get(packageId)}" pada router ini. Dalam 1 router, satu paket hanya boleh dihubungkan ke 1 profile.`
      });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    const finalLocalAddress = localAddressMode === 'manual' ? localAddressVal.trim() : localAddressVal;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/router-profiles/${editingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          package_id: packageId || null,
          local_address_mode: type === 'pppoe' ? localAddressMode : null,
          local_address: type === 'pppoe' ? (finalLocalAddress || null) : null,
          remote_address: type === 'pppoe' ? (remoteAddressPool || null) : null,
          parent_queue: type === 'pppoe' ? (parentQueue || null) : null,
          dns_server: type === 'pppoe' ? (dnsServer || null) : null
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowEditModal(false);
        setEditingProfile(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui profile.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memperbarui profile.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const executeDeleteProfile = async () => {
    if (!deletingProfile) return;
    setDeleteLoading(true);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/router-profiles/${deletingProfile.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_from_router: deleteFromRouterCheckbox })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || `Profile "${deletingProfile.name}" berhasil dihapus!` });
        setDeletingProfile(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus profile.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal menghapus profile: ${err?.message || 'Terjadi kesalahan sistem'}` });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleProfileStatus = async (prof: RouterProfileJoined) => {
    const currentActive = prof.is_active !== false;
    const newActive = !currentActive;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/router-profiles/${prof.id}/toggle-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ 
          type: 'success', 
          text: data.message || `Profile "${prof.name}" sekarang ${newActive ? 'Aktif (dapat tampil ke user)' : 'Nonaktif (disembunyikan dari user)'}.` 
        });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengubah status aktif profile.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal mengubah status: ${err?.message || 'Error'}` });
    }
  };

  const handlePushToMikrotik = async (prof: RouterProfileJoined) => {
    setPushingId(prof.id);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/router-profiles/${prof.id}/push-to-mikrotik`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menerbitkan profile ke Mikrotik.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal me-push profile: ${err?.message || 'Error'}` });
    } finally {
      setPushingId(null);
    }
  };

  const routerList = Array.from(new Set(profiles.map(p => p.router_name))).filter(Boolean);

  const pppoeCount = profiles.filter(p => p.type === 'pppoe').length;
  const hotspotCount = profiles.filter(p => p.type === 'hotspot').length;
  const totalCount = profiles.length;

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.router_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (p.package_name && p.package_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === 'all' || p.type === filterType;
    const matchesRouter = filterRouter === 'all' || p.router_name === filterRouter;
    return matchesSearch && matchesType && matchesRouter;
  });

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Profile Mikrotik (PPP & Hotspot)"
        subtitle="Kelola Profile PPPoE dan Hotspot Mikrotik Terpisah dalam Tab Khusus"
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

        {/* Primary Tab Navigation: PPPoE vs Hotspot */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/70 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
            <button
              onClick={() => setFilterType('pppoe')}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'pppoe'
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Globe size={15} />
              <span>PPP Profile (PPPoE)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                filterType === 'pppoe' ? 'bg-indigo-900/60 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {pppoeCount}
              </span>
            </button>

            <button
              onClick={() => setFilterType('hotspot')}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'hotspot'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-200 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Wifi size={15} />
              <span>Hotspot Profile</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                filterType === 'hotspot' ? 'bg-amber-900/60 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {hotspotCount}
              </span>
            </button>

            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                filterType === 'all'
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-200 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Sliders size={15} />
              <span>Semua Profile</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                filterType === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-300 text-slate-700'
              }`}>
                {totalCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => openAddModalForType('pppoe')}
              className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-extrabold rounded-xl flex items-center gap-1.5 text-xs shadow-md shadow-indigo-100 transition-all cursor-pointer"
            >
              <Globe size={15} />
              <span>+ Buat Profile PPP</span>
            </button>

            <button
              onClick={() => openAddModalForType('hotspot')}
              className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-sans font-extrabold rounded-xl flex items-center gap-1.5 text-xs shadow-md shadow-amber-100 transition-all cursor-pointer"
            >
              <Wifi size={15} />
              <span>+ Buat Profile Hotspot</span>
            </button>
          </div>
        </div>

        {/* Action Bar (Search & Router Filter) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama profile, router, paket..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {routerList.length > 0 && (
              <select
                value={filterRouter}
                onChange={(e) => setFilterRouter(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Router</option>
                {routerList.map(rName => (
                  <option key={rName} value={rName}>{rName}</option>
                ))}
              </select>
            )}

            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Profile"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Profile Grid */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil daftar profile Mikrotik...</span>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada profile Mikrotik terdaftar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProfiles.map((prof) => (
              <div 
                key={prof.id}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                <div className="space-y-3">
                  {/* Category & Status Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${
                      prof.type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {prof.type === 'pppoe' ? <Globe size={12} /> : <Wifi size={12} />}
                      <span>{prof.type === 'pppoe' ? 'PPP Profile' : 'Hotspot Profile'}</span>
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Sync Status Badge */}
                      {prof.is_synced ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          <span>Sync</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 animate-pulse">
                          <AlertCircle size={11} />
                          <span>Draft</span>
                        </span>
                      )}

                      {/* Portal Visibility Badge */}
                      {prof.is_active === false ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1" title="Profile dinonaktifkan: Tidak tampil di portal user">
                          <span>⛔ Nonaktif</span>
                        </span>
                      ) : !prof.package_id ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1" title="Belum dihubungkan ke paket: Tidak tampil di portal user">
                          <span>⚠️ Belum Terhubung Paket</span>
                        </span>
                      ) : prof.package_is_active === false ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1" title="Paket yang terhubung nonaktif: Tidak tampil di portal user">
                          <span>⛔ Paket Nonaktif</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1" title="Aktif dan terhubung ke paket aktif: Tayang di portal user">
                          <Globe size={11} className="text-emerald-600" />
                          <span>Tayang</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Profile Name & Router */}
                  <div>
                    <h3 className="font-mono font-bold text-slate-900 text-lg group-hover:text-[#2563EB] transition-colors">{prof.name}</h3>
                    <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <Server size={13} className="text-slate-400" />
                      <span>{prof.router_name} ({prof.router_ip})</span>
                    </div>
                  </div>

                  {/* Speed / Rate Limit */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      Bandwidth Rate Limit
                    </span>
                    <span className="font-extrabold font-mono text-slate-800">
                      {prof.package_speed_limit || prof.rate_limit || 'Mengikuti Paket'}
                    </span>
                  </div>

                  {/* PPP Extra Info (Local/Remote Address & Parent Queue) */}
                  {prof.type === 'pppoe' && (
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-[11px]">
                      {prof.local_address && (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium">Lokal Address:</span>
                          <span className="font-mono font-bold text-slate-800">{prof.local_address}</span>
                        </div>
                      )}
                      {prof.remote_address && (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium">Remote Pool:</span>
                          <span className="font-mono font-bold text-blue-700">{prof.remote_address}</span>
                        </div>
                      )}
                      {prof.parent_queue && prof.parent_queue !== 'none' && (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium">Parent Queue:</span>
                          <span className="font-mono font-bold text-purple-700">{prof.parent_queue}</span>
                        </div>
                      )}
                      {prof.dns_server && (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="font-medium">DNS Server:</span>
                          <span className="font-mono text-slate-700">{prof.dns_server}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clean Package Detail Display */}
                  <div className="pt-2 border-t border-slate-200/70 space-y-2">
                    <span className="block text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                      <Package size={14} className="text-indigo-600" />
                      Detail Paket Terhubung:
                    </span>

                    {prof.package_name ? (
                      <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-emerald-950 text-xs flex items-center gap-1">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            {prof.package_name}
                          </span>
                          {prof.package_price && (
                            <span className="font-mono font-black text-emerald-900 text-xs">
                              Rp {Number(prof.package_price).toLocaleString('id-ID')}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-2 pt-0.5">
                          <span>Speed: {prof.package_speed_limit || 'Tanpa Limit'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                        <span className="text-amber-800 font-bold text-[11px] flex items-center gap-1">
                          <AlertCircle size={13} className="text-amber-600" />
                          Belum Dihubungkan ke Paket
                        </span>
                        <button
                          onClick={() => openEditModal(prof)}
                          className="text-[10px] font-extrabold text-amber-900 underline hover:text-amber-950 cursor-pointer"
                        >
                          Klik Edit untuk Pilih
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions & PUSH BUTTON */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handlePushToMikrotik(prof)}
                    disabled={pushingId === prof.id}
                    className={`w-full py-2.5 px-4 font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 ${
                      prof.is_synced 
                        ? 'bg-slate-800 hover:bg-slate-900 text-white' 
                        : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white animate-pulse'
                    }`}
                  >
                    <Zap size={14} className={pushingId === prof.id ? 'animate-spin' : ''} />
                    <span>{pushingId === prof.id ? 'Menerbitkan ke Mikrotik...' : prof.is_synced ? '⚡ Singkronkan Ulang ke Mikrotik' : '⚡ Singkronkan Perubahan ke Mikrotik'}</span>
                  </button>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => handleToggleProfileStatus(prof)}
                      title={prof.is_active !== false ? 'Klik untuk menonaktifkan profile ini' : 'Klik untuk mengaktifkan profile ini'}
                      className={`px-3 py-1.5 font-bold text-xs rounded-xl transition-all cursor-pointer border inline-flex items-center gap-1.5 ${
                        prof.is_active !== false
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                    >
                      <Power size={12} className={prof.is_active !== false ? 'text-emerald-600' : 'text-slate-400'} />
                      <span>{prof.is_active !== false ? 'Aktif' : 'Nonaktif'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(prof)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                      >
                        <Edit size={12} />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => {
                          setDeletingProfile(prof);
                          setDeleteFromRouterCheckbox(false);
                        }}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-rose-200 inline-flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* SEPARATE & CLEAN MODAL FOR PPP vs HOTSPOT */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            {/* Dedicated Header for PPP vs Hotspot */}
            <div className={`p-6 border-b flex justify-between items-center shrink-0 ${
              type === 'pppoe' ? 'bg-indigo-50/70 border-indigo-100' : 'bg-amber-50/70 border-amber-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                  type === 'pppoe' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  {type === 'pppoe' ? <Globe size={20} /> : <Wifi size={20} />}
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">
                    {type === 'pppoe' 
                      ? (showEditModal ? 'Edit Konfigurasi PPP Profile' : 'Konfigurasi PPP Profile Baru')
                      : (showEditModal ? 'Edit Konfigurasi Hotspot Profile' : 'Konfigurasi Hotspot Profile Baru')
                    }
                  </h3>
                  <p className="text-xs text-slate-500">
                    {type === 'pppoe' 
                      ? 'Form khusus PPP: Atur Paket PPPoE, Lokal/Remote Address Pool & Parent Queue' 
                      : 'Form khusus Hotspot: Atur Paket Hotspot Member/Voucher tanpa DNS/Pool clutter'
                    }
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingProfile(null); }} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Navigation Tabs (ONLY for PPP Profile) */}
            {type === 'pppoe' && (
              <div className="flex border-b border-slate-100 bg-slate-50/80 px-6 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`py-3 px-5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'general' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Sliders size={14} />
                  <span>General</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('additional')}
                  className={`py-3 px-5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'additional' ? 'border-indigo-600 text-indigo-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Info size={14} />
                  <span>Additional / DNS</span>
                </button>
              </div>
            )}

            {/* Modal Form Body */}
            <form onSubmit={showEditModal ? handleUpdateProfile : handleCreateProfile} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main Inputs Area */}
                <div className="lg:col-span-8 space-y-4">
                  {/* CLEAN FORM FOR PPP PROFILE */}
                  {type === 'pppoe' ? (
                    activeTab === 'general' ? (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Mikrotik Server *</label>
                          <select
                            value={selectedRouterId}
                            onChange={(e) => setSelectedRouterId(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-bold text-slate-800"
                          >
                            {routers.map(r => (
                              <option key={r.id} value={r.id}>
                                📡 {r.name} ({r.ip_address}:{r.api_port})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Nama PPP Profile Mikrotik *</label>
                          <input
                            type="text"
                            required
                            placeholder="Contoh: pppoe-profile-30m"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                          />
                        </div>

                        {/* Hubungkan ke Paket PPPoE */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Hubungkan ke Paket Internet (Khusus Paket PPPoE Bulanan)
                          </label>
                          <select
                            value={packageId}
                            onChange={(e) => setPackageId(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-semibold text-slate-800"
                          >
                            <option value="">-- Pilih Paket PPPoE --</option>
                            {availablePackages.map(pkg => {
                              const usedByProfile = usedPackagesInSelectedRouter.get(pkg.id);
                              return (
                                <option 
                                  key={pkg.id} 
                                  value={pkg.id}
                                  disabled={Boolean(usedByProfile)}
                                  className={usedByProfile ? 'text-slate-400 bg-slate-100 italic' : ''}
                                >
                                  {usedByProfile 
                                    ? `🔒 ${pkg.name} (Sudah dipakai: ${usedByProfile})` 
                                    : `📦 ${pkg.name} (${pkg.speed_limit || 'Tanpa Limit'} - Rp ${Number(pkg.price).toLocaleString('id-ID')})`
                                  }
                                </option>
                              );
                            })}
                          </select>

                          {packageId && usedPackagesInSelectedRouter.has(packageId) && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                              <AlertCircle size={15} className="text-rose-600 shrink-0" />
                              <span>
                                Paket ini sudah digunakan oleh profile <strong>"{usedPackagesInSelectedRouter.get(packageId)}"</strong> pada router ini. Silakan pilih paket lain.
                              </span>
                            </div>
                          )}

                          {availablePackages.length === 0 && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                              ⚠️ Belum ada Paket Internet untuk tipe <strong>PPPoE</strong>. Silakan buat paket di menu <strong>Paket Internet</strong> terlebih dahulu.
                            </p>
                          )}

                          {/* DETAIL PAKET PPPOE TERPILIH */}
                          {selectedPkgDetail && (
                            <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50/60 border border-indigo-200 rounded-2xl space-y-2.5 animate-fade-in shadow-xs">
                              <div className="flex items-center justify-between pb-2 border-b border-indigo-200/70">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                                  <Tag size={14} className="text-indigo-600" />
                                  <span>Detail Konfigurasi Paket: <strong>{selectedPkgDetail.name}</strong></span>
                                </div>
                                <span className="text-xs font-mono font-black text-indigo-900 bg-indigo-200/70 px-2.5 py-0.5 rounded-lg border border-indigo-300/60">
                                  Rp {Number(selectedPkgDetail.price).toLocaleString('id-ID')}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                                {/* Masa Aktif */}
                                <div className="bg-white/90 p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Calendar size={12} className="text-blue-500" />
                                    Masa Aktif
                                  </span>
                                  <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                    {parseIso8601(selectedPkgDetail.validity_iso).human}
                                    {selectedPkgDetail.validity_iso && (
                                      <span className="text-[10px] text-slate-400 font-mono ml-1">({selectedPkgDetail.validity_iso})</span>
                                    )}
                                  </span>
                                </div>

                                {/* Speed Limit */}
                                <div className="bg-white/90 p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Zap size={12} className="text-amber-500" />
                                    Speed Limit
                                  </span>
                                  <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                                    {selectedPkgDetail.speed_limit || 'Tanpa Limit'}
                                  </span>
                                </div>

                                {/* Masa Tenggang Isolir */}
                                <div className="bg-white/90 p-2.5 rounded-xl border border-indigo-100 shadow-xs">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <Clock size={12} className="text-rose-500" />
                                    Masa Tenggang Isolir
                                  </span>
                                  <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                    {parseIso8601(selectedPkgDetail.grace_period_iso || 'P5D').human}
                                    {selectedPkgDetail.grace_period_iso && (
                                      <span className="text-[10px] text-slate-400 font-mono ml-1">({selectedPkgDetail.grace_period_iso})</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                          {/* PPP SETTINGS: Local, Remote, Parent Queue */}
                          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-4">
                            <div className="text-xs font-extrabold text-indigo-900 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Network size={15} className="text-indigo-600" />
                                <span>Pengaturan IP Address & Queue PPPoE</span>
                              </div>
                              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-mono font-bold">
                                {localAddressMode === 'manual' ? 'Mode Gateway IP' : 'Mode Pool IP'}
                              </span>
                            </div>

                            {/* Lokal Address */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Lokal Address (Gateway Server PPPoE)</label>
                              <div className="flex gap-2">
                                <select
                                  value={localAddressMode}
                                  onChange={(e) => {
                                    const newMode = e.target.value as 'manual' | 'pool';
                                    setLocalAddressMode(newMode);
                                    if (newMode === 'pool') {
                                      if (remoteAddressPool) {
                                        setLocalAddressVal(remoteAddressPool);
                                      } else if (localAddressVal && routerIpPools.some(p => p.name === localAddressVal)) {
                                        setRemoteAddressPool(localAddressVal);
                                      }
                                    } else {
                                      // Manual Mode: auto set gateway from current remote pool
                                      const matchedPool = routerIpPools.find(p => p.name === remoteAddressPool);
                                      if (matchedPool) {
                                        const gw = matchedPool.gateway || (matchedPool.ranges.split('.').slice(0, 3).join('.') + '.1');
                                        setLocalAddressVal(gw);
                                      }
                                    }
                                  }}
                                  className="w-32 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="manual">Manual IP</option>
                                  <option value="pool">Pool IP</option>
                                </select>

                                {localAddressMode === 'manual' ? (
                                  <input
                                    type="text"
                                    placeholder="192.168.1.1"
                                    value={localAddressVal}
                                    onChange={(e) => setLocalAddressVal(e.target.value)}
                                    className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none"
                                  />
                                ) : (
                                  <select
                                    value={localAddressVal}
                                    onChange={(e) => {
                                      const poolName = e.target.value;
                                      setLocalAddressVal(poolName);
                                      setRemoteAddressPool(poolName); // Synchronize Remote Address to match
                                    }}
                                    className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                                  >
                                    <option value="">-- Pilih Address Pool --</option>
                                    {routerIpPools.map(p => (
                                      <option key={p.id} value={p.name}>{p.name} ({p.ranges})</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>

                            {/* Remote Address */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Remote Address (Pool Alokasi Client)</label>
                              <select
                                value={remoteAddressPool}
                                onChange={(e) => {
                                  const poolName = e.target.value;
                                  setRemoteAddressPool(poolName);
                                  if (localAddressMode === 'pool') {
                                    setLocalAddressVal(poolName); // Synchronize Local Address Pool to match
                                  } else {
                                    // Manual IP Mode: Auto extract gateway from selected remote pool
                                    const matchedPool = routerIpPools.find(p => p.name === poolName);
                                    if (matchedPool) {
                                      const gw = matchedPool.gateway || (matchedPool.ranges.split('.').slice(0, 3).join('.') + '.1');
                                      setLocalAddressVal(gw);
                                    }
                                  }
                                }}
                                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                              >
                                <option value="">-- Pilih Address Pool --</option>
                                {routerIpPools.map(p => (
                                  <option key={p.id} value={p.name}>{p.name} ({p.ranges})</option>
                                ))}
                              </select>
                            </div>

                          {/* Parent Queue */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">Parent Queue</label>
                            <select
                              value={parentQueue}
                              onChange={(e) => setParentQueue(e.target.value)}
                              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                            >
                              <option value="none">-- none --</option>
                              <option value="PARENT-ALL-PPPOE">PARENT-ALL-PPPOE</option>
                              <option value="PARENT-RUANG-PPPOE">PARENT-RUANG-PPPOE</option>
                            </select>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* PPP ADDITIONAL TAB: DNS SERVER */
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">DNS Server PPPoE</label>
                          <input
                            type="text"
                            placeholder="8.8.8.8, 8.8.4.4"
                            value={dnsServer}
                            onChange={(e) => setDnsServer(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 mt-1 block">Pisahkan beberapa IP DNS dengan koma (contoh: 8.8.8.8, 8.8.4.4)</span>
                        </div>

                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
                          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                          <span>Parameter PPP Profile akan otomatis disinkronkan ke Mikrotik saat ditekan tombol Publish.</span>
                        </div>
                      </div>
                    )
                  ) : (
                    /* SUPER CLEAN FORM FOR HOTSPOT PROFILE (NO DNS / POOL CLUTTER!) */
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Mikrotik Server *</label>
                        <select
                          value={selectedRouterId}
                          onChange={(e) => setSelectedRouterId(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all font-bold text-slate-800"
                        >
                          {routers.map(r => (
                            <option key={r.id} value={r.id}>
                              📡 {r.name} ({r.ip_address}:{r.api_port})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Nama Hotspot Profile Mikrotik *</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: hs-profile-voucher-3h"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                        />
                      </div>

                      {/* Hubungkan ke Paket Hotspot */}
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Hubungkan ke Paket Hotspot (Member / Voucher Jam/Hari)
                        </label>
                        <select
                          value={packageId}
                          onChange={(e) => setPackageId(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all font-semibold text-slate-800"
                        >
                          <option value="">-- Pilih Paket Hotspot --</option>
                          {availablePackages.map(pkg => {
                            const usedByProfile = usedPackagesInSelectedRouter.get(pkg.id);
                            return (
                              <option 
                                key={pkg.id} 
                                value={pkg.id}
                                disabled={Boolean(usedByProfile)}
                                className={usedByProfile ? 'text-slate-400 bg-slate-100 italic' : ''}
                              >
                                {usedByProfile 
                                  ? `🔒 ${pkg.name} (Sudah dipakai: ${usedByProfile})` 
                                  : `📦 ${pkg.name} (${pkg.speed_limit || 'Tanpa Limit'} - Rp ${Number(pkg.price).toLocaleString('id-ID')})`
                                }
                              </option>
                            );
                          })}
                        </select>

                        {packageId && usedPackagesInSelectedRouter.has(packageId) && (
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                            <AlertCircle size={15} className="text-rose-600 shrink-0" />
                            <span>
                              Paket ini sudah digunakan oleh profile <strong>"{usedPackagesInSelectedRouter.get(packageId)}"</strong> pada router ini. Silakan pilih paket lain.
                            </span>
                          </div>
                        )}

                        {availablePackages.length === 0 && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                            ⚠️ Belum ada Paket Internet untuk tipe <strong>Hotspot</strong>. Silakan buat paket di menu <strong>Paket Internet</strong> terlebih dahulu.
                          </p>
                        )}

                        {/* DETAIL PAKET HOTSPOT TERPILIH */}
                        {selectedPkgDetail && (
                          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 rounded-2xl space-y-2.5 animate-fade-in shadow-xs">
                            <div className="flex items-center justify-between pb-2 border-b border-amber-200/70">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                                <Tag size={14} className="text-amber-600" />
                                <span>Detail Konfigurasi Paket: <strong>{selectedPkgDetail.name}</strong></span>
                              </div>
                              <span className="text-xs font-mono font-black text-amber-900 bg-amber-200/70 px-2.5 py-0.5 rounded-lg border border-amber-300/60">
                                Rp {Number(selectedPkgDetail.price).toLocaleString('id-ID')}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                              {/* Masa Aktif */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <Calendar size={12} className="text-blue-500" />
                                  Masa Aktif
                                </span>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                  {parseIso8601(selectedPkgDetail.validity_iso).human}
                                  {selectedPkgDetail.validity_iso && (
                                    <span className="text-[10px] text-slate-400 font-mono ml-1">({selectedPkgDetail.validity_iso})</span>
                                  )}
                                </span>
                              </div>

                              {/* Masa Pakai / Limit Uptime */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <Clock size={12} className="text-emerald-500" />
                                  Masa Pakai (Uptime)
                                </span>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                  {formatUptimeDisplay(selectedPkgDetail.uptime_limit)}
                                </span>
                              </div>

                              {/* Speed Limit */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <Zap size={12} className="text-amber-500" />
                                  Speed Limit
                                </span>
                                <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                                  {selectedPkgDetail.speed_limit || 'Tanpa Limit'}
                                </span>
                              </div>

                              {/* Lock User (MAC) */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <UserCheck size={12} className={selectedPkgDetail.only_one_user ? "text-indigo-600" : "text-slate-400"} />
                                  Lock User (MAC)
                                </span>
                                <span className={`text-xs font-bold block mt-0.5 ${selectedPkgDetail.only_one_user ? 'text-indigo-700' : 'text-slate-600'}`}>
                                  {selectedPkgDetail.only_one_user ? '🔒 Terkunci (1 MAC)' : '🔓 Bebas Ganti HP'}
                                </span>
                              </div>

                              {/* Lock Server Hotspot */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <Server size={12} className={selectedPkgDetail.lock_server ? "text-sky-600" : "text-slate-400"} />
                                  Lock Server
                                </span>
                                <span className={`text-xs font-bold block mt-0.5 ${selectedPkgDetail.lock_server ? 'text-sky-700' : 'text-slate-600'}`}>
                                  {selectedPkgDetail.lock_server ? '🔒 Kunci Server' : '🌐 Semua Server'}
                                </span>
                              </div>

                              {/* Expired Mode */}
                              <div className="bg-white/90 p-2.5 rounded-xl border border-amber-100 shadow-xs">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <ShieldAlert size={12} className="text-rose-500" />
                                  Expired Mode
                                </span>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                  {selectedPkgDetail.expired_mode === 'rem' ? '🗑️ Remove' :
                                   selectedPkgDetail.expired_mode === 'ntf' ? '⚠️ Notice (1s)' :
                                   selectedPkgDetail.expired_mode === 'remc' ? '📋 Remove & Record' :
                                   selectedPkgDetail.expired_mode === 'ntfc' ? '📝 Notice & Record' :
                                   selectedPkgDetail.expired_mode === '0' ? '♾️ Unlimited' :
                                   (selectedPkgDetail.expired_mode || '🗑️ Remove')}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 space-y-1">
                        <div className="font-extrabold flex items-center gap-1.5">
                          <Zap size={15} className="text-amber-600" />
                          <span>Mikhmon Auto-Expire Script Included</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          Hotspot Profile ini secara otomatis dikonfigurasikan dengan script Mikhmon on-login comment tracker untuk pencatatan masa pakai voucher.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Explanation Box */}
                <div className="lg:col-span-4 bg-slate-50 p-5 rounded-3xl border border-slate-200/80 space-y-3 text-xs">
                  <h4 className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px] pb-2 border-b border-slate-200">
                    KETERANGAN ({type === 'pppoe' ? 'PPP PROFILE' : 'HOTSPOT PROFILE'})
                  </h4>

                  {type === 'pppoe' ? (
                    <ul className="space-y-2.5 text-slate-600 text-[11px] leading-relaxed">
                      <li>
                        <strong className="text-slate-800">• Nama Profil Mikrotik:</strong> Nama profil di Mikrotik, harus unik.
                      </li>
                      <li>
                        <strong className="text-slate-800">• Lokal Address:</strong> IP Gateway lokal router (bisa manual / pool).
                      </li>
                      <li>
                        <strong className="text-slate-800">• Remote Address:</strong> Pool IP yang dialokasikan untuk client PPPoE.
                      </li>
                      <li>
                        <strong className="text-slate-800">• Parent Queue:</strong> Antrian induk untuk rate-limit bandwidth.
                      </li>
                      <li>
                        <strong className="text-slate-800">• DNS Server:</strong> IP DNS server yang diberikan ke pelanggan PPPoE.
                      </li>
                    </ul>
                  ) : (
                    <ul className="space-y-2.5 text-slate-600 text-[11px] leading-relaxed">
                      <li>
                        <strong className="text-slate-800">• Nama Profil Hotspot:</strong> Nama profil user hotspot di Mikrotik.
                      </li>
                      <li>
                        <strong className="text-slate-800">• Shared Users:</strong> Otomatis diatur 1 user per voucher.
                      </li>
                      <li>
                        <strong className="text-slate-800">• Rate Limit:</strong> Otomatis mengikuti speed limit Paket Hotspot.
                      </li>
                    </ul>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingProfile(null); }} 
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Batal
                </button>

                <button 
                  type="submit" 
                  disabled={submitLoading} 
                  className={`px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md cursor-pointer flex items-center gap-2 ${
                    type === 'pppoe' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : showEditModal ? 'Simpan Perubahan' : 'Simpan Profile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS PROFILE */}
      {deletingProfile && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-rose-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up flex flex-col">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-rose-50 via-rose-50/80 to-amber-50/50 border-b border-rose-100 flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    Konfirmasi Hapus Profile Mikrotik
                  </h3>
                  <p className="text-xs font-semibold text-rose-600 mt-0.5">
                    Pastikan relasi pengguna telah diperiksa sebelum menghapus
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeletingProfile(null)}
                className="w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Profile Card Summary */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      deletingProfile.type === 'pppoe' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {deletingProfile.type === 'pppoe' ? '🌐 PPP Profile' : '📶 Hotspot Profile'}
                    </span>
                    <span className="font-mono font-black text-slate-900 text-sm">
                      {deletingProfile.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">
                    Router: {deletingProfile.router_name}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-2 pt-1 border-t border-slate-200/60">
                  <Zap size={13} className="text-amber-500" />
                  <span>Rate Limit: <strong>{deletingProfile.rate_limit || deletingProfile.package_speed_limit || 'Mengikuti Paket'}</strong></span>
                </div>
              </div>

              {/* Analisis Relasi Pelanggan Terkait (CRITICAL) */}
              {(() => {
                const linkedCustomers = customers.filter(c => c.router_profile_id === deletingProfile.id);
                if (linkedCustomers.length > 0) {
                  return (
                    <div className="p-4 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2.5">
                      <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                        <Users size={16} className="text-amber-600 shrink-0" />
                        <span>Perhatian: Ada {linkedCustomers.length} Pelanggan Terkait Profile Ini!</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        Jika profile <strong>"{deletingProfile.name}"</strong> dihapus, relasi paket/profil pada <strong>{linkedCustomers.length} pelanggan</strong> berikut akan dilepas (<em>unlinked</em>). Pelanggan <strong>TIDAK akan terhapus</strong> dari sistem, namun Anda disarankan menentukan profil pengganti untuk mereka.
                      </p>
                      <div className="bg-white/80 rounded-xl p-2.5 border border-amber-200 max-h-32 overflow-y-auto space-y-1">
                        {linkedCustomers.slice(0, 6).map((c, idx) => (
                          <div key={c.id || idx} className="text-[11px] flex items-center justify-between text-slate-700 py-0.5">
                            <span className="font-bold truncate max-w-[200px]">{c.name}</span>
                            <span className="font-mono text-[10px] text-slate-500">{c.pppoe_username || c.phone_number || c.customer_code}</span>
                          </div>
                        ))}
                        {linkedCustomers.length > 6 && (
                          <div className="text-[10px] font-bold text-amber-700 text-center pt-1">
                            + {linkedCustomers.length - 6} pelanggan lainnya
                          </div>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-800 text-xs">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span><strong>Aman:</strong> Tidak ada pelanggan aktif yang sedang menggunakan profil ini.</span>
                    </div>
                  );
                }
              })()}

              {/* Checkbox Hapus dari Router MikroTik */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteFromRouterCheckbox}
                    onChange={(e) => setDeleteFromRouterCheckbox(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-black text-slate-800 block">
                      Hapus juga profile langsung dari Router MikroTik
                    </span>
                    <span className="text-[11px] text-slate-500 leading-normal block mt-0.5">
                      Jika dicentang, sistem akan mengirim perintah hapus ke Router <strong>"{deletingProfile.router_name}"</strong> via API Port {deletingProfile.router_port || 8728}.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingProfile(null)}
                disabled={deleteLoading}
                className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeDeleteProfile}
                disabled={deleteLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md shadow-rose-200 transition-all cursor-pointer flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Ya, Hapus Profile</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

