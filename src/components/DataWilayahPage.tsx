import React, { useState, useEffect } from 'react';
import { 
  MapPin, RefreshCw, Search, CheckCircle2, AlertCircle, Plus, Trash2, 
  Database, Globe, Building2, Sparkles, Hash, Layers, ShieldCheck, Download
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { 
  ALL_38_PROVINCES, 
  fetchRegencies, 
  fetchDistricts, 
  fetchVillages, 
  fetchPostalCode, 
  RegionItem, 
  VillageItem 
} from '../services/indonesiaRegionService';
import { saveSyncedRegionsToFirestore, getSyncedRegionsFromFirestore } from '../services/firebaseService';

import { BusinessProfile } from '../types';

interface DataWilayahPageProps {
  profile: BusinessProfile;
  t: any;
  onLogout?: () => void;
}

export default function DataWilayahPage({ profile, t, onLogout }: DataWilayahPageProps) {
  const [provinces] = useState<RegionItem[]>(ALL_38_PROVINCES);
  const [regencies, setRegencies] = useState<RegionItem[]>([]);
  const [districts, setDistricts] = useState<RegionItem[]>([]);

  const [selectedProvId, setSelectedProvId] = useState<string>('35'); // Default Jawa Timur
  const [selectedRegId, setSelectedRegId] = useState<string>('');
  const [selectedRegName, setSelectedRegName] = useState<string>('');

  const [loadingReg, setLoadingReg] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Synced Villages List in Database
  const [syncedVillages, setSyncedVillages] = useState<any[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Add Manual Custom Village State
  const [showAddModal, setShowAddModal] = useState(false);
  const [customDusun, setCustomDusun] = useState('');
  const [customDesa, setCustomDesa] = useState('');
  const [customKecamatan, setCustomKecamatan] = useState('');
  const [customKabupaten, setCustomKabupaten] = useState('');
  const [customProvinsi, setCustomProvinsi] = useState('');
  const [customKodePos, setCustomKodePos] = useState('');

  // Load Regencies when Province changes
  useEffect(() => {
    if (!selectedProvId) { setRegencies([]); return; }
    setLoadingReg(true);
    fetchRegencies(selectedProvId).then(data => {
      setRegencies(data);
      setLoadingReg(false);

      // Auto select Jombang if Jawa Timur is selected
      if (selectedProvId === '35') {
        const jombang = data.find(r => r.name.includes('JOMBANG'));
        if (jombang) {
          setSelectedRegId(jombang.id);
          setSelectedRegName(jombang.name);
        }
      }
    });
  }, [selectedProvId]);

  // Load Saved Synced Regions from Firestore / Cache
  useEffect(() => {
    getSyncedRegionsFromFirestore().then(data => {
      if (Array.isArray(data) && data.length > 0) {
        setSyncedVillages(data);
      }
    });
  }, []);

  // Targeted Sync Handler per Regency (e.g. Kabupaten Jombang)
  const handleSyncRegency = async () => {
    if (!selectedRegId || !selectedRegName) {
      setToastMsg({ type: 'error', text: 'Silakan pilih Kabupaten / Kota terlebih dahulu!' });
      return;
    }

    setIsSyncing(true);
    setToastMsg(null);
    setSyncProgress(`Mengambil daftar Kecamatan di ${selectedRegName}...`);

    try {
      // 1. Fetch all districts in selected regency
      const districtList = await fetchDistricts(selectedRegId);
      if (districtList.length === 0) {
        throw new Error(`Gagal memuat Kecamatan untuk ${selectedRegName}. Cek koneksi internet.`);
      }

      const allFetchedVillages: any[] = [];

      // 2. Loop through each district and fetch all villages + postal codes
      for (let i = 0; i < districtList.length; i++) {
        const dist = districtList[i];
        setSyncProgress(`[${i + 1}/${districtList.length}] Mengunduh Desa & Kode Pos di ${dist.name}...`);

        // Fetch District Postal Code ONCE (0ms via Dictionary / Instant API!)
        const distZip = await fetchPostalCode(`${dist.name} ${selectedRegName}`);

        const vList = await fetchVillages(dist.id);
        for (const v of vList) {
          allFetchedVillages.push({
            id: v.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            desa: v.name.toUpperCase(),
            kecamatan: dist.name.toUpperCase(),
            kabupaten: selectedRegName.toUpperCase(),
            provinsi: (provinces.find(p => p.id === selectedProvId)?.name || 'JAWA TIMUR').toUpperCase(),
            zip: distZip || '61471'
          });
        }
      }

      // Merge with existing synced database
      const existingMap = new Map<string, any>();
      syncedVillages.forEach(v => existingMap.set(`${v.desa}_${v.kecamatan}_${v.kabupaten}`, v));
      allFetchedVillages.forEach(v => existingMap.set(`${v.desa}_${v.kecamatan}_${v.kabupaten}`, v));

      const mergedList = Array.from(existingMap.values());
      setSyncedVillages(mergedList);

      // Save to Cloud Firestore & Local Cache
      await saveSyncedRegionsToFirestore(mergedList);

      setToastMsg({
        type: 'success',
        text: `🎉 Berhasil Menyinkronkan 100% Desa/Kelurahan di ${selectedRegName}! Total ${allFetchedVillages.length} Desa tersimpan.`
      });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal menyinkronkan data wilayah.' });
    } finally {
      setIsSyncing(false);
      setSyncProgress('');
    }
  };

  // Add Manual Custom Village Handler
  const handleAddCustomVillage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDesa || !customKecamatan) {
      setToastMsg({ type: 'error', text: 'Nama Desa dan Kecamatan wajib diisi!' });
      return;
    }

    const newVillage = {
      id: `CUST_VILL_${Date.now()}`,
      dusun: customDusun.trim().toUpperCase(),
      desa: customDesa.trim().toUpperCase(),
      kecamatan: customKecamatan.trim().toUpperCase(),
      kabupaten: (customKabupaten.trim() || selectedRegName || 'KABUPATEN JOMBANG').toUpperCase(),
      provinsi: (customProvinsi.trim() || 'JAWA TIMUR').toUpperCase(),
      zip: customKodePos.trim() || '61471'
    };

    const updatedList = [newVillage, ...syncedVillages.filter(v => v.id !== newVillage.id)];
    setSyncedVillages(updatedList);
    await saveSyncedRegionsToFirestore(updatedList);

    setShowAddModal(false);
    setCustomDusun('');
    setCustomDesa('');
    setCustomKecamatan('');
    setCustomKodePos('');
    setToastMsg({ type: 'success', text: `✅ Dusun/Desa "${newVillage.dusun ? newVillage.dusun + ' - ' : ''}${newVillage.desa}" berhasil ditambahkan secara manual.` });
  };

  // Filter Villages for Display
  const filteredVillages = syncedVillages.filter(v => {
    const q = searchFilter.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.desa || '').toLowerCase().includes(q) ||
      (v.kecamatan || '').toLowerCase().includes(q) ||
      (v.kabupaten || '').toLowerCase().includes(q) ||
      (v.zip || '').includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      <HeaderBar 
        profile={profile}
        t={t}
        onLogout={onLogout}
        title="Manajemen Data Wilayah Indonesia" 
        subtitle="Sinkronkan database desa, kecamatan, kabupaten, & kode pos per wilayah agar 100% lengkap & stabil" 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* Banner Status Header */}
        <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900 border border-blue-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 z-10">
            <div className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-600/30">
              <Globe size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Database Wilayah & Kode Pos Indonesia</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Sparkles className="w-3 h-3 inline mr-1" /> {syncedVillages.length} Desa Tersinkron
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Lakukan sinkronisasi terarah per Kabupaten/Kota untuk mengunduh seluruh Desa & Kode Pos resmi Kemendagri ke Cloud Database Anda.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center gap-2 z-10 shrink-0"
          >
            <Plus size={16} /> Tambah Desa Manual
          </button>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all ${
            toastMsg.type === 'error' ? 'bg-rose-500/20 border-rose-500/40 text-rose-200' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
          }`}>
            <div className="flex items-center gap-2">
              {toastMsg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
          </div>
        )}

        {/* Sync Control Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              1. Pilih Wilayah Target Untuk Disinkronkan
            </h3>
            <span className="text-[11px] text-slate-400">Pilih Provinsi ➔ Kabupaten ➔ Klik Sinkronkan</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Choose Province */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">1. Provinsi</label>
              <select
                value={selectedProvId}
                onChange={(e) => setSelectedProvId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
              >
                {provinces.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Choose Regency */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                2. Kabupaten / Kota {loadingReg && <RefreshCw className="inline w-3 h-3 animate-spin text-blue-400 ml-1" />}
              </label>
              <select
                value={selectedRegId}
                onChange={(e) => {
                  const regId = e.target.value;
                  const rObj = regencies.find(r => r.id === regId);
                  setSelectedRegId(regId);
                  setSelectedRegName(rObj ? rObj.name : '');
                }}
                disabled={!selectedProvId}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-medium disabled:opacity-50"
              >
                <option value="">-- Pilih Kabupaten/Kota --</option>
                {regencies.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Trigger Sync Button */}
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleSyncRegency}
                disabled={isSyncing || !selectedRegId}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Menyinkronkan...' : `⚡ Sinkronkan 100% Desa di ${selectedRegName || 'Kabupaten'}`}</span>
              </button>
            </div>
          </div>

          {/* Sync Progress Status Bar */}
          {isSyncing && (
            <div className="p-3 bg-blue-950/60 border border-blue-500/30 rounded-xl text-xs text-blue-300 flex items-center gap-2 animate-pulse">
              <RefreshCw size={14} className="animate-spin text-blue-400 shrink-0" />
              <span>{syncProgress}</span>
            </div>
          )}
        </div>

        {/* Database List & Live Search Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Daftar Desa/Kelurahan Tersinkron di Database
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Menampilkan {filteredVillages.length} dari {syncedVillages.length} Desa yang siap digunakan di pendaftaran.
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Cari desa, kecamatan, kode pos..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Table Data */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider font-extrabold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Desa / Kelurahan</th>
                  <th className="py-3 px-4">Kecamatan</th>
                  <th className="py-3 px-4">Kabupaten / Kota</th>
                  <th className="py-3 px-4">Provinsi</th>
                  <th className="py-3 px-4 text-center">Kode Pos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredVillages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                      Belum ada data desa tersinkron untuk filter "{searchFilter}". Silakan lakukan sinkronisasi kabupaten di atas.
                    </td>
                  </tr>
                ) : (
                  filteredVillages.slice(0, 50).map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-bold text-white">{item.desa}</td>
                      <td className="py-3 px-4 text-slate-300">{item.kecamatan}</td>
                      <td className="py-3 px-4 text-slate-400">{item.kabupaten}</td>
                      <td className="py-3 px-4 text-slate-400">{item.provinsi}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                        {item.zip || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Add Manual Custom Village */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                Tambah Desa / Dusun Lokal Manual
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleAddCustomVillage} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Nama Dusun <span className="text-slate-400 font-normal">(Opsional / Jika ada)</span></label>
                <input
                  type="text"
                  value={customDusun}
                  onChange={(e) => setCustomDusun(e.target.value)}
                  placeholder="Contoh: DUSUN KRAJAN"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Nama Desa Induk *</label>
                <input
                  type="text"
                  required
                  value={customDesa}
                  onChange={(e) => setCustomDesa(e.target.value)}
                  placeholder="Contoh: CUKIR"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Kecamatan *</label>
                <input
                  type="text"
                  required
                  value={customKecamatan}
                  onChange={(e) => setCustomKecamatan(e.target.value)}
                  placeholder="Contoh: DIWEK"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white uppercase focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Kabupaten / Kota</label>
                  <input
                    type="text"
                    value={customKabupaten}
                    onChange={(e) => setCustomKabupaten(e.target.value)}
                    placeholder="Contoh: KABUPATEN JOMBANG"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Kode Pos</label>
                  <input
                    type="text"
                    value={customKodePos}
                    onChange={(e) => setCustomKodePos(e.target.value)}
                    placeholder="61471"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg cursor-pointer"
                >
                  Simpan Desa Manual
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
