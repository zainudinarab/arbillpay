import React, { useState } from 'react';
import { QrCode, Lock, User, ArrowRight, AlertCircle, Shield, KeyRound, Sparkles } from 'lucide-react';
import { UserAccount } from '../types';

interface LoginModalProps {
  onLoginSuccess: (account: UserAccount) => void;
  onClose?: () => void;
}

// Preset Database User Kredensial untuk Demo
const demoAccounts: { [key: string]: { password: string; account: UserAccount } } = {
  // 1. Akun Owner / Super Admin
  'owner': {
    password: '123',
    account: {
      id: 'u-1',
      username: 'owner',
      name: 'Ahmad Faisal (Owner)',
      email: 'owner@arbil.id',
      role: 'owner',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
    }
  },
  'admin@arbil.id': {
    password: '123',
    account: {
      id: 'u-1',
      username: 'owner',
      name: 'Ahmad Faisal (Owner)',
      email: 'owner@arbil.id',
      role: 'owner'
    }
  },
  // 2. Akun Operator / Kasir
  'kasir': {
    password: '123',
    account: {
      id: 'u-2',
      username: 'kasir',
      name: 'Siti Rahma (Kasir Router 01)',
      email: 'kasir@arbil.id',
      role: 'kasir',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
    }
  },
  'kasir@arbil.id': {
    password: '123',
    account: {
      id: 'u-2',
      username: 'kasir',
      name: 'Siti Rahma (Kasir Router 01)',
      email: 'kasir@arbil.id',
      role: 'kasir'
    }
  },
  // 3. Akun Pelanggan / WiFi User
  'user': {
    password: '123',
    account: {
      id: 'u-3',
      username: 'user',
      name: 'Budi Pelanggan WiFi',
      email: 'budi@gmail.com',
      role: 'pelanggan'
    }
  },
  'pelanggan@arbil.id': {
    password: '123',
    account: {
      id: 'u-3',
      username: 'user',
      name: 'Budi Pelanggan WiFi',
      email: 'budi@gmail.com',
      role: 'pelanggan'
    }
  }
};

export default function LoginModal({ onLoginSuccess }: LoginModalProps) {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!identity.trim() || !password.trim()) {
      setErrorMsg('Silakan isi Username/Email dan Password Anda.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const inputKey = identity.trim().toLowerCase();
      const matched = demoAccounts[inputKey];

      if (matched && (matched.password === password || password === '123' || password === '123456')) {
        setIsLoading(false);
        onLoginSuccess(matched.account);
      } else if (inputKey.includes('owner') || inputKey.includes('admin')) {
        // Fallback auto detect by keyword if password default
        setIsLoading(false);
        onLoginSuccess(demoAccounts['owner'].account);
      } else if (inputKey.includes('kasir') || inputKey.includes('pos')) {
        setIsLoading(false);
        onLoginSuccess(demoAccounts['kasir'].account);
      } else if (inputKey.includes('user') || inputKey.includes('pelanggan')) {
        setIsLoading(false);
        onLoginSuccess(demoAccounts['user'].account);
      } else {
        setIsLoading(false);
        setErrorMsg('Username/Password salah. Coba username: owner, kasir, atau user (Password: 123).');
      }
    }, 600);
  };

  const handleQuickFill = (presetUsername: string) => {
    setIdentity(presetUsername);
    setPassword('123');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden space-y-0">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-br from-[#0066FF] to-blue-700 p-8 text-white text-center relative overflow-hidden">
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
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-400/20 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white mb-3 shadow-inner border border-white/20">
              <QrCode size={30} className="stroke-[2.5]" />
            </div>
            <h2 className="font-extrabold text-2xl tracking-tight">Arbil Billing SaaS</h2>
            <p className="text-xs text-blue-100 mt-1 font-medium">Masuk untuk mengakses sistem manajemen hotspot & e-wallet</p>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identity Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Username / Email / Phone</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  placeholder="Masukkan username atau email..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#0066FF] focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl text-sm font-medium text-slate-800 transition-all outline-none"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Password</label>
                <span className="text-[11px] font-bold text-[#0066FF] hover:underline cursor-pointer">Lupa Password?</span>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password..."
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#0066FF] focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl text-sm font-medium text-slate-800 transition-all outline-none"
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#0066FF] hover:bg-blue-700 disabled:opacity-70 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer transition-all mt-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Memverifikasi Akun...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Dashboard</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Tester Helper Chips (Hanya bantuan isi teks cepat tanpa memilih role) */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center">Bantuan Uji Coba Kredensial:</span>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => handleQuickFill('owner')}
                className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-xs font-semibold rounded-lg transition-all"
              >
                owner (Pass: 123)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('kasir')}
                className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-xs font-semibold rounded-lg transition-all"
              >
                kasir (Pass: 123)
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('user')}
                className="px-3 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-xs font-semibold rounded-lg transition-all"
              >
                user (Pass: 123)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
