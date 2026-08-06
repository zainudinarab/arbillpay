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
  Database
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

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
  is_synced?: boolean;
  on_router?: boolean;
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRouter, setFilterRouter] = useState<string>('all');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RouterProfileJoined | null>(null);

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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const [resProf, resPkg, resRtr, resPool] = await Promise.all([
        fetch(`${apiUrl}/api/router-profiles`),
        fetch(`${apiUrl}/api/packages`),
        fetch(`${apiUrl}/api/routers`),
        fetch(`${apiUrl}/api/ip-pools`)
      ]);

      const dataProf = await parseJsonResponse(resProf);
      const dataPkg = await parseJsonResponse(resPkg);
      const dataRtr = await parseJsonResponse(resRtr);
      const dataPool = await parseJsonResponse(resPool);

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

  // Strict Package Filtering by Profile Type (PPP vs Hotspot)
  const availablePackages = packages.filter(pkg => {
    if (type === 'pppoe') {
      return pkg.type === 'pppoe';
    } else {
      return pkg.type === 'hotspot_monthly' || pkg.type === 'hotspot_voucher';
    }
  });

  // Filter IP Pools available for selected router
  const routerIpPools = ipPools.filter(p => p.router_id === selectedRouterId);

  const selectedPkgDetail = packages.find(p => p.id === packageId);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !name.trim() || !type) {
      setToastMsg({ type: 'error', text: 'Router, Nama Profile, dan Tipe wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    const finalLocalAddress = localAddressMode === 'manual' ? localAddressVal.trim() : localAddressVal;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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

    setSubmitLoading(true);
    setToastMsg(null);

    const finalLocalAddress = localAddressMode === 'manual' ? localAddressVal.trim() : localAddressVal;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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

  const handleDeleteProfile = async (prof: RouterProfileJoined) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus Profile Mikrotik "${prof.name}"?`)) return;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/router-profiles/${prof.id}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || 'Profile berhasil dihapus.' });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus profile.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus profile.' });
    }
  };

  const handlePushToMikrotik = async (prof: RouterProfileJoined) => {
    setPushingId(prof.id);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${
                      prof.type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {prof.type === 'pppoe' ? <Globe size={12} /> : <Wifi size={12} />}
                      <span>{prof.type === 'pppoe' ? 'PPP Profile' : 'Hotspot Profile'}</span>
                    </span>

                    {/* Sync Status Badge */}
                    {prof.is_synced ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        <span>Tersingkron</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 animate-pulse">
                        <AlertCircle size={11} />
                        <span>Draft / Belum Sync</span>
                      </span>
                    )}
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

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => openEditModal(prof)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                    >
                      <Edit size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(prof)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-rose-200 inline-flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>Hapus</span>
                    </button>
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
                            {availablePackages.map(pkg => (
                              <option key={pkg.id} value={pkg.id}>
                                📦 {pkg.name} ({pkg.speed_limit || 'Tanpa Limit'} - Rp {Number(pkg.price).toLocaleString('id-ID')})
                              </option>
                            ))}
                          </select>

                          {availablePackages.length === 0 && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                              ⚠️ Belum ada Paket Internet untuk tipe <strong>PPPoE</strong>. Silakan buat paket di menu <strong>Paket Internet</strong> terlebih dahulu.
                            </p>
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
                          {availablePackages.map(pkg => (
                            <option key={pkg.id} value={pkg.id}>
                              📦 {pkg.name} ({pkg.speed_limit || 'Tanpa Limit'} - Rp {Number(pkg.price).toLocaleString('id-ID')})
                            </option>
                          ))}
                        </select>

                        {availablePackages.length === 0 && (
                          <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                            ⚠️ Belum ada Paket Internet untuk tipe <strong>Hotspot</strong>. Silakan buat paket di menu <strong>Paket Internet</strong> terlebih dahulu.
                          </p>
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
    </div>
  );
}
