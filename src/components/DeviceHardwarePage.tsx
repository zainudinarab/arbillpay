import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Zap, 
  Wifi, 
  Server, 
  Globe, 
  HardDrive,
  RefreshCw,
  Info,
  Sliders,
  Filter
} from 'lucide-react';
import { 
  DEFAULT_DEVICE_CATALOG, 
  getDeviceCatalogFromFirestore, 
  saveDeviceCatalogToFirestore 
} from '../services/firebaseService';

export interface DeviceSpecItem {
  id: string;
  type: 'ONU' | 'ROUTER_WIFI' | 'HTB' | 'SWITCH' | 'OTHER';
  brand: string;
  model: string;
  lan_ports: number;
  wifi_spec?: string;
  notes?: string;
  image_url?: string;
  created_at?: string;
}

export default function DeviceHardwarePage() {
  const [catalog, setCatalog] = useState<DeviceSpecItem[]>(DEFAULT_DEVICE_CATALOG as any);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal State
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DeviceSpecItem | null>(null);

  // Form State
  const [formType, setFormType] = useState<'ONU' | 'ROUTER_WIFI' | 'HTB' | 'SWITCH' | 'OTHER'>('ONU');
  const [formBrand, setFormBrand] = useState('ZTE');
  const [formModel, setFormModel] = useState('');
  const [formLanPorts, setFormLanPorts] = useState<number>(4);
  const [formWifiSpec, setFormWifiSpec] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await getDeviceCatalogFromFirestore();
      if (res.success && Array.isArray(res.catalog) && res.catalog.length > 0) {
        setCatalog(res.catalog as any);
      } else {
        setCatalog(DEFAULT_DEVICE_CATALOG as any);
      }
    } catch (err: any) {
      console.warn('[HARDWARE CATALOG WARN] Failed to load catalog from Firestore:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormType('ONU');
    setFormBrand('ZTE');
    setFormModel('');
    setFormLanPorts(4);
    setFormWifiSpec('2.4GHz Wi-Fi (4 LAN Ethernet)');
    setFormNotes('');
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (item: DeviceSpecItem) => {
    setEditingItem(item);
    setFormType(item.type || 'ONU');
    setFormBrand(item.brand || 'ZTE');
    setFormModel(item.model || '');
    setFormLanPorts(Number(item.lan_ports) || 4);
    setFormWifiSpec(item.wifi_spec || '');
    setFormNotes(item.notes || '');
    setShowAddEditModal(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBrand.trim() || !formModel.trim()) {
      showToast('error', 'Merek dan Seri Model Perangkat wajib diisi!');
      return;
    }

    try {
      let updatedList: DeviceSpecItem[];

      if (editingItem) {
        updatedList = catalog.map(item => item.id === editingItem.id ? {
          ...item,
          type: formType,
          brand: formBrand.trim(),
          model: formModel.trim(),
          lan_ports: Number(formLanPorts),
          wifi_spec: formWifiSpec.trim() || `${formLanPorts} Port LAN Ethernet`,
          notes: formNotes.trim() || undefined
        } : item);
      } else {
        const newItem: DeviceSpecItem = {
          id: `cat-${Date.now()}`,
          type: formType,
          brand: formBrand.trim(),
          model: formModel.trim(),
          lan_ports: Number(formLanPorts),
          wifi_spec: formWifiSpec.trim() || `${formLanPorts} Port LAN Ethernet`,
          notes: formNotes.trim() || 'Custom Hardware',
          created_at: new Date().toISOString()
        };
        updatedList = [newItem, ...catalog];
      }

      setCatalog(updatedList);
      await saveDeviceCatalogToFirestore(updatedList);
      showToast('success', `Data spesifikasi "${formBrand} ${formModel}" berhasil disimpan ke Cloud Catalog!`);
      setShowAddEditModal(false);
    } catch (err: any) {
      showToast('error', 'Gagal menyimpan katalog spesifikasi: ' + (err?.message || 'Error'));
    }
  };

  const handleDeleteItem = async (item: DeviceSpecItem) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus "${item.brand} ${item.model}" dari Katalog Master?`)) return;
    try {
      const updatedList = catalog.filter(c => c.id !== item.id);
      setCatalog(updatedList);
      await saveDeviceCatalogToFirestore(updatedList);
      showToast('success', `Spesifikasi "${item.brand} ${item.model}" berhasil dihapus dari Katalog Master!`);
    } catch (err: any) {
      showToast('error', 'Gagal menghapus spesifikasi: ' + (err?.message || 'Error'));
    }
  };

  // Filter computation
  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = 
      item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.wifi_spec && item.wifi_spec.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedType === 'ALL' || item.type === selectedType;
    const matchesBrand = selectedBrand === 'ALL' || item.brand.toLowerCase() === selectedBrand.toLowerCase();

    return matchesSearch && matchesType && matchesBrand;
  });

  const allBrands = Array.from(new Set(catalog.map(c => c.brand)));
  const onuCount = catalog.filter(c => c.type === 'ONU').length;
  const wifiCount = catalog.filter(c => c.type === 'ROUTER_WIFI').length;
  const otherCount = catalog.filter(c => c.type !== 'ONU' && c.type !== 'ROUTER_WIFI').length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn font-sans">
      {/* Toast Notification */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl text-white font-bold text-xs flex items-center gap-3 border animate-bounce ${
          toastMsg.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
        }`}>
          <span>{toastMsg.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-2xl border border-blue-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-[11px] font-extrabold text-blue-300 uppercase tracking-wider">
              <Cpu size={13} className="text-blue-400" />
              <span>Master Hardware Catalog & Specs</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>Daftar Spesifikasi Perangkat ISP</span>
            </h1>
            <p className="text-xs sm:text-sm text-blue-200/90 max-w-2xl font-medium">
              Katalog spesifikasi Merek, Seri Model, dan Kapasitas Port LAN Modem ONU Optik & Router Wireless. Terhubung otomatis dengan Form Pelanggan & Peta Topologi FTTH.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 cursor-pointer transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            <span>+ Tambah Perangkat Baru</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">TOTAL KATALOG</span>
            <HardDrive size={18} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{catalog.length}</div>
          <p className="text-[10px] text-slate-500 font-medium">Model Perangkat Terdaftar</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">MODEM ONU OPTIK</span>
            <Server size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-950">{onuCount}</div>
          <p className="text-[10px] text-slate-500 font-medium">Model GPON / EPON</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">ROUTER WIRELESS</span>
            <Wifi size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950">{wifiCount}</div>
          <p className="text-[10px] text-slate-500 font-medium">Model Wi-Fi Router / AP</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">DISTRIBUSI LAN/HTB</span>
            <Zap size={18} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-950">{otherCount}</div>
          <p className="text-[10px] text-slate-500 font-medium">Media Converter & Switch</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Box */}
          <div className="relative w-full md:w-96">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari Merek, Seri Model, atau Spesifikasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition whitespace-nowrap ${
                selectedType === 'ALL' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Tipe ({catalog.length})
            </button>
            <button
              onClick={() => setSelectedType('ONU')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition whitespace-nowrap ${
                selectedType === 'ONU' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🏠 Modem ONU ({onuCount})
            </button>
            <button
              onClick={() => setSelectedType('ROUTER_WIFI')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition whitespace-nowrap ${
                selectedType === 'ROUTER_WIFI' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              📶 Router Wi-Fi ({wifiCount})
            </button>
          </div>
        </div>

        {/* Brand Selector Chips */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 text-xs font-medium">
          <span className="text-slate-400 font-bold text-[11px] flex items-center gap-1">
            <Filter size={12} />
            Merek:
          </span>
          <button
            onClick={() => setSelectedBrand('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer transition ${
              selectedBrand === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Semua
          </button>
          {allBrands.map(b => (
            <button
              key={b}
              onClick={() => setSelectedBrand(b)}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer transition ${
                selectedBrand.toLowerCase() === b.toLowerCase() ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Grid List of Hardware Cards */}
      {loading ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
          <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
          <p className="text-xs font-bold text-slate-600">Memuat Katalog Spesifikasi Perangkat Cloud...</p>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
          <Info size={32} className="text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-700">Tidak ada spesifikasi perangkat yang cocok dengan pencarian.</p>
          <button onClick={() => { setSearchQuery(''); setSelectedType('ALL'); setSelectedBrand('ALL'); }} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100">
            Reset Filter Pencarian
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCatalog.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition duration-200 flex flex-col justify-between overflow-hidden group">
              <div className="p-4 space-y-3">
                {/* Header Badge */}
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    item.type === 'ONU' 
                      ? 'bg-indigo-100 text-indigo-900 border border-indigo-200' 
                      : item.type === 'ROUTER_WIFI' 
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' 
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}>
                    {item.type === 'ONU' ? '🏠 MODEM ONU' : item.type === 'ROUTER_WIFI' ? '📶 ROUTER WI-FI' : item.type}
                  </span>
                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    {item.type === 'ONU' ? `1 FO + ${item.lan_ports} RJ45` : `${item.lan_ports} Port LAN`}
                  </span>
                </div>

                {/* Title */}
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{item.brand}</div>
                  <h3 className="text-base font-black text-slate-900 group-hover:text-blue-600 transition">
                    {item.model}
                  </h3>
                </div>

                {/* Specs Detail Box (Optik vs RJ45) */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                    <Zap size={12} className="text-indigo-600" />
                    <span>
                      {item.type === 'ONU' 
                        ? '1 Port Optik SC/UPC (Ke ODP)' 
                        : item.type === 'HTB' 
                        ? 'Port Optik Fiber A (1310nm) / B (1550nm)' 
                        : 'Port WAN Ethernet RJ45'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
                    <Wifi size={12} className="text-blue-500" />
                    <span className="truncate">{item.wifi_spec || `${item.lan_ports} Port LAN RJ45 Ethernet`}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 pt-0.5">
                      💡 {item.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-500 font-semibold">Spesifikasi Master</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition"
                    title="Edit Spesifikasi Model Ini"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition"
                    title="Hapus Model"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add/Edit Hardware Spec */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100">
            <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <Cpu size={18} />
                  <span>{editingItem ? 'Edit Spesifikasi Model Hardware' : 'Tambah Model Hardware Baru'}</span>
                </h3>
                <p className="text-xs text-blue-100/90 font-medium">
                  Spesifikasi ini akan tersimpan ke Katalog Master dan otomatis sync dengan Form Pelanggan
                </p>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Tipe Perangkat *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ONU">🏠 Modem ONU Optik (GPON/EPON FTTH)</option>
                  <option value="ROUTER_WIFI">📶 Router Wireless / Wi-Fi AP</option>
                  <option value="HTB">⚡ HTB Media Converter Optik</option>
                  <option value="SWITCH">🔌 Switch Hub LAN Direct</option>
                  <option value="OTHER">⚙️ Perangkat Jaringan Lainnya</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Merek Perangkat *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: ZTE, Huawei, Tenda, TP-Link"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Seri / Model *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: F609, HG8245H, N301"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Kapasitas Port LAN *</label>
                  <select
                    value={formLanPorts}
                    onChange={(e) => setFormLanPorts(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value={1}>1 Port LAN</option>
                    <option value={2}>2 Port LAN</option>
                    <option value={3}>3 Port LAN</option>
                    <option value={4}>4 Port LAN</option>
                    <option value={8}>8 Port LAN</option>
                    <option value={16}>16 Port LAN</option>
                    <option value={24}>24 Port LAN</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Fitur / Rincian Wi-Fi</label>
                  <input
                    type="text"
                    placeholder="Contoh: Dual Band 2.4G/5G / 300Mbps"
                    value={formWifiSpec}
                    onChange={(e) => setFormWifiSpec(e.target.value)}
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">Catatan Tambahan (Opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Modem GPON Optik standar 4 Port Gigabit..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                >
                  {editingItem ? 'Simpan Perubahan' : '+ Tambah ke Katalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
