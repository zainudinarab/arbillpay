import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Search, 
  Filter, 
  MapPin, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  Radio, 
  Edit3, 
  Trash2, 
  ExternalLink,
  Plus,
  Network,
  Zap,
  Box,
  Cpu,
  Wifi
} from 'lucide-react';
import { getFtthMapFromFirestore, saveFtthMapToFirestore } from '../services/firebaseService';

export const FtthDevicesPage: React.FC = () => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTopology = async () => {
    setLoading(true);
    try {
      const res = await getFtthMapFromFirestore();
      if (res.success) {
        setNodes(res.nodes || []);
        setLines(res.lines || []);
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memuat daftar perangkat: ' + (err?.message || 'Error') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopology();
  }, []);

  const handleDeleteNode = async (nodeId: string, nodeName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin MENGHAPUS node perangkat "${nodeName}" (#${nodeId})?\n\nSemua jalur kabel optik yang terhubung ke node ini akan otomatis dicabut!`)) return;

    try {
      const updatedNodes = nodes.filter(n => n.id !== nodeId);
      const updatedLines = lines.filter(l => l.fromId !== nodeId && l.toId !== nodeId);

      setNodes(updatedNodes);
      setLines(updatedLines);
      await saveFtthMapToFirestore(updatedNodes, updatedLines);
      setToastMsg({ type: 'success', text: `Node perangkat "${nodeName}" berhasil dihapus dari topologi!` });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus node: ' + err?.message });
    }
  };

  // Filter computation
  const filteredNodes = nodes.filter(node => {
    const nameMatch = (node.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const custMatch = (node.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const snMatch = (node.sn_onu || '').toLowerCase().includes(searchQuery.toLowerCase());
    const brandMatch = (node.brand || '').toLowerCase().includes(searchQuery.toLowerCase());
    const modelMatch = (node.model || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSearch = nameMatch || custMatch || snMatch || brandMatch || modelMatch;

    let matchesType = true;
    if (selectedType === 'ONU') matchesType = node.type === 'ONU';
    else if (selectedType === 'ODP') matchesType = node.type === 'ODP';
    else if (selectedType === 'HTB') matchesType = node.type === 'HTB';
    else if (selectedType === 'NETWORK') matchesType = node.type === 'SWITCH' || node.type === 'ROUTER' || node.type === 'OLT';

    return matchesSearch && matchesType;
  });

  const totalDevices = nodes.length;
  const onuCount = nodes.filter(n => n.type === 'ONU').length;
  const odpCount = nodes.filter(n => n.type === 'ODP').length;
  const htbCount = nodes.filter(n => n.type === 'HTB').length;
  const routerCount = nodes.filter(n => n.type === 'SWITCH' || n.type === 'ROUTER' || n.type === 'OLT').length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn font-sans">
      {/* Notification Toast */}
      {toastMsg && (
        <div className={`p-4 rounded-2xl text-xs font-extrabold flex justify-between items-center shadow-lg animate-bounce ${
          toastMsg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          <span>{toastMsg.text}</span>
          <button onClick={() => setToastMsg(null)} className="ml-4 font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Header Page Title */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-black uppercase tracking-wider">
            <Server size={16} />
            <span>Tabel Inventory Perangkat Terpasang (FTTH Topology)</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Tabel Perangkat Lapangan FTTH
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Daftar lengkap perangkat ODP Box, Modem ONU Pelanggan, HTB Media Converter, dan Router yang tersinkronasi dengan Peta Topologi FTTH.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchTopology}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Data</span>
          </button>
          <a
            href="#/map-ftth"
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-200"
          >
            <MapPin size={14} />
            <span>Buka Peta Topologi FTTH</span>
          </a>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Node Perangkat</span>
          <div className="text-xl font-black text-slate-900">{totalDevices} Node</div>
          <span className="text-[10px] text-slate-500 font-medium">Topologi FTTH Active</span>
        </div>

        <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Modem ONU Pelanggan</span>
          <div className="text-xl font-black text-indigo-950">{onuCount} Unit</div>
          <span className="text-[10px] text-indigo-600 font-medium">FTTH Dedicated Customer</span>
        </div>

        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">ODP Box Distribusi</span>
          <div className="text-xl font-black text-emerald-950">{odpCount} Box</div>
          <span className="text-[10px] text-emerald-600 font-medium">Kotak Distribusi Kabel FO</span>
        </div>

        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">HTB Media Converter</span>
          <div className="text-xl font-black text-amber-950">{htbCount} Unit</div>
          <span className="text-[10px] text-amber-600 font-medium">Converter Fiber Optic 1310/1550</span>
        </div>

        <div className="bg-sky-50/70 p-4 rounded-2xl border border-sky-100 shadow-xs space-y-1">
          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">OLT & Router/Switch</span>
          <div className="text-xl font-black text-sky-950">{routerCount} Unit</div>
          <span className="text-[10px] text-sky-600 font-medium">Core Node & Distribution</span>
        </div>
      </div>

      {/* Filter & Live Search Section */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                selectedType === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Perangkat ({totalDevices})
            </button>
            <button
              onClick={() => setSelectedType('ONU')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                selectedType === 'ONU' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Modem ONU Pelanggan ({onuCount})
            </button>
            <button
              onClick={() => setSelectedType('ODP')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                selectedType === 'ODP' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ODP Box ({odpCount})
            </button>
            <button
              onClick={() => setSelectedType('HTB')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                selectedType === 'HTB' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              HTB Converter ({htbCount})
            </button>
            <button
              onClick={() => setSelectedType('NETWORK')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer shrink-0 ${
                selectedType === 'NETWORK' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              OLT / Router / Switch ({routerCount})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama node, pelanggan, SN, merek..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
            <p className="text-xs font-bold text-slate-600">Memuat Topologi Perangkat FTTH...</p>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Server size={32} className="mx-auto text-slate-300" />
            <p className="text-xs font-bold text-slate-600">Tidak ada node perangkat yang cocok dengan kriteria pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Tipe Node</th>
                  <th className="py-3 px-4">Nama Node & Pelanggan</th>
                  <th className="py-3 px-4">Merek & Model Specs</th>
                  <th className="py-3 px-4">Kapasitas Port (FO vs RJ45)</th>
                  <th className="py-3 px-4">SN ONU / Jalur ODP</th>
                  <th className="py-3 px-4">Koordinat GPS</th>
                  <th className="py-3 px-4 text-center">Status Line</th>
                  <th className="py-3 px-4 text-right">Aksi Topologi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredNodes.map((node) => (
                  <tr key={node.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Tipe Node Badge */}
                    <td className="py-3.5 px-4 font-bold">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                        node.type === 'ONU'
                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                          : node.type === 'ODP'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          : node.type === 'HTB'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-sky-100 text-sky-900 border border-sky-200'
                      }`}>
                        {node.type === 'ONU' ? '🏠 MODEM ONU' : node.type === 'ODP' ? '📦 ODP BOX' : node.type === 'HTB' ? '⚡ HTB CONVERTER' : node.type}
                      </span>
                    </td>

                    {/* Nama Node & Pelanggan */}
                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                        <span>{node.name || `Node #${node.id}`}</span>
                      </div>
                      {node.customerName && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          👤 Pelanggan: <b>{node.customerName}</b>
                        </div>
                      )}
                      <div className="text-[9.5px] font-mono text-slate-400">ID: {node.id}</div>
                    </td>

                    {/* Merek & Model */}
                    <td className="py-3.5 px-4 space-y-0.5">
                      <div className="font-extrabold text-slate-800 text-xs">
                        {node.brand || 'Generic'} {node.model || ''}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {node.wifi_spec || `${node.lan_ports || node.capacity || 4} Port LAN`}
                      </div>
                    </td>

                    {/* Port FO vs RJ45 Breakdown */}
                    <td className="py-3.5 px-4 space-y-1">
                      <div className="text-[11px] font-mono font-bold text-slate-800">
                        {node.type === 'ONU' ? (
                          <span className="text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                            1 FO (ODP) + {node.lan_ports || 4} RJ45 LAN
                          </span>
                        ) : node.type === 'HTB' ? (
                          <span className="text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            Fiber A/B + {node.lan_ports || 2} RJ45 LAN
                          </span>
                        ) : (
                          <span className="text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                            Kapasitas: {node.capacity || 8} Port
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SN ONU / Jalur ODP */}
                    <td className="py-3.5 px-4 space-y-0.5 font-mono text-[11px]">
                      {node.sn_onu ? (
                        <div className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded inline-block">
                          SN: {node.sn_onu}
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[10px] italic">SN tidak diisi</div>
                      )}
                      {node.odp_port && (
                        <div className="text-[10px] text-emerald-700 font-extrabold">
                          📍 Jalur: {node.odp_port}
                        </div>
                      )}
                    </td>

                    {/* GPS Coordinates */}
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      {node.lat && node.lng ? (
                        <a
                          href={`https://www.google.com/maps?q=${node.lat},${node.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 px-2 py-0.5 rounded-md transition-all inline-flex items-center gap-1"
                        >
                          <span>📍 {Number(node.lat).toFixed(5)}, {Number(node.lng).toFixed(5)}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Tanpa GPS</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        node.status === 'online'
                          ? 'bg-emerald-100 text-emerald-800'
                          : node.status === 'isolated'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {node.status || 'online'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <a
                        href={`#/map-ftth?nodeId=${node.id}`}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-extrabold transition inline-flex items-center gap-1 cursor-pointer"
                        title="Buka titik node ini di Peta FTTH Interactive"
                      >
                        <MapPin size={11} />
                        <span>Peta</span>
                      </a>
                      <button
                        onClick={() => handleDeleteNode(node.id, node.name || node.id)}
                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                        title="Hapus node dari Peta Topologi FTTH"
                      >
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FtthDevicesPage;
