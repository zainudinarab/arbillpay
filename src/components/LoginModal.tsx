import React, { useState } from 'react';
import { UserAccount } from '../types';
import { QrCode, ArrowRight, ShieldCheck, Lock, AlertCircle, Key, CheckCircle2 } from 'lucide-react';
import { getApiUrl } from '../config/api';
import { verifyOwnerLoginWithFirestore } from '../services/firebaseService';

interface LoginModalProps {
  onLoginSuccess: (user: UserAccount) => void;
  onClose?: () => void;
  initialMode?: 'sso' | 'admin';
}

export default function LoginModal({ onLoginSuccess, onClose, initialMode }: LoginModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showEmergencyAdmin, setShowEmergencyAdmin] = useState(() => {
    if (initialMode === 'sso') return false;
    if (initialMode === 'admin') return true;
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const pathname = window.location.pathname.replace('/', '');
    return hash === 'admin-login' || pathname === 'admin-login' || pathname === 'login';
  });
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleArabPayLogin = () => {
    setIsLoading(true);
    const clientId = (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
    const redirectUri = encodeURIComponent(window.location.origin + '/#/oauth/callback');
    const authUrl = `https://arabpay.my.id/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&app_name=Arbillpay`;
    
    // Redirect browser to real ArabPay OAuth Portal
    window.location.href = authUrl;
  };

  const handleEmergencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = identity.trim();
    const cleanPass = password.trim();

    if (!cleanId || !cleanPass) {
      setErrorMsg('Harap isi ID/Username dan PIN/Password Owner.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      // 1. Try Backend API first if available
      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identity: cleanId, password: cleanPass })
          });
          const data = await res.json();
          if (res.ok && data.success && data.user) {
            if (data.user.role !== 'owner') {
              setErrorMsg('Akses Ditolak: Mode darurat HANYA untuk Owner (Super Admin). Pengguna lain wajib masuk via ArabPay SSO.');
              setIsLoading(false);
              return;
            }
            setIsLoading(false);
            onLoginSuccess(data.user);
            return;
          }
        } catch (apiErr) {
          console.warn('Backend API login failed, attempting Cloud Firestore database verification:', apiErr);
        }
      }

      // 2. Direct Cloud Firestore Database Verification
      const fbOwnerRes = await verifyOwnerLoginWithFirestore(cleanId, cleanPass);
      if (fbOwnerRes && fbOwnerRes.success && fbOwnerRes.user) {
        setIsLoading(false);
        onLoginSuccess(fbOwnerRes.user as any);
        return;
      } else {
        setErrorMsg('❌ Akses Ditolak: ID atau Password Owner darurat tidak cocok dengan data terdaftar di Firestore.');
      }
    } catch (err: any) {
      setErrorMsg('Gagal melakukan verifikasi login darurat: ' + err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden space-y-0 animate-scale-up">
        
        {/* Top Header Card */}
        <div className={`p-8 text-white text-center relative overflow-hidden transition-all ${
          showEmergencyAdmin 
            ? 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900' 
            : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800'
        }`}>
          {onClose && (
            <button 
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer z-20 font-extrabold text-sm"
            >
              ✕
            </button>
          )}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg border border-white/30 font-black text-xl backdrop-blur-md ${
              showEmergencyAdmin ? 'bg-indigo-600/40 text-indigo-300' : 'bg-white/20'
            }`}>
              {showEmergencyAdmin ? '👑' : 'AP'}
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold tracking-wider uppercase mb-1 border border-white/20">
              <ShieldCheck size={12} />
              {showEmergencyAdmin ? 'PORTAL KHUSUS SUPER ADMIN / OWNER' : 'KEMITRAAN RESMI ARABPAY E-WALLET'}
            </div>
            <h2 className="font-extrabold text-2xl tracking-tight text-white">
              {showEmergencyAdmin ? 'Login Admin / Owner' : 'Arbill Login Gateway'}
            </h2>
            <p className="text-xs text-slate-200 mt-1 font-medium max-w-xs leading-relaxed">
              {showEmergencyAdmin 
                ? 'Portal Akses Darurat Khusus Pengelola & Pemilik Sistem (Super Admin Dashboard).' 
                : 'Aplikasi Arbill dikunci eksklusif: Semua pengguna wajib terautentikasi via ArabPay SSO.'}
            </p>
          </div>
        </div>

        {/* Form Area */}
        <div className="p-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-xs font-semibold animate-shake">
              <AlertCircle size={18} className="shrink-0 text-rose-500 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* DEDICATED ADMIN / OWNER EMERGENCY LOGIN FORM */}
          {showEmergencyAdmin ? (
            <form onSubmit={handleEmergencySubmit} className="space-y-4 text-left animate-fade-in">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-2 text-indigo-900 text-xs font-bold">
                <Key size={16} className="text-indigo-600 shrink-0" />
                <span>Masukkan ID & Password Darurat Owner:</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP atau Email Owner:</label>
                <input
                  type="text"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="Contoh: 085746520724 atau ketua11@gmail.com"
                  className="w-full px-4 py-3 bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password Darurat Owner:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ketikkan Password Darurat..."
                  className="w-full px-4 py-3 bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-xl text-xs font-semibold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 hover:from-slate-800 hover:to-indigo-900 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{isLoading ? 'Memverifikasi Hak Akses...' : '⚡ Masuk Ke Dashboard Owner (Super Admin)'}</span>
              </button>
            </form>
          ) : (
            /* ARABPAY SSO LOGIN VIEW FOR CUSTOMERS */
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleArabPayLogin}
                disabled={isLoading}
                className="w-full py-4 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-base rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/25 cursor-pointer transition-all border border-emerald-500/30 transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white font-black text-sm shadow-inner">
                  AP
                </div>
                <span>{isLoading ? 'Mengarahkan ke ArabPay...' : 'Masuk dengan ArabPay (SSO)'}</span>
                <ArrowRight size={18} />
              </button>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-slate-800 text-xs font-bold">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Otentikasi Satu Pintu Terenkripsi</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Login dan pendaftaran dilakukan otomatis via ArabPay. Anda akan diarahkan ke portal aman <strong>https://arabpay.my.id</strong> untuk otorisasi.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
