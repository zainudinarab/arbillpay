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
}

export default function Sidebar({ 
  currentView, 
  setCurrentView, 
  profile, 
  t, 
  onQuickInvoice 
}: SidebarProps) {
  
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
          <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md shadow-blue-200">
            <QrCode size={20} className="stroke-[2.5]" />
          </div>
          <span className="font-sans font-bold text-xl tracking-tight text-slate-800">Billava</span>
        </div>

        {/* Quick Invoice Button */}
        <button
          onClick={onQuickInvoice}
          className="w-full py-3 px-4 bg-[#2563EB] hover:bg-blue-700 transition-all text-white font-sans font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-100 cursor-pointer"
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
                    ? 'bg-[#EFF6FF] text-[#2563EB]' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <IconComponent size={18} className={isActive ? 'text-[#2563EB]' : 'text-slate-400'} />
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
                ? 'bg-[#EFF6FF] text-[#2563EB]' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Settings size={18} className={currentView === 'settings' ? 'text-[#2563EB]' : 'text-slate-400'} />
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
          <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <MoreVertical size={16} />
          </button>
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
