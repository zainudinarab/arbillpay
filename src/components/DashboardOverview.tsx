import React, { useState } from 'react';
import { 
  Search, 
  Bell, 
  ArrowUpRight, 
  Eye, 
  ChevronRight, 
  TrendingUp,
  QrCode,
  Smartphone,
  Wallet,
  Coins,
  Globe,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Invoice, PaymentGateway, BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';

import HeaderBar from './HeaderBar';

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

          {/* Card 5: ArabPay E-Wallet Live Balance Card */}
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-2xl border border-emerald-500/30 shadow-md text-white flex flex-col justify-between hover:shadow-lg transition-all relative overflow-hidden">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-sans font-bold text-emerald-100/90 tracking-wider block uppercase">SALDO ARABPAY</span>
                <span className="text-[10px] font-sans font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                  💳 E-Wallet
                </span>
              </div>
              <h2 className="text-2xl font-sans font-black tracking-tight mt-1">
                Rp {((typeof window !== 'undefined' && JSON.parse(localStorage.getItem('arbil_current_user') || '{}')?.arabpay_balance) ?? 149800).toLocaleString('id-ID')}
              </h2>
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-emerald-100/80 font-mono truncate max-w-[130px]">
                {(typeof window !== 'undefined' && JSON.parse(localStorage.getItem('arbil_current_user') || '{}')?.email) || 'ketua11@gmail.com'}
              </p>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping"></div>
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

                  <span className={`text-[10px] font-sans font-bold px-2.5 py-1 rounded-full ${
                    gw.isActive 
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
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          inv.status === 'paid' 
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

      </main>
    </div>
  );
}
