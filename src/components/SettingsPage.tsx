import React, { useState } from 'react';
import { 
  Save, 
  Settings, 
  User, 
  Building, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  DollarSign, 
  Languages, 
  CheckCircle,
  Database
} from 'lucide-react';
import { BusinessProfile } from '../types';
import HeaderBar from './HeaderBar';

interface SettingsPageProps {
  profile: BusinessProfile;
  onUpdateProfile: (profile: BusinessProfile) => void;
  t: any;
  onLogout?: () => void;
}

export default function SettingsPage({
  profile,
  onUpdateProfile,
  t,
  onLogout
}: SettingsPageProps) {
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address);
  const [taxId, setTaxId] = useState(profile.taxId || '');
  const [currency, setCurrency] = useState<'IDR' | 'USD'>(profile.currency);
  const [language, setLanguage] = useState<'id' | 'en'>(profile.language);
  const [themeColor, setThemeColor] = useState<'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'dark'>(profile.themeColor || 'blue');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProfile: BusinessProfile = {
      ...profile,
      name,
      role,
      companyName,
      email,
      phone,
      address,
      taxId,
      currency,
      language,
      themeColor
    };
    onUpdateProfile(updatedProfile);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <HeaderBar
        title={t.settings}
        subtitle="Konfigurasi profile usaha, preferensi tampilan dan tema warna"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Container */}
      <main className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
        
        {/* Success Alert Banner */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-700 text-sm font-semibold animate-fade-in">
            <CheckCircle size={18} />
            <span>Pengaturan berhasil disimpan!</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left panel: Info & Storage */}
          <div className="space-y-6">
            
            {/* Storage Usage block */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-blue-500" />
                <h3 className="font-sans font-bold text-xs text-slate-400 uppercase tracking-wider">Kapasitas Penyimpanan</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-500">Penyimpanan Terpakai</span>
                  <span className="text-slate-800">{profile.storageUsed} / {profile.storageMax} GB</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#2563EB] h-full rounded-full transition-all duration-300" 
                    style={{ width: `${(profile.storageUsed / profile.storageMax) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans pt-1">
                  Penyimpanan digunakan untuk menyimpan riwayat file PDF tagihan dan aset logo merchant Anda.
                </p>
              </div>
            </div>

            {/* Business Plan */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-2xl text-white shadow-md relative overflow-hidden">
              <div className="space-y-1 z-10 relative">
                <span className="text-[9px] font-sans font-bold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Aktif</span>
                <h3 className="font-sans font-bold text-lg pt-1">Paket Business Pro</h3>
                <p className="text-xs text-blue-100 leading-relaxed font-sans mt-1">
                  Nikmati integrasi e-wallet tak terbatas, penerbitan tagihan tak terbatas, dan analisis keuangan real-time.
                </p>
              </div>
              {/* Abstract graphic decoration */}
              <div className="absolute -bottom-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-xl"></div>
            </div>

          </div>

          {/* Right Panel: Settings Form */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm md:col-span-2 space-y-6">
            
            <div className="border-b border-slate-50 pb-4">
              <h3 className="font-sans font-bold text-base text-slate-800">{t.profileSettings}</h3>
              <p className="text-xs text-slate-400">Sesuaikan data usaha yang akan dicetak di lembar tagihan pelanggan</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Role */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">Jabatan</label>
                  <input
                    type="text"
                    required
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Company Name */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block">Nama Perusahaan / Usaha</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">Email Usaha</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">No. Telepon</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* NPWP */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block">NPWP Perusahaan</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="00.000.000.0-000.000"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Address */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 block">Alamat Kantor</label>
                  <textarea
                    rows={3}
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>

                {/* Currency */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">Mata Uang Utama</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'IDR' | 'USD')}
                    className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  >
                    <option value="IDR">IDR (Rp) Rupiah</option>
                    <option value="USD">USD ($) US Dollar</option>
                  </select>
                </div>

                {/* Language */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 block">Bahasa Dasbor</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'id' | 'en')}
                    className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English (US)</option>
                  </select>
                </div>

                {/* Theme Color Selector */}
                <div className="space-y-1 sm:col-span-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-700 block mb-2">Tema Warna Dashboard</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { key: 'blue', name: 'Ocean Blue', bg: 'bg-blue-600', border: 'border-blue-600' },
                      { key: 'emerald', name: 'Emerald Green', bg: 'bg-emerald-600', border: 'border-emerald-600' },
                      { key: 'violet', name: 'Royal Violet', bg: 'bg-violet-600', border: 'border-violet-600' },
                      { key: 'rose', name: 'Rose Pink', bg: 'bg-rose-600', border: 'border-rose-600' },
                      { key: 'amber', name: 'Warm Amber', bg: 'bg-amber-600', border: 'border-amber-600' },
                      { key: 'dark', name: 'Midnight Dark', bg: 'bg-slate-900', border: 'border-slate-900' }
                    ].map(thm => (
                      <button
                        type="button"
                        key={thm.key}
                        onClick={() => setThemeColor(thm.key as any)}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          themeColor === thm.key ? `${thm.border} bg-slate-50 shadow-sm scale-105` : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full ${thm.bg} shadow-sm`} />
                        <span className="text-[10px] font-bold text-slate-700 leading-tight text-center">{thm.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Form Action */}
              <div className="flex justify-end pt-4 border-t border-slate-50">
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-600 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-100 transition-all"
                >
                  <Save size={14} />
                  <span>{t.save}</span>
                </button>
              </div>

            </form>
          </div>

        </div>

      </main>
    </div>
  );
}
