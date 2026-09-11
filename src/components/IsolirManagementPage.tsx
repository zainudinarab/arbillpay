import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Zap,
  Copy,
  Check,
  ExternalLink,
  Settings,
  Users,
  Search,
  ArrowRight,
  Sliders,
  Network,
  Terminal,
  Clock,
  Radio,
  WifiOff,
  UserCheck
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  api_port?: number;
  status?: string;
}

interface IsolirStatusData {
  pool: boolean;
  pool_details?: { name: string; ranges: string } | null;
  profile: boolean;
  profile_details?: { name: string; rate_limit?: string; address_list?: string } | null;
  filter: boolean;
  nat: boolean;
  scheduler: boolean;
  is_ready: boolean;
}

export default function IsolirManagementPage({ profile }: { profile: BusinessProfile }) {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [loadingRouters, setLoadingRouters] = useState(false);

  // Status state
  const [isolirStatus, setIsolirStatus] = useState<IsolirStatusData | null>(null);
  const [isolatedStats, setIsolatedStats] = useState<{ live_active: number; db_registered: number }>({ live_active: 0, db_registered: 0 });
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'status' | 'customers' | 'script'>('status');

  // Isolated customers state
  const [isolatedCustomers, setIsolatedCustomers] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [searchCust, setSearchCust] = useState('');

  // Setup modal & params
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);

  const [poolRange, setPoolRange] = useState('10.100.100.2-10.100.100.254');
  const [gatewayIp, setGatewayIp] = useState('10.100.100.1');
  const [profileName, setProfileName] = useState('ppoe-expired');
  const [rateLimit, setRateLimit] = useState('128k/128k');
  const [serverHost, setServerHost] = useState('arbill.arabpay.my.id');
  const [serverPort, setServerPort] = useState('3006');

  // Script preview
  const [scriptText, setScriptText] = useState('');
  const [copied, setCopied] = useState(false);

  // Restore action
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Fetch routers on mount
  useEffect(() => {
    fetchRouters();
  }, []);

  // Fetch status when router changes
  useEffect(() => {
    if (selectedRouterId) {
      fetchIsolirStatus(selectedRouterId);
      fetchIsolatedCustomers(selectedRouterId);
      fetchIsolirScript(selectedRouterId, serverHost, serverPort);
    }
  }, [selectedRouterId]);

  const fetchRouters = async () => {
    setLoadingRouters(true);
    try {
      const res = await fetch('/api/routers');
      const data = await res.json();
      if (data.success && Array.isArray(data.routers) && data.routers.length > 0) {
        setRouters(data.routers);
        if (!selectedRouterId) {
          setSelectedRouterId(data.routers[0].id);
        }
      }
    } catch (err: any) {
      console.error('Gagal memuat daftar router:', err);
    } finally {
      setLoadingRouters(false);
    }
  };

  const fetchIsolirStatus = async (rId: string) => {
    setLoadingStatus(true);
    setStatusError('');
    try {
      const res = await fetch(`/api/routers/${rId}/isolir-status`);
      const data = await res.json();
      if (data.success) {
        setIsolirStatus(data.status);
        setIsolatedStats(data.isolated_stats || { live_active: 0, db_registered: 0 });

        // Otomatis sinkronkan nilai yang sudah ada di router ke form konfigurasi
        if (data.status.pool_details?.ranges) {
          setPoolRange(data.status.pool_details.ranges);
        }
        if (data.status.profile_details?.name) {
          setProfileName(data.status.profile_details.name);
        }
        if (data.status.profile_details?.rate_limit) {
          setRateLimit(data.status.profile_details.rate_limit);
        }
        if (data.status.profile_details?.local_address) {
          setGatewayIp(data.status.profile_details.local_address);
        }
      } else {
        setStatusError(data.message || 'Gagal membaca status router.');
        setIsolirStatus(null);
      }
    } catch (err: any) {
      setStatusError('Koneksi ke server gagal: ' + err.message);
      setIsolirStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchIsolatedCustomers = async (rId: string) => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/routers/${rId}/isolated-customers`);
      const data = await res.json();
      if (data.success && Array.isArray(data.customers)) {
        setIsolatedCustomers(data.customers);
      }
    } catch (err: any) {
      console.error('Gagal memuat pelanggan isolir:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const fetchIsolirScript = async (rId: string, host = serverHost, port = serverPort) => {
    try {
      const res = await fetch(`/api/routers/${rId}/isolir-script?server_host=${encodeURIComponent(host)}&server_port=${encodeURIComponent(port)}`);
      const data = await res.json();
      if (data.success && data.script) {
        setScriptText(data.script);
      }
    } catch (e) {}
  };

  const handleExecuteSetup = async () => {
    if (!selectedRouterId) return;
    setSetupLoading(true);
    setSetupResult(null);

    try {
      const res = await fetch(`/api/routers/${selectedRouterId}/setup-isolir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_name: 'pool-isolir',
          pool_range: poolRange,
          gateway_ip: gatewayIp,
          profile_name: profileName,
          rate_limit: rateLimit,
          server_host: serverHost,
          server_port: serverPort
        })
      });
      const data = await res.json();
      if (data.success) {
        setSetupResult({ success: true, message: data.message, details: data.details });
        // Refresh status
        fetchIsolirStatus(selectedRouterId);
        fetchIsolirScript(selectedRouterId);
      } else {
        setSetupResult({ success: false, message: data.message });
      }
    } catch (err: any) {
      setSetupResult({ success: false, message: 'Gagal menghubungi server: ' + err.message });
    } finally {
      setSetupLoading(false);
    }
  };

  const handleRestoreCustomer = async (cust: any) => {
    setRestoringId(cust.id);
    try {
      const res = await fetch(`/api/customers/${cust.id}/sync-hotspot-mikrotik`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        // Refresh list
        fetchIsolatedCustomers(selectedRouterId);
        fetchIsolirStatus(selectedRouterId);
      } else {
        alert('Gagal memulihkan pelanggan: ' + data.message);
      }
    } catch (err: any) {
      alert('Error saat memulihkan: ' + err.message);
    } finally {
      setRestoringId(null);
    }
  };

  const handleCopyScript = () => {
    if (!scriptText) return;
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const selectedRouter = routers.find(r => r.id === selectedRouterId);

  const filteredCustomers = isolatedCustomers.filter(c => {
    if (!searchCust) return true;
    const q = searchCust.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.pppoe_username && c.pppoe_username.toLowerCase().includes(q)) ||
      (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
      (c.live_ip && c.live_ip.includes(q))
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <HeaderBar
        title="Sistem Isolir MikroTik"
        subtitle="Manajemen otomatis IP Pool, Profil Isolir, Firewall NAT Redirect, dan Monitoring Pelanggan Jatuh Tempo"
        profile={profile}
      />

      {/* Top Bar: Router Selector & Quick Actions */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
            <ShieldAlert size={22} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Target Router MikroTik</span>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={selectedRouterId}
                onChange={(e) => setSelectedRouterId(e.target.value)}
                disabled={loadingRouters || routers.length === 0}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-rose-500 cursor-pointer"
              >
                {routers.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => selectedRouterId && fetchIsolirStatus(selectedRouterId)}
                disabled={loadingStatus}
                title="Refresh Status Router"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <RefreshCw size={16} className={loadingStatus ? 'animate-spin text-rose-500' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Zap size={15} />
            1-Klik Pasang ke Router
          </button>

          <a
            href="/#/isolir"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ExternalLink size={14} />
            Uji Landing Page
          </a>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('status')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'status'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders size={15} />
          Status Komponen Isolir
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'customers'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={15} />
          Pelanggan Terisolir
          {isolatedStats.live_active > 0 && (
            <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px] font-mono">
              {isolatedStats.live_active} live
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('script')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'script'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Terminal size={15} />
          Script Terminal Winbox
        </button>
      </div>

      {/* TAB 1: STATUS & HEALTH CHECK */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          {/* Status Banner */}
          {statusError ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-800 text-sm">
              <AlertTriangle size={20} className="text-rose-600 shrink-0" />
              <div>
                <p className="font-bold">Gagal terhubung ke router MikroTik:</p>
                <p className="text-xs text-rose-700 mt-0.5">{statusError}</p>
              </div>
            </div>
          ) : isolirStatus?.is_ready ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-emerald-900 text-sm">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-base">Infrastruktur Isolir Siap & Aktif 100%</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Router "{selectedRouter?.name}" memiliki Pool, Profile, Firewall Filter, NAT Redirect, dan Scheduler otomatis.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm">
                Sistem Siap
              </span>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-amber-900 text-sm">
                <AlertTriangle size={24} className="text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold text-base">Infrastruktur Isolir Belum Lengkap</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Beberapa rule firewall atau pool belum terpasang di router ini. Klik tombol "1-Klik Pasang ke Router" untuk melengkapinya.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                Pasang Sekarang
              </button>
            </div>
          )}

          {/* Component Check Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* 1. IP Pool */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isolirStatus?.pool ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-90'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">1. IP Pool</span>
                {isolirStatus?.pool ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">TERPASANG</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">BELUM ADA</span>
                )}
              </div>
              <p className="font-mono font-bold text-slate-800 text-sm">
                {isolirStatus?.pool_details?.name || 'pool-isolir'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                {isolirStatus?.pool_details?.ranges || '10.100.100.2-10.100.100.254'}
              </p>
            </div>

            {/* 2. PPP Profile */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isolirStatus?.profile ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-90'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">2. PPP Profile</span>
                {isolirStatus?.profile ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">TERPASANG</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">BELUM ADA</span>
                )}
              </div>
              <p className="font-mono font-bold text-slate-800 text-sm">
                {isolirStatus?.profile_details?.name || 'ppoe-expired'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Limit: <span className="font-mono font-semibold">{isolirStatus?.profile_details?.rate_limit || '128k/128k'}</span>
              </p>
            </div>

            {/* 3. Firewall Filter */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isolirStatus?.filter ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-90'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">3. Filter Rule</span>
                {isolirStatus?.filter ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">TERPASANG</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">BELUM ADA</span>
                )}
              </div>
              <p className="font-bold text-slate-800 text-sm">Blokir Internet</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Buka DNS & Server, blokir traffic lain
              </p>
            </div>

            {/* 4. Firewall NAT */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isolirStatus?.nat ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-90'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">4. NAT Redirect</span>
                {isolirStatus?.nat ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">TERPASANG</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">BELUM ADA</span>
                )}
              </div>
              <p className="font-bold text-slate-800 text-sm">DST-NAT Port 80</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Forward HTTP ke landing page Arbill
              </p>
            </div>

            {/* 5. Scheduler */}
            <div className={`p-4 rounded-2xl border transition-all ${
              isolirStatus?.scheduler ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-90'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">5. Scheduler</span>
                {isolirStatus?.scheduler ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">TERPASANG</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">BELUM ADA</span>
                )}
              </div>
              <p className="font-mono font-bold text-slate-800 text-sm">monitor-ppp-arbil</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Cek otomatis tiap 10 menit
              </p>
            </div>
          </div>

          {/* Quick Explanation */}
          <div className="p-5 bg-white/70 border border-slate-200 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={18} className="text-rose-600" />
              Bagaimana Sistem Isolir Arbill Bekerja di Router Anda?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="font-bold text-slate-800 block mb-1">1. Otomatis Cek Batas Toleransi</span>
                Script <code className="text-rose-600 font-mono">monitor-ppp-arbil</code> membandingkan tanggal/jam di comment secret dengan jam router. Begitu batas isolir lewat, profil langsung diubah ke <code className="text-rose-600 font-mono">ppoe-expired</code> dan koneksi aktifnya diputus.
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="font-bold text-slate-800 block mb-1">2. Dial-in Ulang ke Pool Isolir</span>
                Router pelanggan dial-in kembali dan otomatis mendapatkan IP dari pool isolir (<code className="text-rose-600 font-mono">{isolirStatus?.pool_details?.ranges || 'pool-isolir'}</code>) serta dibatasi kecepatannya ke <code className="text-rose-600 font-mono">{isolirStatus?.profile_details?.rate_limit || 'sesuai profil'}</code>.
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="font-bold text-slate-800 block mb-1">3. Redirect ke Halaman Tagihan</span>
                Saat pelanggan membuka web, port 80 diarahkan ke web server Arbill untuk menampilkan pengumuman tagihan jatuh tempo & tombol bayar QRIS.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PELANGGAN TERISOLIR (LIVE & DATABASE) */}
      {activeTab === 'customers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchCust}
                onChange={(e) => setSearchCust(e.target.value)}
                placeholder="Cari nama, username pppoe, atau IP..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Total terisolir: <strong className="text-slate-800">{filteredCustomers.length}</strong> pelanggan
              </span>
              <button
                type="button"
                onClick={() => selectedRouterId && fetchIsolatedCustomers(selectedRouterId)}
                disabled={loadingCustomers}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 cursor-pointer"
              >
                <RefreshCw size={14} className={loadingCustomers ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">Username PPPoE</th>
                    <th className="px-4 py-3">Paket Asli</th>
                    <th className="px-4 py-3">Status Live Router</th>
                    <th className="px-4 py-3">Batas Isolir</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        {loadingCustomers ? 'Memuat data pelanggan...' : 'Tidak ada pelanggan yang sedang terisolir di router ini.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{c.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{c.customer_code || '-'}</p>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-rose-600">
                          {c.pppoe_username}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-700">{c.package_name || 'PPPoE'}</p>
                          <p className="text-[10px] text-slate-400">{formatCurrency(Number(c.package_price || 0))}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.is_live_online ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                Online ({c.live_ip || 'IP Isolir'})
                              </span>
                              <p className="text-[10px] text-slate-400 font-mono">Uptime: {c.live_uptime || '-'}</p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                              Offline (Dial-up pending)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                          {formatDate(c.grace_until || c.expired_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRestoreCustomer(c)}
                            disabled={restoringId === c.id}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg border border-emerald-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <CheckCircle2 size={13} />
                            {restoringId === c.id ? 'Memulihkan...' : 'Pulihkan'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCRIPT TERMINAL WINBOX */}
      {activeTab === 'script' && (
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Script RouterOS Siap Pakai</h3>
              <p className="text-xs text-slate-500">
                Salin script di bawah dan tempelkan (paste) langsung ke menu <strong>New Terminal</strong> di Winbox router Anda.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyScript}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer shrink-0"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              {copied ? 'Tersalin ke Clipboard!' : 'Salin Semua Script'}
            </button>
          </div>

          <div className="relative bg-slate-950 text-emerald-400 p-5 rounded-2xl font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner max-h-[500px]">
            <pre className="whitespace-pre">{scriptText || 'Memuat script...'}</pre>
          </div>
        </div>
      )}

      {/* MODAL SETUP 1-KLIK */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
                  <Zap size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Setup Otomatis Sistem Isolir</h3>
                  <p className="text-xs text-slate-500">Router: {selectedRouter?.name} ({selectedRouter?.ip_address})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowSetupModal(false); setSetupResult(null); }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                ✕
              </button>
            </div>

            {setupResult ? (
              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border ${
                  setupResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <p className="font-bold text-sm mb-1">{setupResult.message}</p>
                  {setupResult.details && (
                    <ul className="text-xs space-y-1 mt-2 text-slate-700 list-disc pl-4 font-mono">
                      {setupResult.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowSetupModal(false); setSetupResult(null); }}
                    className="px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">i</div>
                  <div className="text-[11px] leading-relaxed">
                    <p className="font-bold">Format IP bebas sesuai keinginan & topologi jaringan Anda!</p>
                    <p className="text-blue-800 mt-0.5">
                      Nilai di bawah otomatis membaca konfigurasi yang sudah ada di router Anda. Rule firewall Arbill mengidentifikasi isolir via <code>address-list=ISOLIR-USERS</code>, sehingga IP berapa pun yang Anda gunakan akan tetap terisolir sempurna.
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-600">
                  Periksa parameter isolir di bawah ini sebelum diterapkan ke router MikroTik:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Range IP Pool Isolir</label>
                    <input
                      type="text"
                      value={poolRange}
                      onChange={(e) => setPoolRange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Gateway IP Isolir</label>
                    <input
                      type="text"
                      value={gatewayIp}
                      onChange={(e) => setGatewayIp(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Nama Profile Isolir</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Limit Kecepatan Isolir</label>
                    <input
                      type="text"
                      value={rateLimit}
                      onChange={(e) => setRateLimit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-600">Domain / IP Server Billing</label>
                      {!/^(\d{1,3}\.){3}\d{1,3}$/.test(serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()) && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                          Cloudflare Tunnel
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={serverHost}
                      onChange={(e) => {
                        setServerHost(e.target.value);
                        if (selectedRouterId) fetchIsolirScript(selectedRouterId, e.target.value, serverPort);
                      }}
                      placeholder="Contoh: arbill.arabpay.my.id atau 30.30.2.53"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Port Server Billing</label>
                    <input
                      type="text"
                      value={serverPort}
                      onChange={(e) => {
                        setServerPort(e.target.value);
                        if (selectedRouterId) fetchIsolirScript(selectedRouterId, serverHost, e.target.value);
                      }}
                      placeholder="3006"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>

                {!/^(\d{1,3}\.){3}\d{1,3}$/.test(serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()) && (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">🌐</span>
                    <div className="text-[11px] leading-relaxed">
                      <p className="font-bold">Mode Domain / Cloudflare Tunnel Aktif</p>
                      <p className="text-amber-800 mt-0.5">
                        MikroTik akan otomatis mengaktifkan <strong>Web Proxy (Port 8080)</strong> dengan redirect ke <code>https://{serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()}/#/isolir</code> dan menambahkan <code>{serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()}</code> ke Address-List MikroTik (auto-resolve DNS Anycast Cloudflare).
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-rose-600" />
                    Yang akan dikonfigurasi:
                  </p>
                  <p className="text-[11px] text-rose-700">
                    &bull; IP Pool <code className="font-mono">{poolRange}</code><br />
                    &bull; Profile PPP <code className="font-mono">{profileName}</code> (Rate: {rateLimit}, List: ISOLIR-USERS)<br />
                    &bull; Address-List: Whitelist <code className="font-mono">{serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()}</code> (ARBILL-BILLING-HOST)<br />
                    &bull; Firewall Filter: Izinkan DNS & Billing, Blokir Internet Lain<br />
                    &bull; Redirect HTTP: {!/^(\d{1,3}\.){3}\d{1,3}$/.test(serverHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim()) ? 'Web Proxy MikroTik 8080 (Cloudflare 302 Redirect)' : `DST-NAT ke ${serverHost}:${serverPort}`}<br />
                    &bull; Scheduler: <code className="font-mono">monitor-ppp-arbil</code> (Interval 10 Menit)
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSetupModal(false)}
                    disabled={setupLoading}
                    className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteSetup}
                    disabled={setupLoading}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
                  >
                    {setupLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Memasang ke Router...
                      </>
                    ) : (
                      <>
                        <Zap size={14} />
                        Konfirmasi & Pasang Sekarang
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
