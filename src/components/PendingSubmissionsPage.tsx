import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Phone, 
  UserCheck, 
  Zap, 
  Package, 
  MapPin, 
  Trash2, 
  MessageSquare,
  Search,
  ChevronRight,
  ShieldAlert,
  Wrench,
  Truck,
  Settings,
  ArrowRight,
  Calendar,
  Check
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { getCustomersFromFirestore, saveCustomerToFirestore } from '../services/firebaseService';
import { getApiUrl } from '../config/api';

interface PendingSubmissionsPageProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export const INSTALLATION_STAGES = [
  { key: 'pending', label: '1. Verifikasi Pending', shortLabel: 'Pending', icon: Zap, color: 'amber' },
  { key: 'survey', label: '2. Survei & Jadwal', shortLabel: 'Survei', icon: Truck, color: 'blue' },
  { key: 'installing', label: '3. Pasang FO & ONU', shortLabel: 'Pemasangan', icon: Wrench, color: 'indigo' },
  { key: 'testing', label: '4. Setting & Testing', shortLabel: 'Testing', icon: Settings, color: 'purple' },
  { key: 'active', label: '5. Aktif & Billing', shortLabel: 'Aktif', icon: CheckCircle2, color: 'emerald' }
];

const isPendingOrInProgress = (status: any) => {
  const s = String(status || '').toLowerCase().trim();
  return s === 'pending' || s === 'survey' || s === 'installing' || s === 'testing' || s === 'non-active' || s === 'inactive' || s === 'menunggu persetujuan' || s === 'pending_approval' || (s !== 'active' && s !== 'aktif' && s !== 'terminated' && s !== 'isolir' && s !== 'isolated' && s !== 'rejected');
};

export default function PendingSubmissionsPage({ profile, t, onLogout }: PendingSubmissionsPageProps) {
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPendingSubmissions = async () => {
    setLoading(true);
    try {
      const res = await getCustomersFromFirestore();
      if (res.success && Array.isArray(res.customers)) {
        const pending = res.customers.filter((c: any) => isPendingOrInProgress(c.status));
        setPendingList(pending);
      }
    } catch (err) {
      console.error('Error fetching pending submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingSubmissions();
  }, []);

  const handleAdvanceStage = async (cust: any, nextStageKey: string) => {
    setActionLoadingId(cust.id);
    try {
      const isNowActive = nextStageKey === 'active';
      const updatedCust = {
        ...cust,
        status: nextStageKey,
        installation_stage: nextStageKey,
        ...(isNowActive ? {
          installation_date: new Date().toISOString().split('T')[0],
          approved_at: new Date().toISOString()
        } : {})
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        await fetch(`${apiUrl}/api/customers/${cust.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStageKey })
        }).catch(() => null);
      }

      await saveCustomerToFirestore(updatedCust);

      if (isNowActive) {
        setPendingList(prev => prev.filter(c => c.id !== cust.id));
        setToastMsg({
          type: 'success',
          text: `🎉 Pemasangan Selesai! Layanan "${cust.name}" resmi AKTIF & Billing Dimulai!`
        });
      } else {
        setPendingList(prev => prev.map(c => c.id === cust.id ? updatedCust : c));
        const stageObj = INSTALLATION_STAGES.find(s => s.key === nextStageKey);
        setToastMsg({
          type: 'success',
          text: `Tahap Pemasangan "${cust.name}" diperbarui ke: ${stageObj?.label}`
        });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui tahapan: ' + err?.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (cust: any) => {
    if (!confirm(`Yakin ingin membatalkan / menolak pengajuan dari "${cust.name}"?`)) return;
    setActionLoadingId(cust.id);
    try {
      const updatedCust = {
        ...cust,
        status: 'rejected',
        rejected_at: new Date().toISOString()
      };

      await saveCustomerToFirestore(updatedCust);
      setPendingList(prev => prev.filter(c => c.id !== cust.id));
      setToastMsg({ type: 'success', text: `Pengajuan "${cust.name}" telah dibatalkan.` });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menolak pengajuan: ' + err?.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredPending = pendingList.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone_number || '').includes(term) ||
      (c.package_name || '').toLowerCase().includes(term) ||
      (c.address || '').toLowerCase().includes(term)
    );
  });

  const totalMonthlyPotential = pendingList.reduce((acc, curr) => acc + Number(curr.package_price || curr.price || 150000), 0);

  const getStageIndex = (statusKey: string) => {
    const s = String(statusKey || '').toLowerCase().trim();
    if (s === 'survey') return 1;
    if (s === 'installing') return 2;
    if (s === 'testing') return 3;
    if (s === 'active' || s === 'aktif') return 4;
    return 0; // pending / non-active
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen font-sans">
      <HeaderBar
        title="Pengajuan & Pipeline Pemasangan Customer"
        subtitle="Tahapan Pemasangan Pelanggan Baru: Verifikasi ➔ Survei ➔ Pasang FO ➔ Setting Mikrotik ➔ Aktif"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto">
        {/* Toast Notification */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-200 shrink-0">
                <Zap size={22} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <span>Tahapan Pemasangan Customer</span>
                  {pendingList.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-xs font-extrabold shadow-sm animate-pulse">
                      {pendingList.length} Dalam Proses
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">
                  Kelola alur pekerjaan instalasi pelanggan baru dari survei hingga pengaktifan billing.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={fetchPendingSubmissions}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
            <span>Refresh Data Pipeline</span>
          </button>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl shadow-lg shadow-amber-100 space-y-1">
            <span className="text-xs font-bold text-amber-100 uppercase tracking-wider block">PROSES PEMASANGAN</span>
            <div className="text-3xl font-black">{pendingList.length} Pelanggan</div>
            <p className="text-[11px] text-amber-100/90 font-medium">Sedang dalam tahapan survei, instalasi & testing.</p>
          </div>

          <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl shadow-lg shadow-emerald-100 space-y-1">
            <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider block">ESTIMASI OMSET BARU</span>
            <div className="text-3xl font-black">Rp {totalMonthlyPotential.toLocaleString('id-ID')} / bln</div>
            <p className="text-[11px] text-emerald-100/90 font-medium">Pemasukan berlangganan jika seluruhnya aktif.</p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">TAHAPAN PEKERJAAN</span>
            <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 pt-1">
              <span>⏳ Verifikasi</span> → <span>🚚 Survei</span> → <span>🛠️ Pasang</span> → <span>⚙️ Test</span>
            </div>
            <p className="text-[11px] text-slate-500">Billing dimulai saat status berubah ke "5. Aktif".</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pengajuan berdasarkan Nama, WA, Paket, Alamat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Timeline Pipeline Card List */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200">
            <RefreshCw size={24} className="animate-spin text-amber-500" />
            <span className="text-xs font-semibold">Mengambil pipeline pemasangan pelanggan...</span>
          </div>
        ) : filteredPending.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2 bg-white rounded-3xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <p className="text-sm font-bold text-slate-700">Tidak ada pemasangan yang sedang berproses saat ini!</p>
            <p className="text-xs text-slate-400">Seluruh permohonan telah selesai dipasang dan berstatus AKTIF.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPending.map(cust => {
              const currentStageIdx = getStageIndex(cust.status);
              const cleanPhone = (cust.phone_number || '').replace(/[^0-9]/g, '');
              const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;

              return (
                <div key={cust.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4">
                  {/* Top Info Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 font-extrabold flex items-center justify-center text-base border border-amber-200 shrink-0">
                        {cust.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-800 text-base">{cust.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {cust.customer_code || `CUST-${cust.id.slice(0, 5).toUpperCase()}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {cust.phone_number && (
                            <a
                              href={`https://wa.me/${waPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-emerald-600 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <Phone size={12} />
                              <span>{cust.phone_number}</span>
                            </a>
                          )}
                          <span>• Alamat: <strong className="text-slate-700">{cust.address || 'Belum diisi'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">PAKET PILIHAN</span>
                        <span className="font-extrabold text-blue-700 text-xs block">{cust.package_name || 'Paket Internet PPPoE'}</span>
                        <span className="font-black text-emerald-600 text-xs block">Rp {Number(cust.package_price || cust.price || 150000).toLocaleString('id-ID')} / bln</span>
                      </div>

                      {cust.phone_number && (
                        <a
                          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Halo Kak ${cust.name}, progres pemasangan internet ${cust.package_name || ''} Anda saat ini memasuki tahap: ${INSTALLATION_STAGES[currentStageIdx]?.label}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-all flex items-center justify-center cursor-pointer"
                          title="Kirim Update Progres via WhatsApp"
                        >
                          <MessageSquare size={16} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* STEPPER PROGRESS BAR (5 Tahapan) */}
                  <div className="py-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      TAHAPAN INSTALLASI (STAGING PROGRESS)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {INSTALLATION_STAGES.map((stg, idx) => {
                        const isDone = idx < currentStageIdx;
                        const isCurrent = idx === currentStageIdx;
                        const StgIcon = stg.icon;

                        return (
                          <button
                            key={stg.key}
                            onClick={() => handleAdvanceStage(cust, stg.key)}
                            disabled={actionLoadingId === cust.id}
                            className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                              isCurrent
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-md shadow-amber-200 scale-102'
                                : isDone
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <StgIcon size={14} className={isCurrent ? 'animate-bounce text-white' : (isDone ? 'text-emerald-600' : 'text-slate-400')} />
                              {isDone && <Check size={12} className="text-emerald-600 font-bold" />}
                              {isCurrent && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
                            </div>
                            <span className="text-[11px] font-bold leading-tight block">
                              {stg.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BOTTOM ACTION BUTTONS */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-[11px] text-slate-400 font-medium">
                      Status Saat Ini: <strong className="text-amber-800 font-bold">{INSTALLATION_STAGES[currentStageIdx]?.label}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(cust)}
                        disabled={actionLoadingId === cust.id}
                        className="px-3 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        <span>Batalkan Pemasangan</span>
                      </button>

                      {currentStageIdx < 4 && (
                        <button
                          onClick={() => handleAdvanceStage(cust, INSTALLATION_STAGES[currentStageIdx + 1].key)}
                          disabled={actionLoadingId === cust.id}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {actionLoadingId === cust.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <>
                              <span>Lanjut Ke: {INSTALLATION_STAGES[currentStageIdx + 1]?.shortLabel}</span>
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
