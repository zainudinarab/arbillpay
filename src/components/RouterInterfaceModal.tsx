import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  Server,
  Layers,
  Radio,
  Sliders,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { getApiUrl } from '../config/api';

export interface MikrotikInterface {
  id: string;
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment: string;
  macAddress: string;
  actualMtu: string;
  linkDowns: number;
  rxByte: string;
  txByte: string;
  rxFormatted: string;
  txFormatted: string;
  rxSpeedMbps: number;
  txSpeedMbps: number;
  rxError: number;
  txError: number;
  rxDrop: number;
  txDrop: number;
  isMonitored: boolean;
  interfaceType: string;
  linkedNodeId: string | null;
}

interface RouterInterfaceModalProps {
  router: {
    id: string;
    name: string;
    ip_address: string;
    api_port?: number;
  };
  onClose: () => void;
}

export default function RouterInterfaceModal({ router, onClose }: RouterInterfaceModalProps) {
  const [interfaces, setInterfaces] = useState<MikrotikInterface[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    running: number;
    down: number;
    totalRxGb: number;
    totalTxGb: number;
  } | null>(null);
  const [routerMeta, setRouterMeta] = useState<{ snmp_enabled?: boolean; snmp_port?: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const timerRef = useRef<any>(null);

  const fetchInterfaces = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${router.id}/interfaces`);
      const data = await res.json();
      if (data.success) {
        setInterfaces(data.interfaces || []);
        setSummary(data.summary || null);
        if (data.router) {
          setRouterMeta(data.router);
        }
      } else {
        if (isManual) {
          setToastMsg({ type: 'error', text: data.message || 'Gagal memuat interface' });
        }
      }
    } catch (err: any) {
      if (isManual) {
        setToastMsg({ type: 'error', text: `Koneksi gagal: ${err.message}` });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInterfaces();
  }, [router.id]);

  // Auto-refresh interval (every 8 seconds if enabled)
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchInterfaces();
      }, 8000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, router.id]);

  const handleToggleMonitoring = async (iface: MikrotikInterface) => {
    const nextVal = !iface.isMonitored;
    setToggleLoading(iface.name);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${router.id}/interfaces/toggle-monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interface_name: iface.name,
          is_monitored: nextVal
        })
      });
      const data = await res.json();
      if (data.success) {
        setInterfaces(prev =>
          prev.map(i => (i.name === iface.name ? { ...i, isMonitored: nextVal } : i))
        );
        setToastMsg({
          type: 'success',
          text: `Pemantauan log 30-menit port "${iface.name}" ${nextVal ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}.`
        });
      }
    } catch (e: any) {
      setToastMsg({ type: 'error', text: e.message });
    } finally {
      setToggleLoading(null);
    }
  };

  // Filtered interfaces
  const filtered = interfaces.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.comment.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.type.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      typeFilter === 'all'
        ? true
        : typeFilter === 'ether'
        ? item.type === 'ether'
        : typeFilter === 'vlan'
        ? item.type === 'vlan'
        : typeFilter === 'bridge'
        ? item.type === 'bridge'
        : typeFilter === 'pppoe'
        ? item.type.includes('pppoe')
        : true;

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'running'
        ? item.running
        : statusFilter === 'down'
        ? !item.running
        : true;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-[2600] animate-fade-in">
      <div className="bg-white w-full max-w-6xl rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-xl flex items-center justify-center shadow-md">
              🔌
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex flex-wrap items-center gap-2">
                <span>Daftar Interface & Port Live</span>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border border-blue-200">
                  {router.name} ({router.ip_address})
                </span>
                {routerMeta?.snmp_enabled ? (
                  <span className="bg-emerald-50 text-emerald-800 text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shadow-2xs">
                    📡 Poller: SNMP 64-bit (Port {routerMeta.snmp_port || 161})
                  </span>
                ) : (
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                    ⚡ Poller: MikroTik API (8728)
                  </span>
                )}
                {refreshing && (
                  <span className="text-[10px] text-blue-600 font-bold animate-pulse flex items-center gap-1">
                    <RefreshCw size={10} className="animate-spin" /> Membaca RouterOS...
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Monitor status fisik port, kecepatan download/upload realtime, packet error, dan saklar pencatatan log 30-menit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Aktifkan atau jeda pembaruan otomatis setiap 8 detik"
            >
              <Radio size={13} className={autoRefresh ? 'animate-pulse text-emerald-600' : ''} />
              <span>{autoRefresh ? 'Live (8s)' : 'Jeda'}</span>
            </button>

            <button
              onClick={() => fetchInterfaces(true)}
              disabled={refreshing}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer font-bold disabled:opacity-50"
              title="Segarkan data port sekarang"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={onClose}
              className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
              toastMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="cursor-pointer font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* 4 Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="p-3 bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-200/80 rounded-2xl">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Total Interface</div>
              <div className="text-xl sm:text-2xl font-black text-slate-800 font-mono">
                {summary.total} <span className="text-xs font-medium text-slate-500">Port</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Fisik, VLAN, & Virtual</div>
            </div>

            <div className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 rounded-2xl">
              <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Port Aktif (Link UP)</div>
              <div className="text-xl sm:text-2xl font-black text-emerald-800 font-mono">
                {summary.running} <span className="text-xs font-medium text-emerald-600">Running</span>
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Kabel terhubung & beroperasi</div>
            </div>

            <div className="p-3 bg-gradient-to-br from-rose-50 to-orange-50/50 border border-rose-200 rounded-2xl">
              <div className="text-[10px] font-bold text-rose-700 uppercase tracking-wider mb-0.5">Link Down / Mati</div>
              <div className="text-xl sm:text-2xl font-black text-rose-800 font-mono">
                {summary.down} <span className="text-xs font-medium text-rose-600">Port</span>
              </div>
              <div className="text-[10px] text-rose-600 mt-0.5">Kabel lepas atau port disabled</div>
            </div>

            <div className="p-3 bg-gradient-to-br from-purple-50 to-indigo-50/50 border border-purple-200 rounded-2xl">
              <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-0.5">Akumulasi Kuota Total</div>
              <div className="text-xl sm:text-2xl font-black text-purple-900 font-mono">
                {(summary.totalRxGb + summary.totalTxGb).toFixed(1)} <span className="text-xs font-medium text-purple-600">GB</span>
              </div>
              <div className="text-[10px] text-purple-600 mt-0.5">
                📥 {summary.totalRxGb} GB | 📤 {summary.totalTxGb} GB
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari nama port (ether1, sfp, wan, olt)..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-blue-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Tipe Port</option>
              <option value="ether">Ethernet / SFP Fisik</option>
              <option value="vlan">VLAN</option>
              <option value="bridge">Bridge</option>
              <option value="pppoe">PPPoE Client</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Status</option>
              <option value="running">🟢 Hanya Running (UP)</option>
              <option value="down">⚪ Hanya Link Down</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl shadow-xs">
          {loading ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <RefreshCw size={28} className="animate-spin mx-auto text-blue-600" />
              <div className="font-extrabold text-sm">Menghubungi API Router MikroTik...</div>
              <p className="text-xs text-slate-400">Membaca daftar port fisik, SFP, dan statistik RX/TX</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <AlertTriangle size={28} className="mx-auto text-amber-500" />
              <div className="font-bold text-sm text-slate-700">Tidak ada interface yang cocok</div>
              <p className="text-xs">Coba sesuaikan kata kunci pencarian atau filter status Anda.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[9.5px] font-extrabold border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="p-3">Interface & Port</th>
                  <th className="p-3">Tipe / Role</th>
                  <th className="p-3">Status Link</th>
                  <th className="p-3">Throughput Live</th>
                  <th className="p-3">Akumulasi Kuota</th>
                  <th className="p-3">Kesehatan Port</th>
                  <th className="p-3 text-center">Log 30-Mnt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(iface => {
                  const isWan = iface.name.toLowerCase().includes('wan');
                  const isOlt = iface.name.toLowerCase().includes('olt');

                  return (
                    <tr key={iface.name} className="hover:bg-blue-50/40 transition-colors">
                      {/* Name & Comment */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              iface.running
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {iface.type === 'ether' ? '⚡' : iface.type === 'vlan' ? '🏷️' : iface.type === 'bridge' ? '🌉' : '🌐'}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                              <span>{iface.name}</span>
                              {isWan && (
                                <span className="bg-sky-100 text-sky-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-sky-300">
                                  WAN ISP
                                </span>
                              )}
                              {isOlt && (
                                <span className="bg-purple-100 text-purple-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-purple-300">
                                  TRUNK OLT
                                </span>
                              )}
                            </div>
                            {iface.comment ? (
                              <div className="text-[10px] text-slate-500 font-medium italic">
                                💬 {iface.comment}
                              </div>
                            ) : (
                              <div className="text-[9.5px] font-mono text-slate-400">
                                MTU: {iface.actualMtu} {iface.macAddress ? `| ${iface.macAddress}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type / Role */}
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10.5px]">
                          {iface.type}
                        </span>
                      </td>

                      {/* Link Status */}
                      <td className="p-3">
                        {iface.running ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                            RUNNING (UP)
                          </span>
                        ) : iface.disabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            DISABLED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            LINK DOWN
                          </span>
                        )}
                        {iface.linkDowns > 0 && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            Flap: {iface.linkDowns}x
                          </div>
                        )}
                      </td>

                      {/* Live Speed */}
                      <td className="p-3 font-mono">
                        <div className="space-y-0.5">
                          <div className="text-sky-700 font-bold flex items-center gap-1">
                            <ArrowDown size={11} className="text-sky-500" />
                            <span>{iface.rxSpeedMbps} Mbps</span>
                          </div>
                          <div className="text-emerald-700 font-medium text-[10.5px] flex items-center gap-1">
                            <ArrowUp size={11} className="text-emerald-500" />
                            <span>{iface.txSpeedMbps} Mbps</span>
                          </div>
                        </div>
                      </td>

                      {/* Cumulative Bytes */}
                      <td className="p-3 font-mono text-[11px]">
                        <div className="text-slate-800 font-bold">📥 {iface.rxFormatted}</div>
                        <div className="text-slate-500 text-[10px]">📤 {iface.txFormatted}</div>
                      </td>

                      {/* Error & Drop Check */}
                      <td className="p-3">
                        {iface.rxError > 0 || iface.txError > 0 || iface.rxDrop > 0 || iface.txDrop > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <AlertTriangle size={11} />
                            <span>Drop: {iface.rxDrop + iface.txDrop} | Err: {iface.rxError + iface.txError}</span>
                          </span>
                        ) : (
                          <span className="text-[10.5px] text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 size={12} /> Sehat (0 Drop)
                          </span>
                        )}
                      </td>

                      {/* Log 30-Menit Toggle */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleMonitoring(iface)}
                          disabled={toggleLoading === iface.name}
                          className={`w-10 h-6 rounded-full transition-all cursor-pointer relative p-0.5 ${
                            iface.isMonitored ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                          title={`Klik untuk ${iface.isMonitored ? 'menonaktifkan' : 'mengaktifkan'} penyimpanan log 30-menit`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform transform ${
                              iface.isMonitored ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs shrink-0">
          <div className="text-slate-500 flex items-center gap-2">
            <span>💡 <strong>Tips:</strong> Aktifkan toggle <em>Log 30-Mnt</em> hanya pada port WAN & OLT agar database tetap ringan.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            Tutup Monitor
          </button>
        </div>
      </div>
    </div>
  );
}
