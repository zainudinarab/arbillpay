import React from 'react';
import { 
  LayoutGrid, 
  FileText, 
  Users, 
  TrendingUp, 
  CreditCard, 
  Settings, 
  Plus, 
  MoreVertical,
  QrCode
} from 'lucide-react';
import { BusinessProfile } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  profile: BusinessProfile;
  t: any;
  onQuickInvoice: () => void;
  onLogout?: () => void;
}

export default function Sidebar({ 
  currentView, 
  setCurrentView, 
  profile, 
  t, 
  onQuickInvoice,
  onLogout
}: SidebarProps) {
  
  const theme = profile.themeColor || 'blue';
  const themeStyles = {
    blue: { bg: 'bg-[#0066FF]', activeBg: 'bg-blue-50 text-blue-600', activeIcon: 'text-blue-600', btnBg: 'bg-[#2563EB] hover:bg-blue-700 shadow-blue-100' },
    emerald: { bg: 'bg-emerald-600', activeBg: 'bg-emerald-50 text-emerald-600', activeIcon: 'text-emerald-600', btnBg: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' },
    violet: { bg: 'bg-violet-600', activeBg: 'bg-violet-50 text-violet-600', activeIcon: 'text-violet-600', btnBg: 'bg-violet-600 hover:bg-violet-700 shadow-violet-100' },
    rose: { bg: 'bg-rose-600', activeBg: 'bg-rose-50 text-rose-600', activeIcon: 'text-rose-600', btnBg: 'bg-rose-600 hover:bg-rose-700 shadow-rose-100' },
    amber: { bg: 'bg-amber-600', activeBg: 'bg-amber-50 text-amber-600', activeIcon: 'text-amber-600', btnBg: 'bg-amber-600 hover:bg-amber-700 shadow-amber-100' },
    dark: { bg: 'bg-slate-900', activeBg: 'bg-slate-100 text-slate-900', activeIcon: 'text-slate-900', btnBg: 'bg-slate-900 hover:bg-slate-800 shadow-slate-200' }
  }[theme];

  const menuItems = [
    { id: 'overview', label: t.overview, icon: LayoutGrid },
    { id: 'invoices', label: t.invoices, icon: FileText },
    { id: 'clients', label: t.clients, icon: Users },
    { id: 'analytics', label: t.analytics, icon: TrendingUp },
    { id: 'gateways', label: t.paymentMethods, icon: CreditCard },
  ];

  return (
    <aside id="desktop-sidebar" className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-100 h-screen sticky top-0 p-6 shrink-0 justify-between">
      {/* Brand & Menu */}
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${themeStyles.bg} flex items-center justify-center text-white shadow-md transition-all`}>
            <QrCode size={20} className="stroke-[2.5]" />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight text-slate-800">Billava</span>
        </div>

        {/* Quick Invoice Button */}
        <button
          onClick={onQuickInvoice}
          className={`w-full py-3 px-4 ${themeStyles.btnBg} transition-all text-white font-sans font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer`}
        >
          <Plus size={18} />
          <span>{t.quickInvoice}</span>
        </button>

        {/* Main Menu */}
        <div className="space-y-1 pt-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase block px-3 mb-2">{t.overview ? 'MENU' : 'MENU'}</span>
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-sans font-medium transition-all cursor-pointer ${
                  isActive 
                    ? themeStyles.activeBg 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <IconComponent size={18} className={isActive ? themeStyles.activeIcon : 'text-slate-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* General */}
        <div className="space-y-1 pt-2">
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase block px-3 mb-2">{t.settings ? 'GENERAL' : 'GENERAL'}</span>
          <button
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-sans font-medium transition-all cursor-pointer ${
              currentView === 'settings' 
                ? themeStyles.activeBg 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Settings size={18} className={currentView === 'settings' ? themeStyles.activeIcon : 'text-slate-400'} />
            <span>{t.settings}</span>
          </button>
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="border-t border-slate-100 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EFF6FF] text-[#2563EB] font-bold flex items-center justify-center text-sm">
              {profile.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-sans font-semibold text-sm text-slate-800 truncate leading-tight">{profile.name}</p>
              <p className="text-[11px] font-sans font-medium text-slate-400 truncate mt-0.5">{profile.role}</p>
            </div>
          </div>
          {onLogout && (
            <button 
              onClick={onLogout}
              title="Keluar dari Akun"
              className="text-slate-400 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition-all font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>Keluar</span>
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-sans font-medium">
            <span className="text-slate-400">{t.teamPlan}: <span className="text-slate-700 font-semibold">{t.business}</span></span>
          </div>
          <div className="flex justify-between text-[11px] font-sans font-medium">
            <span className="text-slate-400">{t.storageUsed}</span>
            <span className="text-slate-700 font-semibold">{profile.storageUsed} / {profile.storageMax} GB</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-[#2563EB] h-full rounded-full transition-all duration-500" 
              style={{ width: `${(profile.storageUsed / profile.storageMax) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
