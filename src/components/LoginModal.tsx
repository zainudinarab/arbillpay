import React, { useState } from 'react';
import { UserAccount } from '../types';
import { QrCode, ArrowRight, ShieldCheck, Lock, AlertCircle, Key, CheckCircle2 } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: UserAccount) => void;
  onClose?: () => void;
}

export default function LoginModal({ onLoginSuccess, onClose }: LoginModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showEmergencyAdmin, setShowEmergencyAdmin] = useState(false);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleArabPayLogin = () => {
    setIsLoading(true);
    const clientId = (import.meta as any).env?.VITE_ARABPAY_CLIENT_ID || 'AP24228873';
    const redirectUri = encodeURIComponent(window.location.origin + '/#/oauth/callback');
    const authUrl = `https://arabpay.my.id/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}`;
    
    // Redirect browser to real ArabPay OAuth Portal
    window.location.href = authUrl;
  };

  const handleEmergencySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity.trim() || !password.trim()) {
      setErrorMsg('Harap isi username dan password darurat.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('http://localhost:3006/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: identity.trim(), password })
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
      } else {
        setErrorMsg(data.message || 'Login darurat gagal. Hanya akun Owner yang diizinkan.');
      }
    } catch (err) {
      setErrorMsg('Gagal terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden space-y-0">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 p-8 text-white text-center relative overflow-hidden">
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
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-3 shadow-lg border border-white/30 font-black text-xl">
              AP
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-[10px] font-bold tracking-wider uppercase mb-1 border border-white/20">
              <ShieldCheck size={12} />
              Kemitraan Resmi ArabPay E-Wallet
            </div>
            <h2 className="font-extrabold text-2xl tracking-tight text-white">Arbill Login Gateway</h2>
            <p className="text-xs text-emerald-100 mt-1 font-medium max-w-xs">Aplikasi Arbill dikunci eksklusif: Semua pengguna wajib terautentikasi via ArabPay SSO.</p>
          </div>
        </div>

        {/* Form Area - ArabPay Primary SSO */}
        <div className="p-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-xs font-semibold animate-shake">
              <AlertCircle size={18} className="shrink-0 text-rose-500 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* MAIN SOLE LOGIN BUTTON: ARABPAY SSO */}
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

          {/* Emergency Admin Recovery Mode (Accordion) */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => setShowEmergencyAdmin(!showEmergencyAdmin)}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-all cursor-pointer underline"
            >
              {showEmergencyAdmin ? 'Sembunyikan Mode Darurat Owner' : 'Mode Pemulihan Darurat Owner (Local Login)'}
            </button>

            {showEmergencyAdmin && (
              <form onSubmit={handleEmergencySubmit} className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-left animate-fade-in">
                <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Akses Pemulihan Darurat Admin:</div>
                
                <div>
                  <input
                    type="text"
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder="Username / Email..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  {isLoading ? 'Memverifikasi...' : 'Masuk Darurat (Owner Only)'}
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
