import React, { useState, useEffect, useMemo } from 'react';
import { 
  Ticket, 
  Zap, 
  Search, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  Trash2, 
  Layers, 
  Plus, 
  FileText,
  Calendar,
  DollarSign,
  X
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
}

interface RouterProfileItem {
  id: string;
  router_id: string;
  name: string;
  type: string;
  rate_limit?: string;
  package_name?: string;
  package_price?: number;
}

interface VoucherItem {
  id: string;
  batch_id: string;
  router_id: string;
  router_profile_id: string;
  code: string;
  password: string;
  status: string;
  comment?: string;
  created_at: string;
  router_name?: string;
  router_ip?: string;
  profile_name?: string;
  rate_limit?: string;
  package_name?: string;
  package_price?: number;
  validity_days?: number;
  validity_unit?: string;
  validity_value?: number;
  uptime_limit?: string;
  quota_mb?: number;
}

interface HotspotVoucherManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function HotspotVoucherManagement({ profile, t, onLogout }: HotspotVoucherManagementProps) {
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs & Modals State
  const [activeTab, setActiveTab] = useState<'vouchers' | 'batches'>('vouchers');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRouter, setFilterRouter] = useState<string>('all');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [printBatchId, setPrintBatchId] = useState<string>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Generator Form State
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [count, setCount] = useState<string>('10');
  const [codeLength, setCodeLength] = useState<string>('6');
  const [codePrefix, setCodePrefix] = useState<string>('');
  const [charType, setCharType] = useState<'lower' | 'upper' | 'numbers' | 'mixed'>('lower');

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
      const [resVc, resRtr, resProf] = await Promise.all([
        fetch(`${apiUrl}/api/vouchers`),
        fetch(`${apiUrl}/api/routers`),
        fetch(`${apiUrl}/api/router-profiles`)
      ]);

      const dataVc = await parseJsonResponse(resVc);
      const dataRtr = await parseJsonResponse(resRtr);
      const dataProf = await parseJsonResponse(resProf);

      if (dataVc.success && Array.isArray(dataVc.vouchers)) {
        setVouchers(dataVc.vouchers);
      }

      if (dataRtr.success && Array.isArray(dataRtr.routers)) {
        setRouters(dataRtr.routers);
        if (dataRtr.routers.length > 0 && !selectedRouterId) {
          setSelectedRouterId(dataRtr.routers[0].id);
        }
      }

      if (dataProf.success && Array.isArray(dataProf.profiles)) {
        setRouterProfiles(dataProf.profiles);
      }
    } catch (err: any) {
      console.error('Failed to fetch vouchers:', err);
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memuat data voucher.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Hotspot Profiles for the selected router (Strictly connected to a package with type 'hotspot_voucher')
  const availableHotspotProfiles = useMemo(() => {
    return routerProfiles.filter(p => {
      const matchRouter = !selectedRouterId || p.router_id === selectedRouterId;
      const matchType = p.type === 'hotspot';
      const hasPackageLinked = Boolean((p as any).package_id || (p as any).package_name);
      const isVoucherPackage = (p as any).package_type === 'hotspot_voucher';
      return matchRouter && matchType && hasPackageLinked && isVoucherPackage;
    });
  }, [routerProfiles, selectedRouterId]);

  // Auto select first profile when router changes
  useEffect(() => {
    if (availableHotspotProfiles.length > 0) {
      setSelectedProfileId(availableHotspotProfiles[0].id);
    } else {
      setSelectedProfileId('');
    }
  }, [selectedRouterId, availableHotspotProfiles]);

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRouterId || !selectedProfileId || !count) {
      setToastMsg({ type: 'error', text: 'Router, Profile Hotspot, dan Jumlah Voucher wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/vouchers/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          router_id: selectedRouterId,
          router_profile_id: selectedProfileId,
          count: parseInt(count) || 10,
          code_length: parseInt(codeLength) || 6,
          code_prefix: codePrefix.trim(),
          char_type: charType
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setPrintBatchId(data.batch_id);
        setShowGenerateModal(false);
        fetchData();
        // Ask to print batch
        if (confirm('Voucher berhasil di-generate! Apakah Anda ingin mencetak batch voucher ini sekarang?')) {
          setShowPrintModal(true);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal me-generate voucher.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal me-generate voucher: ${err?.message || 'Error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh voucher dalam batch ini?')) return;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/vouchers/batch/${batchId}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus batch voucher.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus batch voucher.' });
    }
  };

  // Group vouchers by batch_id for Tab 2
  const batchSummaries = useMemo(() => {
    const groups: { [batchId: string]: { batch_id: string; created_at: string; router_name: string; profile_name: string; package_price: number; count: number } } = {};

    vouchers.forEach(v => {
      const bId = v.batch_id || 'unbatched';
      if (!groups[bId]) {
        groups[bId] = {
          batch_id: bId,
          created_at: v.created_at,
          router_name: v.router_name || 'Mikrotik Router',
          profile_name: v.profile_name || 'Hotspot Profile',
          package_price: Number(v.package_price) || 0,
          count: 0
        };
      }
      groups[bId].count += 1;
    });

    return Object.values(groups).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [vouchers]);

  // Filter Vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchesSearch = v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (v.router_name && v.router_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                            (v.profile_name && v.profile_name.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesRouter = filterRouter === 'all' || v.router_name === filterRouter;
      return matchesSearch && matchesRouter;
    });
  }, [vouchers, searchTerm, filterRouter]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterRouter]);

  const totalItems = filteredVouchers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedVouchers = filteredVouchers.slice(startIndex, endIndex);

  const printVouchersList = printBatchId === 'all' 
    ? filteredVouchers 
    : vouchers.filter(v => v.batch_id === printBatchId);

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Voucher Hotspot"
        subtitle="Manajemen Voucher, Cetak Template Mikhmon, dan Batch Generator Mikrotik"
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

        {/* Action Header & Tabs Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setActiveTab('vouchers')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'vouchers'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Ticket size={15} className={activeTab === 'vouchers' ? 'text-amber-600' : ''} />
              <span>Daftar Voucher</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">{totalItems}</span>
            </button>

            <button
              onClick={() => setActiveTab('batches')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'batches'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers size={15} className={activeTab === 'batches' ? 'text-indigo-600' : ''} />
              <span>Rekap Batch</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">{batchSummaries.length}</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-amber-200 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Zap size={16} />
              <span>⚡ Generate Voucher Baru</span>
            </button>

            <button
              onClick={() => { setPrintBatchId('all'); setShowPrintModal(true); }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Printer size={15} />
              <span>🖨️ Cetak Voucher</span>
            </button>

            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all cursor-pointer"
              title="Refresh Data Voucher"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* TAB 1: DAFTAR VOUCHER */}
        {activeTab === 'vouchers' && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari kode voucher, router, profile..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={filterRouter}
                  onChange={(e) => setFilterRouter(e.target.value)}
                  className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Semua Server Router</option>
                  {routers.map(r => (
                    <option key={r.id} value={r.name}>{r.name} ({r.ip_address})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Voucher Table List */}
            {loading ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
                <RefreshCw size={24} className="animate-spin text-amber-500" />
                <span className="text-xs font-semibold">Mengambil daftar voucher hotspot...</span>
              </div>
            ) : filteredVouchers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-xs font-medium">
                Belum ada voucher hotspot terbuat. Klik tombol <strong className="text-slate-700">"⚡ Generate Voucher Baru"</strong> untuk me-generate voucher baru.
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <th className="py-3.5 px-4">No</th>
                        <th className="py-3.5 px-4">Kode Voucher</th>
                        <th className="py-3.5 px-4">Router Mikrotik</th>
                        <th className="py-3.5 px-4">Profile Hotspot</th>
                        <th className="py-3.5 px-4">Tarif & Masa Aktif</th>
                        <th className="py-3.5 px-4">Waktu Buat</th>
                        <th className="py-3.5 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                      {paginatedVouchers.map((v, idx) => (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{startIndex + idx + 1}</td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-extrabold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-xs inline-flex items-center gap-1.5">
                              <Ticket size={13} />
                              {v.code}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">📡 {v.router_name || '-'}</td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg text-[11px]">
                              {v.profile_name || 'default'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {v.package_price ? (
                              <span className="font-bold text-emerald-700">
                                Rp {Number(v.package_price).toLocaleString('id-ID')}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">{v.rate_limit || '-'}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                            {new Date(v.created_at).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleDeleteBatch(v.batch_id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Hapus Batch ini"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Footer */}
                  <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Tampilkan</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-slate-400 font-medium">per halaman</span>
                      <span className="text-slate-400 font-medium ml-2">
                        (Menampilkan <strong className="text-slate-700">{totalItems > 0 ? startIndex + 1 : 0}-{endIndex}</strong> dari <strong className="text-slate-700">{totalItems}</strong> data)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        ‹ Prev
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                          .map((page, idx, arr) => (
                            <React.Fragment key={page}>
                              {idx > 0 && arr[idx - 1] !== page - 1 && (
                                <span className="px-1 text-slate-400 font-bold">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  currentPage === page
                                    ? 'bg-amber-600 text-white shadow-sm'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalItems === 0}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REKAP BATCH VOUCHER */}
        {activeTab === 'batches' && (
          <div className="space-y-4">
            {batchSummaries.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-xs font-medium">
                Belum ada batch voucher yang di-generate.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {batchSummaries.map(b => (
                  <div key={b.batch_id} className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm space-y-4 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">BATCH ID</span>
                        <h4 className="font-mono font-extrabold text-amber-700 text-sm">{b.batch_id}</h4>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold text-[11px] text-slate-700">
                        {b.count} Voucher
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Server Router:</span>
                        <span className="font-bold text-slate-800">{b.router_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Profile Hotspot:</span>
                        <span className="font-bold text-indigo-600">{b.profile_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Total Nilai Batch:</span>
                        <span className="font-bold text-emerald-600">Rp {(b.package_price * b.count).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">Waktu Generate:</span>
                        <span className="font-mono text-[10px] text-slate-500">{new Date(b.created_at).toLocaleString('id-ID')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <button
                        onClick={() => { setPrintBatchId(b.batch_id); setShowPrintModal(true); }}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Printer size={13} />
                        <span>Cetak Batch</span>
                      </button>

                      <button
                        onClick={() => handleDeleteBatch(b.batch_id)}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Hapus Batch"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL POPUP: GENERATE VOUCHER BARU */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Generate Voucher Hotspot Baru</h3>
                  <p className="text-xs text-slate-400">Username & Password Sama Auto-Sync ke Mikrotik</p>
                </div>
              </div>
              <button onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleGenerateVouchers} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Server Router Mikrotik *</label>
                  <select
                    value={selectedRouterId}
                    onChange={(e) => setSelectedRouterId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Paket Internet (Voucher) *</label>
                  <select
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {availableHotspotProfiles.length === 0 ? (
                      <option value="">Tidak ada Paket Internet Voucher di Router ini</option>
                    ) : (
                      availableHotspotProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          📦 {p.package_name || p.name} - Rp {p.package_price ? p.package_price.toLocaleString('id-ID') : '0'} ({p.rate_limit || 'Full Speed'})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Generate Voucher *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="200"
                  placeholder="10"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Maksimal 200 voucher per 1x generate</span>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="text-[11px] font-bold text-amber-900">Format & Custom Kode Voucher</div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Panjang Kode</label>
                    <select
                      value={codeLength}
                      onChange={(e) => setCodeLength(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold"
                    >
                      <option value="4">4 Karakter</option>
                      <option value="5">5 Karakter</option>
                      <option value="6">6 Karakter</option>
                      <option value="8">8 Karakter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Prefix</label>
                    <input
                      type="text"
                      placeholder="Contoh: VC-"
                      value={codePrefix}
                      onChange={(e) => setCodePrefix(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">Karakter</label>
                    <select
                      value={charType}
                      onChange={(e) => setCharType(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-[11px] font-bold"
                    >
                      <option value="lower">abc123 (Kecil)</option>
                      <option value="upper">ABC123 (Besar)</option>
                      <option value="numbers">123456 (Angka)</option>
                      <option value="mixed">aBc123 (Mix)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setShowGenerateModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" disabled={submitLoading || availableHotspotProfiles.length === 0} className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Generating & Syncing...' : `⚡ Generate ${count} Voucher`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cetak Voucher (Mikhmon Style Template) */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-amber-400" />
                <span className="font-bold text-sm">Cetak Template Voucher Hotspot (Mikhmon Style)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Halaman Ini</span>
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer ml-2">&times;</button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {printVouchersList.map((v) => (
                  <div key={v.id} className="bg-white border-2 border-slate-900 rounded-xl p-3 shadow-md flex flex-col justify-between text-slate-900 font-sans">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 mb-1.5">
                      <span className="font-black text-[11px] text-amber-600 truncate">{profile.companyName || 'WIFI HOTSPOT'}</span>
                      <span className="font-bold text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{v.profile_name || 'Voucher'}</span>
                    </div>

                    <div className="text-center py-2 bg-slate-50 rounded-lg border border-slate-100 my-1">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">KODE VOUCHER / PASSWORD</span>
                      <span className="font-mono font-black text-base text-slate-900 tracking-wider select-all">{v.code}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 text-[10px]">
                      <span className="font-bold text-emerald-700">
                        {v.package_price ? `Rp ${Number(v.package_price).toLocaleString('id-ID')}` : '-'}
                      </span>
                      <span className="text-slate-400 text-[9px] font-mono">{v.rate_limit || 'Fast'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
