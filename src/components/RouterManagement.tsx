import React, { useState, useEffect } from 'react';
import { 
  Router, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Zap, 
  ShieldCheck, 
  Clock, 
  Server, 
  Globe, 
  Wifi, 
  Key, 
  User, 
  Activity,
  Radio
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

export interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  api_port: number;
  username: string;
  password?: string;
  status: 'online' | 'offline' | 'testing';
  last_synced?: string;
  profile_count?: number;
  created_at?: string;
}

export interface RouterProfileItem {
  id: string;
  router_id: string;
  name: string;
  type: 'pppoe' | 'hotspot';
  rate_limit?: string;
  synced_at?: string;
}

interface RouterManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function RouterManagement({ profile, t, onLogout }: RouterManagementProps) {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRouter, setEditingRouter] = useState<RouterItem | null>(null);
  const [selectedRouterForProfiles, setSelectedRouterForProfiles] = useState<RouterItem | null>(null);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileItem[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test Connection State
  const [testingConn, setTestingConn] = useState(false);
  const [testConnResult, setTestConnResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('192.168.88.1');
  const [apiPort, setApiPort] = useState('8728');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  const fetchRouters = async () => {
    setLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers`);
      const data = await res.json();
      if (data.success && Array.isArray(data.routers)) {
        setRouters(data.routers);
      }
    } catch (err) {
      console.error('Failed to fetch routers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  const resetForm = () => {
    setName('');
    setIpAddress('192.168.88.1');
    setApiPort('8728');
    setUsername('admin');
    setPassword('');
    setTestConnResult(null);
  };

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      setTestConnResult({ success: false, message: 'Harap isi IP Address router!' });
      return;
    }

    setTestingConn(true);
    setTestConnResult(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip_address: ipAddress.trim(),
          api_port: parseInt(apiPort) || 8728,
          username: username.trim(),
          password: password.trim()
        })
      });
      const data = await res.json();
      setTestConnResult({
        success: data.success,
        message: data.message || (data.success ? '⚡ Koneksi ke Router Mikrotik Berhasil!' : '❌ Gagal terhubung ke Router.')
      });
    } catch (err) {
      setTestConnResult({ success: false, message: 'Gagal melakukan tes koneksi ke backend.' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleCreateRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ipAddress.trim() || !username.trim()) {
      setToastMsg({ type: 'error', text: 'Nama router, IP Address, dan Username wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ip_address: ipAddress.trim(),
          api_port: parseInt(apiPort) || 8728,
          username: username.trim(),
          password: password.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: data.message || `Router "${name}" berhasil didaftarkan!` });
        setShowAddModal(false);
        resetForm();
        fetchRouters();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mendaftarkan router.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal terhubung ke Database API.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (rtr: RouterItem) => {
    setEditingRouter(rtr);
    setName(rtr.name);
    setIpAddress(rtr.ip_address);
    setApiPort(rtr.api_port.toString());
    setUsername(rtr.username);
    setPassword('');
    setTestConnResult(null);
    setShowEditModal(true);
  };

  const handleUpdateRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRouter || !name.trim() || !ipAddress.trim() || !username.trim()) {
      setToastMsg({ type: 'error', text: 'Nama router, IP Address, dan Username wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${editingRouter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ip_address: ipAddress.trim(),
          api_port: parseInt(apiPort) || 8728,
          username: username.trim(),
          password: password.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: data.message || `Router "${name}" berhasil diperbarui!` });
        setShowEditModal(false);
        setEditingRouter(null);
        resetForm();
        fetchRouters();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui router.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui data router.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteRouter = async (rtr: RouterItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data Router Mikrotik "${rtr.name}" (${rtr.ip_address})?`)) return;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${rtr.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || 'Router berhasil dihapus.' });
        fetchRouters();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus router.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus router dari server.' });
    }
  };

  const handleSyncRouterProfiles = async (rtr: RouterItem) => {
    setSyncingId(rtr.id);
    setToastMsg(null);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${rtr.id}/sync`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchRouters();
        if (selectedRouterForProfiles?.id === rtr.id) {
          fetchRouterProfiles(rtr.id);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyingkronkan profile dari router.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal terhubung ke Router Mikrotik API.' });
    } finally {
      setSyncingId(null);
    }
  };

  const fetchRouterProfiles = async (routerId: string) => {
    setProfilesLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${routerId}/profiles`);
      const data = await res.json();
      if (data.success && Array.isArray(data.profiles)) {
        setRouterProfiles(data.profiles);
      }
    } catch (err) {
      console.error('Failed to fetch router profiles:', err);
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleViewProfiles = (rtr: RouterItem) => {
    setSelectedRouterForProfiles(rtr);
    fetchRouterProfiles(rtr.id);
  };

  const filteredRouters = routers.filter(rtr =>
    rtr.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rtr.ip_address.includes(searchTerm) ||
    rtr.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      {/* Header */}
      <HeaderBar
        title="Router Mikrotik (Multi-Router)"
        subtitle={`Total ${routers.length} Router Terhubung dengan Uji Tes Koneksi & Node RouterOS`}
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

        {/* Action & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama router, IP address, atau username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchRouters}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data Router"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} />
              <span>+ Tambah Router Mikrotik</span>
            </button>
          </div>
        </div>

        {/* Routers Grid */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil daftar router Mikrotik dari database...</span>
          </div>
        ) : filteredRouters.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada Router Mikrotik yang terdaftar. Klik "+ Tambah Router Mikrotik" untuk menambahkan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRouters.map((rtr) => (
              <div 
                key={rtr.id}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                      rtr.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      <Activity size={12} />
                      {rtr.status === 'online' ? '● Router Online' : '🔒 Router Offline'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">ID: {rtr.id}</span>
                  </div>

                  <h3 className="font-extrabold text-slate-800 text-base group-hover:text-[#2563EB] transition-colors">{rtr.name}</h3>
                  <div className="text-slate-500 font-mono text-xs font-bold mt-1 flex items-center gap-1.5">
                    <Server size={14} className="text-blue-600" />
                    <span>{rtr.ip_address}:{rtr.api_port}</span>
                  </div>
                </div>

                {/* Info Box */}
                <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <User size={14} className="text-slate-400" />
                      API Username
                    </span>
                    <span className="font-mono font-bold text-slate-800">{rtr.username}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      Profile Disingkron
                    </span>
                    <button
                      onClick={() => handleViewProfiles(rtr)}
                      className="font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md text-[11px] border border-indigo-200 transition-all cursor-pointer"
                    >
                      {rtr.profile_count || 0} Profile (Lihat)
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Singkron Terakhir:
                    </span>
                    <span className="font-mono">{rtr.last_synced ? new Date(rtr.last_synced).toLocaleString('id-ID') : 'Belum pernah'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleSyncRouterProfiles(rtr)}
                    disabled={syncingId === rtr.id}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Zap size={14} className={syncingId === rtr.id ? 'animate-spin' : ''} />
                    <span>{syncingId === rtr.id ? 'Tarik Profile dari Mikrotik...' : '⚡ Singkron Profile dari Router'}</span>
                  </button>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => openEditModal(rtr)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                    >
                      <Edit size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteRouter(rtr)}
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

        {/* View Router Profiles Modal */}
        {selectedRouterForProfiles && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-base text-slate-800">Daftar Profile Disingkron dari {selectedRouterForProfiles.name}</h3>
                    <p className="text-xs text-slate-500">IP: {selectedRouterForProfiles.ip_address}:{selectedRouterForProfiles.api_port}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedRouterForProfiles(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
              </div>

              <div className="p-6 max-h-[400px] overflow-y-auto">
                {profilesLoading ? (
                  <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                    <RefreshCw size={16} className="animate-spin text-indigo-600" />
                    <span>Memuat list profile...</span>
                  </div>
                ) : routerProfiles.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Belum ada profile yang disingkronkan dari router ini. Klik "⚡ Singkron Profile dari Router".
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {routerProfiles.map(p => (
                      <div key={p.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                            p.type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}>
                            {p.type === 'pppoe' ? '🌐 PPP Profile' : '📶 Hotspot User Profile'}
                          </span>
                          <span className="font-mono font-extrabold text-slate-800 text-xs">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-indigo-700 text-xs bg-indigo-50 px-2 py-0.5 rounded">{p.rate_limit || 'Tanpa Limit'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Tambah Router Baru */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Tambah Router Mikrotik Baru</h3>
                  <p className="text-xs text-slate-400">Tes koneksi terlebih dahulu sebelum menyimpan ke database</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateRouter} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Router</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Router Mikrotik Utama (CCR Pusat)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">IP Address / Domain Router</label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.88.1"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Port API (Default: 8728)</label>
                  <input
                    type="number"
                    required
                    placeholder="8728"
                    value={apiPort}
                    onChange={(e) => setApiPort(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login Router</label>
                  <input
                    type="text"
                    required
                    placeholder="admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Login Router</label>
                  <input
                    type="password"
                    placeholder="Password Mikrotik..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* TEST CONNECTION BUTTON & STATUS BANNER */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConn}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Radio size={14} className={testingConn ? 'animate-pulse text-amber-400' : 'text-emerald-400'} />
                  <span>{testingConn ? 'Menguji Koneksi Socket Mikrotik API...' : '⚡ Tes Koneksi Router Mikrotik (Node RouterOS)'}</span>
                </button>

                {testConnResult && (
                  <div className={`mt-3 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                    testConnResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {testConnResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{testConnResult.message}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Router'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Router */}
      {showEditModal && editingRouter && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Config Router Mikrotik</h3>
                  <p className="text-xs text-slate-500">Ubah IP Address, Port, atau Password API</p>
                </div>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditingRouter(null); }} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleUpdateRouter} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Router</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">IP Address / Domain</label>
                  <input
                    type="text"
                    required
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">API Port</label>
                  <input
                    type="number"
                    required
                    value={apiPort}
                    onChange={(e) => setApiPort(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Baru (Opsional)</label>
                  <input
                    type="password"
                    placeholder="Kosongkan jika tidak diubah..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* TEST CONNECTION BUTTON & STATUS BANNER */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConn}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Radio size={14} className={testingConn ? 'animate-pulse text-amber-400' : 'text-emerald-400'} />
                  <span>{testingConn ? 'Menguji Koneksi Socket Mikrotik API...' : '⚡ Tes Koneksi Router Mikrotik (Node RouterOS)'}</span>
                </button>

                {testConnResult && (
                  <div className={`mt-3 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                    testConnResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {testConnResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{testConnResult.message}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => { setShowEditModal(false); setEditingRouter(null); }} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
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
