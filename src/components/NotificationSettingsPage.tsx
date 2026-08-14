import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Send, 
  Check, 
  ShieldCheck, 
  Loader2, 
  Radio, 
  MessageSquare, 
  Save, 
  Zap, 
  Server, 
  Globe, 
  Sparkles,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { BusinessProfile } from '../types';
import HeaderBar from './HeaderBar';
import { getNotificationGatewaySettingsFromFirestore, saveNotificationGatewaySettingsToFirestore } from '../services/firebaseService';
import { sendWhatsAppMessageDirect } from '../services/whatsappService';

interface NotificationSettingsPageProps {
  profile: BusinessProfile;
  onUpdateProfile: (updated: BusinessProfile) => void;
  t: any;
  onLogout?: () => void;
}

export type WAEngineType = 'gowa' | 'waha' | 'wuzapi' | 'fonnte' | 'disabled';

export interface NotificationGatewayConfig {
  activeEngine: WAEngineType;
  gowa: { url: string; token: string };
  waha: { url: string; session: string; token: string };
  wuzapi: { url: string; token: string };
  fonnte: { url: string; token: string };
  autoSendInvoice: boolean;
  autoSendReceipt: boolean;
  autoSendReminder: boolean;
}

export default function NotificationSettingsPage({
  profile,
  onUpdateProfile,
  t,
  onLogout
}: NotificationSettingsPageProps) {
  const [activeEngine, setActiveEngine] = useState<WAEngineType>('gowa');
  
  // Engines Config States
  const [gowaUrl, setGowaUrl] = useState('http://localhost:3000/api/send');
  const [gowaToken, setGowaToken] = useState('');

  const [wahaUrl, setWahaUrl] = useState('http://localhost:3000/api/sendText');
  const [wahaSession, setWahaSession] = useState('default');
  const [wahaToken, setWahaToken] = useState('');

  const [wuzapiUrl, setWuzapiUrl] = useState('http://localhost:8080/chat/send/text');
  const [wuzapiToken, setWuzapiToken] = useState('');

  const [fonnteUrl, setFonnteUrl] = useState('https://api.fonnte.com/send');
  const [fonnteToken, setFonnteToken] = useState(profile.waGatewayToken || '');

  // Auto Events
  const [autoSendInvoice, setAutoSendInvoice] = useState(true);
  const [autoSendReceipt, setAutoSendReceipt] = useState(true);
  const [autoSendReminder, setAutoSendReminder] = useState(true);

  // Test Direct Dispatch States
  const [testPhone, setTestPhone] = useState(profile.phone || '');
  const [testMessage, setTestMessage] = useState('Halo! Ini adalah pesan uji coba integrasi WhatsApp Gateway ArbillPay.');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; isError: boolean } | null>(null);

  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Saved Gateway Config from Firestore / Local Storage on mount
  useEffect(() => {
    getNotificationGatewaySettingsFromFirestore().then(res => {
      if (res.success && res.config) {
        const c = res.config;
        if (c.activeEngine) setActiveEngine(c.activeEngine);
        if (c.gowa) { setGowaUrl(c.gowa.url || ''); setGowaToken(c.gowa.token || ''); }
        if (c.waha) { setWahaUrl(c.waha.url || ''); setWahaSession(c.waha.session || 'default'); setWahaToken(c.waha.token || ''); }
        if (c.wuzapi) { setWuzapiUrl(c.wuzapi.url || ''); setWuzapiToken(c.wuzapi.token || ''); }
        if (c.fonnte) { setFonnteUrl(c.fonnte.url || 'https://api.fonnte.com/send'); setFonnteToken(c.fonnte.token || ''); }
        if (c.autoSendInvoice !== undefined) setAutoSendInvoice(c.autoSendInvoice);
        if (c.autoSendReceipt !== undefined) setAutoSendReceipt(c.autoSendReceipt);
        if (c.autoSendReminder !== undefined) setAutoSendReminder(c.autoSendReminder);
      }
    });
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToastMsg(null);

    const config: NotificationGatewayConfig = {
      activeEngine,
      gowa: { url: gowaUrl.trim(), token: gowaToken.trim() },
      waha: { url: wahaUrl.trim(), session: wahaSession.trim(), token: wahaToken.trim() },
      wuzapi: { url: wuzapiUrl.trim(), token: wuzapiToken.trim() },
      fonnte: { url: fonnteUrl.trim(), token: fonnteToken.trim() },
      autoSendInvoice,
      autoSendReceipt,
      autoSendReminder
    };

    try {
      const res = await saveNotificationGatewaySettingsToFirestore(config);
      if (res.success) {
        // Also sync active token to BusinessProfile for global fallback
        let activeToken = '';
        let activeUrl = '';
        if (activeEngine === 'gowa') { activeToken = gowaToken; activeUrl = gowaUrl; }
        else if (activeEngine === 'waha') { activeToken = wahaToken; activeUrl = wahaUrl; }
        else if (activeEngine === 'wuzapi') { activeToken = wuzapiToken; activeUrl = wuzapiUrl; }
        else if (activeEngine === 'fonnte') { activeToken = fonnteToken; activeUrl = fonnteUrl; }

        onUpdateProfile({
          ...profile,
          waGatewayToken: activeToken,
          waGatewayUrl: activeUrl
        });

        setToastMsg({ type: 'success', text: `✅ Pengaturan WA Gateway (${activeEngine.toUpperCase()}) berhasil disimpan ke Cloud Database!` });
      } else {
        setToastMsg({ type: 'error', text: '⚠️ Gagal menyimpan ke cloud, tersimpan di browser.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal menyimpan pengaturan.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestDispatch = async () => {
    if (!testPhone) {
      setTestResult({ text: 'Nomor HP Uji Coba wajib diisi!', isError: true });
      return;
    }
    setTestLoading(true);
    setTestResult(null);

    try {
      let url = '';
      let token = '';

      if (activeEngine === 'gowa') { url = gowaUrl; token = gowaToken; }
      else if (activeEngine === 'waha') { url = wahaUrl; token = wahaToken; }
      else if (activeEngine === 'wuzapi') { url = wuzapiUrl; token = wuzapiToken; }
      else if (activeEngine === 'fonnte') { url = fonnteUrl; token = fonnteToken; }

      const res = await sendWhatsAppMessageDirect({
        phone: testPhone,
        message: testMessage,
        gatewayToken: token,
        gatewayUrl: url
      });

      if (res.mode === 'gateway') {
        setTestResult({ text: `✅ Pesan berhasil dikirim otomatis oleh Engine ${activeEngine.toUpperCase()}!`, isError: false });
      } else {
        setTestResult({ text: `💬 Membuka WhatsApp 1-Klik (Mode Gateway tidak aktif / Token Kosong).`, isError: false });
      }
    } catch (err: any) {
      setTestResult({ text: `❌ Gagal tes pengiriman: ${err?.message || 'Error'}`, isError: true });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-16">
      <HeaderBar
        title="Pengaturan Notifikasi & WA Gateway"
        subtitle="Kelola bot pengiriman WhatsApp otomatis (GoWA, WAHA, WuzAPI, Fonnte) untuk ISP & RT RW Net"
        profile={profile}
        onLogout={onLogout}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Banner Title */}
        <div className="bg-gradient-to-r from-emerald-900/60 via-slate-900 to-blue-900/60 border border-emerald-500/30 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
              <Bell size={32} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                Multi-Engine WhatsApp Notification Gateway
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-mono font-bold">PRO</span>
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Pilih dan aktifkan service WhatsApp Bot favorit Anda. Sistem ArbillPay akan secara otomatis mengirimkan tagihan, struk pembayaran, dan pengingat jatuh tempo tanpa perlu membuka WA Web.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center gap-2 cursor-pointer transition-all shrink-0 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? 'Memproses Simpan...' : 'Simpan Pengaturan Gateway'}</span>
          </button>
        </div>

        {toastMsg && (
          <div className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-bold animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
          }`}>
            {toastMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{toastMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* 1. Select Active Engine Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap size={18} className="text-amber-400" />
              1. Pilih WA Bot Service yang Diaktifkan (Active Gateway Engine)
            </h3>
            <p className="text-xs text-slate-400">
              Pilih salah satu service bot WhatsApp yang ingin Anda pakai untuk pengiriman otomatis oleh sistem:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
              {[
                { id: 'gowa', label: 'GoWA Gateway', desc: 'Go WhatsApp Engine', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/30' },
                { id: 'waha', label: 'WAHA Gateway', desc: 'WhatsApp HTTP API', color: 'border-blue-500 text-blue-400 bg-blue-950/30' },
                { id: 'wuzapi', label: 'WuzAPI', desc: 'Go-Based WA Gateway', color: 'border-amber-500 text-amber-400 bg-amber-950/30' },
                { id: 'fonnte', label: 'Fonnte', desc: 'Cloud WA API Service', color: 'border-purple-500 text-purple-400 bg-purple-950/30' },
                { id: 'disabled', label: 'Nonaktif / Manual', desc: '1-Klik Web WA Only', color: 'border-slate-700 text-slate-400 bg-slate-900/40' },
              ].map(eng => {
                const isSelected = activeEngine === eng.id;
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setActiveEngine(eng.id as WAEngineType)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      isSelected ? `${eng.color} ring-2 ring-emerald-500/50 shadow-lg scale-105` : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{eng.label}</span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-emerald-400 bg-emerald-500 text-slate-950' : 'border-slate-600'}`}>
                        {isSelected && <Check size={10} strokeWidth={4} />}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">{eng.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Configuration Details per Engine */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Server size={18} className="text-blue-400" />
              2. Konfigurasi Endpoint API & Credentials Service ({activeEngine.toUpperCase()})
            </h3>

            {/* GoWA Config */}
            {activeEngine === 'gowa' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>GoWA (Go WhatsApp Gateway) aktif. Pastikan server GoWA Anda aktif dan menerima kiriman JSON `target` & `message`.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">API Endpoint URL GoWA *</label>
                    <input
                      type="text"
                      value={gowaUrl}
                      onChange={(e) => setGowaUrl(e.target.value)}
                      placeholder="http://gowa.domain-isp-anda.com:3000/api/send"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">API Key / Token Auth GoWA</label>
                    <input
                      type="password"
                      value={gowaToken}
                      onChange={(e) => setGowaToken(e.target.value)}
                      placeholder="Contoh: gowa_secret_token_key"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* WAHA Config */}
            {activeEngine === 'waha' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-2xl text-xs text-blue-300 flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>WAHA (WhatsApp HTTP API Docker) aktif. Menggunakan endpoint standard `/api/sendText`.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">API Endpoint URL WAHA *</label>
                    <input
                      type="text"
                      value={wahaUrl}
                      onChange={(e) => setWahaUrl(e.target.value)}
                      placeholder="http://waha.domain-isp.com:3000/api/sendText"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Session Name WAHA</label>
                    <input
                      type="text"
                      value={wahaSession}
                      onChange={(e) => setWahaSession(e.target.value)}
                      placeholder="default"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Secret Key / Token WAHA</label>
                    <input
                      type="password"
                      value={wahaToken}
                      onChange={(e) => setWahaToken(e.target.value)}
                      placeholder="waha_secret_api_key"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* WuzAPI Config */}
            {activeEngine === 'wuzapi' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-xs text-amber-300 flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>WuzAPI (Golang WhatsApp Web REST API) aktif. Menggunakan header `token`.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">API Endpoint URL WuzAPI *</label>
                    <input
                      type="text"
                      value={wuzapiUrl}
                      onChange={(e) => setWuzapiUrl(e.target.value)}
                      placeholder="http://wuzapi.domain-isp.com:8080/chat/send/text"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">User Token WuzAPI</label>
                    <input
                      type="password"
                      value={wuzapiToken}
                      onChange={(e) => setWuzapiToken(e.target.value)}
                      placeholder="wuzapi_user_token"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fonnte Config */}
            {activeEngine === 'fonnte' && (
              <div className="space-y-4 animate-fade-in">
                <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-2xl text-xs text-purple-300 flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>Fonnte Cloud Gateway Service aktif. Menggunakan header `Authorization`.</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Fonnte API Endpoint URL *</label>
                    <input
                      type="text"
                      value={fonnteUrl}
                      onChange={(e) => setFonnteUrl(e.target.value)}
                      placeholder="https://api.fonnte.com/send"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Token Fonnte API *</label>
                    <input
                      type="password"
                      value={fonnteToken}
                      onChange={(e) => setFonnteToken(e.target.value)}
                      placeholder="Masukkan Token Fonnte Anda"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Disabled Mode */}
            {activeEngine === 'disabled' && (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-1">
                <p className="font-bold text-white">🚫 Gateway Otomatis Dinonaktifkan</p>
                <p>Pengiriman pesan WhatsApp akan menggunakan mode manual 1-klik (membuka WhatsApp Web / App dengan draf pesan otomatis).</p>
              </div>
            )}
          </div>

          {/* 3. Automatic Event Triggers */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe size={18} className="text-emerald-400" />
              3. Event Pengiriman Pesan WA Otomatis oleh Sistem
            </h3>

            <div className="space-y-3 text-xs">
              <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={autoSendInvoice}
                  onChange={(e) => setAutoSendInvoice(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <p className="font-bold text-white">📢 Kirim Tagihan Baru Otomatis saat Terbit</p>
                  <p className="text-[11px] text-slate-400">Sistem otomatis mengirim rincian tagihan & link QRIS ArabPay saat invoice dibuat.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={autoSendReceipt}
                  onChange={(e) => setAutoSendReceipt(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <p className="font-bold text-white">💳 Kirim Struk Pembayaran Lunas Otomatis</p>
                  <p className="text-[11px] text-slate-400">Sistem otomatis mengirim konfirmasi pembayaran lunas & bukti transaksi kepada pelanggan.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={autoSendReminder}
                  onChange={(e) => setAutoSendReminder(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <p className="font-bold text-white">🚨 Kirim Pengingat Jatuh Tempo (Auto-Billing Scan H-3 & H-1)</p>
                  <p className="text-[11px] text-slate-400">Sistem otomatis memproses scan harian dan mengirim peringatan sebelum masa aktif paket habis.</p>
                </div>
              </label>
            </div>
          </div>
        </form>

        {/* 4. Test Gateway Connection Tool */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-amber-400" />
            4. Uji Coba Pengiriman WA Instant (Testing Gateway Direct Dispatch)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Nomor WhatsApp Penguji *</label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Contoh: 08123456789"
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-300 mb-1">Pesan Uji Coba</label>
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Pesan Uji Coba..."
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fade-in ${
              testResult.isError ? 'bg-rose-950/80 border border-rose-800 text-rose-300' : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
            }`}>
              {testResult.isError ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
              <span>{testResult.text}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleTestDispatch}
              disabled={testLoading}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              {testLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              <span>{testLoading ? 'Mengirim Uji Coba...' : `Tes Kirim via Engine ${activeEngine.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
