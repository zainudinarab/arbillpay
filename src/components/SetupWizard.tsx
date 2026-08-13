import React, { useState } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  Building2, 
  CheckCircle2, 
  Sparkles, 
  AlertCircle, 
  ArrowRight, 
  Zap, 
  ExternalLink,
  Phone,
  User,
  Server
} from 'lucide-react';
import { getApiUrl } from '../config/api';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Step 1 Form: Business Profile
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');

  // Step 2 Form: ArabPay Merchant Credentials
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [panelUrl, setPanelUrl] = useState('https://arabpay.my.id');

  // Loading & Result State
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Verified Owner Metadata from ArabPay
  const [verifiedData, setVerifiedData] = useState<{
    client_name?: string;
    owner_user_id?: string;
    owner_phone?: string;
    owner_name?: string;
  } | null>(null);

  // Step 1 Validation
  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!businessName.trim()) {
      setError('Nama Usaha RT/RW Net wajib diisi');
      return;
    }
    if (!ownerPhone.trim() || ownerPhone.length < 10) {
      setError('Nomor WA Owner wajib diisi dengan benar');
      return;
    }
    setStep(2);
  };

  // Step 2: Test & Verify Credentials via S2S Handshake
  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setVerifying(true);

    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID dan Client Secret ArabPay wajib diisi');
      setVerifying(false);
      return;
    }

    try {
      const apiUrl = getApiUrl() || '';
      const response = await fetch(`${apiUrl}/api/setup/verify-arabpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          panel_url: panelUrl.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || 'Client ID atau Client Secret tidak valid pada server ArabPay');
      }

      setVerifiedData(data);
      setSuccessMsg('Koneksi ArabPay S2S Berhasil! Identitas Merchant & Owner terverifikasi.');
      setStep(3);
    } catch (err: any) {
      console.error('ArabPay verification error:', err);
      setError(err.message || 'Gagal terhubung ke ArabPay API Server');
    } finally {
      setVerifying(false);
    }
  };

  // Step 3: Complete Setup & Save Config
  const handleFinalSave = async () => {
    setSaving(true);
    setError('');
    try {
      const apiUrl = getApiUrl() || '';
      const response = await fetch(`${apiUrl}/api/setup/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          panel_url: panelUrl.trim(),
          business_name: businessName.trim(),
          owner_name: ownerName.trim() || verifiedData?.owner_name || 'Owner ArbillPay',
          owner_phone: ownerPhone.trim() || verifiedData?.owner_phone || '',
          owner_user_id: verifiedData?.owner_user_id || '019f74af9fcdWDgDxM8g',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal menyimpan konfigurasi setup');
      }

      setSuccessMsg('Setup Instalasi Berhasil! Mengarahkan ke Dashboard Admin...');
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat menyimpan setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* Glowing Top Decoration */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500"></div>

        {/* Wizard Header */}
        <div className="p-8 pb-6 border-b border-slate-800/80 text-center relative">
          <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            Pengaturan Instalasi Pertama Kali
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto">
            Kaitkan aplikasi biller <strong className="text-emerald-400">ArbillPay</strong> dengan akun <strong className="text-indigo-400">ArabPay Merchant</strong> Anda sebagai Owner penampung saldo.
          </p>

          {/* Steps Progress Indicator */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              step === 1 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400'
            }`}>
              <span>1</span>
              <span>Profil Usaha</span>
            </div>
            <span className="text-slate-600">→</span>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              step === 2 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400'
            }`}>
              <span>2</span>
              <span>Kredensial ArabPay</span>
            </div>
            <span className="text-slate-600">→</span>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              step === 3 ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-400'
            }`}>
              <span>3</span>
              <span>Aktivasi Owner</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="px-8 pt-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* STEP 1: Business & Owner Profile */}
        {step === 1 && (
          <form onSubmit={handleNextStep1} className="p-8 space-y-5">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  Nama Usaha / RT-RW Net
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Nusantara Net / Bintaro Fiber"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-400" />
                    Nama Pemilik / Admin
                  </label>
                  <input
                    type="text"
                    placeholder="Nama Lengkap Owner"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-emerald-400" />
                    Nomor WhatsApp Owner (ArabPay)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 085746520723"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value.replace(/\D/g, ''))}
                    required
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center gap-2 text-sm cursor-pointer"
              >
                <span>Lanjut ke Kredensial ArabPay</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: ArabPay Merchant Credentials */}
        {step === 2 && (
          <form onSubmit={handleVerifyCredentials} className="p-8 space-y-5">
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-2">
              <div className="font-bold text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Petunjuk Kredensial ArabPay:</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Dapatkan <strong>Client ID</strong> dan <strong>Client Secret</strong> dengan membuat aplikasi client baru di Dashboard Merchant ArabPay Anda:
              </p>
              <a
                href="https://arabpay.my.id/dashboard?tab=developers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
              >
                <span>Buka Dashboard Merchant ArabPay (Tab Developers)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  ArabPay Client ID
                </label>
                <input
                  type="text"
                  placeholder="Contoh: AP24228873"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  disabled={verifying}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-indigo-400" />
                  ArabPay Client Secret
                </label>
                <input
                  type="password"
                  placeholder="Contoh: sec_live_xxxx... atau secret string"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  required
                  disabled={verifying}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-slate-400" />
                  ArabPay Server API URL
                </label>
                <input
                  type="text"
                  value={panelUrl}
                  onChange={(e) => setPanelUrl(e.target.value)}
                  required
                  disabled={verifying}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-sm font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Kembali
              </button>

              <button
                type="submit"
                disabled={verifying}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <Zap className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi S2S...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>⚡ Tes Koneksi & Verifikasi Owner</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Auto-Pairing Confirmation */}
        {step === 3 && (
          <div className="p-8 space-y-6 text-center">
            <div className="p-6 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Akun Merchant Terhubung!</h4>
                  <p className="text-xs text-slate-400">Data Owner berhasil ditarik secara otomatis dari ArabPay</p>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nama Usaha:</span>
                  <span className="font-bold text-white">{businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Merchant Client Name:</span>
                  <span className="font-bold text-emerald-400">{verifiedData?.client_name || businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Owner User ID:</span>
                  <span className="font-mono text-indigo-400 font-bold">{verifiedData?.owner_user_id || '019f74af9fcdWDgDxM8g'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nomor HP Owner:</span>
                  <span className="font-mono text-slate-300">{ownerPhone}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinalSave}
              disabled={saving}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <span>Menyimpan Konfigurasi Setup...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Selesaikan & Masuk Dashboard Admin</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
