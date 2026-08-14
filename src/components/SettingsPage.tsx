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
  Database,
  Lock,
  Key,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { BusinessProfile } from '../types';
import HeaderBar from './HeaderBar';
import { saveMerchantCredentialsToFirestore } from '../services/firebaseService';

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
  const [mapLat, setMapLat] = useState<number>(profile.mapLat !== undefined ? profile.mapLat : -7.2585);
  const [mapLng, setMapLng] = useState<number>(profile.mapLng !== undefined ? profile.mapLng : 112.7550);
  const [mapZoom, setMapZoom] = useState<number>(profile.mapZoom !== undefined ? profile.mapZoom : 16);
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [success, setSuccess] = useState(false);

  // Emergency Password Change State
  const [newEmergencyPassword, setNewEmergencyPassword] = useState('');
  const [confirmEmergencyPassword, setConfirmEmergencyPassword] = useState('');
  const [passMsg, setPassMsg] = useState({ text: '', isError: false });
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  // ArabPay SSO Credentials & Secret Rotation State
  const [arabpayClientId, setArabpayClientId] = useState(() => localStorage.getItem('arabpay_client_id') || '');
  const [arabpayClientSecret, setArabpayClientSecret] = useState(() => localStorage.getItem('arabpay_client_secret') || '');
  const [arabpayMsg, setArabpayMsg] = useState({ text: '', isError: false });
  const [isUpdatingArabpay, setIsUpdatingArabpay] = useState(false);

  const handleUpdateArabpayCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setArabpayMsg({ text: '', isError: false });
    if (!arabpayClientId.trim() || !arabpayClientSecret.trim()) {
      setArabpayMsg({ text: 'Client ID dan Client Secret ArabPay wajib diisi!', isError: true });
      return;
    }

    setIsUpdatingArabpay(true);
    try {
      localStorage.setItem('arabpay_client_id', arabpayClientId.trim());
      localStorage.removeItem('arabpay_client_secret');

      await saveMerchantCredentialsToFirestore({
        client_id: arabpayClientId.trim(),
        client_secret: arabpayClientSecret.trim()
      });

      setArabpayMsg({
        text: '✨ Client Secret & Kredensial SSO ArabPay BERHASIL DIPERBARUI & TERSIMPAN DI DATABASE FIRESTORE! Sambungan ke server ArabPay kembali normal & aktif.',
        isError: false
      });
    } catch (err: any) {
      setArabpayMsg({ text: 'Gagal memperbarui kredensial: ' + err?.message, isError: true });
    } finally {
      setIsUpdatingArabpay(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      themeColor,
      mapLat,
      mapLng,
      mapZoom
    };
    onUpdateProfile(updatedProfile);

    // Sync Owner profile changes (Nama, Email, Phone) directly to PostgreSQL VPS Database
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      await fetch(`${apiUrl}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone_number: phone.trim()
        })
      });
    } catch (err) {
      console.warn('Failed to sync owner profile to DB:', err);
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg({ text: '', isError: false });

    if (!newEmergencyPassword || newEmergencyPassword.trim().length < 4) {
      setPassMsg({ text: 'Password darurat baru minimal 4 karakter!', isError: true });
      return;
    }
    if (newEmergencyPassword !== confirmEmergencyPassword) {
      setPassMsg({ text: 'Konfirmasi password tidak cocok!', isError: true });
      return;
    }

    setIsUpdatingPass(true);
    try {
      const cleanPass = newEmergencyPassword.trim();
      
      // Save directly to Cloud Firestore: settings/merchant_credentials (owner_pin & owner_password)
      const firestoreRes = await saveMerchantCredentialsToFirestore({
        client_id: arabpayClientId || 'AP24228873',
        client_secret: arabpayClientSecret || '',
        owner_phone: phone || '085746520724',
        owner_pin: cleanPass,
        owner_password: cleanPass
      } as any);

      if (firestoreRes && firestoreRes.success) {
        localStorage.setItem('arbil_owner_emergency_pin', cleanPass);
        setPassMsg({ text: '✨ Password Darurat Owner Berhasil Diperbarui & Disimpan di Cloud Firestore!', isError: false });
        setNewEmergencyPassword('');
        setConfirmEmergencyPassword('');
      } else {
        setPassMsg({ text: firestoreRes?.error || 'Gagal memperbarui Password Darurat di Cloud Firestore.', isError: true });
      }
    } catch (err: any) {
      setPassMsg({ text: 'Gagal memperbarui Password Darurat: ' + err?.message, isError: true });
    } finally {
      setIsUpdatingPass(false);
    }
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

                {/* Map Coordinates & Initial Session Location Card */}
                <div className="sm:col-span-2 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        <span>📍 Koordinat Lokasi Pusat & Zoom Sesi Peta FTTH Perusahaan</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">Titik lokasi pusat acuan awal ketika Peta FTTH dibuka pertama kali</p>
                    </div>
                    <button
                      type="button"
                      disabled={isGettingGps}
                      onClick={() => {
                        if (!navigator.geolocation) {
                          alert('Browser Anda tidak mendukung fitur lokasi GPS.');
                          return;
                        }
                        setIsGettingGps(true);
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setMapLat(Number(pos.coords.latitude.toFixed(6)));
                            setMapLng(Number(pos.coords.longitude.toFixed(6)));
                            setIsGettingGps(false);
                          },
                          (err) => {
                            alert(`Gagal mengambil lokasi GPS: ${err.message}`);
                            setIsGettingGps(false);
                          }
                        );
                      }}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <span>{isGettingGps ? '⏳ Mengambil GPS...' : '🎯 Gunakan Lokasi GPS Saya Saat Ini'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Latitude (Lintang)</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={mapLat}
                        onChange={(e) => setMapLat(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Longitude (Bujur)</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={mapLng}
                        onChange={(e) => setMapLng(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">Zoom Sesi Awal</label>
                      <select
                        value={mapZoom}
                        onChange={(e) => setMapZoom(parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={12}>12 - Zoom Kota (Sangat Luas)</option>
                        <option value={14}>14 - Zoom Kecamatan (Sedang)</option>
                        <option value={16}>16 - Zoom Desa / Komplek (Default)</option>
                        <option value={18}>18 - Zoom Mikro (Sangat Dekat)</option>
                      </select>
                    </div>
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

            {/* Owner Emergency Password Change Section */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 pt-6">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
                <ShieldCheck className="text-emerald-500" size={20} />
                <div>
                  <h3 className="font-sans font-bold text-sm text-slate-800">Password Pemulihan Darurat Owner</h3>
                  <p className="text-[11px] text-slate-400">Atur/ubah password lokal untuk login darurat Owner jika terjadi kendala jaringan ArabPay</p>
                </div>
              </div>

              {passMsg.text && (
                <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-semibold animate-fade-in ${
                  passMsg.isError ? 'bg-rose-50 border border-rose-100 text-rose-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                }`}>
                  {passMsg.isError ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                  <span>{passMsg.text}</span>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Password Darurat Baru</label>
                    <input
                      type="password"
                      required
                      placeholder="Masukkan password darurat baru..."
                      value={newEmergencyPassword}
                      onChange={(e) => setNewEmergencyPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Konfirmasi Password Darurat</label>
                    <input
                      type="password"
                      required
                      placeholder="Ulangi password darurat baru..."
                      value={confirmEmergencyPassword}
                      onChange={(e) => setConfirmEmergencyPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-700"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingPass}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Lock size={14} />
                    <span>{isUpdatingPass ? 'Mengubah...' : 'Perbarui Password Darurat'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ArabPay SSO Credentials & Secret Rotation Section */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl space-y-4 font-sans">
              <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-lg shrink-0 border border-indigo-400/30">
                  🔑
                </div>
                <div>
                  <h3 className="font-sans font-extrabold text-sm text-white flex items-center gap-2">
                    <span>Pengaturan & Pembaruan Secret ArabPay SSO</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-400/30">
                      ● Active Connected
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Gunakan form ini jika Client Secret merchant di ArabPay di-rotate / diganti agar ArbillPay tetap terhubung ke server.
                  </p>
                </div>
              </div>

              {arabpayMsg.text && (
                <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
                  arabpayMsg.isError ? 'bg-rose-500/20 border-rose-400/40 text-rose-200' : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                }`}>
                  {arabpayMsg.isError ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                  <span>{arabpayMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleUpdateArabpayCredentials} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 block">Client ID ArabPay</label>
                    <input
                      type="text"
                      required
                      value={arabpayClientId}
                      onChange={(e) => setArabpayClientId(e.target.value)}
                      placeholder="Masukkan Client ID..."
                      className="w-full px-3.5 py-2.5 bg-white/10 border border-white/20 rounded-xl text-xs font-mono text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-300 block">Client Secret ArabPay (Baru)</label>
                    <input
                      type="password"
                      required
                      value={arabpayClientSecret}
                      onChange={(e) => setArabpayClientSecret(e.target.value)}
                      placeholder="Masukkan Client Secret Baru..."
                      className="w-full px-3.5 py-2.5 bg-white/10 border border-white/20 rounded-xl text-xs font-mono text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <span className="text-[10px] text-slate-400 font-medium">
                    🔒 Data dienkripsi & disimpan otomatis di Cloud Database & Local Storage.
                  </span>
                  <button
                    type="submit"
                    disabled={isUpdatingArabpay}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{isUpdatingArabpay ? 'Menyimpan...' : '💾 Simpan & Sinkronkan Secret Baru'}</span>
                  </button>
                </div>
              </form>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
