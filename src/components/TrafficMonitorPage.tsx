import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Calendar,
  Database,
  RefreshCw,
  Zap,
  TrendingUp,
  Server,
  Layers,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Eye,
  EyeOff
} from 'lucide-react';
import { BusinessProfile } from '../types';
import { getApiUrl } from '../config/api';
import HeaderBar from './HeaderBar';

interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  snmp_enabled?: boolean;
  snmp_port?: number;
  traffic_sampling_enabled?: boolean;
}

interface InterfaceItem {
  id: string;
  name: string;
  type: string;
  running: boolean;
  rxSpeedMbps: number;
  txSpeedMbps: number;
  rxFormatted: string;
  txFormatted: string;
  isMonitored: boolean;
}

interface TrafficSample {
  t: number;
  rx_mbps: number;
  tx_mbps: number;
  rx_bytes: string;
  tx_bytes: string;
  source?: string;
}

interface Log30m {
  id: string | number;
  interface_name: string;
  avg_rx_mbps: number;
  avg_tx_mbps: number;
  peak_rx_mbps: number;
  peak_tx_mbps: number;
  delta_rx_gb: number;
  delta_tx_gb: number;
  total_gb: number;
  recorded_at: string;
}

interface DailySummary {
  log_date: string;
  avg_rx_mbps: number;
  avg_tx_mbps: number;
  peak_rx_mbps: number;
  peak_tx_mbps: number;
  total_rx_gb: number;
  total_tx_gb: number;
  total_gb: number;
  sample_count: number;
}

interface TrafficMonitorPageProps {
  profile: BusinessProfile;
  t: any;
  onLogout?: () => void;
}

export default function TrafficMonitorPage({ profile, t, onLogout }: TrafficMonitorPageProps) {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [interfaces, setInterfaces] = useState<InterfaceItem[]>([]);
  const [selectedIface, setSelectedIface] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'redis' | '30m' | 'daily'>('redis');
  const [daysFilter, setDaysFilter] = useState<number>(7);

  const [loadingRouters, setLoadingRouters] = useState<boolean>(true);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [rollingUp, setRollingUp] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [redisSamples, setRedisSamples] = useState<TrafficSample[]>([]);
  const [logs30m, setLogs30m] = useState<Log30m[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tab2ChartMode, setTab2ChartMode] = useState<'throughput' | 'quota'>('throughput');
  const [hoverIndex30m, setHoverIndex30m] = useState<number | null>(null);
  const [hoverIndexDaily, setHoverIndexDaily] = useState<number | null>(null);
  const [showTable30m, setShowTable30m] = useState<boolean>(false);
  const [showTableDaily, setShowTableDaily] = useState<boolean>(false);
  const [togglingSampling, setTogglingSampling] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  // 1. Fetch Routers
  useEffect(() => {
    const fetchRouters = async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/routers`);
        const data = await res.json();
        if (data.success && Array.isArray(data.routers)) {
          setRouters(data.routers);
          if (data.routers.length > 0) {
            setSelectedRouterId(data.routers[0].id);
          }
        }
      } catch (err: any) {
        console.error('Error fetching routers:', err);
      } finally {
        setLoadingRouters(false);
      }
    };
    fetchRouters();
  }, []);

  // 2. Fetch Interfaces for selected router
  useEffect(() => {
    if (!selectedRouterId) return;
    const fetchInterfaces = async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/routers/${selectedRouterId}/interfaces`);
        const data = await res.json();
        if (data.success && Array.isArray(data.interfaces)) {
          setInterfaces(data.interfaces);
          // Auto select first monitored or running interface
          const preferred = data.interfaces.find((i: InterfaceItem) => i.isMonitored && i.running) || data.interfaces[0];
          if (preferred) {
            setSelectedIface(preferred.name);
          }
        }
      } catch (err) {
        console.error('Error fetching interfaces:', err);
      }
    };
    fetchInterfaces();
  }, [selectedRouterId]);

  // 3. Fetch History Data for (selectedRouterId, selectedIface, daysFilter)
  const fetchHistory = async (isManual = false) => {
    if (!selectedRouterId || !selectedIface) return;
    if (isManual) setRefreshing(true);
    else setLoadingData(true);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(
        `${apiUrl}/api/routers/${selectedRouterId}/interfaces/${encodeURIComponent(selectedIface)}/history?days=${daysFilter}`
      );
      const data = await res.json();
      if (data.success) {
        setRedisSamples(data.redis_samples || []);
        setLogs30m(data.logs_30m || []);
        setDailySummary(data.daily_summary || []);
      } else {
        if (isManual) setToastMsg({ type: 'error', text: data.message || 'Gagal memuat histori trafik' });
      }
    } catch (err: any) {
      if (isManual) setToastMsg({ type: 'error', text: err.message || 'Koneksi backend gagal' });
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedRouterId, selectedIface, daysFilter]);

  // Auto-refresh interval (every 5s for live monitor tab)
  useEffect(() => {
    if (autoRefresh && activeTab === 'redis' && selectedRouterId && selectedIface) {
      timerRef.current = setInterval(() => {
        fetchHistory();
      }, 5000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, activeTab, selectedRouterId, selectedIface]);

  // Manual Rollup Trigger
  const handleManualRollup = async () => {
    setRollingUp(true);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/traffic/rollup-now`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchHistory(true);
      } else {
        setToastMsg({ type: 'error', text: data.message });
      }
    } catch (e: any) {
      setToastMsg({ type: 'error', text: `Rollup gagal: ${e.message}` });
    } finally {
      setRollingUp(false);
    }
  };

  const handleToggleRouterSampling = async () => {
    if (!selectedRouterId || !currentRouter) return;
    const nextState = currentRouter.traffic_sampling_enabled === false ? true : false;
    setTogglingSampling(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${selectedRouterId}/toggle-traffic-sampling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setRouters(prev => prev.map(r => r.id === selectedRouterId ? { ...r, traffic_sampling_enabled: nextState } : r));
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengubah status pengambilan data' });
      }
    } catch (e: any) {
      setToastMsg({ type: 'error', text: `Gagal toggle: ${e.message}` });
    } finally {
      setTogglingSampling(false);
    }
  };

  const formatTime = (ts: number | string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const currentRouter = routers.find(r => r.id === selectedRouterId);
  const currentIfaceMeta = interfaces.find(i => i.name === selectedIface);

  const latestSample = redisSamples.length > 0 ? redisSamples[redisSamples.length - 1] : null;
  const maxRedisRx = Math.max(...redisSamples.map(s => s.rx_mbps || 0), 0);
  const maxRedisTx = Math.max(...redisSamples.map(s => s.tx_mbps || 0), 0);
  const avgRedisRx = redisSamples.length > 0 
    ? Number((redisSamples.reduce((acc, s) => acc + (s.rx_mbps || 0), 0) / redisSamples.length).toFixed(2)) 
    : 0;
  const avgRedisTx = redisSamples.length > 0 
    ? Number((redisSamples.reduce((acc, s) => acc + (s.tx_mbps || 0), 0) / redisSamples.length).toFixed(2)) 
    : 0;

  const totalLogsRxGb = Number(logs30m.reduce((acc, l) => acc + (l.delta_rx_gb || 0), 0).toFixed(2));
  const totalLogsTxGb = Number(logs30m.reduce((acc, l) => acc + (l.delta_tx_gb || 0), 0).toFixed(2));
  const peakLogRx = Math.max(...logs30m.map(l => l.peak_rx_mbps || 0), 0);
  const peakLogTx = Math.max(...logs30m.map(l => l.peak_tx_mbps || 0), 0);

  // SVG Chart Dimensions
  const chartW = 900;
  const chartH = 280;
  const padX = 60;
  const padY = 35;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      <HeaderBar
        title="Monitoring Grafik Trafik SNMP"
        subtitle="Analisis throughput realtime 1-menit di Redis, rekap per 30-menit, dan histori harian kuota per interface"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <div className="p-4 sm:p-7 space-y-6 flex-1 max-w-7xl mx-auto w-full">
        
        {/* Top Control Bar */}
        <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-xs border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Router Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Pilih Router MikroTik</label>
              <select
                value={selectedRouterId}
                onChange={(e) => setSelectedRouterId(e.target.value)}
                disabled={loadingRouters}
                className="bg-slate-50 border border-slate-300 font-extrabold text-xs text-slate-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer min-w-[200px]"
              >
                {routers.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.ip_address})
                  </option>
                ))}
              </select>
            </div>

            {/* Interface Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Pilih Interface / Port</label>
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                className="bg-slate-50 border border-slate-300 font-mono font-black text-xs text-slate-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer min-w-[220px]"
              >
                {interfaces.map(i => (
                  <option key={i.name} value={i.name}>
                    {i.name} {i.running ? '🟢 UP' : '🔴 DOWN'} {i.isMonitored ? '⭐' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Router Badge & Background Sampling Toggle */}
            {currentRouter && (
              <div className="self-end pb-1.5 flex flex-wrap items-center gap-2">
                <span className="bg-emerald-50 text-emerald-800 text-[11px] font-mono font-black px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  SNMP 64-bit (UDP {currentRouter.snmp_port || 161})
                </span>

                <button
                  type="button"
                  onClick={handleToggleRouterSampling}
                  disabled={togglingSampling}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                    currentRouter.traffic_sampling_enabled !== false
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                  }`}
                  title={
                    currentRouter.traffic_sampling_enabled !== false
                      ? 'Ambil data trafik latar belakang aktif tiap 30 detik. Klik untuk MENJEDA.'
                      : 'Pengambilan data trafik sedang dijeda. Klik untuk MENGAKTIFKAN kembali.'
                  }
                >
                  <Activity size={12} className={currentRouter.traffic_sampling_enabled !== false ? 'animate-pulse' : ''} />
                  <span>
                    {togglingSampling
                      ? 'Menyimpan...'
                      : currentRouter.traffic_sampling_enabled !== false
                      ? '🟢 Ambil Data: Aktif'
                      : '⏸️ Ambil Data: Dijeda'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start lg:self-center">
            {activeTab === 'redis' && (
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  autoRefresh
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <Clock size={13} className={autoRefresh ? 'animate-spin text-emerald-600' : ''} />
                <span>{autoRefresh ? 'Live (5s)' : 'Jeda'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleManualRollup}
              disabled={rollingUp}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Paksa hitung dan rekap 30-menit ke PostgreSQL sekarang"
            >
              <Zap size={14} className={rollingUp ? 'animate-spin' : ''} />
              <span>{rollingUp ? 'Merangkum...' : '⚡ Rollup Manual Sekarang'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchHistory(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer font-bold disabled:opacity-50"
              title="Segarkan data grafik"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Banner if traffic sampling is paused */}
        {currentRouter && currentRouter.traffic_sampling_enabled === false && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⏸️</span>
              <div>
                <strong className="font-extrabold text-amber-950">Pengambilan Data Latar Belakang (Background Worker) Sedang Dijeda</strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Router <b>{currentRouter.name}</b> sedang diatur agar tidak mengambil sampel trafik otomatis setiap 30 detik. Worker background akan melewatinya.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleRouterSampling}
              disabled={togglingSampling}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto shrink-0 transition-all"
            >
              <Activity size={13} />
              <span>{togglingSampling ? 'Mengaktifkan...' : '▶️ Aktifkan Ambil Data Sekarang'}</span>
            </button>
          </div>
        )}

        {/* Toast Alert */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            toastMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Tab Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('redis')}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'redis'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>🔴 30 Menit Terakhir (Redis Buffer)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('30m')}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === '30m'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database size={14} className="text-blue-600" />
              <span>🔵 Log 30-Menit (PostgreSQL)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'daily'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={14} className="text-emerald-600" />
              <span>🟢 Rangkuman Per Hari</span>
            </button>
          </div>

          {activeTab !== 'redis' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold">Rentang Waktu:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {[1, 3, 7, 30].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDaysFilter(d)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                      daysFilter === d ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {d === 1 ? '24 Jam' : `${d} Hari`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab 1: Redis Live Buffer */}
        {activeTab === 'redis' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-sky-700 text-xs font-bold">
                  <span>Kecepatan Download (Saat Ini)</span>
                  <ArrowDown size={16} className="text-sky-600" />
                </div>
                <div className="text-3xl font-black font-mono text-sky-950 mt-2">
                  {latestSample ? latestSample.rx_mbps : 0} <span className="text-sm font-sans text-sky-600">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Sample: {latestSample ? formatTime(latestSample.t) : '-'}
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
                  <span>Kecepatan Upload (Saat Ini)</span>
                  <ArrowUp size={16} className="text-emerald-600" />
                </div>
                <div className="text-3xl font-black font-mono text-emerald-950 mt-2">
                  {latestSample ? latestSample.tx_mbps : 0} <span className="text-sm font-sans text-emerald-600">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Sample: {latestSample ? formatTime(latestSample.t) : '-'}
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-indigo-700 text-xs font-bold">
                  <span>Puncak 30-Menit (True Peak)</span>
                  <TrendingUp size={16} className="text-indigo-600" />
                </div>
                <div className="text-3xl font-black font-mono text-indigo-950 mt-2">
                  {maxRedisRx} <span className="text-sm font-sans text-indigo-600">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Peak Upload: {maxRedisTx} Mbps
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center justify-between text-slate-700 text-xs font-bold">
                  <span>Rata-Rata 30-Menit (True Avg)</span>
                  <Activity size={16} className="text-slate-600" />
                </div>
                <div className="text-3xl font-black font-mono text-slate-900 mt-2">
                  {avgRedisRx} <span className="text-sm font-sans text-slate-500">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                  Avg Upload: {avgRedisTx} Mbps ({redisSamples.length} sample)
                </div>
              </div>
            </div>

            {/* Interactive Graph Box */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-sm font-bold text-sky-700">
                    <span className="w-3.5 h-3.5 rounded-full bg-sky-500"></span>
                    <span>Download (RX)</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-500"></span>
                    <span>Upload (TX)</span>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-400 font-bold">
                  Interface: {selectedIface} &bull; {redisSamples.length} Titik Sample di RAM Redis
                </span>
              </div>

              {redisSamples.length === 0 ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-slate-400 text-xs font-bold space-y-2">
                  <Activity size={36} className="text-slate-300 animate-pulse" />
                  <span>Belum ada sampel trafik di antrean Redis untuk port "{selectedIface}".</span>
                  <span className="text-[11px] font-normal text-slate-400">
                    Sampling otomatis berjalan setiap 1 menit. Tunggu sesaat hingga titik terkumpul.
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto select-none">
                  {(() => {
                    const maxVal = Math.max(maxRedisRx, maxRedisTx, 5);
                    const count = redisSamples.length;

                    const getX = (i: number) => {
                      if (count <= 1) return padX;
                      return padX + (i / (count - 1)) * (chartW - 2 * padX);
                    };
                    const getY = (val: number) => {
                      return chartH - padY - (val / maxVal) * (chartH - 2 * padY);
                    };

                    const rxPoints = redisSamples.map((s, i) => `${getX(i)},${getY(s.rx_mbps || 0)}`).join(' ');
                    const txPoints = redisSamples.map((s, i) => `${getX(i)},${getY(s.tx_mbps || 0)}`).join(' ');

                    const rxArea = `${getX(0)},${chartH - padY} ${rxPoints} ${getX(count - 1)},${chartH - padY}`;
                    const txArea = `${getX(0)},${chartH - padY} ${txPoints} ${getX(count - 1)},${chartH - padY}`;

                    return (
                      <div className="min-w-[700px] relative">
                        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[280px]">
                          <defs>
                            <linearGradient id="gradRxFull" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="gradTxFull" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Horizontal Grid lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                            const y = padY + (1 - ratio) * (chartH - 2 * padY);
                            const valLabel = (ratio * maxVal).toFixed(1);
                            return (
                              <g key={idx}>
                                <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                  {valLabel} Mbps
                                </text>
                              </g>
                            );
                          })}

                          {/* Area fills */}
                          <polygon points={rxArea} fill="url(#gradRxFull)" />
                          <polygon points={txArea} fill="url(#gradTxFull)" />

                          {/* Lines */}
                          <polyline fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={rxPoints} />
                          <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={txPoints} />

                          {/* Interactive Points */}
                          {redisSamples.map((s, i) => (
                            <g key={i}>
                              <circle
                                cx={getX(i)}
                                cy={getY(s.rx_mbps || 0)}
                                r={hoverIndex === i ? 6 : 3}
                                fill="#0284c7"
                                className="transition-all cursor-pointer"
                                onMouseEnter={() => setHoverIndex(i)}
                                onMouseLeave={() => setHoverIndex(null)}
                              />
                              <circle
                                cx={getX(i)}
                                cy={getY(s.tx_mbps || 0)}
                                r={hoverIndex === i ? 5 : 2.5}
                                fill="#10b981"
                                className="transition-all cursor-pointer"
                                onMouseEnter={() => setHoverIndex(i)}
                                onMouseLeave={() => setHoverIndex(null)}
                              />
                            </g>
                          ))}

                          {/* X-axis labels */}
                          {redisSamples.map((s, i) => {
                            if (i % Math.ceil(count / 8) === 0 || i === count - 1) {
                              return (
                                <text
                                  key={`x-${i}`}
                                  x={getX(i)}
                                  y={chartH - 8}
                                  textAnchor="middle"
                                  className="text-[10px] font-mono fill-slate-400 font-bold"
                                >
                                  {formatTime(s.t)}
                                </text>
                              );
                            }
                            return null;
                          })}
                        </svg>

                        {/* Hover Tooltip Popup */}
                        {hoverIndex !== null && redisSamples[hoverIndex] && (
                          <div
                            className="absolute bg-slate-900/95 text-white text-xs p-3 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1.5 font-mono backdrop-blur-md border border-slate-700"
                            style={{
                              left: `${Math.min(chartW - 160, Math.max(10, getX(hoverIndex) - 75))}px`,
                              top: '15px'
                            }}
                          >
                            <div className="font-extrabold text-slate-300 pb-1 border-b border-slate-700/80">
                              ⏱️ Pukul {formatTime(redisSamples[hoverIndex].t)}
                            </div>
                            <div className="text-sky-300 font-bold flex items-center justify-between gap-4">
                              <span>Download:</span>
                              <span>{redisSamples[hoverIndex].rx_mbps} Mbps</span>
                            </div>
                            <div className="text-emerald-300 font-bold flex items-center justify-between gap-4">
                              <span>Upload:</span>
                              <span>{redisSamples[hoverIndex].tx_mbps} Mbps</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: 30-Minute Logs (PostgreSQL) */}
        {activeTab === '30m' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-sky-700 text-xs font-bold">Total Kuota Masuk (RX)</div>
                <div className="text-3xl font-black font-mono text-sky-950 mt-2">
                  {totalLogsRxGb} <span className="text-sm font-sans text-sky-600">GB</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Rentang {daysFilter} hari terakhir</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-emerald-700 text-xs font-bold">Total Kuota Keluar (TX)</div>
                <div className="text-3xl font-black font-mono text-emerald-950 mt-2">
                  {totalLogsTxGb} <span className="text-sm font-sans text-emerald-600">GB</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Rentang {daysFilter} hari terakhir</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-rose-700 text-xs font-bold">Puncak Tertinggi (True Peak)</div>
                <div className="text-3xl font-black font-mono text-rose-950 mt-2">
                  {peakLogRx} <span className="text-sm font-sans text-rose-600">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Peak Upload: {peakLogTx} Mbps</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-indigo-700 text-xs font-bold">Jumlah Rekapan 30-Menit</div>
                <div className="text-3xl font-black font-mono text-indigo-950 mt-2">
                  {logs30m.length} <span className="text-sm font-sans text-indigo-500">Interval</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Tersimpan di tabel PostgreSQL</div>
              </div>
            </div>

            {/* TAB 2 MAIN CHART BOX */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                    📈
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">
                      Grafik Riwayat Agregasi 30-Menit
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      Port: <span className="font-mono font-bold text-slate-700">{selectedIface}</span> &bull; {logs30m.length} titik agregasi
                    </p>
                  </div>
                </div>

                {/* Sub-mode selector */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => setTab2ChartMode('throughput')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      tab2ChartMode === 'throughput'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Zap size={13} className="text-indigo-600" />
                    <span>⚡ Throughput (Avg & Peak Mbps)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab2ChartMode('quota')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      tab2ChartMode === 'quota'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <BarChart3 size={13} className="text-indigo-600" />
                    <span>📦 Volume Kuota (GB)</span>
                  </button>
                </div>
              </div>

              {logs30m.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs font-bold space-y-2">
                  <Database size={36} className="mx-auto text-slate-300 animate-pulse" />
                  <div>Belum ada log 30-menit yang tersimpan di PostgreSQL untuk port "{selectedIface}".</div>
                  <div className="text-slate-400 font-normal">
                    Klik tombol <b>"⚡ Rollup Manual Sekarang"</b> di atas untuk langsung merangkum sample Redis ke database.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Legend Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    {tab2ChartMode === 'throughput' ? (
                      <div className="flex flex-wrap items-center gap-4 font-bold">
                        <div className="flex items-center gap-1.5 text-sky-700">
                          <span className="w-3.5 h-1.5 rounded-full bg-sky-500"></span>
                          <span>Avg Download (RX)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-indigo-900">
                          <span className="w-3.5 h-1 border-t-2 border-dashed border-indigo-600"></span>
                          <span>Peak Download (RX)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-700">
                          <span className="w-3.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Avg Upload (TX)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-teal-900">
                          <span className="w-3.5 h-1 border-t-2 border-dashed border-teal-600"></span>
                          <span>Peak Upload (TX)</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 font-bold">
                        <div className="flex items-center gap-1.5 text-sky-700">
                          <span className="w-3.5 h-3 rounded-md bg-sky-500"></span>
                          <span>Download Kuota (GB)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-emerald-700">
                          <span className="w-3.5 h-3 rounded-md bg-emerald-500"></span>
                          <span>Upload Kuota (GB)</span>
                        </div>
                      </div>
                    )}
                    <span className="text-[11px] font-mono text-slate-400">
                      Arahkan kursor pada grafik untuk melihat rincian snapshot
                    </span>
                  </div>

                  {/* SVG Chart */}
                  <div className="overflow-x-auto select-none">
                    {(() => {
                      const count = logs30m.length;

                      if (tab2ChartMode === 'throughput') {
                        const maxVal = Math.max(
                          ...logs30m.map(l => Math.max(l.peak_rx_mbps || 0, l.peak_tx_mbps || 0, l.avg_rx_mbps || 0, l.avg_tx_mbps || 0)),
                          5
                        );

                        const getX = (i: number) => {
                          if (count <= 1) return chartW / 2;
                          return padX + (i / (count - 1)) * (chartW - 2 * padX);
                        };
                        const getY = (val: number) => {
                          return chartH - padY - (val / maxVal) * (chartH - 2 * padY);
                        };

                        const avgRxPoints = logs30m.map((l, i) => `${getX(i)},${getY(l.avg_rx_mbps || 0)}`).join(' ');
                        const peakRxPoints = logs30m.map((l, i) => `${getX(i)},${getY(l.peak_rx_mbps || 0)}`).join(' ');
                        const avgTxPoints = logs30m.map((l, i) => `${getX(i)},${getY(l.avg_tx_mbps || 0)}`).join(' ');
                        const peakTxPoints = logs30m.map((l, i) => `${getX(i)},${getY(l.peak_tx_mbps || 0)}`).join(' ');

                        const avgRxArea = `${getX(0)},${chartH - padY} ${avgRxPoints} ${getX(count - 1)},${chartH - padY}`;
                        const avgTxArea = `${getX(0)},${chartH - padY} ${avgTxPoints} ${getX(count - 1)},${chartH - padY}`;

                        return (
                          <div className="min-w-[700px] relative">
                            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[280px]">
                              <defs>
                                <linearGradient id="grad30mRx" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="grad30mTx" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              {/* Horizontal Grid lines */}
                              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                const y = padY + (1 - ratio) * (chartH - 2 * padY);
                                const valLabel = (ratio * maxVal).toFixed(1);
                                return (
                                  <g key={idx}>
                                    <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                    <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                      {valLabel} Mbps
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Area fills */}
                              <polygon points={avgRxArea} fill="url(#grad30mRx)" />
                              <polygon points={avgTxArea} fill="url(#grad30mTx)" />

                              {/* Avg Solid Polylines */}
                              <polyline fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={avgRxPoints} />
                              <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={avgTxPoints} />

                              {/* Peak Dashed Polylines */}
                              <polyline fill="none" stroke="#4338ca" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" points={peakRxPoints} />
                              <polyline fill="none" stroke="#0f766e" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" points={peakTxPoints} />

                              {/* Interactive circles and hover hit areas */}
                              {logs30m.map((l, i) => (
                                <g key={i}>
                                  {/* Peak RX Circle */}
                                  <circle
                                    cx={getX(i)}
                                    cy={getY(l.peak_rx_mbps || 0)}
                                    r={hoverIndex30m === i ? 6 : 3.5}
                                    fill="#4338ca"
                                    className="transition-all cursor-pointer"
                                    onMouseEnter={() => setHoverIndex30m(i)}
                                    onMouseLeave={() => setHoverIndex30m(null)}
                                  />
                                  {/* Avg RX Circle */}
                                  <circle
                                    cx={getX(i)}
                                    cy={getY(l.avg_rx_mbps || 0)}
                                    r={hoverIndex30m === i ? 5 : 2.5}
                                    fill="#0284c7"
                                    className="transition-all cursor-pointer"
                                    onMouseEnter={() => setHoverIndex30m(i)}
                                    onMouseLeave={() => setHoverIndex30m(null)}
                                  />
                                </g>
                              ))}

                              {/* X-axis labels */}
                              {logs30m.map((l, i) => {
                                if (i % Math.max(1, Math.ceil(count / 7)) === 0 || i === count - 1) {
                                  const d = new Date(l.recorded_at);
                                  const lbl = `${d.getDate()}/${d.getMonth() + 1} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                                  return (
                                    <text
                                      key={`x-30m-${i}`}
                                      x={getX(i)}
                                      y={chartH - 8}
                                      textAnchor="middle"
                                      className="text-[10px] font-mono fill-slate-400 font-bold"
                                    >
                                      {lbl}
                                    </text>
                                  );
                                }
                                return null;
                              })}
                            </svg>

                            {/* Tooltip Popup */}
                            {hoverIndex30m !== null && logs30m[hoverIndex30m] && (
                              <div
                                className="absolute bg-slate-900/95 text-white text-xs p-3.5 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1.5 font-mono backdrop-blur-md border border-slate-700 min-w-[240px]"
                                style={{
                                  left: `${Math.min(chartW - 250, Math.max(10, getX(hoverIndex30m) - 120))}px`,
                                  top: '15px'
                                }}
                              >
                                <div className="font-extrabold text-slate-300 pb-1.5 border-b border-slate-700/80">
                                  📅 {new Date(logs30m[hoverIndex30m].recorded_at).toLocaleString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                                <div className="text-sky-300 font-bold flex items-center justify-between">
                                  <span>Avg Download:</span>
                                  <span>{logs30m[hoverIndex30m].avg_rx_mbps} Mbps</span>
                                </div>
                                <div className="text-indigo-300 font-bold flex items-center justify-between">
                                  <span>Peak Download:</span>
                                  <span>{logs30m[hoverIndex30m].peak_rx_mbps} Mbps</span>
                                </div>
                                <div className="text-emerald-300 font-bold flex items-center justify-between">
                                  <span>Avg Upload:</span>
                                  <span>{logs30m[hoverIndex30m].avg_tx_mbps} Mbps</span>
                                </div>
                                <div className="text-teal-300 font-bold flex items-center justify-between">
                                  <span>Peak Upload:</span>
                                  <span>{logs30m[hoverIndex30m].peak_tx_mbps} Mbps</span>
                                </div>
                                <div className="pt-1.5 border-t border-slate-700 text-amber-300 font-bold flex items-center justify-between">
                                  <span>Kuota 30 Mnt:</span>
                                  <span>
                                    {logs30m[hoverIndex30m].total_gb > 0
                                      ? `${logs30m[hoverIndex30m].total_gb} GB`
                                      : `${((logs30m[hoverIndex30m].delta_rx_gb + logs30m[hoverIndex30m].delta_tx_gb) * 1024).toFixed(1)} MB`}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        // Quota Bar Chart Mode
                        const maxQuota = Math.max(
                          ...logs30m.map(l => Math.max(l.delta_rx_gb || 0, l.delta_tx_gb || 0, 0.05)),
                          0.1
                        );

                        const availableW = chartW - 2 * padX;
                        const slotW = availableW / count;
                        const barW = Math.max(4, Math.min(18, slotW * 0.38));

                        const getY = (gb: number) => {
                          return chartH - padY - (gb / maxQuota) * (chartH - 2 * padY);
                        };

                        return (
                          <div className="min-w-[700px] relative">
                            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[280px]">
                              {/* Horizontal Grid */}
                              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                const y = padY + (1 - ratio) * (chartH - 2 * padY);
                                const valLabel = (ratio * maxQuota).toFixed(2);
                                return (
                                  <g key={idx}>
                                    <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                    <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                      {valLabel} GB
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Bars */}
                              {logs30m.map((l, i) => {
                                const centerX = padX + i * slotW + slotW / 2;
                                const rxH = (chartH - padY) - getY(l.delta_rx_gb || 0);
                                const txH = (chartH - padY) - getY(l.delta_tx_gb || 0);

                                return (
                                  <g
                                    key={i}
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoverIndex30m(i)}
                                    onMouseLeave={() => setHoverIndex30m(null)}
                                  >
                                    {/* Download Bar */}
                                    <rect
                                      x={centerX - barW - 1}
                                      y={getY(l.delta_rx_gb || 0)}
                                      width={barW}
                                      height={Math.max(2, rxH)}
                                      rx={3}
                                      fill="#0284c7"
                                      opacity={hoverIndex30m === i ? 1 : 0.85}
                                    />
                                    {/* Upload Bar */}
                                    <rect
                                      x={centerX + 1}
                                      y={getY(l.delta_tx_gb || 0)}
                                      width={barW}
                                      height={Math.max(2, txH)}
                                      rx={3}
                                      fill="#10b981"
                                      opacity={hoverIndex30m === i ? 1 : 0.85}
                                    />
                                  </g>
                                );
                              })}

                              {/* X-axis labels */}
                              {logs30m.map((l, i) => {
                                if (i % Math.max(1, Math.ceil(count / 7)) === 0 || i === count - 1) {
                                  const d = new Date(l.recorded_at);
                                  const lbl = `${d.getDate()}/${d.getMonth() + 1} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                                  const centerX = padX + i * slotW + slotW / 2;
                                  return (
                                    <text
                                      key={`x-bar-${i}`}
                                      x={centerX}
                                      y={chartH - 8}
                                      textAnchor="middle"
                                      className="text-[10px] font-mono fill-slate-400 font-bold"
                                    >
                                      {lbl}
                                    </text>
                                  );
                                }
                                return null;
                              })}
                            </svg>

                            {/* Tooltip Popup */}
                            {hoverIndex30m !== null && logs30m[hoverIndex30m] && (
                              <div
                                className="absolute bg-slate-900/95 text-white text-xs p-3.5 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1.5 font-mono backdrop-blur-md border border-slate-700 min-w-[220px]"
                                style={{
                                  left: `${Math.min(chartW - 230, Math.max(10, padX + hoverIndex30m * slotW - 80))}px`,
                                  top: '15px'
                                }}
                              >
                                <div className="font-extrabold text-slate-300 pb-1.5 border-b border-slate-700/80">
                                  📦 {new Date(logs30m[hoverIndex30m].recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-sky-300 font-bold flex items-center justify-between">
                                  <span>Download:</span>
                                  <span>{logs30m[hoverIndex30m].delta_rx_gb} GB</span>
                                </div>
                                <div className="text-emerald-300 font-bold flex items-center justify-between">
                                  <span>Upload:</span>
                                  <span>{logs30m[hoverIndex30m].delta_tx_gb} GB</span>
                                </div>
                                <div className="pt-1.5 border-t border-slate-700 text-amber-300 font-bold flex items-center justify-between">
                                  <span>Total Kuota:</span>
                                  <span>{logs30m[hoverIndex30m].total_gb} GB</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Optional Collapsible Data Table */}
            {logs30m.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowTable30m(!showTable30m)}
                  className="w-full p-4 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer text-left"
                >
                  <div className="font-extrabold text-xs text-slate-800 flex items-center gap-2">
                    {showTable30m ? <EyeOff size={15} className="text-slate-500" /> : <Eye size={15} className="text-indigo-600" />}
                    <span>{showTable30m ? 'Sembunyikan Tabel Rincian Data' : `Tampilkan Tabel Rincian Data (${logs30m.length} Catatan)`}</span>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600">
                    {showTable30m ? 'Tutup ▲' : 'Buka Rincian ▼'}
                  </span>
                </button>

                {showTable30m && (
                  <div className="overflow-x-auto max-h-[400px] scrollbar-thin border-t border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[11px] uppercase font-mono font-bold text-slate-500 sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="p-3.5">Waktu Pencatatan</th>
                          <th className="p-3.5">Avg Download (RX)</th>
                          <th className="p-3.5">Peak Download (RX)</th>
                          <th className="p-3.5">Avg Upload (TX)</th>
                          <th className="p-3.5">Peak Upload (TX)</th>
                          <th className="p-3.5">Pemakaian Kuota (30 Mnt)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {logs30m.slice().reverse().map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 font-sans font-bold text-slate-800">
                              {new Date(log.recorded_at).toLocaleString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="p-3.5 text-sky-700 font-black">{log.avg_rx_mbps} Mbps</td>
                            <td className="p-3.5 text-indigo-900 font-black">
                              <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-lg border border-indigo-200">
                                {log.peak_rx_mbps} Mbps
                              </span>
                            </td>
                            <td className="p-3.5 text-emerald-700 font-black">{log.avg_tx_mbps} Mbps</td>
                            <td className="p-3.5 text-teal-900 font-black">
                              <span className="bg-teal-50 text-teal-800 px-2 py-0.5 rounded-lg border border-teal-200">
                                {log.peak_tx_mbps} Mbps
                              </span>
                            </td>
                            <td className="p-3.5 font-black text-slate-900">
                              {log.total_gb > 0 ? `${log.total_gb} GB` : `${((log.delta_rx_gb + log.delta_tx_gb) * 1024).toFixed(1)} MB`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Daily Summary */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            {/* Daily KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-purple-700 text-xs font-bold">Total Kuota Keseluruhan</div>
                <div className="text-3xl font-black font-mono text-purple-950 mt-2">
                  {dailySummary.reduce((acc, d) => acc + (d.total_gb || 0), 0).toFixed(2)}{' '}
                  <span className="text-sm font-sans text-purple-600">GB</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Akumulasi {dailySummary.length} hari</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-sky-700 text-xs font-bold">Rata-Rata Kuota / Hari</div>
                <div className="text-3xl font-black font-mono text-sky-950 mt-2">
                  {dailySummary.length > 0
                    ? (dailySummary.reduce((acc, d) => acc + (d.total_gb || 0), 0) / dailySummary.length).toFixed(2)
                    : 0}{' '}
                  <span className="text-sm font-sans text-sky-600">GB/hari</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Download & Upload gabungan</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-rose-700 text-xs font-bold">Rekor Puncak (All-Time Peak)</div>
                <div className="text-3xl font-black font-mono text-rose-950 mt-2">
                  {Math.max(...dailySummary.map(d => d.peak_rx_mbps || 0), 0)}{' '}
                  <span className="text-sm font-sans text-rose-600">Mbps</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Throughput download tertinggi</div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
                <div className="text-emerald-700 text-xs font-bold">Durasi Hari Terdata</div>
                <div className="text-3xl font-black font-mono text-emerald-950 mt-2">
                  {dailySummary.length} <span className="text-sm font-sans text-emerald-600">Hari</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Rekapan database PostgreSQL</div>
              </div>
            </div>

            {/* TAB 3 MAIN CHARTS BOX */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    📊
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900">
                      Grafik Batang Konsumsi Kuota Harian (GB)
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      Perbandingan kuota Download vs Upload setiap hari untuk port <span className="font-mono font-bold text-slate-700">{selectedIface}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-sky-700">
                    <span className="w-3.5 h-3 rounded-md bg-sky-500"></span>
                    <span>Download (GB)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-3.5 h-3 rounded-md bg-emerald-500"></span>
                    <span>Upload (GB)</span>
                  </div>
                </div>
              </div>

              {dailySummary.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs font-bold space-y-2">
                  <Calendar size={36} className="mx-auto text-slate-300" />
                  <div>Belum ada data rekapan harian yang terbentuk.</div>
                  <div className="text-slate-400 font-normal">
                    Data harian akan otomatis terakumulasi dari hasil rollup 30-menit setiap hari.
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Daily Quota Bar Chart SVG */}
                  <div className="overflow-x-auto select-none">
                    {(() => {
                      const count = dailySummary.length;
                      const maxDailyGb = Math.max(
                        ...dailySummary.map(d => Math.max(d.total_rx_gb || 0, d.total_tx_gb || 0, (d.total_gb || 0) * 0.7)),
                        1
                      );

                      const availableW = chartW - 2 * padX;
                      const slotW = availableW / count;
                      const barW = Math.max(8, Math.min(28, slotW * 0.32));

                      const getY = (gb: number) => {
                        return chartH - padY - (gb / maxDailyGb) * (chartH - 2 * padY);
                      };

                      return (
                        <div className="min-w-[700px] relative">
                          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[280px]">
                            {/* Horizontal Grid */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                              const y = padY + (1 - ratio) * (chartH - 2 * padY);
                              const valLabel = (ratio * maxDailyGb).toFixed(1);
                              return (
                                <g key={idx}>
                                  <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                  <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                    {valLabel} GB
                                  </text>
                                </g>
                              );
                            })}

                            {/* Daily Bars */}
                            {dailySummary.map((d, i) => {
                              const centerX = padX + i * slotW + slotW / 2;
                              const rxH = (chartH - padY) - getY(d.total_rx_gb || 0);
                              const txH = (chartH - padY) - getY(d.total_tx_gb || 0);
                              const isHovered = hoverIndexDaily === i;

                              return (
                                <g
                                  key={i}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoverIndexDaily(i)}
                                  onMouseLeave={() => setHoverIndexDaily(null)}
                                >
                                  {/* Download Bar */}
                                  <rect
                                    x={centerX - barW - 1.5}
                                    y={getY(d.total_rx_gb || 0)}
                                    width={barW}
                                    height={Math.max(2, rxH)}
                                    rx={4}
                                    fill="#0284c7"
                                    opacity={isHovered ? 1 : 0.85}
                                  />
                                  {/* Upload Bar */}
                                  <rect
                                    x={centerX + 1.5}
                                    y={getY(d.total_tx_gb || 0)}
                                    width={barW}
                                    height={Math.max(2, txH)}
                                    rx={4}
                                    fill="#10b981"
                                    opacity={isHovered ? 1 : 0.85}
                                  />

                                  {/* Total Badge on top */}
                                  <text
                                    x={centerX}
                                    y={Math.min(getY(d.total_rx_gb || 0), getY(d.total_tx_gb || 0)) - 6}
                                    textAnchor="middle"
                                    className="text-[9px] font-mono font-black fill-purple-700"
                                  >
                                    {d.total_gb} GB
                                  </text>

                                  {/* X-axis date label */}
                                  <text
                                    x={centerX}
                                    y={chartH - 8}
                                    textAnchor="middle"
                                    className={`text-[10px] font-mono font-bold ${isHovered ? 'fill-indigo-600 font-black' : 'fill-slate-500'}`}
                                  >
                                    {new Date(d.log_date).toLocaleDateString('id-ID', {
                                      weekday: 'short',
                                      day: 'numeric',
                                      month: 'short'
                                    })}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>

                          {/* Daily Tooltip */}
                          {hoverIndexDaily !== null && dailySummary[hoverIndexDaily] && (
                            <div
                              className="absolute bg-slate-900/95 text-white text-xs p-3.5 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1.5 font-mono backdrop-blur-md border border-slate-700 min-w-[240px]"
                              style={{
                                left: `${Math.min(chartW - 250, Math.max(10, padX + hoverIndexDaily * slotW - 90))}px`,
                                top: '15px'
                              }}
                            >
                              <div className="font-extrabold text-slate-300 pb-1.5 border-b border-slate-700/80">
                                📅 {new Date(dailySummary[hoverIndexDaily].log_date).toLocaleDateString('id-ID', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric'
                                })}
                              </div>
                              <div className="text-sky-300 font-bold flex items-center justify-between">
                                <span>Download (RX):</span>
                                <span>{dailySummary[hoverIndexDaily].total_rx_gb} GB</span>
                              </div>
                              <div className="text-emerald-300 font-bold flex items-center justify-between">
                                <span>Upload (TX):</span>
                                <span>{dailySummary[hoverIndexDaily].total_tx_gb} GB</span>
                              </div>
                              <div className="text-purple-300 font-extrabold flex items-center justify-between border-t border-slate-700 pt-1">
                                <span>Total Kuota:</span>
                                <span>{dailySummary[hoverIndexDaily].total_gb} GB</span>
                              </div>
                              <div className="text-rose-300 font-bold flex items-center justify-between">
                                <span>Puncak Peak (DL):</span>
                                <span>{dailySummary[hoverIndexDaily].peak_rx_mbps} Mbps</span>
                              </div>
                              <div className="text-slate-400 text-[10px] pt-1">
                                Durasi: {dailySummary[hoverIndexDaily].sample_count} snapshot ({(dailySummary[hoverIndexDaily].sample_count * 0.5).toFixed(1)} jam)
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Daily Peak Throughput Line Chart */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-rose-600" />
                        <span>Tren Puncak Kecepatan Harian (Peak Throughput Mbps)</span>
                      </h5>
                      <div className="flex items-center gap-3 text-[11px] font-bold">
                        <span className="text-rose-600">🔴 Peak Download</span>
                        <span className="text-teal-600">🟢 Peak Upload</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto select-none">
                      {(() => {
                        const count = dailySummary.length;
                        const maxPeak = Math.max(
                          ...dailySummary.map(d => Math.max(d.peak_rx_mbps || 0, d.peak_tx_mbps || 0)),
                          5
                        );

                        const getX = (i: number) => {
                          if (count <= 1) return chartW / 2;
                          return padX + (i / (count - 1)) * (chartW - 2 * padX);
                        };
                        const getY = (val: number) => {
                          return 180 - 25 - (val / maxPeak) * (180 - 2 * 25);
                        };

                        const rxLine = dailySummary.map((d, i) => `${getX(i)},${getY(d.peak_rx_mbps || 0)}`).join(' ');
                        const txLine = dailySummary.map((d, i) => `${getX(i)},${getY(d.peak_tx_mbps || 0)}`).join(' ');

                        return (
                          <div className="min-w-[700px]">
                            <svg viewBox={`0 0 ${chartW} 180`} className="w-full h-[180px]">
                              {[0, 0.5, 1].map((ratio, idx) => {
                                const y = 25 + (1 - ratio) * (180 - 2 * 25);
                                return (
                                  <g key={idx}>
                                    <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={idx === 0 ? '0' : '3 3'} />
                                    <text x={padX - 8} y={y + 3} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                      {(ratio * maxPeak).toFixed(1)} Mbps
                                    </text>
                                  </g>
                                );
                              })}
                              <polyline fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={rxLine} />
                              <polyline fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={txLine} />
                              {dailySummary.map((d, i) => (
                                <g key={i}>
                                  <circle cx={getX(i)} cy={getY(d.peak_rx_mbps || 0)} r={4} fill="#e11d48" />
                                  <circle cx={getX(i)} cy={getY(d.peak_tx_mbps || 0)} r={3.5} fill="#0d9488" />
                                  <text x={getX(i)} y={172} textAnchor="middle" className="text-[9.5px] font-mono fill-slate-400 font-bold">
                                    {new Date(d.log_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                  </text>
                                </g>
                              ))}
                            </svg>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Collapsible Daily Data Table */}
            {dailySummary.length > 0 && (
              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowTableDaily(!showTableDaily)}
                  className="w-full p-4 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer text-left"
                >
                  <div className="font-extrabold text-xs text-slate-800 flex items-center gap-2">
                    {showTableDaily ? <EyeOff size={15} className="text-slate-500" /> : <Eye size={15} className="text-emerald-600" />}
                    <span>{showTableDaily ? 'Sembunyikan Tabel Rincian Harian' : `Tampilkan Tabel Rincian Harian (${dailySummary.length} Hari)`}</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {showTableDaily ? 'Tutup ▲' : 'Buka Rincian ▼'}
                  </span>
                </button>

                {showTableDaily && (
                  <div className="overflow-x-auto border-t border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[11px] uppercase font-mono font-bold text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3.5">Tanggal</th>
                          <th className="p-3.5">Total Download (RX)</th>
                          <th className="p-3.5">Total Upload (TX)</th>
                          <th className="p-3.5">Total Kuota Harian</th>
                          <th className="p-3.5">Peak Tertinggi (DL)</th>
                          <th className="p-3.5">Rata-Rata Throughput</th>
                          <th className="p-3.5">Jumlah Snapshot 30-Mnt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {dailySummary.slice().reverse().map((day) => (
                          <tr key={day.log_date} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 font-sans font-extrabold text-slate-900">
                              {new Date(day.log_date).toLocaleDateString('id-ID', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </td>
                            <td className="p-3.5 text-sky-800 font-bold">{day.total_rx_gb} GB</td>
                            <td className="p-3.5 text-emerald-800 font-bold">{day.total_tx_gb} GB</td>
                            <td className="p-3.5 font-black text-slate-900">
                              <span className="bg-purple-50 text-purple-800 px-2.5 py-1 rounded-xl border border-purple-200">
                                {day.total_gb} GB
                              </span>
                            </td>
                            <td className="p-3.5 text-rose-700 font-black">{day.peak_rx_mbps} Mbps</td>
                            <td className="p-3.5 text-slate-600 font-bold">
                              ↓ {day.avg_rx_mbps} Mbps | ↑ {day.avg_tx_mbps} Mbps
                            </td>
                            <td className="p-3.5 font-sans text-slate-500 font-medium">
                              {day.sample_count}x ({(day.sample_count * 0.5).toFixed(1)} Jam)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
