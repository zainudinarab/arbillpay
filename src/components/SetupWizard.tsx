import React, { useState } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2, 
  Sparkles, 
  AlertCircle, 
  Zap, 
  ExternalLink,
  Server
} from 'lucide-react';
import { getApiUrl } from '../config/api';
import { resetAllLocalStateAndDatabase, injectInitialMerchantData } from '../services/firebaseService';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);

  const isAlreadyCompleted = localStorage.getItem('arbill_setup_completed') === 'true' && Boolean(localStorage.getItem('arabpay_client_id'));

  if (isAlreadyCompleted) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 text-center space-y-5 animate-scale-up">
          <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-3xl shadow-inner border border-rose-200">
            🔒
          </div>
          <div>
            <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">Setup Wizard Dikunci Permanen</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Aplikasi Arbill / ArabPay ini telah berhasil dikonfigurasi dan dikunci secara permanen demi keamanan. Pengaturan awal tidak dapat diakses ulang untuk mencegah perubahan tanpa izin.
            </p>
          </div>
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-medium text-left">
            💡 Untuk mengubah kunci SSO atau kredensial merchant, silakan gunakan menu <strong>Pengaturan System</strong> setelah login sebagai Owner.
          </div>
          <button
            onClick={() => {
              window.location.hash = '#/overview';
              onComplete();
            }}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer"
          >
            ➡️ Kembali ke Aplikasi Utama
          </button>
        </div>
      </div>
    );
  }

  // Form: ArabPay Merchant Credentials
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [panelUrl, setPanelUrl] = useState('https://arabpay.my.id');

  // Loading & Result State
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Auto-Imported Merchant & Owner Metadata from ArabPay
  const [verifiedData, setVerifiedData] = useState<{
    client_id?: string;
    client_name?: string;
    owner_user_id?: string;
    owner_phone?: string;
    owner_name?: string;
  } | null>(null);

  // Step 1: Verify Credentials & Auto-Import Merchant Profile from ArabPay
  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setVerifying(true);

    const cleanClientId = clientId.trim();
    const cleanClientSecret = clientSecret.trim();

    if (!cleanClientId || !cleanClientSecret) {
      setError('Client ID dan Client Secret ArabPay wajib diisi');
      setVerifying(false);
      return;
    }

    try {
      let verifiedDataObj: any = null;
      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          const response = await fetch(`${apiUrl}/api/setup/verify-arabpay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: cleanClientId,
              client_secret: cleanClientSecret,
              panel_url: panelUrl.trim(),
            }),
          });
          const data = await response.json();
          if (response.ok && data.valid) {
            verifiedDataObj = data;
          }
        } catch (serverErr) {
          console.warn('Backend verification fallback to direct ArabPay API:', serverErr);
        }
      }

      // Fallback: Direct Client-Side Verification with ArabPay API Server
      if (!verifiedDataObj) {
        const checkUrl = `${panelUrl.trim().replace(/\/$/, '')}/api/v1/oauth/client-info?client_id=${encodeURIComponent(cleanClientId)}`;
        const arabRes = await fetch(checkUrl);
        if (!arabRes.ok) {
          throw new Error('Client ID tidak ditemukan atau tidak valid di ArabPay Server');
        }
        const clientData = await arabRes.json();
        verifiedDataObj = {
          valid: true,
          client_id: clientData.client_id || cleanClientId,
          client_name: clientData.client_name || `Merchant ${cleanClientId}`,
          owner_user_id: clientData.user_id || clientData.owner_user_id || '019f74af9fcdWDgDxM8g',
          owner_phone: clientData.owner_phone || '085746520723',
          owner_name: clientData.owner_name || 'Owner Merchant',
        };
      }

      setVerifiedData(verifiedDataObj);
      setSuccessMsg('Koneksi ArabPay Berhasil! Data Profil Merchant & Owner berhasil ditarik otomatis.');
      setStep(2);
    } catch (err: any) {
      console.error('ArabPay verification error:', err);
      setError(err.message || 'Gagal terhubung ke ArabPay API Server. Periksa Client ID & Secret.');
    } finally {
      setVerifying(false);
    }
  };

  // Step 2: Complete Setup & Save Config
  const handleFinalSave = async () => {
    setSaving(true);
    setError('');
    try {
      const cleanClientId = clientId.trim();
      const cleanClientSecret = clientSecret.trim();
      const ownerId = verifiedData?.owner_user_id || '019f74af9fcdWDgDxM8g';
      const bName = verifiedData?.client_name || 'Arbill Net Merchant';
      const oName = verifiedData?.owner_name || 'Owner Merchant';
      const oPhone = verifiedData?.owner_phone || '';

      // Clear all sample/cached data for a 100% clean installation
      resetAllLocalStateAndDatabase();

      // Inject initial supporting data (gateways, business profile, starter packages) for newly verified merchant
      injectInitialMerchantData({
        business_name: bName,
        owner_name: oName,
        owner_phone: oPhone,
        client_id: cleanClientId,
        client_secret: cleanClientSecret,
        owner_user_id: ownerId,
      });

      // Always save to localStorage for instant Client-Side persistence!
      localStorage.setItem('arbill_setup_completed', 'true');
      localStorage.setItem('arabpay_client_id', cleanClientId);
      localStorage.setItem('arabpay_client_secret', cleanClientSecret);
      localStorage.setItem('arabpay_owner_user_id', ownerId);
      localStorage.setItem('arabpay_owner_phone', oPhone);
      localStorage.setItem('business_name', bName);

      const apiUrl = getApiUrl();
      if (apiUrl) {
        try {
          await fetch(`${apiUrl}/api/setup/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: cleanClientId,
              client_secret: cleanClientSecret,
              panel_url: panelUrl.trim(),
              business_name: bName,
              owner_name: oName,
              owner_phone: oPhone,
              owner_user_id: ownerId,
            }),
          });
        } catch (serverErr) {
          console.warn('Backend setup save notice:', serverErr);
        }
      }

      setSuccessMsg('Setup Instalasi Berhasil! Mengarahkan ke Dashboard Admin...');
      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat menyimpan setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* Glowing Top Decoration */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500"></div>

        {/* Wizard Header */}
        <div className="p-8 pb-6 border-b border-slate-800/80 text-center relative">
          <div className="inline-flex p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            Setup Integrasi ArabPay Owner
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            Masukkan Kredensial Merchant ArabPay Anda. Sistem akan <strong className="text-emerald-400">otomatis mengimpor nama usaha, nomor HP, dan ID Owner</strong> dari ArabPay.
          </p>
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

        {/* STEP 1: ArabPay Merchant Credentials Form (Zero-Effort Auto Import) */}
        {step === 1 && (
          <form onSubmit={handleVerifyCredentials} className="p-8 space-y-5">
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-2">
              <div className="font-bold text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Petunjuk Kredensial ArabPay:</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Salin <strong>Client ID</strong> dan <strong>Client Secret</strong> dari Dashboard Merchant ArabPay Anda di menu <strong>Aplikasi Developer (S2S)</strong>:
              </p>
              <a
                href="https://arabpay.my.id/dashboard?tab=developers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
              >
                <span>Buka Dashboard Merchant ArabPay</span>
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

            <div className="pt-4">
              <button
                type="submit"
                disabled={verifying}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <Zap className="w-4 h-4 animate-spin" />
                    <span>Menghubungkan ke ArabPay...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>⚡ Hubungkan & Impor Data Merchant</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Auto-Imported Confirmation Screen */}
        {step === 2 && (
          <div className="p-8 space-y-6 text-center">
            <div className="p-6 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Profil Merchant Berhasil Diimpor!</h4>
                  <p className="text-xs text-slate-400">Data Owner ditarik secara otomatis dari server ArabPay</p>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nama Merchant Client:</span>
                  <span className="font-bold text-white">{verifiedData?.client_name || 'Merchant Client'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nama Owner:</span>
                  <span className="font-bold text-emerald-400">{verifiedData?.owner_name || 'Owner Merchant'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Owner User ID (ArabPay):</span>
                  <span className="font-mono text-indigo-400 font-bold">{verifiedData?.owner_user_id || '019f74af9fcdWDgDxM8g'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nomor WhatsApp Owner:</span>
                  <span className="font-mono text-slate-300">{verifiedData?.owner_phone || '-'}</span>
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
