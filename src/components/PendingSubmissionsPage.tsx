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
  ShieldAlert
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
        const pending = res.customers.filter((c: any) => c.status === 'pending');
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

  const handleApprove = async (cust: any) => {
    setActionLoadingId(cust.id);
    try {
      const updatedCust = {
        ...cust,
        status: 'active',
        approved_at: new Date().toISOString()
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        await fetch(`${apiUrl}/api/customers/${cust.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' })
        }).catch(() => null);
      }

      await saveCustomerToFirestore(updatedCust);
      setPendingList(prev => prev.filter(c => c.id !== cust.id));
      setToastMsg({
        type: 'success',
        text: `✨ Pengajuan member "${cust.name}" BERHASIL DISETUJUI & DIAKTIFKAN!`
      });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menyetujui pengajuan: ' + err?.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (cust: any) => {
    if (!confirm(`Yakin ingin menolak pengajuan dari "${cust.name}"?`)) return;
    setActionLoadingId(cust.id);
    try {
      const updatedCust = {
        ...cust,
        status: 'rejected',
        rejected_at: new Date().toISOString()
      };

      await saveCustomerToFirestore(updatedCust);
      setPendingList(prev => prev.filter(c => c.id !== cust.id));
      setToastMsg({ type: 'success', text: `Pengajuan "${cust.name}" telah ditolak.` });
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

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Pengajuan Member Pending"
        subtitle="Verifikasi dan Tindak Lanjuti Pendaftaran Langganan Pelanggan Baru"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto">
        {/* Toast */}
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

        {/* Title Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-200 shrink-0">
                <Zap size={22} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-2xl font-black font-sans text-slate-800 tracking-tight flex items-center gap-2">
                  <span>Pengajuan Customer Pending</span>
                  {pendingList.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-xs font-extrabold shadow-sm animate-pulse">
                      {pendingList.length} Baru
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 font-sans">
                  Pelanggan yang melakukan registrasi mandiri via Portal Customer & menunggu konfirmasi Admin.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={fetchPendingSubmissions}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-sans font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans">
          <div className="p-5 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-3xl shadow-lg shadow-amber-100 space-y-1">
            <span className="text-xs font-bold text-amber-100 uppercase tracking-wider block">MENUNGGU VERIFIKASI</span>
            <div className="text-3xl font-black">{pendingList.length} Permohonan</div>
            <p className="text-[11px] text-amber-100/90 font-medium">Perlu persetujuan Admin agar layanan aktif.</p>
          </div>

          <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl shadow-lg shadow-emerald-100 space-y-1">
            <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider block">ESTIMASI OMSET BARU</span>
            <div className="text-3xl font-black">Rp {totalMonthlyPotential.toLocaleString('id-ID')} / bln</div>
            <p className="text-[11px] text-emerald-100/90 font-medium">Potensi pemasukan dari pengajuan pending ini.</p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">VERIFIKASI OTOMATIS</span>
            <div className="text-sm font-black text-slate-800 flex items-center gap-2 pt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Terhubung dengan WhatsApp & ArabPay</span>
            </div>
            <p className="text-[11px] text-slate-500">Identitas nomor WA sah dan unik di sistem.</p>
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

        {/* Table / List of Pending Applications */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw size={24} className="animate-spin text-amber-500" />
              <span className="text-xs font-semibold">Mengambil daftar pengajuan pending dari Firestore...</span>
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <p className="text-sm font-bold text-slate-700">Tidak ada pengajuan member yang pending saat ini!</p>
              <p className="text-xs text-slate-400">Seluruh permohonan pendaftaran pelanggan telah disetujui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider">
                    <th className="py-4 px-6">Pelanggan & Kontak WA</th>
                    <th className="py-4 px-6">Paket Internet & Tarif</th>
                    <th className="py-4 px-6">Username / Kredensial</th>
                    <th className="py-4 px-6">Alamat Pemasangan</th>
                    <th className="py-4 px-6 text-right">Tindak Lanjut Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredPending.map(cust => {
                    const cleanPhone = (cust.phone_number || '').replace(/[^0-9]/g, '');
                    const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;

                    return (
                      <tr key={cust.id} className="hover:bg-amber-50/40 transition-all">
                        {/* Name & WA */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm border border-amber-200 shrink-0">
                              {cust.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{cust.name}</div>
                              {cust.phone_number && (
                                <a
                                  href={`https://wa.me/${waPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-mono text-emerald-600 font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                                  title="Klik untuk membuka obrolan WhatsApp"
                                >
                                  <Phone size={12} />
                                  <span>{cust.phone_number}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Package & Price */}
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800 text-xs">
                            {cust.package_name || 'Paket Internet PPPoE'}
                          </div>
                          <div className="text-emerald-600 font-extrabold text-xs mt-0.5">
                            Rp {Number(cust.package_price || cust.price || 150000).toLocaleString('id-ID')} / bln
                          </div>
                        </td>

                        {/* Username */}
                        <td className="py-4 px-6 font-mono text-xs">
                          <div className="font-bold text-pink-600">{cust.pppoe_username || cust.username || '-'}</div>
                          <div className="text-[10px] text-slate-400">Pass: {cust.pppoe_password || '123456'}</div>
                        </td>

                        {/* Address */}
                        <td className="py-4 px-6 text-slate-600 max-w-[220px]">
                          <div className="truncate font-medium">{cust.address || 'Alamat belum diisi'}</div>
                          {(cust.dusun || cust.desa) && (
                            <div className="text-[10px] text-slate-400">{cust.dusun || ''} {cust.desa || ''}</div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {cust.phone_number && (
                              <a
                                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Halo Kak ${cust.name}, pengajuan layanan internet ${cust.package_name || ''} Anda sedang kami proses.`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition-all flex items-center gap-1 cursor-pointer"
                                title="Chat calon pelanggan via WhatsApp"
                              >
                                <MessageSquare size={13} />
                                <span>Hubungi WA</span>
                              </a>
                            )}

                            <button
                              onClick={() => handleApprove(cust)}
                              disabled={actionLoadingId === cust.id}
                              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Setujui permohonan dan aktifkan paket langganan"
                            >
                              {actionLoadingId === cust.id ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              <span>✅ Setujui & Aktifkan</span>
                            </button>

                            <button
                              onClick={() => handleReject(cust)}
                              disabled={actionLoadingId === cust.id}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                              title="Tolak Pengajuan Ini"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
