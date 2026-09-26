import React, { useState, useEffect } from 'react';
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Zap,
  ShieldCheck,
  Globe,
  Bot,
  Layers,
  ArrowRight,
  AlertTriangle,
  FileText,
  Server,
  Package,
  Activity,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { BusinessProfile } from '../types';
import HeaderBar from './HeaderBar';
import { getApiUrl } from '../config/api';

interface ApiSecretPageProps {
  profile: BusinessProfile;
  t?: any;
  onLogout?: () => void;
}

export default function ApiSecretPage({
  profile,
  t,
  onLogout
}: ApiSecretPageProps) {
  const [apiSecret, setApiSecret] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>('Arbill');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Modal Confirmation
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: 'generate' | 'delete' }>({
    isOpen: false,
    action: 'generate'
  });

  // Test Ping State
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency: number;
    data?: any;
    error?: string;
  } | null>(null);

  const backendBase = getApiUrl() || window.location.origin;

  // Load current API Secret Status
  const loadSecretStatus = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`${backendBase}/api/setup/api-secret`);
      if (res.ok) {
        const data = await res.json();
        setApiSecret(data.api_secret || null);
        setCreatedAt(data.created_at || null);
        if (data.business_name) setBusinessName(data.business_name);
        setServerUrl(data.server_url || backendBase);
      } else {
        setServerUrl(backendBase);
      }
    } catch (err: any) {
      console.warn('Gagal memuat status API Secret:', err);
      setServerUrl(backendBase);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSecretStatus();
  }, []);

  // Handle Generate / Regenerate
  const handleGenerateSecret = async () => {
    setIsGenerating(true);
    setStatusMsg(null);
    setTestResult(null);
    try {
      const res = await fetch(`${backendBase}/api/setup/api-secret/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApiSecret(data.api_secret);
        setCreatedAt(data.created_at);
        setShowSecret(true);
        setStatusMsg({
          text: '✨ API Secret baru berhasil dibuat dan disimpan dengan aman!',
          isError: false
        });
      } else {
        throw new Error(data.message || 'Gagal membuat API Secret');
      }
    } catch (err: any) {
      setStatusMsg({
        text: `Gagal membuat API Secret: ${err.message}`,
        isError: true
      });
    } finally {
      setIsGenerating(false);
      setConfirmModal({ isOpen: false, action: 'generate' });
    }
  };

  // Handle Delete / Revoke
  const handleDeleteSecret = async () => {
    setIsDeleting(true);
    setStatusMsg(null);
    setTestResult(null);
    try {
      const res = await fetch(`${backendBase}/api/setup/api-secret`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApiSecret(null);
        setCreatedAt(null);
        setStatusMsg({
          text: 'API Secret berhasil dicabut/dihapus.',
          isError: false
        });
      } else {
        throw new Error(data.message || 'Gagal menghapus API Secret');
      }
    } catch (err: any) {
      setStatusMsg({
        text: `Gagal menghapus API Secret: ${err.message}`,
        isError: true
      });
    } finally {
      setIsDeleting(false);
      setConfirmModal({ isOpen: false, action: 'delete' });
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, type: 'secret' | 'url') => {
    navigator.clipboard.writeText(text);
    if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  // Live Test Handshake Ping
  const handleTestPing = async () => {
    if (!apiSecret) return;
    setIsTesting(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const res = await fetch(`${backendBase}/api/integration/ping`, {
        method: 'GET',
        headers: {
          'X-Arbill-Secret': apiSecret
        }
      });
      const end = performance.now();
      const latency = Math.round(end - start);
      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({
          success: true,
          latency,
          data
        });
      } else {
        setTestResult({
          success: false,
          latency,
          error: data.message || `HTTP ${res.status}: Gagal otentikasi`
        });
      }
    } catch (err: any) {
      const end = performance.now();
      setTestResult({
        success: false,
        latency: Math.round(end - start),
        error: `Koneksi gagal: ${err.message}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC] pb-16">
      {/* Header Bar */}
      <HeaderBar
        title="API Secret & Integrasi AI Chat"
        profile={profile}
        t={t || {}}
        onLogout={onLogout}
        subtitle="Kunci otorisasi aman untuk menghubungkan ArbillBaru dengan Arbill-Chat AI"
      />

      <div className="p-4 md:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Toast / Status Alert */}
        {statusMsg && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold transition-all shadow-sm ${
              statusMsg.isError
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMsg.isError ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{statusMsg.text}</span>
            </div>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-slate-400 hover:text-slate-600 font-bold px-2 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Main Secret Card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-100 shrink-0">
                <Key size={24} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <span>API Secret Gateway</span>
                  {apiSecret ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Aktif & Terproteksi
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                      Belum Dibuat
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Digunakan oleh Arbill-Chat untuk mengecek tagihan, status pelanggan, dan paket secara mandiri dan aman.
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {apiSecret ? (
                <>
                  <button
                    onClick={handleTestPing}
                    disabled={isTesting}
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Activity size={14} className={isTesting ? 'animate-spin' : ''} />
                    <span>{isTesting ? 'Menguji...' : 'Tes Koneksi'}</span>
                  </button>
                  <button
                    onClick={() => setConfirmModal({ isOpen: true, action: 'generate' })}
                    disabled={isGenerating}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                    <span>Rotasi Secret</span>
                  </button>
                  <button
                    onClick={() => setConfirmModal({ isOpen: true, action: 'delete' })}
                    disabled={isDeleting}
                    className="p-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
                    title="Hapus API Secret"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGenerateSecret}
                  disabled={isGenerating}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md shadow-blue-100 transition-all cursor-pointer"
                >
                  <Key size={14} />
                  <span>{isGenerating ? 'Membuat...' : 'Buat API Secret Baru'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Credentials Display Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Domain Server Field */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Globe size={13} className="text-blue-500" />
                <span>Domain / URL Server Arbill</span>
              </label>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <input
                  type="text"
                  readOnly
                  value={serverUrl || backendBase}
                  className="bg-transparent font-mono text-xs text-slate-700 flex-1 outline-none font-bold"
                />
                <button
                  onClick={() => copyToClipboard(serverUrl || backendBase, 'url')}
                  className="text-slate-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
                  title="Salin URL Domain"
                >
                  {copiedUrl ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Masukkan URL domain ini ke dalam pengaturan AI Tools di Arbill-Chat.
              </p>
            </div>

            {/* API Secret Field */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Key size={13} className="text-amber-500" />
                  <span>API Secret Kredensial</span>
                </label>
                {createdAt && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    Dibuat: {new Date(createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  readOnly
                  value={apiSecret || ''}
                  placeholder={apiSecret ? '' : 'Belum ada API Secret. Klik tombol "Buat API Secret Baru"'}
                  className="bg-transparent font-mono text-xs text-slate-700 flex-1 outline-none font-bold placeholder:font-sans placeholder:font-normal placeholder:text-slate-300"
                />
                {apiSecret && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
                      title={showSecret ? 'Sembunyikan Secret' : 'Tampilkan Secret'}
                    >
                      {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(apiSecret, 'secret')}
                      className="text-slate-400 hover:text-blue-600 p-1 rounded-lg transition-colors cursor-pointer"
                      title="Salin Secret"
                    >
                      {copiedSecret ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                Rahasiakan kunci ini. Siapa pun yang memiliki secret ini dapat mengakses informasi tagihan via API.
              </p>
            </div>
          </div>

          {/* Test Result Live Banner */}
          {testResult && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 transition-all animate-fade-in ${
                testResult.success
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50/70 border-rose-200 text-rose-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-extrabold">
                  {testResult.success ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      <span>Tes Koneksi Berhasil! (Response: {testResult.latency} ms)</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} className="text-rose-600" />
                      <span>Tes Koneksi Gagal (Response: {testResult.latency} ms)</span>
                    </>
                  )}
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/60 font-bold">
                  GET /api/integration/ping
                </span>
              </div>
              <p className="text-[11px] opacity-90">
                {testResult.success
                  ? testResult.data?.message || 'Server merespon dengan status 200 OK. Handshake sukses!'
                  : testResult.error}
              </p>
              {testResult.success && testResult.data && (
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[10px] overflow-x-auto">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* 2. Step-by-Step Integration Guide */}
        <div className="bg-gradient-to-br from-blue-900 via-slate-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 backdrop-blur-md flex items-center justify-center text-blue-400 font-black text-sm border border-blue-400/20">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Panduan Integrasi ke Arbill-Chat</h3>
              <p className="text-xs text-blue-200/80">Hubungkan bot kecerdasan buatan (AI) agar dapat membalas pertanyaan pelanggan secara mandiri.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Step 1 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center">
                1
              </div>
              <h4 className="font-bold text-xs text-white">Salin Domain & API Secret</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Salin <strong>URL Domain Server</strong> dan <strong>API Secret</strong> dari kartu di atas.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center">
                2
              </div>
              <h4 className="font-bold text-xs text-white">Buka Developer Portal Chat</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Masuk ke <strong>Arbill-Chat</strong> &gt; Menu <strong>Developer Portal</strong> &gt; Pilih Grup &gt; Menu <strong>AI Tools</strong>.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-emerald-500 text-white font-black text-xs flex items-center justify-center">
                3
              </div>
              <h4 className="font-bold text-xs text-white">Simpan & AI Siap Bekerja!</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Tempelkan domain & secret lalu aktifkan tool. AI kini bisa mengecek status tagihan & MikroTik secara real-time.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Endpoint Reference Cards */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-5">
          <div className="flex items-center gap-2.5">
            <Layers size={18} className="text-slate-700" />
            <h3 className="font-extrabold text-sm text-slate-800">Daftar Endpoint Integrasi AI Tools</h3>
          </div>
          <p className="text-xs text-slate-400">
            Berikut endpoint otomatis yang dilindungi API Secret dan dapat dipanggil langsung oleh modul AI:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Card 1: Invoices */}
            <div className="border border-slate-100 rounded-2xl p-4 hover:border-blue-200 transition-all space-y-2 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  GET /api/integration/invoices
                </span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  Tool: Cek Tagihan
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-800">Query Tagihan & Status Bayar</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Mencari data tagihan berdasarkan nomor HP, kode pelanggan, atau username PPPoE. Menghasilkan ringkasan apakah sudah lunas atau belum beserta nominalnya.
              </p>
            </div>

            {/* Card 2: Customer Status */}
            <div className="border border-slate-100 rounded-2xl p-4 hover:border-emerald-200 transition-all space-y-2 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  GET /api/integration/customer
                </span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  Tool: Status Pelanggan
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-800">Cek Masa Aktif & Status Layanan</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Mengecek tanggal jatuh tempo pelanggan, apakah sedang terisolir atau aktif, serta nama paket internet yang sedang digunakan.
              </p>
            </div>

            {/* Card 3: Packages */}
            <div className="border border-slate-100 rounded-2xl p-4 hover:border-indigo-200 transition-all space-y-2 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  GET /api/integration/packages
                </span>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  Tool: Paket Internet
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-800">Katalog Paket & Harga</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Mengambil daftar semua paket internet aktif (kecepatan bandwidth dan tarif harga) agar AI dapat merekomendasikan paket ke pelanggan baru.
              </p>
            </div>

            {/* Card 4: Handshake */}
            <div className="border border-slate-100 rounded-2xl p-4 hover:border-amber-200 transition-all space-y-2 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  GET /api/integration/ping
                </span>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                  Handshake & Auth
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-800">Pemeriksaan Sambungan Aman</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Memastikan bahwa API Secret valid dan server Arbill siap melayani panggilan dari bot chat tanpa mengekspos port MikroTik ke publik.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                confirmModal.action === 'generate' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
              }`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-800">
                  {confirmModal.action === 'generate' ? 'Rotasi / Buat API Secret Baru?' : 'Cabut & Hapus API Secret?'}
                </h4>
                <p className="text-xs text-slate-400">Tindakan ini memerlukan konfirmasi.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmModal.action === 'generate'
                ? 'Jika Anda membuat API Secret baru, secret lama akan langsung hangus dan tidak dapat digunakan lagi. Anda harus memperbarui secret di Arbill-Chat.'
                : 'API Secret akan dihapus. Integrasi Arbill-Chat AI tidak akan dapat mengakses data tagihan hingga Anda membuat secret baru.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: false, action: 'generate' })}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.action === 'generate' ? handleGenerateSecret : handleDeleteSecret}
                disabled={isGenerating || isDeleting}
                className={`px-4 py-2 text-xs font-extrabold text-white rounded-xl shadow-md transition-all cursor-pointer ${
                  confirmModal.action === 'generate'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-100'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-100'
                }`}
              >
                {confirmModal.action === 'generate'
                  ? (isGenerating ? 'Memproses...' : 'Ya, Buat Secret Baru')
                  : (isDeleting ? 'Menghapus...' : 'Ya, Hapus Secret')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
