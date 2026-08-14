import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  FileText,
  Users,
  TrendingUp,
  CreditCard,
  Settings,
  Plus,
  UserCheck,
  Globe,
  Router,
  Server,
  Zap,
  Ticket,
  Network,
  ChevronDown,
  ChevronRight,
  Package,
  ShieldCheck,
  LogOut,
  Radio,
  MapPin,
  Wifi,
  Bell
} from 'lucide-react';
import { BusinessProfile, UserRole } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  profile: BusinessProfile;
  t: any;
  onQuickInvoice: () => void;
  onLogout?: () => void;
  userRole?: UserRole;
  pendingCount?: number;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: any;
  roles: string[];
  items: {
    id: string;
    label: string;
    icon: any;
    roles: string[];
  }[];
}

export default function Sidebar({
  currentView,
  setCurrentView,
  profile,
  t,
  onQuickInvoice,
  onLogout,
  userRole = 'owner',
  pendingCount = 0
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

  // Grouped Menu Definitions
  const menuGroups: MenuGroup[] = [
    {
      id: 'ftth_group',
      label: 'Manajemen FTTH',
      icon: Network,
      roles: ['owner', 'teknisi', 'marketing', 'kasir'],
      items: [
        { id: 'map-ftth', label: 'Peta FTTH', icon: MapPin, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'ftth-splitter', label: 'Master Splitter', icon: Settings, roles: ['owner', 'teknisi'] },
        { id: 'ftth-devices', label: 'Tabel Perangkat', icon: Server, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
      ]
    },
    {
      id: 'network_group',
      label: 'Jaringan & Router',
      icon: Server,
      roles: ['owner', 'teknisi'],
      items: [
        { id: 'routers', label: 'Daftar Router', icon: Server, roles: ['owner', 'teknisi'] },
        { id: 'ip-pools', label: 'Address Pool', icon: Network, roles: ['owner', 'teknisi'] },
        { id: 'profiles', label: 'Profile Mikrotik', icon: Zap, roles: ['owner', 'teknisi'] },
        { id: 'genieacs', label: 'GenieACS OLT', icon: Radio, roles: ['owner', 'teknisi'] },
      ]
    },
    {
      id: 'billing_group',
      label: 'Layanan & Billing',
      icon: Package,
      roles: ['owner', 'teknisi', 'marketing', 'kasir', 'pelanggan'],
      items: [
        { id: 'pending-submissions', label: 'Pengajuan Customer', icon: Zap, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'packages', label: 'Paket Internet', icon: Router, roles: ['owner', 'teknisi'] },
        { id: 'customers', label: 'Pelanggan Rumah', icon: Globe, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'hotspot-customers', label: 'Pelanggan Hotspot', icon: Wifi, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'invoices', label: userRole === 'pelanggan' ? 'Tagihan Saya' : t.invoices, icon: FileText, roles: ['owner', 'kasir', 'pelanggan'] },
      ]
    },
    {
      id: 'system_group',
      label: 'Pengguna & Akses',
      icon: Users,
      roles: ['owner'],
      items: [
        { id: 'users', label: 'Pengguna System', icon: UserCheck, roles: ['owner'] },
        { id: 'clients', label: t.clients, icon: Users, roles: ['owner'] },
      ]
    },
    {
      id: 'reports_group',
      label: 'Laporan & Metode',
      icon: TrendingUp,
      roles: ['owner'],
      items: [
        { id: 'analytics', label: t.analytics, icon: TrendingUp, roles: ['owner'] },
        { id: 'gateways', label: t.paymentMethods, icon: CreditCard, roles: ['owner'] },
      ]
    },
    {
      id: 'settings_group',
      label: 'Pengaturan & Wilayah',
      icon: Settings,
      roles: ['owner', 'teknisi', 'marketing', 'kasir'],
      items: [
        { id: 'settings', label: t.settings, icon: Settings, roles: ['owner'] },
        { id: 'notifications', label: 'Notifikasi WA & Gateway', icon: Bell, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
        { id: 'regions', label: 'Data Wilayah', icon: MapPin, roles: ['owner', 'teknisi', 'marketing', 'kasir'] },
      ]
    }
  ];

  // State to track open/closed accordion groups (default ALL CLOSED, except the active group)
  const [openGroups, setOpenGroups] = useState<{ [key: string]: boolean }>(() => {
    const initial: { [key: string]: boolean } = {};
    menuGroups.forEach(group => {
      if (group.items.some(item => item.id === currentView)) {
        initial[group.id] = true;
      }
    });
    return initial;
  });

  // Expand group containing active view when currentView changes
  useEffect(() => {
    menuGroups.forEach(group => {
      if (group.items.some(item => item.id === currentView)) {
        setOpenGroups(prev => ({ ...prev, [group.id]: true }));
      }
    });
  }, [currentView]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <aside id="desktop-sidebar" className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-100 h-screen sticky top-0 p-6 shrink-0 justify-between overflow-y-auto">
      {/* Brand & Menu */}
      <div className="space-y-5">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${themeStyles.bg} flex items-center justify-center text-white shadow-md transition-all font-black text-sm shrink-0`}>
              AP
            </div>
            <div>
              <span className="font-sans font-extrabold text-xl tracking-tight text-slate-800 block leading-none">Arbill</span>
              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block mt-0.5">🔒 ArabPay SSO Locked</span>
            </div>
          </div>
        </div>

        {/* Quick Invoice Button (Owner & Kasir Only) */}
        {userRole !== 'pelanggan' && (
          <button
            onClick={onQuickInvoice}
            className={`w-full py-2.5 px-4 ${themeStyles.btnBg} transition-all text-white font-sans font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md text-xs cursor-pointer`}
          >
            <Plus size={16} />
            <span>{t.quickInvoice}</span>
          </button>
        )}

        {/* Overview Top Item */}
        <div className="space-y-1">
          <button
            onClick={() => setCurrentView('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-sans font-bold transition-all cursor-pointer ${currentView === 'overview'
              ? themeStyles.activeBg
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
          >
            <LayoutGrid size={17} className={currentView === 'overview' ? themeStyles.activeIcon : 'text-slate-400'} />
            <span>{userRole === 'pelanggan' ? 'Ringkasan Saya' : t.overview}</span>
          </button>
        </div>

        {/* Grouped Submenus */}
        <div className="space-y-3 pt-1">
          {menuGroups.map(group => {
            const groupFilteredItems = group.items.filter(item => item.roles.includes(userRole));
            if (groupFilteredItems.length === 0) return null;

            const isOpen = openGroups[group.id];
            const isGroupActive = groupFilteredItems.some(item => item.id === currentView);
            const GroupIcon = group.icon;

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Header Button */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isGroupActive ? 'text-slate-900 bg-slate-50' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/60'
                    }`}
                >
                  <div className="flex items-center gap-2.5">
                    <GroupIcon size={16} className={isGroupActive ? themeStyles.activeIcon : 'text-slate-400'} />
                    <span className="uppercase text-[10px] tracking-wider font-extrabold">{group.label}</span>
                  </div>
                  {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                </button>

                {/* Submenu Items list */}
                {isOpen && (
                  <div className="pl-4 space-y-1 border-l-2 border-slate-100 ml-3.5 pt-1">
                    {groupFilteredItems.map(item => {
                      const ItemIcon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setCurrentView(item.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-sans font-semibold transition-all cursor-pointer ${isActive
                            ? themeStyles.activeBg
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ItemIcon size={15} className={isActive ? themeStyles.activeIcon : 'text-slate-400'} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.id === 'pending-submissions' && pendingCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-black shadow-xs shadow-rose-200 animate-pulse shrink-0">
                              {pendingCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="border-t border-slate-100 pt-4 space-y-3 mt-6 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`w-8 h-8 rounded-full ${themeStyles.activeBg} font-black flex items-center justify-center text-xs shrink-0 shadow-xs border border-slate-100`}>
              {(profile?.name || 'Admin').replace(/[\(\)]/g, '').split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-xs text-slate-800 truncate leading-tight" title={profile?.name || 'Admin'}>{profile?.name || 'Admin'}</p>
              <p className="text-[10px] font-sans font-semibold text-slate-400 truncate mt-0.5" title={profile?.role || 'owner'}>{profile?.role || 'owner'}</p>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="Keluar dari Akun"
              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all font-semibold text-[11px] shrink-0 cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-sans font-medium">
            <span className="text-slate-400">{t.storageUsed}</span>
            <span className="text-slate-700 font-bold">{profile.storageUsed} / {profile.storageMax} GB</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`${themeStyles.bg} h-full rounded-full transition-all duration-500`}
              style={{ width: `${(profile.storageUsed / profile.storageMax) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
