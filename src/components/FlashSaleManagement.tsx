import React, { useState, useEffect } from 'react';
import {
  Flame, Sparkles, Clock, Calendar, CheckCircle2, AlertCircle,
  Save, RefreshCw, Zap, Shield, ShoppingCart, Tag, ExternalLink,
  ChevronRight, ArrowRight, Eye, Smartphone, Monitor, Info, RotateCcw,
  Database, Users, Search, Copy, Check, Filter, Wifi, Radio, UserCheck
} from 'lucide-react';
import { BusinessProfile, CustomerPortalConfig } from '../types';

interface FlashSaleManagementProps {
  profile: BusinessProfile;
  onNavigateView?: (view: string) => void;
}

const defaultFlashSale = {
  enabled: true,
  badge_label: 'FLASH SALE AKHIR PEKAN',
  discount_text: 'Diskon Terbatas 50%',
  title: '⚡ Promo Hotspot Spesial Akhir Pekan',
  subtitle: 'Dapatkan voucher hotspot dengan harga spesial sebelum kuota atau promo berakhir!',
  target_package_id: '',
  target_package_name: '',
  original_price: 5000,
  promo_price: 2500,
  quota_limit: 50,
  quota_sold: 0,
  max_per_user: 1,
  end_time: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  button_text: 'Beli Promo Flash Sale',
  button_url: ''
};

export default function FlashSaleManagement({ profile, onNavigateView }: FlashSaleManagementProps) {
  const [fullConfig, setFullConfig] = useState<CustomerPortalConfig | null>(null);
  const [flashSale, setFlashSale] = useState(defaultFlashSale);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  // Database Buyers State
  const [buyers, setBuyers] = useState<any[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [buyersStats, setBuyersStats] = useState({
    total_buyers: 0,
    used_count: 0,
    unused_count: 0,
    total_revenue: 0
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unused' | 'expired'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Countdown timer for live preview
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!flashSale.end_time) return;

    const updateTimer = () => {
      const diff = new Date(flashSale.end_time).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown({ days, hours, minutes, seconds, isExpired: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [flashSale.end_time]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Fetch current portal config
      const portalRes = await fetch('/api/portal-config');
      const portalData = await portalRes.json();
      if (portalData.success && portalData.config) {
        setFullConfig(portalData.config);
        if (portalData.config.flash_sale) {
          setFlashSale({
            ...defaultFlashSale,
            ...portalData.config.flash_sale
          });
        }
      }

      // 2. Fetch available voucher packages from Mikrotik / Database
      const pkgRes = await fetch('/api/vouchers/available');
      const pkgData = await pkgRes.json();
      if (pkgData.success && Array.isArray(pkgData.groups)) {
        setAvailablePackages(pkgData.groups);
      }

      // 3. Fetch real database buyers from PostgreSQL
      await fetchBuyers();
    } catch (err) {
      console.warn('Gagal memuat data Flash Sale:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyers = async () => {
    setBuyersLoading(true);
    try {
      const res = await fetch('/api/vouchers/flash-sale/buyers');
      const data = await res.json();
      if (data.success && Array.isArray(data.buyers)) {
        setBuyers(data.buyers);
        const stats = {
          total_buyers: data.total_buyers ?? data.buyers.length,
          used_count: data.used_count ?? 0,
          unused_count: data.unused_count ?? 0,
          total_revenue: data.total_revenue ?? 0
        };
        setBuyersStats(stats);
        // Automatically sync actual database buyers count into quota_sold
        setFlashSale(prev => ({
          ...prev,
          quota_sold: stats.total_buyers
        }));
      }
    } catch (e) {
      console.warn('Gagal memuat pembeli flash sale:', e);
    } finally {
      setBuyersLoading(false);
    }
  };

  const handlePackageSelect = (pkgId: string) => {
    const selected = availablePackages.find(p => (p.profile_id || p.id) === pkgId);
    if (selected) {
      const orig = Number(selected.price) || 5000;
      const promo = Math.round(orig / 2);
      setFlashSale(prev => ({
        ...prev,
        target_package_id: selected.profile_id || selected.id,
        target_package_name: selected.package_name || selected.name || selected.profile_name || 'Voucher Hotspot',
        original_price: orig,
        promo_price: promo
      }));
    } else {
      setFlashSale(prev => ({
        ...prev,
        target_package_id: '',
        target_package_name: ''
      }));
    }
  };

  const applyPresetEndTime = (hoursFromNow: number) => {
    const target = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    setFlashSale(prev => ({ ...prev, end_time: target.toISOString() }));
  };

  const applyWeekendPreset = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59);
    setFlashSale(prev => ({ ...prev, end_time: sunday.toISOString() }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updatedConfig = {
        ...(fullConfig || {}),
        flash_sale: {
          ...flashSale,
          original_price: Number(flashSale.original_price) || 0,
          promo_price: Number(flashSale.promo_price) || 0,
          quota_limit: Number(flashSale.quota_limit) || 50,
          quota_sold: Number(flashSale.quota_sold) || 0,
          max_per_user: Number(flashSale.max_per_user) || 1
        }
      };

      const res = await fetch('/api/portal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: updatedConfig })
      });
      const data = await res.json();
      if (data.success) {
        setFullConfig(data.config || updatedConfig);
        setSaveSuccess(true);
        try {
          localStorage.setItem('arbil_portal_config', JSON.stringify(data.config || updatedConfig));
          localStorage.setItem('arbil_portal_config_time', Date.now().toString());
          window.dispatchEvent(new Event('storage'));
        } catch (_) {}
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(data.message || 'Gagal menyimpan pengaturan Flash Sale.');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetQuotaSold = () => {
    if (!window.confirm('Reset jumlah kuota voucher terjual kembali ke 0 untuk memulai promo baru?')) return;
    setFlashSale(prev => ({ ...prev, quota_sold: 0 }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  const discountPercent = flashSale.original_price > 0 && flashSale.promo_price > 0
    ? Math.max(1, Math.round((1 - (flashSale.promo_price / flashSale.original_price)) * 100))
    : 0;

  const actualSold = buyersStats.total_buyers || flashSale.quota_sold || 0;
  const quotaProgress = Math.min(100, Math.round((actualSold / (flashSale.quota_limit || 50)) * 100));

  // Filtered buyers list
  const filteredBuyers = buyers.filter(b => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
      (b.customer_phone && b.customer_phone.includes(q)) ||
      (b.voucher_code && b.voucher_code.toLowerCase().includes(q)) ||
      (b.invoice_number && b.invoice_number.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ? true : b.usage_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto animate-fade-in text-slate-100">
      {/* Top Header Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-950/70 via-slate-900 to-amber-950/60 border border-rose-500/30 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-60 h-60 bg-rose-500/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-600 text-white flex items-center justify-center shadow-lg shadow-rose-600/30">
                <Flame className="w-5 h-5 animate-pulse" />
              </div>
              <span className="px-3 py-1 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-300 text-xs font-black uppercase tracking-wider">
                Manajemen Promo Khusus
              </span>
              <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full text-emerald-300 text-xs font-bold flex items-center gap-1">
                <Database className="w-3.5 h-3.5" /> Database Synced
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Flash Sale & Promo Hotspot
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium">
              Atur paket voucher promo MikroTik dengan diskon harga coret, kuota kuantitas stok, countdown hitung mundur, serta batasan proteksi 1 voucher per akun user.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/#/portal"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka Portal Pelanggan</span>
            </a>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Menyimpan...' : saveSuccess ? 'Tersimpan!' : 'Simpan Promo'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Strip (Real Database Counters) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status Promo</span>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${flashSale.enabled ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
            <span className={`text-sm sm:text-base font-black ${flashSale.enabled ? 'text-emerald-400' : 'text-slate-400'}`}>
              {flashSale.enabled ? 'AKTIF BERJALAN' : 'NONAKTIF'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block truncate">
            {flashSale.badge_label || 'Flash Sale'}
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kuota Terjual (DB)</span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold">{quotaProgress}%</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm sm:text-base font-black text-rose-400 font-mono">
              {actualSold}
            </p>
            <span className="text-xs text-slate-400 font-mono">/ {flashSale.quota_limit || 50} User</span>
          </div>
          <p className="text-[10px] text-slate-400 block">
            {actualSold >= (flashSale.quota_limit || 50) ? '❌ Kuota Habis' : `Sisa ${Math.max(0, (flashSale.quota_limit || 50) - actualSold)} voucher`}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Penggunaan WiFi</span>
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {buyersStats.used_count} Aktif/Login
            </span>
          </div>
          <span className="text-[10px] text-amber-400 block">
            {buyersStats.unused_count} Belum Dipakai
          </span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Omset Promo</span>
          <p className="text-sm sm:text-base font-black text-amber-300 font-mono">
            {formatRupiah(buyersStats.total_revenue)}
          </p>
          <p className="text-[10px] text-slate-400 block">
            Dari {actualSold} transaksi database
          </p>
        </div>
      </div>

      {/* Main Content: Form Inputs on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Card 1: Saklar & Informasi Waktu Promo */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-white">Status & Waktu Promo</h3>
                  <p className="text-xs text-slate-400">Aktifkan promo dan atur tanggal batas waktu countdown</p>
                </div>
              </div>

              {/* Master Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={flashSale.enabled}
                  onChange={e => setFlashSale({ ...flashSale, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Label Badge Promo</label>
                <input
                  type="text"
                  value={flashSale.badge_label}
                  onChange={e => setFlashSale({ ...flashSale, badge_label: e.target.value })}
                  placeholder="Contoh: FLASH SALE AKHIR PEKAN"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Teks Diskon Promo</label>
                <input
                  type="text"
                  value={flashSale.discount_text}
                  onChange={e => setFlashSale({ ...flashSale, discount_text: e.target.value })}
                  placeholder="Contoh: Diskon Terbatas 50%"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Judul Banner Promo</label>
                <input
                  type="text"
                  value={flashSale.title}
                  onChange={e => setFlashSale({ ...flashSale, title: e.target.value })}
                  placeholder="Contoh: ⚡ Promo Hotspot Spesial Akhir Pekan"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Deskripsi / Subtitle</label>
                <textarea
                  value={flashSale.subtitle}
                  onChange={e => setFlashSale({ ...flashSale, subtitle: e.target.value })}
                  rows={2}
                  placeholder="Penjelasan ringkas promo flash sale..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none resize-none"
                />
              </div>

              <div className="sm:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-rose-400" />
                    <span>Waktu Selesai Promo (Countdown End Time)</span>
                  </label>
                  <span className="text-[11px] font-mono text-amber-400">
                    {new Date(flashSale.end_time).toLocaleString('id-ID')}
                  </span>
                </div>

                <input
                  type="datetime-local"
                  value={flashSale.end_time ? new Date(flashSale.end_time).toISOString().slice(0, 16) : ''}
                  onChange={e => {
                    if (e.target.value) {
                      setFlashSale({ ...flashSale, end_time: new Date(e.target.value).toISOString() });
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none"
                />

                {/* Preset Fast Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-bold text-slate-500 mr-1">Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyPresetEndTime(3)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] text-slate-300 font-bold transition cursor-pointer"
                  >
                    +3 Jam
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetEndTime(12)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] text-slate-300 font-bold transition cursor-pointer"
                  >
                    +12 Jam
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetEndTime(24)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] text-slate-300 font-bold transition cursor-pointer"
                  >
                    +24 Jam (1 Hari)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPresetEndTime(72)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] text-slate-300 font-bold transition cursor-pointer"
                  >
                    +3 Hari
                  </button>
                  <button
                    type="button"
                    onClick={applyWeekendPreset}
                    className="px-2.5 py-1 bg-rose-950/80 border border-rose-800/80 hover:bg-rose-900 rounded-lg text-[11px] text-rose-300 font-bold transition cursor-pointer"
                  >
                    ⚡ Akhir Pekan (Minggu Malam)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Produk Sasaran & Penetapan Harga Promo */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">Produk Sasaran & Harga Promo</h3>
                <p className="text-xs text-slate-400">Pilih paket voucher yang ingin didiskon & tentukan harga flash sale</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Pilih Produk Voucher Sasaran Flash Sale</label>
                <select
                  value={flashSale.target_package_id || ''}
                  onChange={e => handlePackageSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="">-- Pilih Paket Voucher MikroTik --</option>
                  {availablePackages.map(pkg => (
                    <option key={pkg.profile_id || pkg.id} value={pkg.profile_id || pkg.id}>
                      {pkg.package_name || pkg.profile_name || pkg.name} — Normal: {formatRupiah(Number(pkg.price || 0))} ({pkg.rate_limit || pkg.speed_limit || 'Normal'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  Paket ini akan otomatis terhubung ke MikroTik RouterOS saat pelanggan membeli lewat promo flash sale.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Harga Normal (Dicoret)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-slate-500 font-bold">Rp</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={flashSale.original_price}
                      onChange={e => setFlashSale({ ...flashSale, original_price: Number(e.target.value) || 0 })}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
                      placeholder="5000"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-400">Harga Flash Sale (Promo)</label>
                    {discountPercent > 0 && (
                      <span className="px-2 py-0.5 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-300 text-[10px] font-black">
                        HEMAT {discountPercent}%
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-amber-400 font-bold">Rp</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={flashSale.promo_price}
                      onChange={e => setFlashSale({ ...flashSale, promo_price: Number(e.target.value) || 0 })}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-xs sm:text-sm text-amber-300 font-bold font-mono focus:border-amber-400 focus:outline-none"
                      placeholder="2500"
                    />
                  </div>
                </div>
              </div>

              {discountPercent > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-300">
                      Pelanggan menghemat <strong>{formatRupiah(Math.max(0, flashSale.original_price - flashSale.promo_price))}</strong> per voucher!
                    </span>
                  </div>
                  <span className="font-mono font-black text-amber-400">
                    Diskon {discountPercent}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Kuota Promo & Batasan 1 Per User */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white">Stok Kuota & Batasan Akun (Anti-Abuse)</h3>
                <p className="text-xs text-slate-400">Batasi total kuota voucher promo dan batasi 1 akun hanya boleh 1 voucher</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Total Kuota Promo (Qty)</label>
                <input
                  type="number"
                  min={1}
                  value={flashSale.quota_limit}
                  onChange={e => setFlashSale({ ...flashSale, quota_limit: Number(e.target.value) || 1 })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white font-mono focus:border-emerald-500 focus:outline-none"
                  placeholder="50"
                />
                <p className="text-[11px] text-slate-400">Jumlah kuota yang ingin dilepas ke publik (misal: 50 user).</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Kuota Terjual di Database</label>
                  <button
                    type="button"
                    onClick={handleResetQuotaSold}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset ke 0
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={actualSold}
                  readOnly
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-rose-300 font-mono focus:outline-none"
                />
                <p className="text-[11px] text-slate-400">Tersinkron otomatis dengan jumlah transaksi di tabel database.</p>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Maksimal Pembelian Per Akun (User Limit)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={flashSale.max_per_user || 1}
                    onChange={e => setFlashSale({ ...flashSale, max_per_user: Number(e.target.value) || 1 })}
                    className="w-24 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-emerald-400 font-mono font-bold focus:border-emerald-500 focus:outline-none text-center"
                  />
                  <div className="text-xs text-slate-300 space-y-0.5">
                    <p className="font-bold text-emerald-300">Terkunci Rekomendasi: 1 Voucher / Akun</p>
                    <p className="text-slate-400 text-[11px]">
                      Sistem backend memverifikasi histori invoice pengguna berdasarkan no. HP & User ID. Jika akun sudah pernah membeli promo, pembelian berikutnya otomatis diblokir.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Teks Tombol Aksi Pelanggan</label>
                <input
                  type="text"
                  value={flashSale.button_text}
                  onChange={e => setFlashSale({ ...flashSale, button_text: e.target.value })}
                  placeholder="Contoh: Beli Promo Flash Sale"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-extrabold text-white">Live Preview Tampilan Pelanggan</h3>
              </div>

              {/* Device Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${previewDevice === 'mobile' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  title="Tampilan Layar HP"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${previewDevice === 'desktop' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  title="Tampilan Desktop / Laptop"
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Berikut adalah banner Flash Sale persis seperti yang akan dilihat oleh pelanggan di Customer Portal:
            </p>

            {/* Mockup Frame */}
            <div className={`mx-auto transition-all ${previewDevice === 'mobile' ? 'max-w-sm' : 'w-full'}`}>
              <div className="relative overflow-hidden p-5 rounded-3xl bg-gradient-to-br from-rose-950/90 via-slate-900 to-amber-950/80 border border-rose-500/40 shadow-2xl backdrop-blur-xl space-y-4">
                {/* Ambient Glow */}
                <div className="absolute top-0 right-0 -mt-6 -mr-6 w-40 h-40 bg-rose-500/15 rounded-full blur-2xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 -mb-6 -ml-6 w-40 h-40 bg-amber-500/15 rounded-full blur-2xl pointer-events-none"></div>

                {/* Top Badges */}
                <div className="relative flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 bg-gradient-to-r from-rose-600 to-red-600 rounded-full text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md shadow-rose-600/30">
                    <Flame className="w-3 h-3 animate-bounce" />
                    <span>{flashSale.badge_label || 'FLASH SALE'}</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>{flashSale.discount_text || 'Diskon Terbatas'}</span>
                  </span>
                  {discountPercent > 0 && (
                    <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-[10px] font-black uppercase">
                      Hemat {discountPercent}%
                    </span>
                  )}
                </div>

                {/* Title & Subtitle */}
                <div className="relative space-y-1">
                  <h4 className="text-lg sm:text-xl font-black text-white tracking-tight leading-tight">
                    {flashSale.title || '⚡ Promo Hotspot Spesial'}
                  </h4>
                  <p className="text-xs text-slate-300 font-medium">
                    {flashSale.subtitle || 'Dapatkan voucher hotspot dengan harga spesial sebelum promo berakhir!'}
                  </p>
                </div>

                {/* Linked Target Product Card Box */}
                <div className="relative p-3.5 rounded-2xl bg-black/40 border border-rose-500/30 backdrop-blur-md space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Paket Promo</span>
                    <span className="text-[10px] font-semibold text-slate-300 bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700/60">
                      🛡️ Maks. {flashSale.max_per_user || 1} voucher / akun
                    </span>
                  </div>

                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">{flashSale.target_package_name || 'Voucher Hotspot Pilihan'}</span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    {flashSale.original_price > flashSale.promo_price && (
                      <span className="text-xs text-slate-400 line-through font-mono">
                        {formatRupiah(flashSale.original_price)}
                      </span>
                    )}
                    <span className="text-base font-black text-amber-300 font-mono">
                      {formatRupiah(flashSale.promo_price)}
                    </span>
                  </div>

                  {/* Quota Progress */}
                  <div className="space-y-1 pt-1 border-t border-rose-500/20">
                    <div className="flex justify-between text-[10px] font-semibold">
                      <span className="text-slate-400">Kuota Promo</span>
                      <span className="text-rose-300 font-mono">
                        {actualSold} / {flashSale.quota_limit || 50}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all"
                        style={{ width: `${quotaProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Countdown Digit Boxes */}
                <div className="relative flex items-center justify-center gap-1.5 pt-1">
                  {countdown.days > 0 && (
                    <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-2.5 py-1.5 rounded-xl min-w-[42px]">
                      <span className="text-base font-black font-mono text-white leading-none">
                        {String(countdown.days).padStart(2, '0')}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Hari</span>
                    </div>
                  )}
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-2.5 py-1.5 rounded-xl min-w-[42px]">
                    <span className="text-base font-black font-mono text-amber-300 leading-none">
                      {String(countdown.hours).padStart(2, '0')}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Jam</span>
                  </div>
                  <span className="text-sm font-bold text-rose-400 font-mono -mt-2">:</span>
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-2.5 py-1.5 rounded-xl min-w-[42px]">
                    <span className="text-base font-black font-mono text-amber-300 leading-none">
                      {String(countdown.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Menit</span>
                  </div>
                  <span className="text-sm font-bold text-rose-400 font-mono -mt-2">:</span>
                  <div className="flex flex-col items-center bg-black/60 border border-rose-500/30 px-2.5 py-1.5 rounded-xl min-w-[42px]">
                    <span className="text-base font-black font-mono text-rose-400 leading-none animate-pulse">
                      {String(countdown.seconds).padStart(2, '0')}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Detik</span>
                  </div>
                </div>

                {/* Claim CTA Button Preview */}
                <div className="relative pt-1">
                  <div className="w-full py-3 bg-gradient-to-r from-rose-600 to-amber-600 text-white font-extrabold text-xs rounded-2xl shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer">
                    <Flame className="w-4 h-4 fill-white" />
                    <span>{flashSale.button_text || 'Beli Promo Flash Sale'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-slate-300 font-bold">
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Koneksi Otomatis ke Portal Pelanggan</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Setiap kali Anda menekan tombol <strong>Simpan Promo</strong> di atas, banner di Portal Pelanggan langsung terupdate secara real-time. Pelanggan dapat langsung mengklaim voucher dengan harga promo yang ditentukan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FULL-WIDTH SECTION: DAFTAR TRANSAKSI & PEMBELI FLASH SALE (POSTGRESQL DB) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                <span>Daftar Pembeli Flash Sale</span>
                <span className="px-2.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full text-xs font-bold">
                  {actualSold} dari {flashSale.quota_limit || 50} Kuota
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Data transaksi riil tersimpan di database PostgreSQL beserta status pemakaian login di router MikroTik.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchBuyers}
              disabled={buyersLoading}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Perbarui Data dari Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${buyersLoading ? 'animate-spin text-rose-400' : ''}`} />
              <span>{buyersLoading ? 'Memuat...' : 'Segarkan Data'}</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari nama, no HP, kode voucher, atau invoice..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs sm:text-sm text-white focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Status:
            </span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:border-rose-500 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Status ({buyers.length})</option>
              <option value="active">Sedang Digunakan ({buyersStats.used_count})</option>
              <option value="unused">Belum Dipakai ({buyersStats.unused_count})</option>
              <option value="expired">Masa Aktif Habis</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {buyersLoading && buyers.length === 0 ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-rose-500" />
            <span className="text-xs font-bold">Mengambil data pembeli dari database...</span>
          </div>
        ) : filteredBuyers.length === 0 ? (
          <div className="py-16 text-center bg-slate-950/60 border border-slate-800/80 rounded-2xl space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-300">
              {searchTerm ? 'Tidak ada data pembeli yang cocok dengan pencarian' : 'Belum Ada Transaksi Flash Sale'}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchTerm
                ? 'Coba gunakan kata kunci lain (nama pembeli, nomor HP, atau nomor invoice).'
                : 'Saat pelanggan membeli voucher promo lewat Customer Portal, riwayat transaksi otomatis tersimpan di sini secara real-time.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4"># Invoice & Waktu</th>
                  <th className="py-3.5 px-4">Pembeli (User)</th>
                  <th className="py-3.5 px-4">Voucher Hotspot</th>
                  <th className="py-3.5 px-4">Nominal</th>
                  <th className="py-3.5 px-4">Status Pemakaian MikroTik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredBuyers.map((b, idx) => {
                  const isUsed = b.usage_status === 'active' || b.usage_status === 'expired';
                  return (
                    <tr key={b.invoice_id || idx} className="hover:bg-slate-800/40 transition">
                      {/* Invoice & Time */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-200 block">
                          #{b.invoice_number || b.invoice_id}
                        </span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {b.purchased_at}
                        </span>
                      </td>

                      {/* Buyer Name & Phone */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block text-sm">
                            {b.customer_name || 'Pelanggan Hotspot'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono block">
                            {b.customer_phone || 'Tanpa No. HP'}
                          </span>
                          {b.arabpay_user_id && (
                            <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md inline-block font-mono">
                              ArabPay ID: {b.arabpay_user_id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Voucher Credentials */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 text-[10px]">User:</span>
                            <span className="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                              {b.voucher_code || '-'}
                            </span>
                            {b.voucher_code && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(b.voucher_code, `code-${b.invoice_id}`)}
                                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition cursor-pointer"
                                title="Salin Kode Voucher"
                              >
                                {copiedId === `code-${b.invoice_id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>

                          {b.voucher_password && b.voucher_password !== b.voucher_code && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 text-[10px]">Pass:</span>
                              <span className="font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-[11px]">
                                {b.voucher_password}
                              </span>
                            </div>
                          )}

                          <span className="text-[10px] text-slate-500 block truncate">
                            {b.package_name}
                          </span>
                        </div>
                      </td>

                      {/* Nominal & Channel */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-black text-amber-300 block text-sm">
                          {formatRupiah(b.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {b.payment_method || 'ArabPay E-Wallet'}
                        </span>
                      </td>

                      {/* MikroTik Usage Status */}
                      <td className="py-3.5 px-4">
                        {isUsed ? (
                          <div className="space-y-1">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 inline-flex items-center gap-1">
                              <Wifi className="w-3 h-3 text-emerald-400" />
                              {b.usage_label}
                            </span>
                            {b.first_login_at && (
                              <p className="text-[10px] text-slate-400">
                                Login pertama: <strong className="text-slate-200">{b.first_login_at}</strong>
                              </p>
                            )}
                            {b.mac_address && (
                              <p className="text-[10px] text-slate-400 font-mono">
                                MAC HP: <strong className="text-slate-300">{b.mac_address}</strong>
                              </p>
                            )}
                            {b.ip_address && (
                              <p className="text-[10px] text-slate-400 font-mono">
                                IP: {b.ip_address}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              Belum Dipakai (Siap Login)
                            </span>
                            <p className="text-[10px] text-slate-500">
                              Voucher belum pernah diinput login ke hotspot MikroTik
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
