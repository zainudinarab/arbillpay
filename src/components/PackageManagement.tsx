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
  Router, 
  Zap, 
  Clock, 
  Tag, 
  ShieldCheck
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

export interface PackageItem {
  id: string;
  name: string;
  type: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher' | string;
  price: number;
  speed_limit: string;
  validity_days: number;
  mikrotik_profile?: string;
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

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'pppoe' | 'hotspot_monthly' | 'hotspot_voucher'>('pppoe');
  const [price, setPrice] = useState<string>('150000');
  const [speedLimit, setSpeedLimit] = useState('10M/10M');
  const [validityDays, setValidityDays] = useState<string>('30');
  const [mikrotikProfile, setMikrotikProfile] = useState('pppoe-profile-10m');

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/packages`);
      const data = await res.json();
      if (data.success && Array.isArray(data.packages)) {
        setPackages(data.packages);
      }
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const resetForm = () => {
    setName('');
    setType('pppoe');
    setPrice('150000');
    setSpeedLimit('10M/10M');
    setValidityDays('30');
    setMikrotikProfile('pppoe-profile-10m');
  };

  const handleTypeChange = (newType: 'pppoe' | 'hotspot_monthly' | 'hotspot_voucher') => {
    setType(newType);
    if (newType === 'pppoe') {
      setMikrotikProfile('pppoe-profile-20m');
      setValidityDays('30');
    } else if (newType === 'hotspot_monthly') {
      setMikrotikProfile('hs-profile-monthly');
      setValidityDays('30');
    } else {
      setMikrotikProfile('hs-profile-3h');
      setValidityDays('1');
      setPrice('5000');
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
          validity_days: parseInt(validityDays) || 30,
          mikrotik_profile: mikrotikProfile.trim() || 'default'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: data.message || `Paket "${name}" berhasil dibuat!` });
        setShowAddModal(false);
        resetForm();
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat paket internet.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal terhubung ke Database API.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (pkg: PackageItem) => {
    setEditingPackage(pkg);
    setName(pkg.name);
    setType(pkg.type as any);
    setPrice(pkg.price.toString());
    setSpeedLimit(pkg.speed_limit || '10M/10M');
    setValidityDays((pkg.validity_days || 30).toString());
    setMikrotikProfile(pkg.mikrotik_profile || 'default');
    setShowEditModal(true);
  };

  const handleUpdatePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPackage || !name.trim() || !price) {
      setToastMsg({ type: 'error', text: 'Nama paket dan harga wajib diisi!' });
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
          validity_days: parseInt(validityDays) || 30,
          mikrotik_profile: mikrotikProfile.trim() || 'default'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: data.message || `Paket "${name}" berhasil diperbarui!` });
        setShowEditModal(false);
        setEditingPackage(null);
        resetForm();
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui paket.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui paket.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeletePackage = async (pkg: PackageItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus paket "${pkg.name}"?`)) return;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/packages/${pkg.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || 'Paket berhasil dihapus.' });
        fetchPackages();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus paket.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus paket dari server.' });
    }
  };

  const filteredPackages = packages.filter(pkg => {
    const matchesSearch = pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (pkg.mikrotik_profile && pkg.mikrotik_profile.toLowerCase().includes(searchTerm.toLowerCase())) ||
                          (pkg.speed_limit && pkg.speed_limit.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && pkg.type === filterType;
  });

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      {/* Header */}
      <HeaderBar
        title="Paket Internet & Profile Mikrotik"
        subtitle={`Total ${packages.length} Paket Konfigurasi PPPoE & Hotspot`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content */}
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
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Paket
            </button>
            <button
              onClick={() => setFilterType('pppoe')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterType === 'pppoe' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Globe size={14} />
              🌐 PPPoE Bulanan
            </button>
            <button
              onClick={() => setFilterType('hotspot_monthly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterType === 'hotspot_monthly' ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
              }`}
            >
              <Wifi size={14} />
              📶 Hotspot Bulanan
            </button>
            <button
              onClick={() => setFilterType('hotspot_voucher')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterType === 'hotspot_voucher' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Tag size={14} />
              🎫 Voucher Hotspot
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchPackages}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data Paket"
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

        {/* Packages Cards Grid */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil data paket internet & profile Mikrotik...</span>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada paket internet yang dibuat. Klik "+ Buat Paket Internet Baru" untuk menambahkan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPackages.map((pkg) => (
              <div 
                key={pkg.id} 
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                {/* Top Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider mb-2 border ${
                      pkg.type === 'pppoe' 
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                        : pkg.type === 'hotspot_monthly' 
                        ? 'bg-sky-50 text-sky-700 border-sky-200' 
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {pkg.type === 'pppoe' ? '🌐 PPPoE Bulanan' : pkg.type === 'hotspot_monthly' ? '📶 Hotspot Bulanan' : '🎫 Voucher Hotspot'}
                    </span>
                    <h3 className="font-extrabold text-slate-800 text-base group-hover:text-[#2563EB] transition-colors">{pkg.name}</h3>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-slate-900 text-lg">Rp {Number(pkg.price).toLocaleString('id-ID')}</span>
                    <span className="text-[11px] text-slate-400 block font-semibold">/ {pkg.validity_days} Hari</span>
                  </div>
                </div>

                {/* Specs Section */}
                <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      Kecepatan (Bandwidth)
                    </span>
                    <span className="font-extrabold font-mono text-slate-800">{pkg.speed_limit || '10M/10M'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-200/60">
                    <span className="text-indigo-700 font-bold flex items-center gap-1.5">
                      <Router size={14} className="text-indigo-600" />
                      Profile Mikrotik ({pkg.type === 'pppoe' ? 'PPP Profile' : 'User Profile'})
                    </span>
                    <span className="font-extrabold font-mono text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-md text-[11px]">
                      {pkg.mikrotik_profile || 'default'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => openEditModal(pkg)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                  >
                    <Edit size={12} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeletePackage(pkg)}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-rose-200 inline-flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    <span>Hapus</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Tambah Paket Baru */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Buat Paket Internet Baru</h3>
                  <p className="text-xs text-slate-400">Tentukan tarif & nama Profile di Mikrotik Router</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreatePackage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Paket Internet</label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-bold text-slate-800"
                >
                  <option value="pppoe">🌐 PPPoE Bulanan (Profile ppp mikrotik)</option>
                  <option value="hotspot_monthly">📶 Hotspot Bulanan (Profile user mikrotik)</option>
                  <option value="hotspot_voucher">🎫 Voucher Hotspot (Profile user voucher mikrotik)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Paket Internet</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Home BroadBand 20 Mbps"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                />
              </div>

              {/* MIKROTIK PROFILE NAME INPUT (DEDICATED) */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-900 font-extrabold text-xs">
                  <Router size={16} className="text-indigo-600" />
                  <span>Nama Profile di Router Mikrotik</span>
                </div>
                <input
                  type="text"
                  required
                  placeholder={type === 'pppoe' ? 'Contoh: pppoe-profile-20m' : 'Contoh: hs-profile-monthly'}
                  value={mikrotikProfile}
                  onChange={(e) => setMikrotikProfile(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-indigo-700 font-medium">
                  {type === 'pppoe' 
                    ? '⚠️ Harus persis sama dengan nama PPP Profile di Mikrotik (`/ppp profile`).' 
                    : '⚠️ Harus persis sama dengan nama Hotspot User Profile di Mikrotik (`/ip hotspot user profile`).'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Harga Paket (Rp)</label>
                  <input
                    type="number"
                    required
                    placeholder="150000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Batas Kecepatan (Rate Limit)</label>
                  <input
                    type="text"
                    required
                    placeholder="20M/20M"
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Masa Aktif Paket (Hari)</label>
                <input
                  type="number"
                  required
                  placeholder="30"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Paket'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Paket */}
      {showEditModal && editingPackage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Paket Internet & Profile Mikrotik</h3>
                  <p className="text-xs text-slate-500">Sesuaikan tarif atau nama Profile Mikrotik</p>
                </div>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditingPackage(null); }} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleUpdatePackage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Paket Internet</label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-bold text-slate-800"
                >
                  <option value="pppoe">🌐 PPPoE Bulanan (Profile ppp mikrotik)</option>
                  <option value="hotspot_monthly">📶 Hotspot Bulanan (Profile user mikrotik)</option>
                  <option value="hotspot_voucher">🎫 Voucher Hotspot (Profile user voucher mikrotik)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Paket Internet</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              {/* MIKROTIK PROFILE NAME INPUT */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-900 font-extrabold text-xs">
                  <Router size={16} className="text-indigo-600" />
                  <span>Nama Profile di Router Mikrotik</span>
                </div>
                <input
                  type="text"
                  required
                  value={mikrotikProfile}
                  onChange={(e) => setMikrotikProfile(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-indigo-300 rounded-xl text-xs font-mono font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Harga Paket (Rp)</label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Batas Kecepatan (Rate Limit)</label>
                  <input
                    type="text"
                    required
                    value={speedLimit}
                    onChange={(e) => setSpeedLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Masa Aktif Paket (Hari)</label>
                <input
                  type="number"
                  required
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
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
