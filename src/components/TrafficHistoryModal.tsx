import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Clock,
  Calendar,
  Database,
  RefreshCw,
  X,
  Zap,
  TrendingUp,
  HardDrive,
  BarChart3,
  Layers,
  ChevronDown,
  Eye,
  EyeOff
} from 'lucide-react';
import { getApiUrl } from '../config/api';

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
  interface_type: string;
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

interface TrafficHistoryModalProps {
  routerId: string;
  routerName: string;
  interfaceName: string;
  availableInterfaces?: { name: string; type?: string; running?: boolean }[];
  onSelectInterface?: (name: string) => void;
  onClose: () => void;
}

export default function TrafficHistoryModal({
  routerId,
  routerName,
  interfaceName: initialIface,
  availableInterfaces = [],
  onSelectInterface,
  onClose
}: TrafficHistoryModalProps) {
  const [selectedIface, setSelectedIface] = useState<string>(initialIface);
  const [activeTab, setActiveTab] = useState<'redis' | '30m' | 'daily'>('redis');
  const [daysFilter, setDaysFilter] = useState<number>(7);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [rollingUp, setRollingUp] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [redisSamples, setRedisSamples] = useState<TrafficSample[]>([]);
  const [logs30m, setLogs30m] = useState<Log30m[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);

  // Hover state for interactive chart tooltip
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tab2ChartMode, setTab2ChartMode] = useState<'throughput' | 'quota'>('throughput');
  const [hoverIndex30m, setHoverIndex30m] = useState<number | null>(null);
  const [hoverIndexDaily, setHoverIndexDaily] = useState<number | null>(null);
  const [showTable30m, setShowTable30m] = useState<boolean>(false);
  const [showTableDaily, setShowTableDaily] = useState<boolean>(false);

  const timerRef = useRef<any>(null);

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${routerId}/interfaces/${encodeURIComponent(selectedIface)}/history?days=${daysFilter}`);
      const data = await res.json();
      if (data.success) {
        setRedisSamples(data.redis_samples || []);
        setLogs30m(data.logs_30m || []);
        setDailySummary(data.daily_summary || []);
      } else {
        if (isManual) setToastMsg({ type: 'error', text: data.message || 'Gagal memuat data histori' });
      }
    } catch (err: any) {
      if (isManual) setToastMsg({ type: 'error', text: err.message || 'Koneksi ke backend gagal' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [routerId, selectedIface, daysFilter]);

  // Auto-refresh interval (every 10s for redis live tab)
  useEffect(() => {
    if (autoRefresh && activeTab === 'redis') {
      timerRef.current = setInterval(() => {
        fetchData();
      }, 10000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, activeTab, routerId, selectedIface]);

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
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message });
      }
    } catch (e: any) {
      setToastMsg({ type: 'error', text: `Rollup gagal: ${e.message}` });
    } finally {
      setRollingUp(false);
    }
  };

  // Switch Interface handler
  const handleIfaceChange = (newName: string) => {
    setSelectedIface(newName);
    if (onSelectInterface) onSelectInterface(newName);
  };

  // Helper formatting
  const formatTime = (ts: number | string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateLabel = (dStr: string) => {
    const d = new Date(dStr);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  // Latest Redis reading calculations
  const latestSample = redisSamples.length > 0 ? redisSamples[redisSamples.length - 1] : null;
  const maxRedisRx = Math.max(...redisSamples.map(s => s.rx_mbps || 0), 0);
  const maxRedisTx = Math.max(...redisSamples.map(s => s.tx_mbps || 0), 0);
  const avgRedisRx = redisSamples.length > 0 
    ? Number((redisSamples.reduce((acc, s) => acc + (s.rx_mbps || 0), 0) / redisSamples.length).toFixed(2)) 
    : 0;
  const avgRedisTx = redisSamples.length > 0 
    ? Number((redisSamples.reduce((acc, s) => acc + (s.tx_mbps || 0), 0) / redisSamples.length).toFixed(2)) 
    : 0;

  // Total 30m logs sum
  const totalLogsRxGb = Number(logs30m.reduce((acc, l) => acc + (l.delta_rx_gb || 0), 0).toFixed(2));
  const totalLogsTxGb = Number(logs30m.reduce((acc, l) => acc + (l.delta_tx_gb || 0), 0).toFixed(2));
  const peakLogRx = Math.max(...logs30m.map(l => l.peak_rx_mbps || 0), 0);
  const peakLogTx = Math.max(...logs30m.map(l => l.peak_tx_mbps || 0), 0);

  // SVG Chart Dimensions
  const chartW = 860;
  const chartH = 260;
  const padX = 55;
  const padY = 30;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 z-[2700] animate-fade-in">
      <div className="bg-white w-full max-w-5xl rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[94vh] flex flex-col">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
              📈
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg">
                  Grafik Trafik SNMP 64-Bit
                </h3>
                <span className="bg-indigo-100 text-indigo-800 text-[10.5px] font-mono font-black px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {routerName}
                </span>

                {/* Interface Selector Dropdown */}
                {availableInterfaces.length > 0 ? (
                  <div className="relative inline-block">
                    <select
                      value={selectedIface}
                      onChange={(e) => handleIfaceChange(e.target.value)}
                      className="bg-emerald-50 text-emerald-800 font-mono font-black text-xs px-3 py-1 rounded-xl border border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-2xs pr-7"
                    >
                      {availableInterfaces.map(ifc => (
                        <option key={ifc.name} value={ifc.name}>
                          {ifc.name} {ifc.running === false ? '(Down)' : '(Up)'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="bg-emerald-50 text-emerald-800 text-[11px] font-mono font-black px-3 py-0.5 rounded-full border border-emerald-200">
                    Port: {selectedIface}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Pemantauan sampling 1-menitan di RAM Redis, rekap per 30-menit, dan akumulasi harian database.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            {activeTab === 'redis' && (
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  autoRefresh
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
                title="Pembaruan data live otomatis setiap 10 detik"
              >
                <Clock size={12} className={autoRefresh ? 'animate-spin text-emerald-600' : ''} />
                <span>{autoRefresh ? 'Live (10s)' : 'Jeda'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleManualRollup}
              disabled={rollingUp}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Paksa hitung dan simpan rangkuman 30-menit ke PostgreSQL sekarang"
            >
              <Zap size={13} className={rollingUp ? 'animate-spin' : ''} />
              <span>{rollingUp ? 'Merangkum...' : '⚡ Rollup Manual'}</span>
            </button>

            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer disabled:opacity-50 font-bold"
              title="Segarkan data sekarang"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            toastMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tab Navigation Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('redis')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'redis'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              <span>🔴 30 Menit Terakhir (Redis)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('30m')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === '30m'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database size={13} className="text-blue-600" />
              <span>🔵 Log 30-Menit (PostgreSQL)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'daily'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={13} className="text-emerald-600" />
              <span>🟢 Rangkuman Per Hari</span>
            </button>
          </div>

          {/* Days Filter (for 30m and daily tabs) */}
          {activeTab !== 'redis' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold">Rentang Waktu:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {[1, 3, 7, 30].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDaysFilter(d)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
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

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 scrollbar-thin">
          
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCw size={28} className="animate-spin text-indigo-600" />
              <p className="text-xs text-slate-500 font-bold">Memuat data statistik dari Redis & PostgreSQL...</p>
            </div>
          ) : (
            <>
              {/* ============================================================ */}
              {/* TAB 1: 30 MENIT TERAKHIR (BUFFER REDIS 1-MENITAN)            */}
              {/* ============================================================ */}
              {activeTab === 'redis' && (
                <div className="space-y-4">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3">
                      <div className="flex items-center justify-between text-sky-700 text-xs font-bold">
                        <span>Speed Download</span>
                        <ArrowDown size={14} className="text-sky-600" />
                      </div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-sky-950 mt-1">
                        {latestSample ? latestSample.rx_mbps : 0} <span className="text-xs font-sans text-sky-600">Mbps</span>
                      </div>
                      <div className="text-[10px] text-sky-600 mt-0.5">
                        Sample saat ini ({latestSample ? formatTime(latestSample.t) : '-'})
                      </div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3">
                      <div className="flex items-center justify-between text-emerald-700 text-xs font-bold">
                        <span>Speed Upload</span>
                        <ArrowUp size={14} className="text-emerald-600" />
                      </div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-emerald-950 mt-1">
                        {latestSample ? latestSample.tx_mbps : 0} <span className="text-xs font-sans text-emerald-600">Mbps</span>
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        Sample saat ini ({latestSample ? formatTime(latestSample.t) : '-'})
                      </div>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3">
                      <div className="flex items-center justify-between text-indigo-700 text-xs font-bold">
                        <span>Puncak (True Peak)</span>
                        <TrendingUp size={14} className="text-indigo-600" />
                      </div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-indigo-950 mt-1">
                        {maxRedisRx} <span className="text-xs font-sans text-indigo-600">Mbps</span>
                      </div>
                      <div className="text-[10px] text-indigo-600 mt-0.5">
                        Peak Upload: {maxRedisTx} Mbps
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                      <div className="flex items-center justify-between text-slate-700 text-xs font-bold">
                        <span>Rata-Rata (30 Mnt)</span>
                        <Activity size={14} className="text-slate-600" />
                      </div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 mt-1">
                        {avgRedisRx} <span className="text-xs font-sans text-slate-500">Mbps</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Avg Upload: {avgRedisTx} Mbps ({redisSamples.length} titik)
                      </div>
                    </div>
                  </div>

                  {/* SVG Line / Area Chart for 30-min Redis */}
                  <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700">
                          <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                          <span>Download (RX)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                          <span>Upload (TX)</span>
                        </div>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {redisSamples.length} sample 1-menitan di RAM Redis
                      </div>
                    </div>

                    {redisSamples.length === 0 ? (
                      <div className="h-[240px] flex flex-col items-center justify-center text-slate-400 text-xs font-bold">
                        <Activity size={32} className="mb-2 text-slate-300 animate-pulse" />
                        <span>Belum ada sampel trafik di Redis untuk port ini.</span>
                        <span className="text-[10px] text-slate-400 font-normal mt-1">
                          Pastikan saklar pemantauan aktif dan tunggu 1-2 menit hingga worker mengambil sample.
                        </span>
                      </div>
                    ) : (
                      <div className="relative overflow-x-auto">
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

                          // Generate SVG paths
                          const rxPoints = redisSamples.map((s, i) => `${getX(i)},${getY(s.rx_mbps || 0)}`).join(' ');
                          const txPoints = redisSamples.map((s, i) => `${getX(i)},${getY(s.tx_mbps || 0)}`).join(' ');

                          const rxArea = `${getX(0)},${chartH - padY} ${rxPoints} ${getX(count - 1)},${chartH - padY}`;
                          const txArea = `${getX(0)},${chartH - padY} ${txPoints} ${getX(count - 1)},${chartH - padY}`;

                          return (
                            <div className="min-w-[650px] relative">
                              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[240px]">
                                <defs>
                                  <linearGradient id="gradRx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                                  </linearGradient>
                                  <linearGradient id="gradTx" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
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
                                        {valLabel}
                                      </text>
                                    </g>
                                  );
                                })}

                                {/* Area fills */}
                                <polygon points={rxArea} fill="url(#gradRx)" />
                                <polygon points={txArea} fill="url(#gradTx)" />

                                {/* Lines */}
                                <polyline fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={rxPoints} />
                                <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={txPoints} />

                                {/* Points */}
                                {redisSamples.map((s, i) => (
                                  <g key={i}>
                                    <circle
                                      cx={getX(i)}
                                      cy={getY(s.rx_mbps || 0)}
                                      r={hoverIndex === i ? 5 : 2.5}
                                      fill="#0284c7"
                                      className="transition-all cursor-pointer"
                                      onMouseEnter={() => setHoverIndex(i)}
                                      onMouseLeave={() => setHoverIndex(null)}
                                    />
                                    <circle
                                      cx={getX(i)}
                                      cy={getY(s.tx_mbps || 0)}
                                      r={hoverIndex === i ? 4 : 2}
                                      fill="#10b981"
                                      className="transition-all cursor-pointer"
                                      onMouseEnter={() => setHoverIndex(i)}
                                      onMouseLeave={() => setHoverIndex(null)}
                                    />
                                  </g>
                                ))}

                                {/* X-axis Time labels */}
                                {redisSamples.map((s, i) => {
                                  if (i % Math.ceil(count / 7) === 0 || i === count - 1) {
                                    return (
                                      <text
                                        key={`x-${i}`}
                                        x={getX(i)}
                                        y={chartH - 8}
                                        textAnchor="middle"
                                        className="text-[9.5px] font-mono fill-slate-400 font-bold"
                                      >
                                        {formatTime(s.t)}
                                      </text>
                                    );
                                  }
                                  return null;
                                })}
                              </svg>

                              {/* Hover Tooltip Card */}
                              {hoverIndex !== null && redisSamples[hoverIndex] && (
                                <div
                                  className="absolute bg-slate-900/90 text-white text-[11px] p-2.5 rounded-xl shadow-xl pointer-events-none z-10 space-y-1 font-mono backdrop-blur-xs"
                                  style={{
                                    left: `${Math.min(chartW - 140, Math.max(10, getX(hoverIndex) - 60))}px`,
                                    top: '15px'
                                  }}
                                >
                                  <div className="font-bold text-slate-300 pb-1 border-b border-slate-700">
                                    ⏰ {formatTime(redisSamples[hoverIndex].t)}
                                  </div>
                                  <div className="text-sky-300 font-bold flex items-center justify-between gap-3">
                                    <span>Download:</span>
                                    <span>{redisSamples[hoverIndex].rx_mbps} Mbps</span>
                                  </div>
                                  <div className="text-emerald-300 font-bold flex items-center justify-between gap-3">
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

                  {/* Information Banner */}
                  <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 flex items-start gap-2 leading-relaxed">
                    <span className="text-base">💡</span>
                    <div>
                      <b>Cara Kerja Redis Buffer:</b> Setiap 1 menit, SNMP MikroTik membaca counter 64-bit dan menyimpan kecepatan ke RAM Redis. Data ini langsung habis dirangkum ke database setiap 30 menit untuk menjaga memori server selalu optimal.
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 2: LOG 30-MENIT (POSTGRESQL interface_traffic_logs)       */}
              {/* ============================================================ */}
              {activeTab === '30m' && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3">
                      <div className="text-sky-700 text-xs font-bold">Total Kuota Masuk (RX)</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-sky-950 mt-1">
                        {totalLogsRxGb} <span className="text-xs font-sans text-sky-600">GB</span>
                      </div>
                      <div className="text-[10px] text-sky-600 mt-0.5">Rentang {daysFilter} hari</div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3">
                      <div className="text-emerald-700 text-xs font-bold">Total Kuota Keluar (TX)</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-emerald-950 mt-1">
                        {totalLogsTxGb} <span className="text-xs font-sans text-emerald-600">GB</span>
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">Rentang {daysFilter} hari</div>
                    </div>

                    <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3">
                      <div className="text-rose-700 text-xs font-bold">Peak Tertinggi (RX)</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-rose-950 mt-1">
                        {peakLogRx} <span className="text-xs font-sans text-rose-600">Mbps</span>
                      </div>
                      <div className="text-[10px] text-rose-600 mt-0.5">Peak Upload: {peakLogTx} Mbps</div>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3">
                      <div className="text-indigo-700 text-xs font-bold">Total Rekapan 30-Mnt</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-indigo-950 mt-1">
                        {logs30m.length} <span className="text-xs font-sans text-indigo-600">Interval</span>
                      </div>
                      <div className="text-[10px] text-indigo-600 mt-0.5">Tersimpan di tabel PostgreSQL</div>
                    </div>
                  </div>

                  {/* Main Chart Box */}
                  <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          📈
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-slate-800">
                            Grafik Riwayat Agregasi 30-Menit
                          </h4>
                          <p className="text-[11px] text-slate-400 font-medium">
                            Port: <span className="font-mono font-bold text-slate-700">{selectedIface}</span> &bull; {logs30m.length} titik agregasi
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-center">
                        <button
                          type="button"
                          onClick={() => setTab2ChartMode('throughput')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            tab2ChartMode === 'throughput'
                              ? 'bg-white text-indigo-700 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Zap size={11} className="text-indigo-600" />
                          <span>⚡ Throughput (Mbps)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab2ChartMode('quota')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                            tab2ChartMode === 'quota'
                              ? 'bg-white text-indigo-700 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <BarChart3 size={11} className="text-indigo-600" />
                          <span>📦 Kuota (GB)</span>
                        </button>
                      </div>
                    </div>

                    {logs30m.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs font-bold space-y-1">
                        <Database size={28} className="mx-auto mb-2 text-slate-300 animate-pulse" />
                        <div>Belum ada log 30-menit yang tersimpan di database untuk port "{selectedIface}".</div>
                        <div className="text-[10.5px] text-slate-400 font-normal">
                          Klik tombol <b>"⚡ Rollup Manual"</b> di kanan atas untuk merangkum sample Redis ke database.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Legend */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                          {tab2ChartMode === 'throughput' ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-sky-700 flex items-center gap-1">
                                <span className="w-2.5 h-1.5 rounded-full bg-sky-500"></span> Avg RX (DL)
                              </span>
                              <span className="text-indigo-900 flex items-center gap-1">
                                <span className="w-2.5 h-1 border-t-2 border-dashed border-indigo-600"></span> Peak RX
                              </span>
                              <span className="text-emerald-700 flex items-center gap-1">
                                <span className="w-2.5 h-1.5 rounded-full bg-emerald-500"></span> Avg TX (UL)
                              </span>
                              <span className="text-teal-900 flex items-center gap-1">
                                <span className="w-2.5 h-1 border-t-2 border-dashed border-teal-600"></span> Peak TX
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-sky-700 flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded bg-sky-500"></span> Download GB
                              </span>
                              <span className="text-emerald-700 flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Upload GB
                              </span>
                            </div>
                          )}
                          <span className="text-[10px] font-mono text-slate-400 font-normal">
                            Arahkan kursor ke titik grafik untuk info detail
                          </span>
                        </div>

                        {/* Chart Area */}
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
                                <div className="min-w-[650px] relative">
                                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[250px]">
                                    <defs>
                                      <linearGradient id="modalGrad30mRx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
                                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                                      </linearGradient>
                                      <linearGradient id="modalGrad30mTx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                      </linearGradient>
                                    </defs>

                                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                      const y = padY + (1 - ratio) * (chartH - 2 * padY);
                                      return (
                                        <g key={idx}>
                                          <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                          <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                            {(ratio * maxVal).toFixed(1)} Mbps
                                          </text>
                                        </g>
                                      );
                                    })}

                                    <polygon points={avgRxArea} fill="url(#modalGrad30mRx)" />
                                    <polygon points={avgTxArea} fill="url(#modalGrad30mTx)" />

                                    <polyline fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={avgRxPoints} />
                                    <polyline fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={avgTxPoints} />

                                    <polyline fill="none" stroke="#4338ca" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" points={peakRxPoints} />
                                    <polyline fill="none" stroke="#0f766e" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" points={peakTxPoints} />

                                    {logs30m.map((l, i) => (
                                      <g key={i}>
                                        <circle
                                          cx={getX(i)}
                                          cy={getY(l.peak_rx_mbps || 0)}
                                          r={hoverIndex30m === i ? 5.5 : 3}
                                          fill="#4338ca"
                                          className="cursor-pointer transition-all"
                                          onMouseEnter={() => setHoverIndex30m(i)}
                                          onMouseLeave={() => setHoverIndex30m(null)}
                                        />
                                        <circle
                                          cx={getX(i)}
                                          cy={getY(l.avg_rx_mbps || 0)}
                                          r={hoverIndex30m === i ? 5 : 2.5}
                                          fill="#0284c7"
                                          className="cursor-pointer transition-all"
                                          onMouseEnter={() => setHoverIndex30m(i)}
                                          onMouseLeave={() => setHoverIndex30m(null)}
                                        />
                                      </g>
                                    ))}

                                    {logs30m.map((l, i) => {
                                      if (i % Math.max(1, Math.ceil(count / 7)) === 0 || i === count - 1) {
                                        const d = new Date(l.recorded_at);
                                        const lbl = `${d.getDate()}/${d.getMonth() + 1} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                                        return (
                                          <text key={`mx-${i}`} x={getX(i)} y={chartH - 8} textAnchor="middle" className="text-[9.5px] font-mono fill-slate-400 font-bold">
                                            {lbl}
                                          </text>
                                        );
                                      }
                                      return null;
                                    })}
                                  </svg>

                                  {hoverIndex30m !== null && logs30m[hoverIndex30m] && (
                                    <div
                                      className="absolute bg-slate-900/95 text-white text-[11px] p-3 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1 font-mono backdrop-blur-md border border-slate-700 min-w-[220px]"
                                      style={{
                                        left: `${Math.min(chartW - 230, Math.max(10, getX(hoverIndex30m) - 100))}px`,
                                        top: '10px'
                                      }}
                                    >
                                      <div className="font-bold text-slate-300 pb-1 border-b border-slate-700">
                                        📅 {new Date(logs30m[hoverIndex30m].recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ({new Date(logs30m[hoverIndex30m].recorded_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})
                                      </div>
                                      <div className="text-sky-300 font-bold flex justify-between">
                                        <span>Avg Download:</span>
                                        <span>{logs30m[hoverIndex30m].avg_rx_mbps} Mbps</span>
                                      </div>
                                      <div className="text-indigo-300 font-bold flex justify-between">
                                        <span>Peak Download:</span>
                                        <span>{logs30m[hoverIndex30m].peak_rx_mbps} Mbps</span>
                                      </div>
                                      <div className="text-emerald-300 font-bold flex justify-between">
                                        <span>Avg Upload:</span>
                                        <span>{logs30m[hoverIndex30m].avg_tx_mbps} Mbps</span>
                                      </div>
                                      <div className="text-teal-300 font-bold flex justify-between">
                                        <span>Peak Upload:</span>
                                        <span>{logs30m[hoverIndex30m].peak_tx_mbps} Mbps</span>
                                      </div>
                                      <div className="pt-1 border-t border-slate-700 text-amber-300 font-bold flex justify-between">
                                        <span>Kuota:</span>
                                        <span>{logs30m[hoverIndex30m].total_gb > 0 ? `${logs30m[hoverIndex30m].total_gb} GB` : `${((logs30m[hoverIndex30m].delta_rx_gb + logs30m[hoverIndex30m].delta_tx_gb) * 1024).toFixed(1)} MB`}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              // Quota Mode
                              const maxQuota = Math.max(
                                ...logs30m.map(l => Math.max(l.delta_rx_gb || 0, l.delta_tx_gb || 0, 0.05)),
                                0.1
                              );

                              const availableW = chartW - 2 * padX;
                              const slotW = availableW / count;
                              const barW = Math.max(4, Math.min(16, slotW * 0.38));

                              const getY = (gb: number) => {
                                return chartH - padY - (gb / maxQuota) * (chartH - 2 * padY);
                              };

                              return (
                                <div className="min-w-[650px] relative">
                                  <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[250px]">
                                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                      const y = padY + (1 - ratio) * (chartH - 2 * padY);
                                      return (
                                        <g key={idx}>
                                          <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                          <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                            {(ratio * maxQuota).toFixed(2)} GB
                                          </text>
                                        </g>
                                      );
                                    })}

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
                                          <rect x={centerX - barW - 1} y={getY(l.delta_rx_gb || 0)} width={barW} height={Math.max(2, rxH)} rx={3} fill="#0284c7" opacity={hoverIndex30m === i ? 1 : 0.85} />
                                          <rect x={centerX + 1} y={getY(l.delta_tx_gb || 0)} width={barW} height={Math.max(2, txH)} rx={3} fill="#10b981" opacity={hoverIndex30m === i ? 1 : 0.85} />
                                        </g>
                                      );
                                    })}

                                    {logs30m.map((l, i) => {
                                      if (i % Math.max(1, Math.ceil(count / 7)) === 0 || i === count - 1) {
                                        const d = new Date(l.recorded_at);
                                        const lbl = `${d.getDate()}/${d.getMonth() + 1} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
                                        const centerX = padX + i * slotW + slotW / 2;
                                        return (
                                          <text key={`mxb-${i}`} x={centerX} y={chartH - 8} textAnchor="middle" className="text-[9.5px] font-mono fill-slate-400 font-bold">
                                            {lbl}
                                          </text>
                                        );
                                      }
                                      return null;
                                    })}
                                  </svg>

                                  {hoverIndex30m !== null && logs30m[hoverIndex30m] && (
                                    <div
                                      className="absolute bg-slate-900/95 text-white text-[11px] p-3 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1 font-mono backdrop-blur-md border border-slate-700 min-w-[200px]"
                                      style={{
                                        left: `${Math.min(chartW - 210, Math.max(10, padX + hoverIndex30m * slotW - 70))}px`,
                                        top: '10px'
                                      }}
                                    >
                                      <div className="font-bold text-slate-300 pb-1 border-b border-slate-700">
                                        📦 Pukul {new Date(logs30m[hoverIndex30m].recorded_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                      <div className="text-sky-300 font-bold flex justify-between">
                                        <span>Download:</span>
                                        <span>{logs30m[hoverIndex30m].delta_rx_gb} GB</span>
                                      </div>
                                      <div className="text-emerald-300 font-bold flex justify-between">
                                        <span>Upload:</span>
                                        <span>{logs30m[hoverIndex30m].delta_tx_gb} GB</span>
                                      </div>
                                      <div className="pt-1 border-t border-slate-700 text-amber-300 font-bold flex justify-between">
                                        <span>Total:</span>
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

                  {/* Collapsible Table */}
                  {logs30m.length > 0 && (
                    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                      <button
                        type="button"
                        onClick={() => setShowTable30m(!showTable30m)}
                        className="w-full p-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer text-left"
                      >
                        <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          {showTable30m ? <EyeOff size={14} className="text-slate-500" /> : <Eye size={14} className="text-indigo-600" />}
                          <span>{showTable30m ? 'Sembunyikan Tabel Data' : `Tampilkan Rincian Tabel Data (${logs30m.length} Catatan)`}</span>
                        </div>
                        <span className="text-[11px] font-bold text-indigo-600">
                          {showTable30m ? 'Tutup ▲' : 'Buka Rincian ▼'}
                        </span>
                      </button>

                      {showTable30m && (
                        <div className="overflow-x-auto max-h-[300px] scrollbar-thin border-t border-slate-200">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 text-[10.5px] uppercase font-mono font-bold text-slate-500 sticky top-0 border-b border-slate-200 z-10">
                              <tr>
                                <th className="p-3">Waktu Rekam</th>
                                <th className="p-3">Avg RX</th>
                                <th className="p-3">Peak RX</th>
                                <th className="p-3">Avg TX</th>
                                <th className="p-3">Peak TX</th>
                                <th className="p-3">Total Kuota</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {logs30m.slice().reverse().map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="p-3 font-sans font-bold text-slate-800">
                                    {new Date(log.recorded_at).toLocaleString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </td>
                                  <td className="p-3 text-sky-700 font-extrabold">{log.avg_rx_mbps} Mbps</td>
                                  <td className="p-3 text-indigo-900 font-black">
                                    <span className="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200">
                                      {log.peak_rx_mbps} Mbps
                                    </span>
                                  </td>
                                  <td className="p-3 text-emerald-700 font-extrabold">{log.avg_tx_mbps} Mbps</td>
                                  <td className="p-3 text-teal-900 font-black">
                                    <span className="bg-teal-50 text-teal-800 px-1.5 py-0.5 rounded border border-teal-200">
                                      {log.peak_tx_mbps} Mbps
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-slate-800">
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

              {/* ============================================================ */}
              {/* TAB 3: RANGKUMAN PER HARI (DAILY SUMMARY)                    */}
              {/* ============================================================ */}
              {activeTab === 'daily' && (
                <div className="space-y-4">
                  {/* Daily KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3">
                      <div className="text-purple-700 text-xs font-bold">Total Kuota Harian</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-purple-950 mt-1">
                        {dailySummary.reduce((acc, d) => acc + (d.total_gb || 0), 0).toFixed(2)}{' '}
                        <span className="text-xs font-sans text-purple-600">GB</span>
                      </div>
                      <div className="text-[10px] text-purple-600 mt-0.5">{dailySummary.length} hari terdata</div>
                    </div>

                    <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3">
                      <div className="text-sky-700 text-xs font-bold">Rata-Rata / Hari</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-sky-950 mt-1">
                        {dailySummary.length > 0
                          ? (dailySummary.reduce((acc, d) => acc + (d.total_gb || 0), 0) / dailySummary.length).toFixed(2)
                          : 0}{' '}
                        <span className="text-xs font-sans text-sky-600">GB</span>
                      </div>
                      <div className="text-[10px] text-sky-600 mt-0.5">Konsumsi gabungan</div>
                    </div>

                    <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3">
                      <div className="text-rose-700 text-xs font-bold">All-Time Peak</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-rose-950 mt-1">
                        {Math.max(...dailySummary.map(d => d.peak_rx_mbps || 0), 0)}{' '}
                        <span className="text-xs font-sans text-rose-600">Mbps</span>
                      </div>
                      <div className="text-[10px] text-rose-600 mt-0.5">Puncak download tertinggi</div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3">
                      <div className="text-emerald-700 text-xs font-bold">Durasi Catatan</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-emerald-950 mt-1">
                        {dailySummary.length} <span className="text-xs font-sans text-emerald-600">Hari</span>
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">Rekap PostgreSQL</div>
                    </div>
                  </div>

                  {/* Main Daily Chart Box */}
                  <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                          📊
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-slate-800">
                            Grafik Batang Konsumsi Kuota Harian (GB)
                          </h4>
                          <p className="text-[11px] text-slate-400 font-medium">
                            Download vs Upload per hari untuk port <span className="font-mono font-bold text-slate-700">{selectedIface}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span className="text-sky-700 flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded bg-sky-500"></span> Download
                        </span>
                        <span className="text-emerald-700 flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Upload
                        </span>
                      </div>
                    </div>

                    {dailySummary.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs font-bold space-y-1">
                        <Calendar size={28} className="mx-auto mb-2 text-slate-300" />
                        <div>Belum ada data rekapan harian yang terbentuk.</div>
                        <div className="text-[10.5px] text-slate-400 font-normal">
                          Data harian otomatis terakumulasi dari hasil rollup 30-menit setiap hari.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Daily Bar Chart */}
                        <div className="overflow-x-auto select-none">
                          {(() => {
                            const count = dailySummary.length;
                            const maxDailyGb = Math.max(
                              ...dailySummary.map(d => Math.max(d.total_rx_gb || 0, d.total_tx_gb || 0, (d.total_gb || 0) * 0.7)),
                              1
                            );

                            const availableW = chartW - 2 * padX;
                            const slotW = availableW / count;
                            const barW = Math.max(8, Math.min(26, slotW * 0.32));

                            const getY = (gb: number) => {
                              return chartH - padY - (gb / maxDailyGb) * (chartH - 2 * padY);
                            };

                            return (
                              <div className="min-w-[650px] relative">
                                <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-[250px]">
                                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                                    const y = padY + (1 - ratio) * (chartH - 2 * padY);
                                    return (
                                      <g key={idx}>
                                        <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#f1f5f9" strokeWidth="1.2" strokeDasharray={idx === 0 ? '0' : '4 4'} />
                                        <text x={padX - 8} y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400 font-bold">
                                          {(ratio * maxDailyGb).toFixed(1)} GB
                                        </text>
                                      </g>
                                    );
                                  })}

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
                                        <rect x={centerX - barW - 1} y={getY(d.total_rx_gb || 0)} width={barW} height={Math.max(2, rxH)} rx={3} fill="#0284c7" opacity={isHovered ? 1 : 0.85} />
                                        <rect x={centerX + 1} y={getY(d.total_tx_gb || 0)} width={barW} height={Math.max(2, txH)} rx={3} fill="#10b981" opacity={isHovered ? 1 : 0.85} />
                                        <text x={centerX} y={Math.min(getY(d.total_rx_gb || 0), getY(d.total_tx_gb || 0)) - 5} textAnchor="middle" className="text-[8.5px] font-mono font-black fill-purple-700">
                                          {d.total_gb} GB
                                        </text>
                                        <text x={centerX} y={chartH - 8} textAnchor="middle" className={`text-[9.5px] font-mono font-bold ${isHovered ? 'fill-indigo-600 font-black' : 'fill-slate-500'}`}>
                                          {new Date(d.log_date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </text>
                                      </g>
                                    );
                                  })}
                                </svg>

                                {hoverIndexDaily !== null && dailySummary[hoverIndexDaily] && (
                                  <div
                                    className="absolute bg-slate-900/95 text-white text-[11px] p-3 rounded-2xl shadow-2xl pointer-events-none z-10 space-y-1 font-mono backdrop-blur-md border border-slate-700 min-w-[220px]"
                                    style={{
                                      left: `${Math.min(chartW - 230, Math.max(10, padX + hoverIndexDaily * slotW - 80))}px`,
                                      top: '10px'
                                    }}
                                  >
                                    <div className="font-bold text-slate-300 pb-1 border-b border-slate-700">
                                      📅 {new Date(dailySummary[hoverIndexDaily].log_date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </div>
                                    <div className="text-sky-300 font-bold flex justify-between">
                                      <span>Download:</span>
                                      <span>{dailySummary[hoverIndexDaily].total_rx_gb} GB</span>
                                    </div>
                                    <div className="text-emerald-300 font-bold flex justify-between">
                                      <span>Upload:</span>
                                      <span>{dailySummary[hoverIndexDaily].total_tx_gb} GB</span>
                                    </div>
                                    <div className="text-purple-300 font-extrabold flex justify-between border-t border-slate-700 pt-1">
                                      <span>Total Kuota:</span>
                                      <span>{dailySummary[hoverIndexDaily].total_gb} GB</span>
                                    </div>
                                    <div className="text-rose-300 font-bold flex justify-between">
                                      <span>Puncak Peak:</span>
                                      <span>{dailySummary[hoverIndexDaily].peak_rx_mbps} Mbps</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Collapsible Daily Table */}
                  {dailySummary.length > 0 && (
                    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
                      <button
                        type="button"
                        onClick={() => setShowTableDaily(!showTableDaily)}
                        className="w-full p-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between cursor-pointer text-left"
                      >
                        <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          {showTableDaily ? <EyeOff size={14} className="text-slate-500" /> : <Eye size={14} className="text-emerald-600" />}
                          <span>{showTableDaily ? 'Sembunyikan Tabel Data' : `Tampilkan Rincian Tabel Harian (${dailySummary.length} Hari)`}</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600">
                          {showTableDaily ? 'Tutup ▲' : 'Buka Rincian ▼'}
                        </span>
                      </button>

                      {showTableDaily && (
                        <div className="overflow-x-auto border-t border-slate-200">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 text-[10.5px] uppercase font-mono font-bold text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="p-3">Tanggal</th>
                                <th className="p-3">Total Download</th>
                                <th className="p-3">Total Upload</th>
                                <th className="p-3">Total Kuota</th>
                                <th className="p-3">Peak DL</th>
                                <th className="p-3">Rata-Rata Throughput</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {dailySummary.slice().reverse().map((day) => (
                                <tr key={day.log_date} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="p-3 font-sans font-extrabold text-slate-900">
                                    {new Date(day.log_date).toLocaleDateString('id-ID', {
                                      weekday: 'short',
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric'
                                    })}
                                  </td>
                                  <td className="p-3 text-sky-800 font-bold">{day.total_rx_gb} GB</td>
                                  <td className="p-3 text-emerald-800 font-bold">{day.total_tx_gb} GB</td>
                                  <td className="p-3 font-black text-slate-900">
                                    <span className="bg-purple-50 text-purple-800 px-2 py-0.5 rounded-lg border border-purple-200">
                                      {day.total_gb} GB
                                    </span>
                                  </td>
                                  <td className="p-3 text-rose-700 font-black">{day.peak_rx_mbps} Mbps</td>
                                  <td className="p-3 text-slate-600 font-bold">
                                    ↓ {day.avg_rx_mbps} Mbps | ↑ {day.avg_tx_mbps} Mbps
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
            </>
          )}

        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Arbill SNMP 64-bit Engine &bull; Redis In-Memory Ring Buffer &bull; PostgreSQL Aggregator</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
