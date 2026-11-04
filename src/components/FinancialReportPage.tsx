import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Radio,
  Zap,
  RefreshCw,
  X,
  Search,
  FileText,
  CreditCard,
  Building2,
  Percent,
  Receipt
} from 'lucide-react';
import { BusinessProfile, ExpenseItem, ExpenseCategory, ProfitLossReportData } from '../types';
import { formatCurrency, formatDate } from '../utils';
import HeaderBar from './HeaderBar';

interface FinancialReportPageProps {
  profile: BusinessProfile;
  t: any;
  defaultTab?: 'report' | 'expenses';
  onLogout?: () => void;
  setCurrentView: (view: string) => void;
}

const CATEGORY_MAP: Record<ExpenseCategory, { label: string; icon: any; color: string; bg: string }> = {
  isp: {
    label: 'ISP & Bandwidth',
    icon: Radio,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200'
  },
  modem: {
    label: 'Modem & ONT / AP',
    icon: Cpu,
    color: 'text-sky-600',
    bg: 'bg-sky-50 border-sky-200'
  },
  kabel: {
    label: 'Kabel FO & Aksesoris',
    icon: Zap,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200'
  },
  server: {
    label: 'Server, OLT & Switch',
    icon: Building2,
    color: 'text-purple-600',
    bg: 'bg-purple-50 border-purple-200'
  },
  listrik: {
    label: 'Listrik & Sewa Tiang',
    icon: Zap,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 border-yellow-200'
  },
  teknisi: {
    label: 'Teknisi & Transport',
    icon: Wallet,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200'
  },
  operasional: {
    label: 'Operasional Kantor',
    icon: Receipt,
    color: 'text-rose-600',
    bg: 'bg-rose-50 border-rose-200'
  },
  lainnya: {
    label: 'Lain-lain',
    icon: FileText,
    color: 'text-slate-600',
    bg: 'bg-slate-50 border-slate-200'
  }
};

export default function FinancialReportPage({
  profile,
  t,
  defaultTab = 'report',
  onLogout,
  setCurrentView
}: FinancialReportPageProps) {
  const isId = profile.language === 'id';
  const currencyMode = profile.currency || 'IDR';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'report' | 'expenses'>(defaultTab);

  // Filter States
  const [periodFilter, setPeriodFilter] = useState<'month' | 'last_month' | 'quarter' | 'year' | 'all'>('month');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [reportData, setReportData] = useState<ProfitLossReportData>({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0,
    profitMargin: 0,
    paidInvoicesCount: 0,
    expensesCount: 0,
    categoryBreakdown: [],
    monthlyTrend: []
  });

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    title: '',
    category: 'isp' as ExpenseCategory,
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'transfer',
    vendor: '',
    notes: ''
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

  // Fetch Report & Expenses Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (dateRange.startDate) queryParams.set('startDate', dateRange.startDate);
      if (dateRange.endDate) queryParams.set('endDate', dateRange.endDate);

      // Fetch Profit Loss summary
      const resPL = await fetch(`/api/expenses/profit-loss?${queryParams.toString()}`);
      if (resPL.ok) {
        const json = await resPL.json();
        if (json.success && json.report) {
          setReportData(json.report);
        }
      }

      // Fetch Expenses list
      const resExp = await fetch(`/api/expenses?${queryParams.toString()}`);
      if (resExp.ok) {
        const json = await resExp.json();
        if (json.success && Array.isArray(json.expenses)) {
          setExpenses(json.expenses);
        }
      }
    } catch (err) {
      console.error('Failed to load financial report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  // Filtered Expenses in UI
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        exp.title.toLowerCase().includes(q) ||
        (exp.vendor && exp.vendor.toLowerCase().includes(q)) ||
        (exp.notes && exp.notes.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [expenses, categoryFilter, searchQuery]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      category: 'isp',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'transfer',
      vendor: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: ExpenseItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      category: item.category,
      amount: String(item.amount),
      expense_date: item.expense_date.split('T')[0],
      payment_method: item.payment_method || 'transfer',
      vendor: item.vendor || '',
      notes: item.notes || ''
    });
    setIsModalOpen(true);
  };

  // Save Expense (POST or PUT)
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Mohon isi judul keperluan pengeluaran.');
      return;
    }
    const numAmount = Number(formData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Mohon masukkan nominal yang valid dan lebih dari 0.');
      return;
    }

    setFormSubmitting(true);
    try {
      const url = editingItem ? `/api/expenses/${editingItem.id}` : '/api/expenses';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          category: formData.category,
          amount: numAmount,
          expense_date: formData.expense_date,
          payment_method: formData.payment_method,
          vendor: formData.vendor.trim(),
          notes: formData.notes.trim()
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setIsModalOpen(false);
        fetchData();
      } else {
        alert(json.message || 'Gagal menyimpan pengeluaran.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan jaringan: ' + err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string, title: string) => {
    if (!confirm(`Yakin ingin menghapus catatan pengeluaran "${title}"?`)) return;

    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        fetchData();
      } else {
        alert(json.message || 'Gagal menghapus pengeluaran.');
      }
    } catch (err: any) {
      alert('Gagal menghapus: ' + err.message);
    }
  };

  // Quick Preset Helper
  const applyPreset = (presetCategory: ExpenseCategory, defaultTitle: string) => {
    setFormData(prev => ({
      ...prev,
      category: presetCategory,
      title: defaultTitle
    }));
  };

  return (
    <div className="flex-1 min-w-0 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header Bar */}
      <HeaderBar
        title={isId ? 'Laporan Keuangan & Laba Rugi' : 'Financial & Profit/Loss Report'}
        subtitle={isId ? 'Analisis keuntungan bersih riil (Pemasukan vs Biaya Operasional & ISP)' : 'Real net profit analysis (Income vs Operational & ISP costs)'}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content */}
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">

        {/* Top Control Bar: Tab switcher, Date filter, & Add button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab('report')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp size={16} />
              <span>{isId ? 'Laba Rugi & Keuntungan' : 'Profit & Loss'}</span>
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt size={16} />
              <span>{isId ? 'Catatan Pengeluaran' : 'Expenses'}</span>
              {expenses.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
                  {expenses.length}
                </span>
              )}
            </button>
          </div>

          {/* Right Controls: Period Selector & New Expense Button */}
          <div className="flex flex-wrap items-center gap-3">
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
              onClick={fetchData}
              title="Refresh Data"
              className="p-2.5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-600' : ''} />
            </button>

            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-md shadow-emerald-200 transition-all cursor-pointer active:scale-95"
            >
              <Plus size={16} className="stroke-[2.5]" />
              <span>{isId ? 'Catat Pengeluaran' : 'Add Expense'}</span>
            </button>
          </div>
        </div>

        {/* 4 HIGHLIGHT KPI CARDS (Pemasukan, Pengeluaran, Keuntungan Bersih, Margin) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Card 1: Total Pemasukan */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {isId ? 'Total Pemasukan (Omset)' : 'Total Income'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArrowUpRight size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {formatCurrency(reportData.totalIncome, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{reportData.paidInvoicesCount} tagihan invoice lunas</span>
            </div>
          </div>

          {/* Card 2: Total Pengeluaran */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {isId ? 'Total Pengeluaran (Biaya)' : 'Total Expenses'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <ArrowDownRight size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 tracking-tight">
              {formatCurrency(reportData.totalExpense, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500"></span>
              <span>{reportData.expensesCount} transaksi tercatat</span>
            </div>
          </div>

          {/* Card 3: Keuntungan Bersih (Net Profit) */}
          <div className={`rounded-3xl border p-6 shadow-sm relative overflow-hidden ${
            reportData.netProfit >= 0
              ? 'bg-gradient-to-br from-indigo-900 to-indigo-950 text-white border-indigo-800'
              : 'bg-gradient-to-br from-rose-900 to-rose-950 text-white border-rose-800'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-200">
                {isId ? 'Keuntungan / Laba Bersih' : 'Net Profit'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-white/10 text-white flex items-center justify-center backdrop-blur-sm">
                <DollarSign size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black tracking-tight text-emerald-400">
              {formatCurrency(reportData.netProfit, currencyMode)}
            </div>
            <div className="mt-2 text-[11px] text-indigo-200/80 font-medium">
              {reportData.netProfit >= 0 ? '✓ Arus kas surplus / untung' : '⚠ Perhatian: Biaya melebihi pemasukan'}
            </div>
          </div>

          {/* Card 4: Margin Keuntungan */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {isId ? 'Margin Keuntungan' : 'Profit Margin'}
              </span>
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Percent size={18} className="stroke-[2.5]" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {reportData.profitMargin}%
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-semibold">
              Persentase laba dari omset kotor
            </div>
          </div>

        </div>

        {/* TAB 1: LAPORAN LABA RUGI */}
        {activeTab === 'report' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Monthly Trend Chart & Breakdown */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Trend Chart: Pemasukan vs Pengeluaran 6 Bulan Terakhir */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-base">
                      {isId ? 'Tren Finansial 6 Bulan Terakhir' : '6-Month Financial Trend'}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {isId ? 'Perbandingan pemasukan, pengeluaran, dan laba bersih dari database' : 'Comparison of income, expense, and profit'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="w-3 h-3 rounded-md bg-emerald-500"></span>
                      Pemasukan
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-500">
                      <span className="w-3 h-3 rounded-md bg-rose-500"></span>
                      Pengeluaran
                    </span>
                    <span className="flex items-center gap-1.5 text-indigo-600">
                      <span className="w-3 h-3 rounded-md bg-indigo-600"></span>
                      Laba Bersih
                    </span>
                  </div>
                </div>

                {/* Bar Chart Visualization */}
                {reportData.monthlyTrend.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-xs font-medium">
                    Belum ada data transaksi dalam 6 bulan terakhir.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reportData.monthlyTrend.map((m, idx) => {
                      const maxVal = Math.max(
                        ...reportData.monthlyTrend.map(x => Math.max(x.income, x.expense, 1))
                      );
                      const incomePct = Math.min(100, Math.round((m.income / maxVal) * 100));
                      const expensePct = Math.min(100, Math.round((m.expense / maxVal) * 100));

                      return (
                        <div key={idx} className="p-3 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                          <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                            <span className="text-slate-700">{m.label}</span>
                            <span className={`font-mono text-xs ${
                              m.profit >= 0 ? 'text-indigo-600' : 'text-rose-600'
                            }`}>
                              Laba: {formatCurrency(m.profit, currencyMode)}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {/* Income Bar */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 w-16">Pemasukan</span>
                              <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${incomePct}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-[11px] font-bold text-slate-600 w-24 text-right">
                                {formatCurrency(m.income, currencyMode)}
                              </span>
                            </div>
                            {/* Expense Bar */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 w-16">Pengeluaran</span>
                              <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${expensePct}%` }}
                                ></div>
                              </div>
                              <span className="font-mono text-[11px] font-bold text-slate-600 w-24 text-right">
                                {formatCurrency(m.expense, currencyMode)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rincian Ringkasan Pengeluaran per Kategori */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <h3 className="font-extrabold text-slate-800 text-base mb-4">
                  {isId ? 'Alokasi Pengeluaran per Kategori' : 'Expense Category Allocation'}
                </h3>
                {reportData.categoryBreakdown.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-medium">
                    Belum ada pengeluaran yang dicatat pada periode ini.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reportData.categoryBreakdown.map((cat, idx) => {
                      const meta = CATEGORY_MAP[cat.category as ExpenseCategory] || CATEGORY_MAP.lainnya;
                      const Icon = meta.icon;
                      return (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/60 border border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${meta.bg} ${meta.color}`}>
                              <Icon size={18} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 text-xs">{meta.label}</div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                {cat.count} transaksi • {cat.percentage}% dari total pengeluaran
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-slate-800 text-xs">
                              {formatCurrency(cat.amount, currencyMode)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Right Col: Shortcut & Catatan Operasional */}
            <div className="space-y-6">
              
              {/* Shortcut Tambah Biaya Cepat */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
                <h3 className="font-extrabold text-slate-800 text-sm mb-2">
                  {isId ? 'Catat Biaya Cepat' : 'Quick Expense Presets'}
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-4">
                  Pilih keperluan operasional yang sering dikeluarkan:
                </p>

                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    onClick={() => {
                      handleOpenCreate();
                      applyPreset('isp', 'Tagihan ISP Indihome / Moratel Bulanan');
                    }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Radio size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">Tagihan ISP & Bandwidth</div>
                      <div className="text-[10px] text-slate-400">Biaya langganan jalur internet induk</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleOpenCreate();
                      applyPreset('modem', 'Beli Modem ONT GPON / EPON');
                    }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                      <Cpu size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-sky-600">Beli Modem & Router</div>
                      <div className="text-[10px] text-slate-400">Pembelian modem untuk pasang baru</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleOpenCreate();
                      applyPreset('kabel', 'Beli Kabel Dropcore 1 Roll (1000m)');
                    }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                      <Zap size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-amber-600">Kabel Dropcore & FO</div>
                      <div className="text-[10px] text-slate-400">Kabel optik, fast connector, splitter</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleOpenCreate();
                      applyPreset('listrik', 'Token Listrik Server & Sewa Tiang');
                    }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-yellow-200 hover:bg-yellow-50/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center shrink-0">
                      <Zap size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-yellow-600">Listrik PLN & Sewa Tiang</div>
                      <div className="text-[10px] text-slate-400">Daya OLT/Router & retribusi bulanan</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      handleOpenCreate();
                      applyPreset('teknisi', 'Fee Tarikan Kabel / Gaji Teknisi');
                    }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 text-left transition-all cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Wallet size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 group-hover:text-emerald-600">Upah Teknisi & Bensin</div>
                      <div className="text-[10px] text-slate-400">Operasional instalasi & maintenance</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Tips Manajemen Finansial */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-3xl p-6">
                <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs mb-2">
                  <CheckCircle2 size={16} />
                  <span>Formula Laba Bersih</span>
                </div>
                <p className="text-xs text-indigo-900/80 leading-relaxed font-medium">
                  <strong>Keuntungan Bersih</strong> dihitung secara akurat dari seluruh <strong>Tagihan Lunas (Invoices Paid)</strong> dikurangi seluruh <strong>Pengeluaran Operasional</strong> (Tagihan ISP, pembelian modem, kabel, teknisi, dll).
                </p>
                <div className="mt-4 p-3 bg-white/70 rounded-2xl border border-indigo-100/50 text-[11px] font-mono text-indigo-900">
                  Laba Bersih = Omset Lunas - Total Biaya
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: CATATAN PENGELUARAN (BUKU KAS OPERASIONAL) */}
        {activeTab === 'expenses' && (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            
            {/* Search & Filter Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Cari keperluan, vendor, atau catatan..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Kategori</option>
                  <option value="isp">🌐 ISP & Bandwidth</option>
                  <option value="modem">📟 Modem & ONT</option>
                  <option value="kabel">🔌 Kabel FO & Aksesoris</option>
                  <option value="server">🖥️ Server, OLT & Switch</option>
                  <option value="listrik">⚡ Listrik & Sewa Tiang</option>
                  <option value="teknisi">🛠️ Teknisi & Transport</option>
                  <option value="operasional">📋 Operasional Kantor</option>
                  <option value="lainnya">📦 Lain-lain</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3">Tanggal</th>
                    <th className="py-3 px-3">Keperluan / Judul</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-3">Vendor / Toko</th>
                    <th className="py-3 px-3">Metode Bayar</th>
                    <th className="py-3 px-3 text-right">Nominal Biaya</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        {loading ? 'Memuat data pengeluaran...' : 'Belum ada catatan pengeluaran pada filter ini.'}
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((item) => {
                      const meta = CATEGORY_MAP[item.category] || CATEGORY_MAP.lainnya;
                      const Icon = meta.icon;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-semibold text-slate-500 whitespace-nowrap">
                            {formatDate(item.expense_date)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-800">{item.title}</div>
                            {item.notes && (
                              <div className="text-[11px] text-slate-400 font-medium line-clamp-1">
                                {item.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-extrabold border ${meta.bg} ${meta.color}`}>
                              <Icon size={12} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium whitespace-nowrap">
                            {item.vendor || '-'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
                              {item.payment_method || 'Cash'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-rose-600 text-right whitespace-nowrap text-sm">
                            {formatCurrency(item.amount, currencyMode)}
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenEdit(item)}
                                title="Edit Pengeluaran"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteExpense(item.id, item.title)}
                                title="Hapus Pengeluaran"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredExpenses.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold bg-slate-50/50">
                      <td colSpan={5} className="py-3 px-3 text-slate-700">
                        Total Pengeluaran ({filteredExpenses.length} transaksi)
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-rose-600 text-right text-sm">
                        {formatCurrency(
                          filteredExpenses.reduce((sum, x) => sum + Number(x.amount || 0), 0),
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

      {/* MODAL INPUT / EDIT PENGELUARAN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {editingItem ? 'Edit Catatan Pengeluaran' : 'Catat Pengeluaran Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Masukkan rincian biaya operasional untuk perhitungan laba rugi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSubmitExpense} className="p-6 overflow-y-auto space-y-4">
              
              {/* Judul Pengeluaran */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Keperluan / Judul Pengeluaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Contoh: Tagihan ISP Indihome, Beli Kabel Dropcore 1 Roll, Beli Modem 5 Pcs"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              {/* Kategori & Nominal Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Kategori */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kategori Pengeluaran <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as ExpenseCategory })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="isp">🌐 ISP & Bandwidth</option>
                    <option value="modem">📟 Modem & ONT / AP</option>
                    <option value="kabel">🔌 Kabel FO & Aksesoris</option>
                    <option value="server">🖥️ Server, OLT & Switch</option>
                    <option value="listrik">⚡ Listrik & Sewa Tiang</option>
                    <option value="teknisi">🛠️ Teknisi & Transport</option>
                    <option value="operasional">📋 Operasional Kantor</option>
                    <option value="lainnya">📦 Lain-lain</option>
                  </select>
                </div>

                {/* Nominal Biaya */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nominal Biaya (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">Rp</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="any"
                      value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold font-mono focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

              </div>

              {/* Tanggal & Metode Bayar Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Tanggal Transaksi */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tanggal Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={e => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Metode Bayar */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Metode Pembayaran
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={e => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="transfer">Bank Transfer</option>
                    <option value="cash">Tunai / Cash</option>
                    <option value="arabpay">Saldo ArabPay</option>
                    <option value="qris">QRIS / E-Wallet</option>
                  </select>
                </div>

              </div>

              {/* Vendor / Toko */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Vendor / Toko / Penerima Biaya (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder="Contoh: PT Telkom, Tokopedia Toko Fiber, PLN, Teknisi Joko"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              {/* Catatan / Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Nomor resi, invoice vendor, rincian item..."
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {formSubmitting ? 'Menyimpan...' : (editingItem ? 'Simpan Perubahan' : 'Simpan Pengeluaran')}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}

