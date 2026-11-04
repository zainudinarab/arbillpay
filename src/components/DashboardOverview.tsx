import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  ArrowUpRight,
  Eye,
  EyeOff,
  ChevronRight,
  TrendingUp,
  QrCode,
  Smartphone,
  Wallet,
  Coins,
  Globe,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Copy,
  Check,
  X,
  Wifi,
  Zap,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Invoice, PaymentGateway, BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';

import HeaderBar from './HeaderBar';
import { getApiUrl } from '../config/api';

interface DashboardOverviewProps {
  invoices: Invoice[];
  gateways: PaymentGateway[];
  profile: BusinessProfile;
  t: any;
  setLanguage: (lang: 'id' | 'en') => void;
  setCurrentView: (view: string) => void;
  setSelectedInvoice: (invoice: Invoice) => void;
  onQuickInvoice: () => void;
  onLogout?: () => void;
}

export default function DashboardOverview({
  invoices,
  gateways,
  profile,
  t,
  setLanguage,
  setCurrentView,
  setSelectedInvoice,
  onQuickInvoice,
  onLogout
}: DashboardOverviewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; month: string; value: number } | null>(null);

  const [arabpayBalance, setArabpayBalance] = useState<number>(() => {
    try {
      const u = JSON.parse(localStorage.getItem('arbil_current_user') || '{}');
      return typeof u?.arabpay_balance === 'number' ? u?.arabpay_balance : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const handleBalanceUpdate = (e: any) => {
      if (typeof e.detail === 'number') {
        setArabpayBalance(e.detail);
      }
    };
    window.addEventListener('arabpay_balance_update', handleBalanceUpdate);
    return () => window.removeEventListener('arabpay_balance_update', handleBalanceUpdate);
  }, []);

  // --- WALLET PRO VIP STATES & ACTIONS ---
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [showTopupModal, setShowTopupModal] = useState<boolean>(false);
  const [topupAmount, setTopupAmount] = useState<number>(10000);
  const [topupLoading, setTopupLoading] = useState<boolean>(false);
  const [topupData, setTopupData] = useState<any>(null);
  const [topupError, setTopupError] = useState<string>('');
  const [topupStep, setTopupStep] = useState<'input' | 'qris' | 'success'>('input');
  const [showQrisModal, setShowQrisModal] = useState<boolean>(false);

  const currentUser = React.useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('arbil_current_user') || '{}');
    } catch {
      return {};
    }
  }, [arabpayBalance]);

  const displayOwnerId = React.useMemo(() => {
    const rawId = currentUser?.arabpay_user_id || currentUser?.id;
    if (rawId && !rawId.startsWith('00000000')) return rawId;
    if (currentUser?.phone_number) return `AP-${currentUser.phone_number}`;
    return 'AP-OWNER';
  }, [currentUser]);

  const refreshLiveBalance = async () => {
    setIsRefreshing(true);
    try {
      const uId = displayOwnerId;
      const phone = currentUser?.phone_number || '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/auth/live-balance?userId=${encodeURIComponent(uId)}&phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data && data.success && typeof data.balance === 'number') {
        setArabpayBalance(data.balance);
        const raw = localStorage.getItem('arbil_current_user');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            parsed.arabpay_balance = data.balance;
            localStorage.setItem('arbil_current_user', JSON.stringify(parsed));
          } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('arabpay_balance_update', { detail: data.balance }));
      }
    } catch (e) {
      console.warn('Dashboard live balance refresh error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleDashboardTopup = async () => {
    if (!topupAmount || topupAmount < 1000) {
      setTopupError('Nominal top up minimal Rp 1.000 (Bebas).');
      return;
    }

    setTopupLoading(true);
    setTopupError('');
    try {
      const apiUrl = getApiUrl();
      const phone = currentUser?.phone_number || '';
      const uId = displayOwnerId;
      const res = await fetch(`${apiUrl}/api/portal/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phone,
          user_id: uId,
          amount: Number(topupAmount),
          channel: 'qris'
        })
      });
      const data = await res.json();
      if (data && data.success) {
        setTopupData(data);
        setTopupStep('qris');
      } else {
        setTopupError(data?.error || 'Gagal memproses QRIS top up. Coba lagi.');
      }
    } catch (err: any) {
      setTopupError('Gagal terhubung ke gateway ArabPay: ' + err.message);
    } finally {
      setTopupLoading(false);
    }
  };

  // Auto-polling for topup status when QRIS is active
  useEffect(() => {
    if (!showTopupModal || topupStep !== 'qris' || !topupData?.reference_id) return;
    const refId = topupData.reference_id;
    const apiUrl = getApiUrl();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/portal/topup-status?reference_id=${encodeURIComponent(refId)}`);
        const data = await res.json();
        if (data && data.success && (data.status === 'paid' || data.status === 'success')) {
          setTopupStep('success');
          refreshLiveBalance();
          clearInterval(interval);
        }
      } catch (e) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [showTopupModal, topupStep, topupData?.reference_id]);

  // Filter invoices for display in recent
  const filteredRecentInvoices = invoices
    .filter(inv => !inv.isArchived)
    .filter(inv =>
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.client.company && inv.client.company.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .slice(0, 5); // Show top 5 latest activity

  // Calculate stats based on actual non-archived invoices array
  const activeInvoices = invoices.filter(inv => !inv.isArchived);
  const totalInvoiced = activeInvoices.reduce((sum, inv) => sum + inv.total, 0);

  const paidInvoicesAmt = activeInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0);
  const paidCount = activeInvoices.filter(inv => inv.status === 'paid').length;

  const pendingInvoicesAmt = activeInvoices
    .filter(inv => inv.status === 'pending')
    .reduce((sum, inv) => sum + inv.total, 0);
  const pendingCount = activeInvoices.filter(inv => inv.status === 'pending').length;

  const overdueInvoicesAmt = activeInvoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.total, 0);
  const overdueCount = activeInvoices.filter(inv => inv.status === 'overdue').length;

  // Revenue flow data (smooth wavy line representation)
  // Monthly inflow (approximate based on realistic IDR scale)
  const chartData = [
    { month: 'Jan', value: 24000000, x: 50, y: 160 },
    { month: 'Feb', value: 38000000, x: 150, y: 130 },
    { month: 'Mar', value: 31000000, x: 250, y: 145 },
    { month: 'Apr', value: 52000000, x: 350, y: 100 },
    { month: 'May', value: 68000000, x: 450, y: 70 },
    { month: 'Jun', value: 84620000, x: 550, y: 35 },
  ];

  // SVG dimensions for responsive scaling
  const chartWidth = 600;
  const chartHeight = 200;

  // Create smooth cubic bezier line string
  const createBezierPath = () => {
    let path = `M ${chartData[0].x} ${chartData[0].y}`;
    for (let i = 0; i < chartData.length - 1; i++) {
      const p0 = chartData[i];
      const p1 = chartData[i + 1];
      // Control points
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const createAreaPath = () => {
    const linePath = createBezierPath();
    const lastPoint = chartData[chartData.length - 1];
    const firstPoint = chartData[0];
    return `${linePath} L ${lastPoint.x} ${chartHeight} L ${firstPoint.x} ${chartHeight} Z`;
  };

  const getGatewayIcon = (iconName: string) => {
    switch (iconName) {
      case 'QrCode':
        return <QrCode size={18} className="text-rose-500" />;
      case 'Wallet':
        return <Wallet size={18} className="text-teal-600" />;
      case 'CreditCard':
        return <Coins size={18} className="text-indigo-600" />;
      case 'Smartphone':
        return <Smartphone size={18} className="text-blue-500" />;
      default:
        return <Coins size={18} className="text-slate-500" />;
    }
  };

  return (
    <div className="flex-1 min-w-0 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header Bar */}
      <HeaderBar
        profile={profile}
        t={t}
        setLanguage={setLanguage}
        onLogout={onLogout}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />

      {/* Main Content Dashboard */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">

        {/* Mobile Header Title */}
        <div className="lg:hidden flex items-center justify-between pb-2">
          <div>
            <h1 className="font-sans font-bold text-2xl text-slate-800">Arbill</h1>
            <p className="text-xs font-medium text-slate-400">{profile.companyName}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 bg-blue-50 text-[#2563EB] rounded-full">
            <span>{profile.currency}</span>
          </div>
        </div>

        {/* 1. KPI Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

          {/* Card 1: Total Invoiced */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.totalInvoiced}</span>
              <h2 className="text-2xl font-sans font-extrabold text-slate-800 tracking-tight mt-1">
                {formatCurrency(totalInvoiced, profile.currency)}
              </h2>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400 font-sans">{invoices.length} {profile.language === 'id' ? 'tagihan kuartal ini' : 'invoices this quarter'}</p>
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white shadow-sm shadow-blue-200"></div>
            </div>
          </div>

          {/* Card 2: Paid Invoices */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.paidInvoices}</span>
                <span className="text-[10px] font-sans font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  +12.4%
                </span>
              </div>
              <h2 className="text-2xl font-sans font-extrabold text-slate-800 tracking-tight mt-1">
                {formatCurrency(paidInvoicesAmt, profile.currency)}
              </h2>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400 font-sans">{paidCount} {profile.language === 'id' ? 'terkumpul' : 'collected'}</p>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm shadow-emerald-200"></div>
            </div>
          </div>

          {/* Card 3: Pending Invoices */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.pendingInvoices}</span>
              <h2 className="text-2xl font-sans font-extrabold text-slate-800 tracking-tight mt-1">
                {formatCurrency(pendingInvoicesAmt, profile.currency)}
              </h2>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400 font-sans">{pendingCount} {profile.language === 'id' ? 'menunggu pembayaran' : 'awaiting payment'}</p>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white shadow-sm shadow-amber-200"></div>
            </div>
          </div>

          {/* Card 4: Overdue Amount */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.overdueAmount}</span>
                <span className="text-[10px] font-sans font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                  {overdueCount} {profile.language === 'id' ? 'terlambat' : 'overdue'}
                </span>
              </div>
              <h2 className="text-2xl font-sans font-extrabold text-slate-800 tracking-tight mt-1">
                {formatCurrency(overdueInvoicesAmt, profile.currency)}
              </h2>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-400 font-sans">
                {profile.language === 'id' ? 'Rata-rata 14 hari' : 'Avg. 14 days'}
              </p>
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white shadow-sm shadow-rose-200"></div>
            </div>
          </div>

          {/* Card 5: ArabPay Wallet Pro Platinum Card */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 rounded-2xl border border-emerald-500/40 shadow-xl shadow-emerald-950/20 text-white flex flex-col justify-between hover:shadow-2xl transition-all relative overflow-hidden group">
            {/* Background luxury glow */}
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

            <div>
              {/* Header: Chip, Contactless, Badge & Eye Toggle */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  {/* Gold Mini EMV Chip */}
                  <div className="w-7 h-5 rounded bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 p-0.5 shadow-xs border border-amber-300/80 shrink-0">
                    <div className="w-full h-full rounded border border-amber-800/40 grid grid-cols-2 gap-0.5 p-0.5">
                      <div className="border border-amber-900/40"></div>
                      <div className="border border-amber-900/40"></div>
                    </div>
                  </div>
                  <Wifi className="w-3.5 h-3.5 rotate-90 text-emerald-400 opacity-80 shrink-0" />
                  <span className="text-[10px] font-black tracking-wider bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-200 bg-clip-text text-transparent uppercase">
                    WALLET PRO
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="SSE Live Connected" />
                  <button
                    type="button"
                    onClick={() => setShowBalance(!showBalance)}
                    className="p-1 hover:bg-white/10 rounded text-slate-300 hover:text-white transition cursor-pointer"
                    title={showBalance ? 'Sembunyikan Saldo (Sensor Privasi)' : 'Tampilkan Saldo'}
                  >
                    {showBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Saldo Display */}
              <div className="pt-3">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                  Total Saldo Aktif
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight bg-gradient-to-r from-emerald-300 via-teal-200 to-white bg-clip-text text-transparent">
                    {showBalance ? `Rp ${arabpayBalance.toLocaleString('id-ID')}` : 'Rp ••••••••'}
                  </h2>
                  <button
                    type="button"
                    onClick={refreshLiveBalance}
                    className="p-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 rounded-lg text-emerald-400 hover:text-emerald-200 transition cursor-pointer shrink-0"
                    title="Refresh Saldo Live S2S"
                  >
                    <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Account ID / Owner Details */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 font-mono">
                <span className="truncate max-w-[120px]" title={displayOwnerId}>
                  ID: {displayOwnerId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(displayOwnerId);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                  className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-emerald-300 rounded text-[9px] font-sans font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Salin ID Akun"
                >
                  {copiedId ? <Check size={10} /> : <Copy size={10} />}
                  <span>{copiedId ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            {/* Quick Actions Footer Buttons */}
            <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-1.5 mt-3">
              <button
                type="button"
                onClick={() => {
                  setTopupStep('input');
                  setTopupError('');
                  setShowTopupModal(true);
                }}
                className="py-1.5 px-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-[10px] rounded-lg shadow-sm flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
              >
                <Plus size={11} />
                <span>Top Up (Min 1rb)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrisModal(true)}
                className="py-1.5 px-2 bg-white/10 hover:bg-white/20 border border-white/15 text-slate-200 font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                title="Tampilkan QRIS Kasir Toko"
              >
                <QrCode size={11} className="text-emerald-400" />
                <span>QRIS Kasir</span>
              </button>
            </div>
          </div>

        </div>

        {/* 2. Middle Row: Line Chart + Gateways List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Billing & Revenue Flow (Chart) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm lg:col-span-2 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.billingRevenueFlow}</span>
                <h3 className="font-sans font-bold text-lg text-slate-800 mt-1">{t.monthlyCashInflow}</h3>
              </div>
              <div className="text-[11px] font-sans font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-0.5">
                <TrendingUp size={12} />
                <span>+14.8%</span>
              </div>
            </div>

            {/* Interactive SVG Chart Container */}
            <div className="relative pt-6 h-[220px]">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-full overflow-visible"
              >
                <defs>
                  {/* Grid / Glow lines */}
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Grid Lines */}
                <line x1="50" y1="35" x2="550" y2="35" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4,4" />
                <line x1="50" y1="85" x2="550" y2="85" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4,4" />
                <line x1="50" y1="135" x2="550" y2="135" stroke="#F1F5F9" strokeWidth="1" strokeDasharray="4,4" />
                <line x1="50" y1="185" x2="550" y2="185" stroke="#E2E8F0" strokeWidth="1" />

                {/* Fill Area */}
                <path d={createAreaPath()} fill="url(#chartGradient)" />

                {/* Line path */}
                <path
                  d={createBezierPath()}
                  fill="none"
                  stroke="#0066FF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  className="animate-[dash_1.5s_ease-in-out]"
                />

                {/* Dots / Interactive Circles */}
                {chartData.map((pt, idx) => (
                  <g key={pt.month} className="cursor-pointer group/dot">
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="12"
                      fill="transparent"
                      onMouseEnter={() => setHoveredPoint({ x: pt.x, y: pt.y, month: pt.month, value: pt.value })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="5"
                      fill="#FFFFFF"
                      stroke="#0066FF"
                      strokeWidth="3"
                      className="transition-all duration-200 group-hover/dot:r-7 group-hover/dot:stroke-[4]"
                    />
                  </g>
                ))}

                {/* X Axis Labels */}
                {chartData.map((pt) => (
                  <text
                    key={pt.month}
                    x={pt.x}
                    y={chartHeight - 2}
                    textAnchor="middle"
                    className="text-[11px] font-sans font-medium fill-slate-400"
                  >
                    {pt.month}
                  </text>
                ))}
              </svg>

              {/* Chart Tooltip Overlay */}
              {hoveredPoint && (
                <div
                  className="absolute bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-xs shadow-lg font-sans font-medium flex flex-col pointer-events-none z-20"
                  style={{
                    left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                    top: `${(hoveredPoint.y / chartHeight) * 100 - 25}%`,
                    transform: 'translateX(-50%)'
                  }}
                >
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{hoveredPoint.month}</span>
                  <span className="font-semibold">{formatCurrency(hoveredPoint.value, profile.currency)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods (Right panel) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            <div>
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.paymentMethods}</span>
              <h3 className="font-sans font-bold text-lg text-slate-800 mt-1">{t.connectedGateways}</h3>
            </div>

            {/* List of E-Wallet Gateways */}
            <div className="space-y-3">
              {gateways.slice(0, 3).map((gw) => (
                <div key={gw.id} className="flex items-center justify-between p-3 border border-slate-50 hover:border-slate-100 hover:bg-slate-50/50 rounded-xl transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                      {getGatewayIcon(gw.iconName)}
                    </div>
                    <div>
                      <h4 className="font-sans font-semibold text-sm text-slate-800">{gw.name}</h4>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{gw.accountNumber || 'Gwy Config'}</p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-sans font-bold px-2.5 py-1 rounded-full ${gw.isActive
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-slate-100 text-slate-400'
                    }`}>
                    {gw.isActive ? (profile.language === 'id' ? 'Aktif' : 'Connected') : (profile.language === 'id' ? 'Nonaktif' : 'Inactive')}
                  </span>
                </div>
              ))}
            </div>

            {/* Payout Distribution charts */}
            <div className="space-y-3 pt-2">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.payoutDistribution}</span>

              <div className="space-y-3">
                {gateways.filter(g => g.isActive && g.payoutShare > 0).map((gw) => (
                  <div key={gw.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-slate-600">
                      <span>{gw.name}</span>
                      <span className="font-semibold text-slate-800">{gw.payoutShare}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                        style={{ width: `${gw.payoutShare}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* 3. Recent Invoices (Table) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 flex justify-between items-center border-b border-slate-50">
            <div>
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider block uppercase">{t.recentInvoices}</span>
              <h3 className="font-sans font-bold text-lg text-slate-800 mt-1">{t.latestBillingActivity}</h3>
            </div>
            <button
              onClick={() => setCurrentView('invoices')}
              className="text-xs font-semibold text-[#2563EB] hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>{t.viewAll}</span>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/50">
                  <th className="p-4 pl-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.invoiceId}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.clientName}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.issueDate}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.amount}</th>
                  <th className="p-4 pr-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider text-right">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRecentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                      {profile.language === 'id' ? 'Tidak ada data tagihan ditemukan' : 'No invoices found'}
                    </td>
                  </tr>
                ) : (
                  filteredRecentInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        setSelectedInvoice(inv);
                        setCurrentView('invoice-detail');
                      }}
                      className="hover:bg-slate-50/70 transition-all cursor-pointer group"
                    >
                      {/* Invoice ID */}
                      <td className="p-4 pl-6">
                        <span className="font-sans font-semibold text-sm text-slate-800 group-hover:text-[#2563EB] transition-colors block">
                          {inv.invoiceNumber}
                        </span>
                      </td>

                      {/* Client */}
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-50 text-[#2563EB] font-bold text-xs flex items-center justify-center shrink-0">
                            {inv.client.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-sans font-semibold text-xs text-slate-700 leading-tight">{inv.client.name}</p>
                            {inv.client.company && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{inv.client.company}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Issue Date */}
                      <td className="p-4">
                        <span className="text-xs text-slate-500 font-sans font-medium">
                          {formatDate(inv.issueDate, profile.language)}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="p-4">
                        <span className="font-sans font-semibold text-sm text-slate-800">
                          {formatCurrency(inv.total, profile.currency)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-4 pr-6 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${inv.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-600'
                          : inv.status === 'pending'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-rose-50 text-rose-600'
                          }`}>
                          {inv.status === 'paid' ? (
                            <CheckCircle size={12} className="shrink-0" />
                          ) : inv.status === 'pending' ? (
                            <Clock size={12} className="shrink-0" />
                          ) : (
                            <AlertCircle size={12} className="shrink-0" />
                          )}
                          <span>
                            {inv.status === 'paid' ? t.paid : inv.status === 'pending' ? t.pending : t.overdue}
                          </span>
                        </span>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Top Up Saldo Bebas (Min. Rp 1.000) */}
        {showTopupModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up relative">
              {/* Header Modal */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                    <Plus size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                      <span>Top Up Saldo ArabPay</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono border border-amber-500/30">
                        Min. Rp 1.000
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">Akun: {displayOwnerId}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowTopupModal(false);
                    setTopupStep('input');
                    setTopupData(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* STEP 1: INPUT NOMINAL BEBAS */}
              {topupStep === 'input' && (
                <div className="space-y-4 pt-1">
                  {topupError && (
                    <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{topupError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block">
                      Masukkan Nominal Bebas (Rupiah):
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 font-bold text-slate-400 font-mono text-sm">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={topupAmount > 0 ? topupAmount.toLocaleString('id-ID') : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setTopupAmount(raw ? parseInt(raw, 10) : 0);
                          setTopupError('');
                        }}
                        placeholder="Contoh: 1.000, 2.500, 15.000..."
                        className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-base font-black font-mono text-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>

                  {/* Pilihan Cepat */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Zap size={12} className="text-amber-400" /> Nominal Cepat:
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {[1000, 2000, 5000, 10000, 20000, 50000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setTopupAmount(amt);
                            setTopupError('');
                          }}
                          className={`py-2 px-1 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                            topupAmount === amt
                              ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-sm'
                              : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <span>Rp {amt.toLocaleString('id-ID')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={topupLoading || topupAmount < 1000}
                    onClick={handleDashboardTopup}
                    className="w-full mt-2 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {topupLoading && <RefreshCw size={14} className="animate-spin" />}
                    <span>{topupLoading ? 'Memproses QRIS...' : `Bayar Top Up Rp ${topupAmount.toLocaleString('id-ID')}`}</span>
                  </button>
                </div>
              )}

              {/* STEP 2: QRIS PAYMENT */}
              {topupStep === 'qris' && topupData && (
                <div className="space-y-4 text-center pt-1 animate-fade-in">
                  <div className="p-4 bg-white rounded-2xl inline-block shadow-md border border-slate-200">
                    {topupData.qr_image || topupData.qr_url ? (
                      <img
                        src={topupData.qr_image || topupData.qr_url}
                        alt="QRIS Topup"
                        className="w-48 h-48 mx-auto object-contain"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                        QRIS Code Generated
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block">Total Pembayaran:</span>
                    <span className="text-xl font-black font-mono text-emerald-400">
                      Rp {(topupData.total_amount || topupData.amount || topupAmount).toLocaleString('id-ID')}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Scan QRIS via GoPay, OVO, DANA, BCA, Mandiri, ShopeePay, atau m-Banking apapun.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/20 py-2 rounded-xl">
                    <RefreshCw size={13} className="animate-spin text-amber-400" />
                    <span>Menunggu konfirmasi pembayaran otomatis...</span>
                  </div>
                </div>
              )}

              {/* STEP 3: SUCCESS */}
              {topupStep === 'success' && (
                <div className="py-6 text-center space-y-3 animate-fade-in">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="font-extrabold text-base text-white">Top Up Saldo Berhasil!</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Saldo ArabPay Anda telah diperbarui dan langsung aktif di sistem.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTopupModal(false);
                      setTopupStep('input');
                      setTopupData(null);
                    }}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
                  >
                    Selesai & Tutup
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal QRIS Kasir Toko */}
        {showQrisModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 animate-scale-up border border-slate-100">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="text-left">
                  <h3 className="font-black text-slate-800 text-sm">QRIS Kasir Arbill</h3>
                  <p className="text-[11px] text-slate-400">{profile.companyName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQrisModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="w-48 h-48 mx-auto bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center">
                  <QrCode size={160} className="text-slate-800" />
                </div>
                <span className="text-[10px] text-slate-500 block font-mono">NMID: ID102026ARABPAY01</span>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Tunjukkan QRIS ini kepada pelanggan untuk menerima pembayaran instan via All Payment Bank & E-Wallet.
              </p>

              <button
                type="button"
                onClick={() => setShowQrisModal(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
