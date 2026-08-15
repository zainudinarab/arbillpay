import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  MapPin, 
  Zap, 
  Calculator, 
  CheckCircle, 
  AlertCircle,
  Network,
  Radio,
  Sliders
} from 'lucide-react';
import { getDeviceCatalogFromFirestore, saveDeviceCatalogToFirestore } from '../services/firebaseService';

export interface SplitterSpecItem {
  id: string;
  name: string;
  type: 'PLC' | 'RATIO_FBT';
  ratio: string;
  ports: number;
  loss_db: number;
  secondary_loss_db?: number; // for ratio splitters (e.g. 10:90 -> tap loss 10.5dB, pass loss 0.8dB)
  notes?: string;
}

const DEFAULT_SPLITTERS: SplitterSpecItem[] = [
  { id: 'spl-plc-1-2', name: 'PLC Splitter 1:2 Equal', type: 'PLC', ratio: '1:2', ports: 2, loss_db: 3.5, notes: 'Redaman ~3.5 dB per port output' },
  { id: 'spl-plc-1-4', name: 'PLC Splitter 1:4 Equal', type: 'PLC', ratio: '1:4', ports: 4, loss_db: 7.2, notes: 'Redaman ~7.2 dB per port output' },
  { id: 'spl-plc-1-8', name: 'PLC Splitter 1:8 Equal', type: 'PLC', ratio: '1:8', ports: 8, loss_db: 10.5, notes: 'Standar ODP 8 Port Redaman ~10.5 dB' },
  { id: 'spl-plc-1-16', name: 'PLC Splitter 1:16 Equal', type: 'PLC', ratio: '1:16', ports: 16, loss_db: 13.8, notes: 'Standar ODP 16 Port Redaman ~13.8 dB' },
  { id: 'spl-plc-1-32', name: 'PLC Splitter 1:32 Equal', type: 'PLC', ratio: '1:32', ports: 32, loss_db: 17.1, notes: 'High Capacity Splitter Redaman ~17.1 dB' },
  { id: 'spl-ratio-1-99', name: 'Ratio Splitter FBT 1:99', type: 'RATIO_FBT', ratio: '1:99', ports: 2, loss_db: 20.0, secondary_loss_db: 0.3, notes: 'Tap 1% (~20dB), Pass 99% (~0.3dB)' },
  { id: 'spl-ratio-2-98', name: 'Ratio Splitter FBT 2:98', type: 'RATIO_FBT', ratio: '2:98', ports: 2, loss_db: 17.0, secondary_loss_db: 0.4, notes: 'Tap 2% (~17dB), Pass 98% (~0.4dB)' },
  { id: 'spl-ratio-5-95', name: 'Ratio Splitter FBT 5:95', type: 'RATIO_FBT', ratio: '5:95', ports: 2, loss_db: 13.0, secondary_loss_db: 0.5, notes: 'Tap 5% (~13dB), Pass 95% (~0.5dB)' },
  { id: 'spl-ratio-10-90', name: 'Ratio Splitter FBT 10:90', type: 'RATIO_FBT', ratio: '10:90', ports: 2, loss_db: 10.5, secondary_loss_db: 0.8, notes: 'Tap 10% (~10.5dB), Pass 90% (~0.8dB)' },
  { id: 'spl-ratio-20-80', name: 'Ratio Splitter FBT 20:80', type: 'RATIO_FBT', ratio: '20:80', ports: 2, loss_db: 7.5, secondary_loss_db: 1.2, notes: 'Tap 20% (~7.5dB), Pass 80% (~1.2dB)' },
  { id: 'spl-ratio-30-70', name: 'Ratio Splitter FBT 30:70', type: 'RATIO_FBT', ratio: '30:70', ports: 2, loss_db: 5.5, secondary_loss_db: 1.8, notes: 'Tap 30% (~5.5dB), Pass 70% (~1.8dB)' },
  { id: 'spl-ratio-50-50', name: 'Ratio Splitter FBT 50:50', type: 'RATIO_FBT', ratio: '50:50', ports: 2, loss_db: 3.5, secondary_loss_db: 3.5, notes: 'Equal FBT 50% / 50% (~3.5dB)' }
];

export const FtthSplitterPage: React.FC = () => {
  const [splitters, setSplitters] = useState<SplitterSpecItem[]>(DEFAULT_SPLITTERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Optical Loss Budget Calculator State
  const [oltPower, setOltPower] = useState<number>(5.0); // +5 dBm Class C++
  const [fiberDistanceKm, setFiberDistanceKm] = useState<number>(2.5); // 2.5 km
  const [spliceCount, setSpliceCount] = useState<number>(4); // 4 splices
  const [selectedSplitterId, setSelectedSplitterId] = useState<string>('spl-plc-1-8');

  // Form Add/Edit Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<SplitterSpecItem | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<'PLC' | 'RATIO_FBT'>('PLC');
  const [formRatio, setFormRatio] = useState<string>('1:8');
  const [formPorts, setFormPorts] = useState<number>(8);
  const [formLossDb, setFormLossDb] = useState<number>(10.5);
  const [formSecondaryLossDb, setFormSecondaryLossDb] = useState<number>(0.8);
  const [formNotes, setFormNotes] = useState<string>('');

  const loadSplitters = async () => {
    setLoading(true);
    try {
      const res = await getDeviceCatalogFromFirestore();
      if (res.success && Array.isArray((res as any).splitters) && (res as any).splitters.length > 0) {
        setSplitters((res as any).splitters);
      } else {
        setSplitters(DEFAULT_SPLITTERS);
      }
    } catch (err: any) {
      setSplitters(DEFAULT_SPLITTERS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSplitters();
  }, []);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormName('');
    setFormType('PLC');
    setFormRatio('1:8');
    setFormPorts(8);
    setFormLossDb(10.5);
    setFormSecondaryLossDb(0.8);
    setFormNotes('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: SplitterSpecItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormType(item.type);
    setFormRatio(item.ratio);
    setFormPorts(item.ports);
    setFormLossDb(item.loss_db);
    setFormSecondaryLossDb(item.secondary_loss_db || 0.8);
    setFormNotes(item.notes || '');
    setShowAddModal(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formRatio.trim()) {
      setToastMsg({ type: 'error', text: 'Nama Splitter dan Rasio wajib diisi!' });
      return;
    }

    try {
      let updatedList: SplitterSpecItem[];
      if (editingItem) {
        updatedList = splitters.map(s => s.id === editingItem.id ? {
          ...s,
          name: formName.trim(),
          type: formType,
          ratio: formRatio.trim(),
          ports: Number(formPorts),
          loss_db: Number(formLossDb),
          secondary_loss_db: formType === 'RATIO_FBT' ? Number(formSecondaryLossDb) : undefined,
          notes: formNotes.trim() || undefined
        } : s);
      } else {
        const newItem: SplitterSpecItem = {
          id: `spl-custom-${Date.now()}`,
          name: formName.trim(),
          type: formType,
          ratio: formRatio.trim(),
          ports: Number(formPorts),
          loss_db: Number(formLossDb),
          secondary_loss_db: formType === 'RATIO_FBT' ? Number(formSecondaryLossDb) : undefined,
          notes: formNotes.trim() || 'Custom Splitter'
        };
        updatedList = [newItem, ...splitters];
      }

      setSplitters(updatedList);
      // Save splitters list to Cloud Firestore catalog
      const catalogData = await getDeviceCatalogFromFirestore();
      await saveDeviceCatalogToFirestore(catalogData.catalog || [], updatedList as any);

      setToastMsg({ type: 'success', text: `Spesifikasi Splitter "${formName}" berhasil disimpan!` });
      setShowAddModal(false);
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menyimpan splitter: ' + err?.message });
    }
  };

  const handleDeleteItem = async (item: SplitterSpecItem) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus "${item.name}" dari Master Katalog Splitter?`)) return;

    try {
      const updatedList = splitters.filter(s => s.id !== item.id);
      setSplitters(updatedList);
      const catalogData = await getDeviceCatalogFromFirestore();
      await saveDeviceCatalogToFirestore(catalogData.catalog || [], updatedList as any);
      setToastMsg({ type: 'success', text: `Splitter "${item.name}" berhasil dihapus!` });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus: ' + err?.message });
    }
  };

  // Filter computation
  const filteredSplitters = splitters.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.ratio.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = selectedType === 'ALL' || item.type === selectedType;

    return matchesSearch && matchesType;
  });

  const plcCount = splitters.filter(s => s.type === 'PLC').length;
  const ratioCount = splitters.filter(s => s.type === 'RATIO_FBT').length;

  // Calculation for Optical Power Loss Budget
  const selectedCalcSplitter = splitters.find(s => s.id === selectedSplitterId) || splitters[2] || DEFAULT_SPLITTERS[2];
  const fiberLossPerKm = 0.35; // 0.35 dB/km for 1310nm / 1490nm
  const spliceLossPerJoint = 0.1; // 0.1 dB per fusion splice
  const totalFiberLoss = fiberDistanceKm * fiberLossPerKm;
  const totalSpliceLoss = spliceCount * spliceLossPerJoint;
  const totalSplitterLoss = selectedCalcSplitter.loss_db;
  const totalOpticalLoss = totalFiberLoss + totalSpliceLoss + totalSplitterLoss;
  const rxPowerAtOnu = oltPower - totalOpticalLoss;

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

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-black uppercase tracking-wider">
            <Sliders size={16} />
            <span>Master Catalog & Redaman Optical Splitter</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Master Splitter Optik (PLC & FBT Ratio)
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Katalog spesifikasi resmi rasio splitter pasif (1:2 hingga 1:32 & FBT Ratio 1:99 s.d. 50:50) beserta kalkulator simulasi daya redaman optik (Optical Loss Budget).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-200"
          >
            <Plus size={14} />
            <span>Tambah Splitter Baru</span>
          </button>
          <a
            href="#/map-ftth"
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5"
          >
            <MapPin size={14} />
            <span>Buka Peta FTTH</span>
          </a>
        </div>
      </div>

      {/* Optical Loss Budget Interactive Calculator Banner */}
      <div className="p-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-black text-sm text-sky-400">
            <Calculator size={18} />
            <span>⚡ Kalkulator Simulasi Daya Redaman Optik (Optical Loss Budget)</span>
          </div>
          <span className="text-[10px] bg-sky-500/20 text-sky-300 font-bold px-2.5 py-1 rounded-full border border-sky-400/30">
            Formula Akurat GPON / EPON
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1">Daya OLT SFP PON (dBm)</label>
            <select
              value={oltPower}
              onChange={(e) => setOltPower(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value={2.5}>+2.5 dBm (Class B+ Standard)</option>
              <option value={5.0}>+5.0 dBm (Class C++ High Power)</option>
              <option value={7.0}>+7.0 dBm (Class C+++ Ultra Power)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1">Panjang Kabel FO (KM)</label>
            <input
              type="number"
              step="0.1"
              min={0}
              value={fiberDistanceKm}
              onChange={(e) => setFiberDistanceKm(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1">Jumlah Sambungan Fusion Splice</label>
            <input
              type="number"
              min={0}
              value={spliceCount}
              onChange={(e) => setSpliceCount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1">Splitter Pasif Ditingkat Ini</label>
            <select
              value={selectedSplitterId}
              onChange={(e) => setSelectedSplitterId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {splitters.map(s => (
                <option key={s.id} value={s.id}>{s.name} (Loss {s.loss_db} dB)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Calculation Result Summary Box */}
        <div className="p-4 bg-slate-800/80 border border-slate-700/80 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
              <span>Perhitungan Total Redaman (Optical Loss):</span>
              <span className="font-mono text-amber-400 font-extrabold">
                {fiberDistanceKm}km ({totalFiberLoss.toFixed(2)}dB) + {spliceCount} Splice ({totalSpliceLoss.toFixed(2)}dB) + {selectedCalcSplitter.name} ({totalSplitterLoss}dB) = {totalOpticalLoss.toFixed(2)} dB Loss.
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Standar ideal sinyal penerimaan ONU pelanggan adalah antara <b>-15 dBm s.d. -25 dBm</b>. (Sensitivitas maksimal ONU: -28 dBm).
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 shrink-0 text-center space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estimasi Sinyal RX di ONU</span>
            <div className={`text-xl font-black ${
              rxPowerAtOnu >= -24 
                ? 'text-emerald-400' 
                : rxPowerAtOnu >= -27 
                ? 'text-amber-400' 
                : 'text-rose-400'
            }`}>
              {rxPowerAtOnu.toFixed(2)} dBm
            </div>
            <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
              rxPowerAtOnu >= -24 
                ? 'bg-emerald-500/20 text-emerald-300' 
                : rxPowerAtOnu >= -27 
                ? 'bg-amber-500/20 text-amber-300' 
                : 'bg-rose-500/20 text-rose-300'
            }`}>
              {rxPowerAtOnu >= -24 ? '✅ Sangat Bagus (Bagus)' : rxPowerAtOnu >= -27 ? '⚠️ Masih Toleransi' : '❌ Sinyal Drop / LOS'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Live Search Section */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedType === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Splitter ({splitters.length})
            </button>
            <button
              onClick={() => setSelectedType('PLC')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedType === 'PLC' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              PLC Splitter Equal ({plcCount})
            </button>
            <button
              onClick={() => setSelectedType('RATIO_FBT')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedType === 'RATIO_FBT' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              FBT Ratio Splitter ({ratioCount})
            </button>
          </div>

          <div className="relative w-full md:w-72">
            <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari rasio splitter, 1:8, 10:90..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Grid Cards of Master Splitters */}
      {loading ? (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center space-y-2">
          <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
          <p className="text-xs font-bold text-slate-600">Memuat Katalog Master Splitter...</p>
        </div>
      ) : filteredSplitters.length === 0 ? (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center space-y-2">
          <Sliders size={32} className="text-slate-300 mx-auto" />
          <p className="text-xs font-bold text-slate-600">Tidak ada splitter yang cocok dengan kriteria pencarian.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredSplitters.map(item => (
            <div key={item.id} className="bg-white rounded-3xl border border-slate-200/90 shadow-xs hover:shadow-md transition flex flex-col justify-between overflow-hidden group">
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    item.type === 'PLC'
                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                      : 'bg-purple-100 text-purple-900 border border-purple-200'
                  }`}>
                    {item.type === 'PLC' ? '⚖️ PLC SPLITTER' : '🔀 FBT RATIO'}
                  </span>
                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    Rasio {item.ratio}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-900 group-hover:text-blue-600 transition">
                    {item.name}
                  </h3>
                  <div className="text-[11px] font-mono font-bold text-slate-500 pt-0.5">
                    Kapasitas: {item.ports} Port Output
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-extrabold text-slate-800">
                    <span>Redaman (Loss):</span>
                    <span className="font-mono text-rose-600 font-black">-{item.loss_db} dB</span>
                  </div>
                  {item.secondary_loss_db !== undefined && (
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                      <span>Pass Loss (Jalur Utama):</span>
                      <span className="font-mono text-emerald-700">-{item.secondary_loss_db} dB</span>
                    </div>
                  )}
                  {item.notes && (
                    <p className="text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200/60 line-clamp-2">
                      💡 {item.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400 font-semibold">Standard FTTH Catalog</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg transition"
                    title="Edit Spesifikasi Splitter Ini"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition"
                    title="Hapus dari Katalog Master"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add / Edit Splitter */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 font-sans">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-black flex items-center gap-2">
                <Sliders size={16} />
                <span>{editingItem ? 'Edit Spesifikasi Splitter' : 'Tambah Splitter Optik Baru'}</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Splitter *</label>
                <input
                  type="text"
                  required
                  placeholder="PLC Splitter 1:8 Equal"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tipe Splitter</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  >
                    <option value="PLC">PLC (Equal Ratio)</option>
                    <option value="RATIO_FBT">FBT Ratio (Tidak Seimbang)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Rasio Pembagian *</label>
                  <input
                    type="text"
                    required
                    placeholder="1:8"
                    value={formRatio}
                    onChange={(e) => setFormRatio(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Jumlah Port Output</label>
                  <input
                    type="number"
                    min={2}
                    max={64}
                    value={formPorts}
                    onChange={(e) => setFormPorts(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Redaman Loss (dB) *</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    placeholder="10.5"
                    value={formLossDb}
                    onChange={(e) => setFormLossDb(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                </div>
              </div>

              {formType === 'RATIO_FBT' && (
                <div>
                  <label className="block text-[11px] font-bold text-purple-900 mb-1">Pass Loss Jalur Utama (dB)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0.8"
                    value={formSecondaryLossDb}
                    onChange={(e) => setFormSecondaryLossDb(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl font-bold text-purple-950"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Catatan Spesifikasi (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Redaman standar ODP 8 port..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-extrabold rounded-xl hover:bg-blue-700 transition cursor-pointer shadow-md shadow-blue-200"
                >
                  Simpan Spesifikasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FtthSplitterPage;
