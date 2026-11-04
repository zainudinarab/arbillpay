import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  Ticket,
  Wifi,
  Home,
  AlertCircle,
  Clock,
  CheckCircle,
  Search,
  RefreshCw,
  Calendar,
  MessageSquare,
  CreditCard,
  Printer,
  ShieldAlert,
  ArrowUpRight,
  Package,
  Layers,
  PhoneCall,
  CheckCircle2
} from 'lucide-react';
import { BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';
import HeaderBar from './HeaderBar';

interface IncomeReportPageProps {
  profile: BusinessProfile;
  t: any;
  defaultTab?: 'pppoe' | 'voucher' | 'hotspot' | 'unpaid';
  onLogout?: () => void;
  setCurrentView: (view: string) => void;
}

export default function IncomeReportPage({
  profile,
  t,
  defaultTab = 'pppoe',
  onLogout,
  setCurrentView
}: IncomeReportPageProps) {
  const isId = profile.language === 'id';
  const currencyMode = profile.currency || 'IDR';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'pppoe' | 'voucher' | 'hotspot' | 'unpaid'>(defaultTab);

  // Period Filter
  const [periodFilter, setPeriodFilter] = useState<'month' | 'last_month' | 'quarter' | 'year' | 'all'>('month');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [unpaidTypeFilter, setUnpaidTypeFilter] = useState<'all' | 'pppoe' | 'hotspot'>('all');

  // Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Report Data State
  const [reportData, setReportData] = useState<{
    summary: {
      totalIncome: number;
      pppoeTotal: number;
      hotspotMemberTotal: number;
      voucherTotal: number;
      unpaidTotal: number;
      unpaidCount: number;
    };
    pppoeByPackage: any[];
    pppoeTransactions: any[];
    hotspotMemberByPackage: any[];
    hotspotMemberTransactions: any[];
    voucherByPackage: any[];
    voucherTransactions: any[];
    unpaidCustomers: any[];
  }>({
    summary: {
      totalIncome: 0,
      pppoeTotal: 0,
      hotspotMemberTotal: 0,
      voucherTotal: 0,
      unpaidTotal: 0,
      unpaidCount: 0
    },
    pppoeByPackage: [],
    pppoeTransactions: [],
    hotspotMemberByPackage: [],
    hotspotMemberTransactions: [],
    voucherByPackage: [],
    voucherTransactions: [],
    unpaidCustomers: []
  });

  // Calculate Date Ranges
  const dateRange = useMemo(() => {
    const now = new Date();
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (periodFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    } else if (periodFilter === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
    } else if (periodFilter === 'quarter') {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    } else if (periodFilter === 'year') {
      const start = new Date(now.getFullYear(), 0, 1);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    }

    return { startDate, endDate };
  }, [periodFilter]);

  // Fetch Report Data from Server
  const fetchReport = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (dateRange.startDate) queryParams.set('startDate', dateRange.startDate);
      if (dateRange.endDate) queryParams.set('endDate', dateRange.endDate);

      const res = await fetch(`/api/invoices/income-report?${queryParams.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setReportData(json);
        }
      }
    } catch (err) {
      console.error('Failed to load income report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [dateRange]);

  // Handle Mark Invoice Paid (Tunai / Kasir)
  const handleMarkPaid = async (invoiceId: string, customerName: string) => {
    if (!confirm(`Tandai tagihan untuk "${customerName}" sebagai LUNAS (Pembayaran Kasir / Tunai)?`)) return;

    setActionLoadingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'Kasir / Tunai' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        alert(`✓ Tagihan untuk ${customerName} berhasil ditandai Lunas!`);
        fetchReport();
      } else {
        alert(json.message || 'Gagal mengubah status tagihan.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Send WhatsApp Reminder
  const handleSendWA = async (item: any) => {
    const phone = item.customer_phone ? String(item.customer_phone).replace(/[^0-9]/g, '') : '';
    if (!phone) {
      alert('Pelanggan tidak memiliki nomor HP / WhatsApp.');
      return;
    }

    const cleanPhone = phone.startsWith('0') ? '62' + phone.substring(1) : phone;
    const formattedAmount = `Rp ${Number(item.amount || 0).toLocaleString('id-ID')}`;
    const message = `Halo Yth. *${item.customer_name}*,\n\nBerikut adalah tagihan internet Anda dari *${profile.companyName || 'Arbill Internet'}*:\n` +
      `• No. Tagihan: *${item.invoice_number}*\n` +
      `• Paket: *${item.package_name}*\n` +
      `• Jumlah: *${formattedAmount}*\n` +
      (item.due_date ? `• Jatuh Tempo: *${formatDate(item.due_date)}*\n\n` : `\n`) +
      `Silakan melakukan pembayaran tepat waktu agar koneksi internet Anda tetap aktif lancar. Terima kasih!`;

    // Open WhatsApp Web directly
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    // Also call backend to record/send if bot configured
    try {
      await fetch(`/api/invoices/${item.invoice_id}/send-wa`, { method: 'POST' });
    } catch (e) {}
  };

  // Filtered Unpaid Customers
  const filteredUnpaid = useMemo(() => {
    return reportData.unpaidCustomers.filter(item => {
      const matchesType = unpaidTypeFilter === 'all' || 
        (unpaidTypeFilter === 'pppoe' && (item.connection_type === 'pppoe' || !item.connection_type)) ||
        (unpaidTypeFilter === 'hotspot' && item.connection_type === 'hotspot');

      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
        (item.customer_phone && item.customer_phone.includes(q)) ||
        (item.pppoe_username && item.pppoe_username.toLowerCase().includes(q)) ||
        (item.address && item.address.toLowerCase().includes(q)) ||
        (item.package_name && item.package_name.toLowerCase().includes(q));

      return matchesType && matchesSearch;
    });
  }, [reportData.unpaidCustomers, unpaidTypeFilter, searchQuery]);

  return (
    <div className="flex-1 min-w-0 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <HeaderBar
        title={isId ? 'Laporan Pemasukan & Piutang Pelanggan' : 'Income & Receivables Report'}
        subtitle={isId ? 'Rincian omset pemasukan bulanan rumahan, hotspot, voucher, dan daftar tagihan belum bayar' : 'Breakdown of PPPoE, hotspot, voucher revenues, and unpaid bills'}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Top Control Bar: Period Filter & Refresh */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          
          {/* Main Tab Switchers (4 Tabs) */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('pppoe')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'pppoe'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Home size={15} />
              <span>{isId ? 'Pelanggan Rumahan (Paket)' : 'PPPoE Home'}</span>
            </button>

            <button
              onClick={() => setActiveTab('voucher')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'voucher'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Ticket size={15} />
              <span>{isId ? 'Penjualan Voucher' : 'Vouchers'}</span>
            </button>

            <button
              onClick={() => setActiveTab('hotspot')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'hotspot'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wifi size={15} />
              <span>{isId ? 'Hotspot Bulanan' : 'Hotspot Member'}</span>
            </button>

            <button
              onClick={() => setActiveTab('unpaid')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'unpaid'
                  ? 'bg-white text-rose-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertCircle size={15} />
              <span>{isId ? 'Belum Bayar (Tunggakan)' : 'Unpaid Bills'}</span>
              {reportData.summary.unpaidCount > 0 && (
                <span className="bg-rose-100 text-rose-700 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                  {reportData.summary.unpaidCount}
                </span>
              )}
            </button>
          </div>

          {/* Period Filter & Actions */}
          <div className="flex items-center gap-2.5 self-end md:self-auto">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-2xl p-1 text-xs font-bold text-slate-700">
              <Calendar size={14} className="text-slate-400 ml-2" />
              <button
                onClick={() => setPeriodFilter('month')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  periodFilter === 'month' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'
                }`}
              >
                Bulan Ini
              </button>
              <button
                onClick={() => setPeriodFilter('last_month')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  periodFilter === 'last_month' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'
                }`}
              >
                Bulan Lalu
              </button>
              <button
                onClick={() => setPeriodFilter('quarter')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  periodFilter === 'quarter' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'
                }`}
              >
                3 Bulan
              </button>
              <button
                onClick={() => setPeriodFilter('year')}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  periodFilter === 'year' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'
                }`}
              >
                Tahun Ini
              </button>
            </div>

            <button
              onClick={fetchReport}
              title="Refresh Laporan"
              className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-600' : ''} />
            </button>

            <button
              onClick={() => window.print()}
              title="Cetak Laporan"
              className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
            >
              <Printer size={16} />
            </button>
          </div>

        </div>

        {/* 4 TOP SUMMARY CARDS (Total Omset, Rumahan, Voucher, Tunggakan) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Card 1: Total Seluruh Pemasukan */}
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 text-white rounded-3xl p-6 shadow-sm border border-indigo-800 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-200">
                {isId ? 'Total Seluruh Pemasukan' : 'Total Revenue'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-white/10 text-white flex items-center justify-center backdrop-blur-sm">
                <DollarSign size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-400 tracking-tight">
              {formatCurrency(reportData.summary.totalIncome, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-indigo-200/80 font-medium">
              Gabungan rumahan, voucher & hotspot
            </div>
          </div>

          {/* Card 2: Pemasukan Rumahan (PPPoE) */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {isId ? 'Pemasukan Rumahan (PPPoE)' : 'PPPoE Home Revenue'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Home size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {formatCurrency(reportData.summary.pppoeTotal, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>{reportData.pppoeTransactions.length} transaksi tagihan terbayar</span>
            </div>
          </div>

          {/* Card 3: Penjualan Voucher Hotspot */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {isId ? 'Penjualan Voucher Hotspot' : 'Voucher Sales'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Ticket size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {formatCurrency(reportData.summary.voucherTotal, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{reportData.voucherTransactions.length} voucher terjual</span>
            </div>
          </div>

          {/* Card 4: Total Tagihan Belum Bayar (Tunggakan) */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500">
                {isId ? 'Total Tunggakan (Belum Bayar)' : 'Total Unpaid Bills'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertCircle size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {formatCurrency(reportData.summary.unpaidTotal, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-rose-500 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>{reportData.summary.unpaidCount} pelanggan belum melunasi</span>
            </div>
          </div>

        </div>

        {/* TAB 1: PEMASUKAN PELANGGAN RUMAHAN SESUAI PAKET */}
        {activeTab === 'pppoe' && (
          <div className="space-y-6">
            
            {/* Breakdown Cards per Paket */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {isId ? 'Rincian Pemasukan per Paket Internet Rumahan' : 'Home Internet Package Revenue Breakdown'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Omset yang dihasilkan dari masing-masing paket langganan
                  </p>
                </div>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl">
                  {reportData.pppoeByPackage.length} Paket Aktif
                </span>
              </div>

              {reportData.pppoeByPackage.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Belum ada pemasukan pelanggan rumahan pada periode yang dipilih.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportData.pppoeByPackage.map((pkg, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-extrabold text-slate-800 text-sm">{pkg.package_name}</div>
                          {pkg.speed_limit && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                              {pkg.speed_limit}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
                            {pkg.paid_count} Lunas
                          </span>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Total Omset:</span>
                        <span className="font-mono font-black text-slate-800 text-sm">
                          {formatCurrency(pkg.total_amount, currencyMode)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat Transaksi Pelanggan Rumahan */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h3 className="font-extrabold text-slate-800 text-base">
                {isId ? 'Daftar Transaksi Pembayaran Rumahan Terakhir' : 'Recent Home Payment Transactions'}
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Tanggal Bayar</th>
                      <th className="py-3 px-3">Pelanggan & Username</th>
                      <th className="py-3 px-3">Paket Internet</th>
                      <th className="py-3 px-3">Alamat / Lokasi</th>
                      <th className="py-3 px-3">Metode Bayar</th>
                      <th className="py-3 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.pppoeTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                          Belum ada transaksi pembayaran rumahan pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      reportData.pppoeTransactions.map((trx) => (
                        <tr key={trx.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                            {formatDate(trx.paid_at || trx.issue_date)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-800">{trx.customer_name}</div>
                            {trx.pppoe_username && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                PPPoE: {trx.pppoe_username}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {trx.package_name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium max-w-xs truncate">
                            {[trx.dusun, trx.desa, trx.address].filter(Boolean).join(', ') || '-'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                              {trx.payment_method || 'Kasir / Tunai'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800 text-right whitespace-nowrap text-sm">
                            {formatCurrency(trx.total, currencyMode)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: PENJUALAN VOUCHER HOTSPOT */}
        {activeTab === 'voucher' && (
          <div className="space-y-6">
            
            {/* Breakdown Cards per Paket Voucher */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {isId ? 'Rincian Penjualan per Paket Voucher Hotspot' : 'Voucher Sales Breakdown by Package'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Omset dari voucher eceran/harian yang terjual
                  </p>
                </div>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-xl">
                  {reportData.voucherByPackage.length} Jenis Voucher
                </span>
              </div>

              {reportData.voucherByPackage.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Belum ada voucher hotspot yang terjual pada periode ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportData.voucherByPackage.map((vPkg, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-amber-50/20 hover:bg-amber-50/40 transition-all flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-extrabold text-slate-800 text-sm">{vPkg.package_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Tarif: {formatCurrency(vPkg.price, currencyMode)}
                          </div>
                        </div>
                        <span className="text-xs font-extrabold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-xl">
                          {vPkg.sold_count} Terjual
                        </span>
                      </div>
                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Total Omset:</span>
                        <span className="font-mono font-black text-slate-800 text-sm">
                          {formatCurrency(vPkg.total_amount, currencyMode)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat Voucher Terjual */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h3 className="font-extrabold text-slate-800 text-base">
                {isId ? 'Daftar Riwayat Voucher Terjual' : 'Sold Voucher History'}
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Waktu Terjual</th>
                      <th className="py-3 px-3">Kode Voucher</th>
                      <th className="py-3 px-3">Paket / Profil</th>
                      <th className="py-3 px-3">Router Hotspot</th>
                      <th className="py-3 px-3">Pembeli / Catatan</th>
                      <th className="py-3 px-3 text-right">Harga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.voucherTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                          Belum ada riwayat voucher terjual pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      reportData.voucherTransactions.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                            {formatDate(v.sold_at || v.created_at)}
                          </td>
                          <td className="py-3 px-3 font-mono font-extrabold text-indigo-600">
                            {v.code}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {v.package_name || v.profile_name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                            {v.router_name || 'Mikrotik'}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium">
                            {v.sold_to || 'Kasir / Lokasi Hotspot'}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800 text-right whitespace-nowrap">
                            {formatCurrency(v.price, currencyMode)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: LANGGANAN HOTSPOT BULANAN */}
        {activeTab === 'hotspot' && (
          <div className="space-y-6">
            
            {/* Breakdown Cards per Paket Hotspot Bulanan */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {isId ? 'Rincian Pemasukan Langganan Hotspot Bulanan' : 'Monthly Hotspot Subscription Breakdown'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Omset dari member pelanggan hotspot berlangganan bulanan
                  </p>
                </div>
                <span className="text-xs font-bold text-sky-600 bg-sky-50 px-3 py-1 rounded-xl">
                  {reportData.hotspotMemberByPackage.length} Paket Bulanan
                </span>
              </div>

              {reportData.hotspotMemberByPackage.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs font-medium">
                  Belum ada transaksi pelanggan hotspot bulanan pada periode ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reportData.hotspotMemberByPackage.map((pkg, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-sky-50/30 hover:bg-sky-50/50 transition-all flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-extrabold text-slate-800 text-sm">{pkg.package_name}</div>
                          {pkg.speed_limit && (
                            <span className="inline-block mt-0.5 text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md">
                              {pkg.speed_limit}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-extrabold text-sky-700 bg-sky-100 px-2.5 py-1 rounded-xl">
                          {pkg.paid_count} Lunas
                        </span>
                      </div>
                      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Total Omset:</span>
                        <span className="font-mono font-black text-slate-800 text-sm">
                          {formatCurrency(pkg.total_amount, currencyMode)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Riwayat Pembayaran Hotspot Bulanan */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
              <h3 className="font-extrabold text-slate-800 text-base">
                {isId ? 'Daftar Transaksi Hotspot Bulanan Terakhir' : 'Recent Monthly Hotspot Transactions'}
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-3">Tanggal Bayar</th>
                      <th className="py-3 px-3">Pelanggan</th>
                      <th className="py-3 px-3">No. HP</th>
                      <th className="py-3 px-3">Paket Hotspot</th>
                      <th className="py-3 px-3">Metode Bayar</th>
                      <th className="py-3 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.hotspotMemberTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                          Belum ada transaksi langganan hotspot bulanan pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      reportData.hotspotMemberTransactions.map((trx) => (
                        <tr key={trx.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                            {formatDate(trx.paid_at || trx.issue_date)}
                          </td>
                          <td className="py-3 px-3 font-extrabold text-slate-800">
                            {trx.customer_name}
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">
                            {trx.customer_phone || '-'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-block px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-sky-50 text-sky-700 border border-sky-100">
                              {trx.package_name}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                              {trx.payment_method || 'Kasir / Tunai'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-800 text-right whitespace-nowrap text-sm">
                            {formatCurrency(trx.total, currencyMode)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: PELANGGAN YANG BELUM BAYAR (TUNGGAKAN) */}
        {activeTab === 'unpaid' && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-5">
            
            {/* Header & Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <AlertCircle size={18} className="text-rose-500" />
                  <span>{isId ? 'Daftar Tagihan Pelanggan Belum Bayar' : 'Unpaid Bills & Defaulters List'}</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {filteredUnpaid.length} pelanggan memiliki tagihan tertunda / melewati jatuh tempo
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Service Type Filter */}
                <select
                  value={unpaidTypeFilter}
                  onChange={e => setUnpaidTypeFilter(e.target.value as any)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Layanan</option>
                  <option value="pppoe">🏠 Rumahan (PPPoE)</option>
                  <option value="hotspot">📶 Hotspot Bulanan</option>
                </select>

                {/* Search Input */}
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Cari nama, HP, PPPoE..."
                    className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all w-48 sm:w-60"
                  />
                </div>
              </div>
            </div>

            {/* Unpaid Bills Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Pelanggan</th>
                    <th className="py-3 px-3">Layanan & Paket</th>
                    <th className="py-3 px-3">Alamat / Lokasi</th>
                    <th className="py-3 px-3">Jatuh Tempo</th>
                    <th className="py-3 px-3">Status Keterlambatan</th>
                    <th className="py-3 px-3 text-right">Tagihan (Rp)</th>
                    <th className="py-3 px-3 text-center">Aksi Cepat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUnpaid.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        {loading ? 'Memuat daftar tunggakan...' : '🎉 Luar biasa! Tidak ada pelanggan yang menunggak pada filter ini.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUnpaid.map((item) => {
                      const isOverdue = Number(item.overdue_days || 0) > 0;

                      return (
                        <tr key={item.invoice_id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Nama & Kontak */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-800">{item.customer_name}</div>
                            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                              {item.customer_phone ? (
                                <span className="flex items-center gap-1 text-slate-500">
                                  <PhoneCall size={10} />
                                  {item.customer_phone}
                                </span>
                              ) : (
                                <span className="text-slate-300">No HP (-)</span>
                              )}
                              {item.pppoe_username && (
                                <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded font-mono text-[9px]">
                                  @{item.pppoe_username}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Layanan & Paket */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-bold text-slate-700">{item.package_name}</div>
                            <span className={`inline-block mt-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                              item.connection_type === 'hotspot' 
                                ? 'bg-sky-50 text-sky-700' 
                                : 'bg-indigo-50 text-indigo-700'
                            }`}>
                              {item.connection_type === 'hotspot' ? '📶 Hotspot Member' : '🏠 Rumahan PPPoE'}
                            </span>
                          </td>

                          {/* Alamat */}
                          <td className="py-3 px-3 text-slate-500 max-w-xs truncate">
                            {[item.dusun, item.desa, item.address].filter(Boolean).join(', ') || '-'}
                          </td>

                          {/* Jatuh Tempo */}
                          <td className="py-3 px-3 font-semibold text-slate-600 whitespace-nowrap">
                            {formatDate(item.due_date || item.expired_at)}
                          </td>

                          {/* Keterlambatan Badge */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {isOverdue ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                                <Clock size={11} />
                                Terlambat {item.overdue_days} hari
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={11} />
                                Menunggu Bayar
                              </span>
                            )}
                          </td>

                          {/* Nominal Tagihan */}
                          <td className="py-3 px-3 font-mono font-black text-rose-600 text-right whitespace-nowrap text-sm">
                            {formatCurrency(item.amount, currencyMode)}
                          </td>

                          {/* Aksi Cepat */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Kirim WhatsApp */}
                              <button
                                onClick={() => handleSendWA(item)}
                                title="Kirim Tagihan via WhatsApp"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-bold transition-all cursor-pointer"
                              >
                                <MessageSquare size={13} className="text-emerald-600" />
                                <span>Tagih WA</span>
                              </button>

                              {/* Tandai Lunas (Kasir) */}
                              <button
                                onClick={() => handleMarkPaid(item.invoice_id, item.customer_name)}
                                disabled={actionLoadingId === item.invoice_id}
                                title="Tandai Sudah Bayar (Kasir)"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={13} className="text-indigo-600" />
                                <span>{actionLoadingId === item.invoice_id ? 'Proses...' : 'Lunas'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredUnpaid.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold bg-slate-50/50">
                      <td colSpan={5} className="py-3 px-3 text-slate-700">
                        Total Tunggakan ({filteredUnpaid.length} Pelanggan Belum Bayar)
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-rose-600 text-right text-sm">
                        {formatCurrency(
                          filteredUnpaid.reduce((sum, x) => sum + Number(x.amount || 0), 0),
                          currencyMode
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

