import React, { useState, useRef, useEffect } from 'react';
import { Search, Globe, Bell, LogOut, User, Shield, ChevronDown, Copy, Check } from 'lucide-react';
import { BusinessProfile } from '../types';

interface HeaderBarProps {
  profile: BusinessProfile;
  t: any;
  setLanguage?: (lang: 'id' | 'en') => void;
  onLogout?: () => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  title?: string;
  subtitle?: string;
}

export default function HeaderBar({
  profile,
  t,
  setLanguage,
  onLogout,
  searchTerm,
  setSearchTerm,
  title,
  subtitle
}: HeaderBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const savedUserStr = typeof window !== 'undefined' ? localStorage.getItem('arbil_current_user') : null;
  const currentUser = savedUserStr ? JSON.parse(savedUserStr) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = profile.name
    ? profile.name.replace(/[\(\)]/g, '').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : 'U';

  const theme = profile.themeColor || 'blue';
  const avatarBgClass = {
    blue: 'bg-blue-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    violet: 'bg-violet-600 text-white',
    rose: 'bg-rose-600 text-white',
    amber: 'bg-amber-600 text-white',
    dark: 'bg-slate-900 text-white'
  }[theme];

  return (
    <header className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 md:px-8 z-20 flex items-center justify-between gap-4 shadow-xs">
      
      {/* Title or Search */}
      {setSearchTerm !== undefined ? (
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t.searchPlaceholder || "Search..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-slate-700"
          />
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg md:text-xl text-slate-800 tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 font-medium truncate">{subtitle}</p>}
        </div>
      )}

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Real-time Indicator (Desktop) */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-medium text-slate-500">{t.realTimeFilter || 'Live Data'}</span>
        </div>

        {/* Language Toggle */}
        {setLanguage && (
          <button
            onClick={() => setLanguage(profile.language === 'id' ? 'en' : 'id')}
            title="Ganti Bahasa / Toggle Language"
            className="p-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-slate-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all"
          >
            <Globe size={16} className="text-slate-400" />
            <span className="uppercase">{profile.language}</span>
          </button>
        )}

        {/* ArabPay E-Wallet Balance Badge */}
        <div className="hidden sm:flex items-center gap-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
          <div className="w-5 h-5 rounded-md bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">
            AP
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider leading-none">Saldo ArabPay</span>
            <span className="text-xs font-black text-slate-800 leading-tight">
              Rp {(currentUser?.arabpay_balance ?? 149800).toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Notifications Icon */}
        <button className="p-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-slate-600 relative cursor-pointer">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
        </button>

        {/* USER PROFILE AVATAR WITH DROPDOWN */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition-all cursor-pointer"
          >
            <div className={`w-8 h-8 rounded-full ${avatarBgClass} font-extrabold flex items-center justify-center text-xs shadow-xs`}>
              {initials}
            </div>
            <span className="hidden sm:block text-xs font-bold text-slate-700 max-w-[100px] truncate">{profile.name}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {/* User Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-800 truncate">{profile.name}</p>
                <p className="text-[11px] font-semibold text-slate-400 truncate mt-0.5">{profile.role}</p>
                <p className="text-[10px] font-medium text-blue-600 truncate mt-0.5">{profile.email}</p>
              </div>

              {/* ArabPay E-Wallet Card inside Dropdown */}
              <div className="p-3 mx-2 my-2 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl text-white shadow-sm space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-100">
                  <span className="flex items-center gap-1">💳 ArabPay E-Wallet</span>
                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px]">Verified</span>
                </div>
                <div className="text-base font-black tracking-tight">
                  Rp {(currentUser?.arabpay_balance ?? 149800).toLocaleString('id-ID')}
                </div>
                
                {/* ID ArabPay with 1-Click Copy */}
                <div className="pt-1 border-t border-white/10 flex items-center justify-between gap-1 text-[10px]">
                  <span className="text-emerald-100/80 font-mono truncate" title={currentUser?.arabpay_user_id || '019f74af9fcdWDgDxM8g'}>
                    ID: {currentUser?.arabpay_user_id || '019f74af9fcdWDgDxM8g'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const arabId = currentUser?.arabpay_user_id || '019f74af9fcdWDgDxM8g';
                      navigator.clipboard.writeText(arabId);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="px-2 py-0.5 bg-white/20 hover:bg-white/30 text-white font-sans font-bold text-[9px] rounded flex items-center gap-1 transition-all cursor-pointer border border-white/20 shrink-0"
                    title="Salin ID ArabPay ke clipboard"
                  >
                    {copied ? <Check size={10} className="text-emerald-200" /> : <Copy size={10} />}
                    <span>{copied ? 'Tersalin!' : 'Salin ID'}</span>
                  </button>
                </div>
              </div>

              <div className="py-1">
                <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-slate-500">
                  <Shield size={14} className="text-emerald-500" />
                  <span>Sistem VPS (Online)</span>
                </div>
              </div>

              {onLogout && (
                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      onLogout();
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut size={15} />
                    <span>Keluar dari Akun</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
