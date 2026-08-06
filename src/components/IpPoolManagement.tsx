import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Server, 
  Plus, 
  RefreshCw, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Layers,
  Search,
  Zap,
  ArrowRight,
  ShieldCheck,
  Hourglass,
  AlertTriangle
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

export interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
}

export interface IpPoolItem {
  id: string;
  router_id: string;
  name: string;
  gateway?: string;
  ranges: string;
  total_ip?: number;
  subnet?: string;
  is_synced?: boolean;
  on_router?: boolean;
  synced_at?: string;
  created_at?: string;
  router_name?: string;
  router_ip?: string;
}

interface IpPoolManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

// IPv4 Helper Functions
function ipToNum(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  return parts.reduce((acc, octet) => (acc << 8) + (parseInt(octet, 10) || 0), 0) >>> 0;
}

function numToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
}

export default function IpPoolManagement({ profile, t, onLogout }: IpPoolManagementProps) {
  const [pools, setPools] = useState<IpPoolItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPool, setEditingPool] = useState<IpPoolItem | null>(null);
  const [deletingPoolTarget, setDeletingPoolTarget] = useState<IpPoolItem | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [syncingServerId, setSyncingServerId] = useState<string | null>(null);
  const [syncingPoolId, setSyncingPoolId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State (Matching User's Mockup)
  const [name, setName] = useState('ppoetes');
  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [targetSubnet, setTargetSubnet] = useState('/22');
  const [gatewayIp, setGatewayIp] = useState('192.168.53.1');
  const [staticCountInput, setStaticCountInput] = useState<number>(203);

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
      const [resP, resR] = await Promise.all([
        fetch(`${apiUrl}/api/ip-pools`),
        fetch(`${apiUrl}/api/routers`)
      ]);

      const dataP = await parseJsonResponse(resP);
      const dataR = await parseJsonResponse(resR);

      if (dataP.success && Array.isArray(dataP.pools)) {
        setPools(dataP.pools);
      }
      if (dataR.success && Array.isArray(dataR.routers)) {
        setRouters(dataR.routers);
        if (dataR.routers.length > 0 && !selectedRouterId) {
          setSelectedRouterId(dataR.routers[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch IP pools:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Smart CIDR & Gateway Network Calculation (Matches user image 2)
  const calculateSubnetMath = () => {
    const cleanIp = gatewayIp.trim();
    const parts = cleanIp.split('.');
    if (parts.length !== 4 || parts.some(p => isNaN(parseInt(p, 10)) || parseInt(p, 10) < 0 || parseInt(p, 10) > 255)) {
      return {
        isValidIp: false,
        networkIp: '0.0.0.0',
        broadcastIp: '0.0.0.0',
        suggestedGwIp: '192.168.52.1',
        isGwAtBlockStart: true,
        totalUsableHosts: 1022,
        dynamicCount: 562,
        staticCount: 203,
        dhcpRange: '192.168.53.2-192.168.55.51',
        staticRange: '192.168.55.52-192.168.55.254'
      };
    }

    const cidr = parseInt(targetSubnet.replace('/', ''), 10) || 24;
    const gwNum = ipToNum(cleanIp);
    const maskNum = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;

    const netNum = (gwNum & maskNum) >>> 0;
    const broadcastNum = (netNum | (~maskNum >>> 0)) >>> 0;

    const suggestedGwNum = netNum + 1;
    const isGwAtBlockStart = gwNum === suggestedGwNum;

    // Total usable IPs in subnet (excluding network and broadcast addresses)
    const totalUsableHosts = Math.max(0, broadcastNum - netNum - 1);
    
    // Gateway takes 1 usable IP (usually netNum + 1, e.g., 192.168.52.1)
    const poolStartIpNum = netNum + 2; // e.g., 192.168.52.2

    const staticCount = Math.min(Math.max(0, staticCountInput), Math.max(0, totalUsableHosts - 1));
    const dynamicCount = Math.max(0, totalUsableHosts - 1 - staticCount);

    const dhcpStartNum = gwNum + 1; // start from IP right after Gateway (e.g. 192.168.53.2)
    const dhcpEndNum = dhcpStartNum + dynamicCount - 1;

    let dhcpRange = 'Kosong';
    let staticRange = 'Kosong';

    if (dynamicCount > 0 && dhcpEndNum <= broadcastNum - 1) {
      dhcpRange = `${numToIp(dhcpStartNum)}-${numToIp(dhcpEndNum)}`;
    }

    const staticStartNum = dhcpEndNum + 1;
    const staticEndNum = broadcastNum - 1;

    if (staticCount > 0 && staticStartNum <= staticEndNum) {
      staticRange = `${numToIp(staticStartNum)}-${numToIp(staticEndNum)}`;
    } else if (staticCount > 0) {
      staticRange = `${numToIp(netNum + 2)}-${numToIp(netNum + 1 + staticCount)}`;
    }

    return {
      isValidIp: true,
      networkIp: numToIp(netNum),
      broadcastIp: numToIp(broadcastNum),
      suggestedGwIp: numToIp(suggestedGwNum),
      isGwAtBlockStart,
      totalUsableHosts,
      dynamicCount,
      staticCount,
      dhcpRange,
      staticRange
    };
  };

  const netInfo = calculateSubnetMath();

  const resetForm = () => {
    setName('ppoetes');
    setGatewayIp('192.168.53.1');
    setTargetSubnet('/22');
    setStaticCountInput(203);
    if (routers.length > 0) setSelectedRouterId(routers[0].id);
  };

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedRouterId || !gatewayIp) {
      setToastMsg({ type: 'error', text: 'Nama Pool, Router, dan Gateway IP wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/ip-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: selectedRouterId,
          name: name.trim(),
          gateway: gatewayIp.trim(),
          ranges: netInfo.dhcpRange,
          subnet: targetSubnet
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowAddModal(false);
        resetForm();
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat IP Pool.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal membuat IP Pool: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (p: IpPoolItem) => {
    setEditingPool(p);
    setName(p.name);
    setSelectedRouterId(p.router_id);
    setGatewayIp(p.gateway || '192.168.53.1');
    setTargetSubnet(p.subnet || '/22');
    setStaticCountInput(203);
    setShowEditModal(true);
  };

  const handleUpdatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPool || !name.trim() || !gatewayIp) {
      setToastMsg({ type: 'error', text: 'Nama Pool dan Gateway IP wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/ip-pools/${editingPool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          gateway: gatewayIp.trim(),
          ranges: netInfo.dhcpRange,
          subnet: targetSubnet
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowEditModal(false);
        setEditingPool(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui IP Pool.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal memperbarui IP Pool: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const confirmDeletePool = async () => {
    if (!deletingPoolTarget) return;

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/ip-pools/${deletingPoolTarget.id}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setDeletingPoolTarget(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus IP Pool.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal menghapus IP Pool: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Pull live IP Pools from Mikrotik Router
  const handleSyncServer = async (routerId: string) => {
    setSyncingServerId(routerId);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${routerId}/sync-ip-pools`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyinkronkan server.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal sync server: ${err?.message || 'Error'}` });
    } finally {
      setSyncingServerId(null);
    }
  };

  // Push single pool live to Mikrotik
  const handlePushPool = async (poolId: string) => {
    setSyncingPoolId(poolId);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/ip-pools/${poolId}/push-to-mikrotik`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menerbitkan IP Pool ke Mikrotik.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal menerbitkan IP Pool: ${err?.message || 'Error'}` });
    } finally {
      setSyncingPoolId(null);
    }
  };

  // Group Pools by Router
  const poolsByRouter = routers.map(r => ({
    router: r,
    pools: pools.filter(p => p.router_id === r.id && p.name.toLowerCase().includes(searchTerm.toLowerCase()))
  }));

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Daftar Address Pool"
        subtitle="Kelola alokasi IP statis dan dinamis serta sinkronisasi data dengan Mikrotik Router"
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

        {/* Action & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama pool, gateway, range IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} />
              <span>+ Tambah Pool</span>
            </button>
          </div>
        </div>

        {/* Address Pool List per Server */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil daftar address pool Mikrotik...</span>
          </div>
        ) : routers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada Router Mikrotik terdaftar. Daftarkan router terlebih dahulu.
          </div>
        ) : (
          <div className="space-y-6">
            {poolsByRouter.map(({ router: r, pools: routerPools }) => (
              <div key={r.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden space-y-0">
                {/* Server Card Header */}
                <div className="p-5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                      <Server size={20} />
                    </div>
                    <div>
                      <h3 className="font-sans font-bold text-slate-800 text-base">{r.name}</h3>
                      <p className="text-xs font-mono text-slate-400">{r.ip_address}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSyncServer(r.id)}
                    disabled={syncingServerId === r.id}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 border border-slate-200"
                  >
                    <RefreshCw size={14} className={syncingServerId === r.id ? 'animate-spin text-blue-600' : ''} />
                    <span>{syncingServerId === r.id ? 'Tarik dari Mikrotik...' : '🔄 Sync Server'}</span>
                  </button>
                </div>

                {/* Pool Table */}
                {routerPools.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-medium">
                    Belum ada Address Pool pada server ini. Klik "Sync Server" untuk menarik pool langsung dari Mikrotik Router.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-100 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                          <th className="py-4 px-6">NAMA POOL</th>
                          <th className="py-4 px-6">GATEWAY</th>
                          <th className="py-4 px-6 text-center">TOTAL IP</th>
                          <th className="py-4 px-6">DINAMIS (MIKROTIK)</th>
                          <th className="py-4 px-6 text-center">SYNC STATUS</th>
                          <th className="py-4 px-6 text-right">AKSI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {routerPools.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-4 px-6 font-mono font-bold text-slate-900">{p.name}</td>
                            <td className="py-4 px-6 font-mono text-slate-600">{p.gateway || '192.168.53.1'}</td>
                            <td className="py-4 px-6 text-center font-mono font-extrabold text-slate-700">{p.total_ip || 254}</td>
                            <td className="py-4 px-6 font-mono text-blue-600 font-extrabold">{p.ranges}</td>
                            <td className="py-4 px-6 text-center">
                              {p.is_synced ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                  <CheckCircle2 size={11} />
                                  Tersingkron
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                  <AlertCircle size={11} />
                                  Draft / Belum Sync
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  onClick={() => handlePushPool(p.id)}
                                  disabled={syncingPoolId === p.id}
                                  className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                    p.is_synced 
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                                      : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
                                  }`}
                                >
                                  <Zap size={13} className={syncingPoolId === p.id ? 'animate-spin' : ''} />
                                  <span>{syncingPoolId === p.id ? 'Publishing...' : p.is_synced ? 'Publish Ulang' : '⚡ Publish Mikrotik'}</span>
                                </button>

                                <button
                                  onClick={() => openEditModal(p)}
                                  className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                                  title="Edit Pool"
                                >
                                  <Edit size={14} />
                                </button>

                                <button
                                  onClick={() => setDeletingPoolTarget(p)}
                                  className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                                  title="Hapus Pool"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Konfirmasi Hapus IP Pool */}
      {deletingPoolTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up p-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 size={28} />
            </div>

            <div>
              <h3 className="font-sans font-bold text-slate-800 text-lg">Hapus Address Pool?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Apakah Anda yakin ingin menghapus Address Pool <strong className="text-slate-800 font-mono">"{deletingPoolTarget.name}"</strong> (<span className="font-mono">{deletingPoolTarget.ranges}</span>) dari database lokal ArbillPay?
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-[11px] text-amber-800 text-left flex items-start gap-2">
              <ShieldCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Keamanan Router:</strong> Pool di Mikrotik Router Anda <u>TIDAK AKAN terhapus</u>. Penghapusan ini hanya membersihkan record lokal di ArbillPay.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPoolTarget(null)}
                className="w-full py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={confirmDeletePool}
                disabled={submitLoading}
                className="w-full py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                <span>{submitLoading ? 'Menghapus...' : 'Ya, Hapus Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Address Pool (EXACT MATCH TO USER'S SCREENSHOT 2) */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-5xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <Network size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">
                    {showEditModal ? 'Edit Address Pool' : 'Tambah Address Pool'}
                  </h3>
                  <p className="text-xs text-slate-400">Kelola alokasi IP statis dan dinamis dengan validasi cerdas</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingPool(null); }} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body (2 Columns Layout matching user screenshot) */}
            <form onSubmit={showEditModal ? handleUpdatePool : handleCreatePool} className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Network Form Inputs (Informasi Jaringan) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <Info size={14} className="text-blue-500" />
                    <span>INFORMASI JARINGAN</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pool *</label>
                    <input
                      type="text"
                      required
                      placeholder="ppoetes"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mikrotik Server *</label>
                      <select
                        value={selectedRouterId}
                        onChange={(e) => setSelectedRouterId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                      >
                        {routers.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Target Subnet *</label>
                      <select
                        value={targetSubnet}
                        onChange={(e) => setTargetSubnet(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                      >
                        <option value="/22">Class B2 (Max 1022 Host) - /22</option>
                        <option value="/24">Class C (Max 254 Host) - /24</option>
                        <option value="/25">Class C Subnet - /25 (126 Host)</option>
                        <option value="/26">Class C Subnet - /26 (62 Host)</option>
                        <option value="/23">Class B Subnet - /23 (510 Host)</option>
                        <option value="/21">Class B Subnet - /21 (2046 Host)</option>
                        <option value="/20">Class B Subnet - /20 (4094 Host)</option>
                        <option value="/16">Class A/B Subnet - /16 (65534 Host)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">IP Router / Gateway *</label>
                    <input
                      type="text"
                      required
                      placeholder="192.168.53.1"
                      value={gatewayIp}
                      onChange={(e) => setGatewayIp(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                  </div>

                  {/* SMART SUBNET & GATEWAY WARNING ALERT BOX (EXACT MATCH TO USER'S SCREENSHOT 2) */}
                  {!netInfo.isGwAtBlockStart ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-3 shadow-xs animate-fade-in">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <div>
                          <strong>IP {gatewayIp}</strong> bukan awal blok untuk <strong>{targetSubnet}</strong>.
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Saran IP Router terbaik:</span>
                          <button
                            type="button"
                            onClick={() => setGatewayIp(netInfo.suggestedGwIp)}
                            className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-mono font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-xs inline-flex items-center gap-1"
                            title="Klik untuk gunakan IP Router terbaik"
                          >
                            <span>{netInfo.suggestedGwIp}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-center gap-2.5 animate-fade-in">
                      <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                      <span className="font-bold">
                        IP Router <strong className="font-mono">{gatewayIp}</strong> sudah sesuai sebagai awal blok {targetSubnet}.
                      </span>
                    </div>
                  )}

                  {/* Network & Broadcast Summary Bar (Matching User's Screenshot 2) */}
                  <div className="p-3.5 bg-slate-100 rounded-2xl flex items-center justify-between text-xs font-mono text-slate-700 font-bold border border-slate-200/60">
                    <span>Network: <strong>{netInfo.networkIp}</strong></span>
                    <span>Broadcast: <strong>{netInfo.broadcastIp}</strong></span>
                  </div>
                </div>

                {/* Right Column: IP Address Distribution Panel (DISTRIBUSI ALAMAT IP - Matching User's Screenshot 2) */}
                <div className="lg:col-span-5 bg-slate-50/80 p-5 rounded-3xl border border-slate-200/80 space-y-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 text-center mb-4">
                      DISTRIBUSI ALAMAT IP
                    </h4>

                    {/* Interactive Statis & Dinamis Counters Box (Matching User's Screenshot 2) */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      {/* Statis System Input Counter Box */}
                      <div className="bg-white p-3.5 rounded-2xl border-2 border-blue-400 text-center shadow-xs">
                        <label className="block text-[11px] font-bold text-blue-600 mb-1">Statis (System)</label>
                        <input
                          type="number"
                          min="0"
                          max={netInfo.totalUsableHosts}
                          value={staticCountInput}
                          onChange={(e) => setStaticCountInput(parseInt(e.target.value) || 0)}
                          className="w-full text-center text-2xl font-mono font-black text-slate-900 bg-transparent focus:outline-none"
                        />
                      </div>

                      {/* Dinamis Pool Calculated Counter Box */}
                      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-xs">
                        <div className="text-[11px] font-bold text-slate-600 mb-1">Dinamis (Pool)</div>
                        <div className="text-2xl font-mono font-black text-slate-900 pt-1">{netInfo.dynamicCount}</div>
                      </div>
                    </div>

                    {/* DHCP RANGE (MIKROTIK) (Matching User's Screenshot 2) */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>DHCP RANGE (MIKROTIK)</span>
                          <span className="bg-blue-600 text-white font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                            {netInfo.dynamicCount} IP
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-2xl border-2 border-blue-500 font-mono font-black text-blue-600 text-xs text-center shadow-xs">
                          {netInfo.dhcpRange}
                        </div>
                      </div>

                      {/* STATIC RANGE (INTERNAL) (Matching User's Screenshot 2) */}
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>STATIC RANGE (INTERNAL)</span>
                          <span className="bg-slate-700 text-white font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                            {netInfo.staticCount} IP
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-2xl border border-slate-200 font-mono font-bold text-slate-600 text-xs text-center">
                          {netInfo.staticRange}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-2xl text-[11px] text-blue-800 leading-snug">
                    ℹ️ <strong>Kalkulasi Cerdas:</strong> Cukup tentukan Gateway & Jumlah IP Statis. Range DHCP dan IP Statis secara otomatis dihitung dan dibagi rapi oleh sistem.
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingPool(null); }} 
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Batal
                </button>

                <button 
                  type="submit" 
                  disabled={submitLoading} 
                  className="px-6 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : showEditModal ? 'Simpan Perubahan' : 'Simpan Pool Baru'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
