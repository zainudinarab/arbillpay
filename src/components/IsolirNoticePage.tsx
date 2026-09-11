import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  QrCode, 
  Phone, 
  Search, 
  Receipt, 
  CheckCircle2, 
  ExternalLink,
  CreditCard,
  WifiOff,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface IsolirNoticePageProps {
  profile: BusinessProfile;
}

export default function IsolirNoticePage({ profile }: IsolirNoticePageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-detect from URL params (misal ?user=xxx atau ?code=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const userQuery = params.get('user') || params.get('code') || hashParams.get('user') || hashParams.get('code');
    if (userQuery) {
      setSearchTerm(userQuery);
      handleSearch(userQuery);
    }
  }, []);

  const handleSearch = async (queryToSearch?: string) => {
    const q = (queryToSearch || searchTerm).trim();
    if (!q) return;

    setLoading(true);
    setErrorMsg('');
    setCustomer(null);
    setInvoices([]);

    try {
      // Cari data customer berdasarkan username pppoe atau kode pelanggan
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.customers) && data.customers.length > 0) {
        const found = data.customers.find((c: any) => 
          c.pppoe_username?.toLowerCase() === q.toLowerCase() || 
          c.customer_code?.toLowerCase() === q.toLowerCase() ||
          c.phone_number === q
        ) || data.customers[0];

        setCustomer(found);

        // Ambil invoice pelanggan
        const invRes = await fetch(`/api/invoices?customer_id=${found.id}`);
        const invData = await invRes.json();
        if (invData.success && Array.isArray(invData.invoices)) {
          const unpaid = invData.invoices.filter((i: any) => i.status === 'unpaid' || i.status === 'overdue');
          setInvoices(unpaid.length > 0 ? unpaid : invData.invoices.slice(0, 2));
        }
      } else {
        setErrorMsg('Data pelanggan tidak ditemukan. Pastikan Username PPPoE atau Kode Pelanggan benar.');
      }
    } catch (err: any) {
      setErrorMsg('Gagal memuat informasi pelanggan: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const whatsappNumber = (profile.whatsappNumber || profile.phone || '6281234567890').replace(/[^0-9]/g, '');
  const waLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Halo Admin ${profile.companyName || 'Internet'}, saya ingin konfirmasi pembayaran tagihan internet saya (Username: ${customer?.pppoe_username || searchTerm || '-'})`)}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-rose-950/40 to-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-rose-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/30">
            <WifiOff size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white">
              {profile.companyName || 'Layanan Internet'}
            </h1>
            <p className="text-xs text-rose-300/80">Pemberitahuan Layanan & Tagihan Internet</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          Layanan Terisolir
        </span>
      </header>

      {/* Main Alert Card */}
      <main className="max-w-4xl mx-auto w-full my-auto py-8">
        <div className="bg-slate-800/80 backdrop-blur-xl border border-rose-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-rose-950/50">
          
          {/* Status Header */}
          <div className="text-center max-w-xl mx-auto mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <ShieldAlert size={36} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
              Akses Internet Dinonaktifkan
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Koneksi internet Anda dialihkan sementara ke halaman ini karena masa aktif paket telah melewati tanggal jatuh tempo & toleransi isolir.
            </p>
          </div>

          {/* Search Bar if not yet resolved */}
          {!customer && (
            <div className="max-w-md mx-auto mb-8">
              <label className="block text-xs font-bold text-slate-300 mb-2 text-center">
                Masukkan Username PPPoE / Kode Pelanggan untuk Cek Tagihan:
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Contoh: user123 atau CUST-001"
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSearch()}
                  disabled={loading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-rose-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {loading ? 'Mencari...' : 'Cek Tagihan'}
                  <ArrowRight size={16} />
                </button>
              </div>
              {errorMsg && (
                <p className="text-xs text-rose-400 mt-2 text-center flex items-center justify-center gap-1">
                  <AlertTriangle size={14} /> {errorMsg}
                </p>
              )}
            </div>
          )}

          {/* Customer & Invoice Details */}
          {customer && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-900/60 rounded-2xl border border-slate-700/60">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pelanggan</span>
                  <p className="font-bold text-white text-base mt-0.5">{customer.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{customer.pppoe_username || customer.customer_code}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Paket Internet</span>
                  <p className="font-bold text-rose-300 text-base mt-0.5">{customer.package_name || 'Paket Bulanan'}</p>
                  <p className="text-xs text-slate-400">Jatuh Tempo: {formatDate(customer.expired_at) || '-'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Status Layanan</span>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                      🔴 Terisolir
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomer(null)}
                      className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Ganti User
                    </button>
                  </div>
                </div>
              </div>

              {/* Tagihan yang harus dibayar */}
              {invoices.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Receipt size={16} className="text-amber-400" />
                    Tagihan Belum Lunas
                  </h3>
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-4 bg-rose-950/30 border border-rose-500/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-rose-300">{inv.invoice_number || inv.id}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 font-semibold">
                            {inv.status === 'overdue' ? 'Jatuh Tempo' : 'Belum Lunas'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Periode: {formatDate(inv.due_date || inv.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase">Total Tagihan</span>
                          <span className="text-lg font-black text-white">
                            {formatCurrency(Number(inv.total_amount || inv.amount || 0))}
                          </span>
                        </div>

                        <a
                          href={`/#/portal?phone=${encodeURIComponent(customer.phone_number || '')}`}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition-all"
                        >
                          <QrCode size={16} />
                          Bayar Sekarang
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-900/40 rounded-xl text-center text-xs text-slate-400">
                  Tidak ditemukan tagihan tertunggak. Jika Anda baru saja melakukan pembayaran, silakan hubungi admin di bawah untuk mengaktifkan kembali koneksi Anda.
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-700/60 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Phone size={18} />
              Konfirmasi Pembayaran via WhatsApp
            </a>

            <a
              href="/#/portal"
              className="w-full sm:w-auto px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <CreditCard size={18} />
              Buka Portal Pelanggan
            </a>
          </div>

          <p className="text-[11px] text-slate-500 text-center mt-6">
            Setelah pembayaran terverifikasi, sistem Arbill akan otomatis mengembalikan profil internet Anda ke kecepatan normal tanpa perlu ganti router atau password.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center py-4 text-xs text-slate-500">
        &copy; {new Date().getFullYear()} {profile.companyName || 'Arbill ISP'} &bull; Layanan Dukungan:{' '}
        <span className="text-slate-400 font-mono">{profile.phone || '0812-xxxx-xxxx'}</span>
      </footer>
    </div>
  );
}
