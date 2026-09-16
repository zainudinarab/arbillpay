import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Flame, Sparkles, Clock, Calendar, CheckCircle2, AlertCircle,
  Save, RefreshCw, Zap, Shield, ShoppingCart, Tag, ExternalLink,
  ChevronRight, ArrowRight, Eye, Smartphone, Monitor, Info, RotateCcw,
  Database, Users, Search, Copy, Check, Filter, Wifi, Radio, UserCheck,
  Plus, Edit3, Trash2, Power, ToggleLeft, ToggleRight, X
} from 'lucide-react';
import { BusinessProfile } from '../types';

interface FlashSaleManagementProps {
  profile: BusinessProfile;
  onNavigateView?: (view: string) => void;
}

export interface FlashSaleItem {
  id: string;
  title: string;
  subtitle: string;
  badge_label: string;
  discount_text?: string;
  router_id: string | null;
  router_name?: string | null;
  target_package_id: string | null;
  target_package_name: string | null;
  original_price: number;
  promo_price: number;
  quota_limit: number;
  quota_sold: number;
  max_per_user: number;
  start_time?: string;
  end_time: string;
  is_active: boolean;
  button_text: string;
  created_at?: string;
  remaining_quota?: number;
  is_expired?: boolean;
  is_sold_out?: boolean;
  discount_percent?: number;
}

const defaultNewPromo: Omit<FlashSaleItem, 'id'> = {
  title: '⚡ Promo Hotspot Spesial',
  subtitle: 'Dapatkan voucher hotspot dengan harga spesial sebelum kuota berakhir!',
  badge_label: 'PROMO TERBATAS',
  discount_text: 'Diskon 50%',
  router_id: null,
  target_package_id: '',
  target_package_name: '',
  original_price: 5000,
  promo_price: 2500,
  quota_limit: 50,
  quota_sold: 0,
  max_per_user: 1,
  end_time: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  is_active: true,
  button_text: 'Beli Promo Flash Sale'
};

// Helper: Konversi ISO date ke string lokal yyyy-MM-ddThh:mm untuk input datetime-local
const formatToLocalDateTimeString = (dateInput: string | Date | undefined) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Helper: Tampilkan tanggal lokal bahasa Indonesia yang ramah & mudah dibaca
const formatHumanDatePreview = (dateInput: string | Date | undefined) => {
  if (!dateInput) return 'Belum ditentukan';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Format waktu tidak valid';

  const dateStr = d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) {
    return `${dateStr}, pukul ${timeStr} WIB (⚠️ Promo Sudah Berakhir)`;
  }

  const diffHours = Math.floor(diffMs / (1000 * 3600));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  const timeRemaining = diffDays > 0 ? `${diffDays} hari ${remHours} jam lagi` : `${diffHours} jam lagi`;

  return `${dateStr}, pukul ${timeStr} WIB (Sisa: ${timeRemaining})`;
};

export default function FlashSaleManagement({ profile, onNavigateView }: FlashSaleManagementProps) {
  const [flashSales, setFlashSales] = useState<FlashSaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [routers, setRouters] = useState<any[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<FlashSaleItem, 'id'>>(defaultNewPromo);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Database Buyers State
  const [buyers, setBuyers] = useState<any[]>([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [buyersStats, setBuyersStats] = useState({
    total_buyers: 0,
    used_count: 0,
    unused_count: 0,
    total_revenue: 0
  });
  const [selectedBuyerCampaignId, setSelectedBuyerCampaignId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unused' | 'expired'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchFlashSales();
    fetchInitialAuxData();
    fetchBuyers('all');
  }, []);

  const fetchFlashSales = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/flash-sales');
      const data = await res.json();
      if (data.success && Array.isArray(data.flash_sales)) {
        setFlashSales(data.flash_sales);
      }
    } catch (err) {
      console.warn('Gagal memuat list flash sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInitialAuxData = async () => {
    try {
      // Ambil paket voucher yang memiliki profil MikroTik aktif (/api/vouchers/available) & daftar router
      const [vRes, rRes] = await Promise.all([
        fetch('/api/vouchers/available').catch(() => null),
        fetch('/api/routers').catch(() => null)
      ]);
      const vData = vRes && vRes.ok ? await vRes.json() : null;
      const rData = rRes && rRes.ok ? await rRes.json() : null;

      if (rData && rData.success && Array.isArray(rData.routers)) {
        setRouters(rData.routers);
      }

      if (vData && vData.success && Array.isArray(vData.groups)) {
        // Hanya paket yang terhubung ke profil MikroTik dan siap dibeli (persis seperti di customer portal)
        setAvailablePackages(vData.groups);
      }
    } catch (e) {
      console.warn('Gagal memuat data paket berprofil:', e);
    }
  };

  const fetchBuyers = async (campaignId?: string) => {
    setBuyersLoading(true);
    try {
      const targetId = campaignId !== undefined ? campaignId : selectedBuyerCampaignId;
      const url = targetId && targetId !== 'all'
        ? `/api/flash-sales/buyers?flash_sale_id=${encodeURIComponent(targetId)}`
        : '/api/flash-sales/buyers';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.buyers)) {
        setBuyers(data.buyers);
        setBuyersStats({
          total_buyers: data.total_buyers || data.buyers.length,
          used_count: data.used_count || 0,
          unused_count: data.unused_count || 0,
          total_revenue: data.total_revenue || 0
        });
      }
    } catch (e) {
      console.warn('Gagal memuat pembeli:', e);
    } finally {
      setBuyersLoading(false);
    }
  };

  const handleOpenCreate = () => {
    fetchInitialAuxData();
    setEditingId(null);
    setFormData({
      ...defaultNewPromo,
      end_time: new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: FlashSaleItem) => {
    fetchInitialAuxData();
    setEditingId(item.id);
    setFormData({
      title: item.title,
      subtitle: item.subtitle,
      badge_label: item.badge_label || 'FLASH SALE',
      discount_text: item.discount_text || '',
      router_id: item.router_id || null,
      target_package_id: item.target_package_id || '',
      target_package_name: item.target_package_name || '',
      original_price: Number(item.original_price) || 0,
      promo_price: Number(item.promo_price) || 0,
      quota_limit: Number(item.quota_limit) || 50,
      quota_sold: Number(item.quota_sold) || 0,
      max_per_user: Number(item.max_per_user) || 1,
      end_time: item.end_time || new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      is_active: Boolean(item.is_active),
      button_text: item.button_text || 'Beli Promo Flash Sale'
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handlePackageSelect = (profileId: string) => {
    const selected = availablePackages.find(p => p.profile_id === profileId || p.id === profileId);
    if (selected) {
      const orig = Number(selected.price || selected.nominal || 0);
      const halfPromo = Math.round(orig * 0.5);
      setFormData(prev => ({
        ...prev,
        target_package_id: profileId,
        target_package_name: selected.package_name || selected.name || selected.profile_name || 'Voucher Hotspot',
        original_price: orig,
        promo_price: halfPromo,
        router_id: selected.router_id || prev.router_id || null,
        discount_text: `Hemat 50% (Rp ${formatRupiah(orig - halfPromo)})`
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        target_package_id: profileId,
        target_package_name: ''
      }));
    }
  };

  const applyPresetEndTime = (hoursFromNow: number) => {
    const target = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    setFormData(prev => ({ ...prev, end_time: target.toISOString() }));
  };

  const applyWeekendPreset = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59);
    setFormData(prev => ({ ...prev, end_time: sunday.toISOString() }));
  };

  const openDatePicker = () => {
    if (dateInputRef.current) {
      try {
        dateInputRef.current.showPicker?.();
      } catch (_) {
        dateInputRef.current.focus();
      }
    }
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setModalError('Judul promo Flash Sale wajib diisi.');
      return;
    }

    setSaving(true);
    setModalError('');

    try {
      const payload = {
        ...formData,
        original_price: Number(formData.original_price) || 0,
        promo_price: Number(formData.promo_price) || 0,
        quota_limit: Number(formData.quota_limit) || 50,
        max_per_user: Number(formData.max_per_user) || 1
      };

      const url = editingId ? `/api/flash-sales/${editingId}` : '/api/flash-sales';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setIsModalOpen(false);
        await fetchFlashSales();
      } else {
        setModalError(data.message || 'Gagal menyimpan paket promo.');
      }
    } catch (err: any) {
      setModalError('Terjadi kesalahan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePromo = async (id: string, title: string) => {
    if (!window.confirm(`Hapus paket promo Flash Sale "${title}"?`)) return;

    try {
      const res = await fetch(`/api/flash-sales/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchFlashSales();
      } else {
        alert(data.message || 'Gagal menghapus.');
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/flash-sales/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchFlashSales();
      }
    } catch (e) {
      console.warn('Gagal toggle status:', e);
    }
  };

  const handleResetQuota = async (id: string, title: string) => {
    if (!window.confirm(`Reset kuota terjual promo "${title}" kembali ke 0?`)) return;

    try {
      const res = await fetch(`/api/flash-sales/${id}/reset-quota`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchFlashSales();
      } else {
        alert(data.message || 'Error reset kuota: ' + data.message);
      }
    } catch (e: any) {
      alert('Error reset kuota: ' + e.message);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  const activeCount = flashSales.filter(fs => fs.is_active && !fs.is_expired).length;
  const totalSoldAll = flashSales.reduce((sum, fs) => sum + (Number(fs.quota_sold) || 0), 0);
  const totalQuotaAll = flashSales.reduce((sum, fs) => sum + (Number(fs.quota_limit) || 0), 0);

  const filteredBuyers = useMemo(() => {
    return buyers.filter(b => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
        (b.customer_phone && b.customer_phone.includes(q)) ||
        (b.voucher_code && b.voucher_code.toLowerCase().includes(q)) ||
        (b.invoice_number && b.invoice_number.toLowerCase().includes(q)) ||
        (b.package_name && b.package_name.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ||
        b.usage_status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [buyers, searchTerm, statusFilter]);

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-3.5 sm:space-y-4">
      {/* Top Header - Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-4 rounded-xl border border-rose-900/30 shadow-md text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-2 bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/30 shrink-0">
            <Flame size={20} className="animate-pulse text-rose-400" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2 truncate">
              <span>Manajemen Flash Sale</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold tracking-wider uppercase shrink-0">
                PostgreSQL
              </span>
            </h1>
            <p className="text-xs text-rose-200/70 truncate">
              Kelola promo, waktu countdown, batas kuota, dan pantau pembeli riil.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            onClick={() => { fetchFlashSales(); fetchBuyers(); }}
            disabled={loading}
            className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            title="Muat Ulang"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-rose-400' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-3 py-1.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 active:scale-95 text-white font-bold rounded-lg shadow-md shadow-rose-500/20 transition flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <Plus size={15} />
            <span>Buat Promo Baru</span>
          </button>
        </div>
      </div>

      {/* Metric Cards - Compact Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Promo Aktif</span>
            <span className="p-1 rounded bg-emerald-500/10 text-emerald-400"><Zap size={13} /></span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-white">{activeCount}</span>
            <span className="text-[11px] text-slate-500">/ {flashSales.length} total</span>
          </div>
          <div className="text-[10px] text-emerald-400 font-medium truncate mt-0.5">Tampil di Portal Mandiri</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Kuota Terjual</span>
            <span className="p-1 rounded bg-rose-500/10 text-rose-400"><ShoppingCart size={13} /></span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-rose-400">{totalSoldAll}</span>
            <span className="text-[11px] text-slate-500">/ {totalQuotaAll} kuota</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all"
              style={{ width: `${totalQuotaAll > 0 ? Math.min(100, Math.round((totalSoldAll / totalQuotaAll) * 100)) : 0}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Total Pembeli</span>
            <span className="p-1 rounded bg-amber-500/10 text-amber-400"><Users size={13} /></span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-400">{buyersStats.total_buyers}</span>
            <span className="text-[11px] text-slate-500">voucher</span>
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-0.5">
            {buyersStats.used_count} login • {buyersStats.unused_count} standby
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Omzet Flash Sale</span>
            <span className="p-1 rounded bg-indigo-500/10 text-indigo-400"><Tag size={13} /></span>
          </div>
          <div className="mt-1">
            <span className="text-base sm:text-lg font-black text-indigo-400 font-mono truncate block">
              {formatRupiah(buyersStats.total_revenue)}
            </span>
          </div>
          <div className="text-[10px] text-emerald-400 font-medium truncate mt-0.5">Via ArabPay E-Wallet</div>
        </div>
      </div>

      {/* Flash Sale Cards Grid - Compact */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Flame size={16} className="text-rose-500" />
            <h2 className="text-sm font-bold text-white">Daftar Paket Promo Flash Sale</h2>
            <span className="text-[11px] px-2 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
              {flashSales.length}
            </span>
          </div>
        </div>

        {loading && flashSales.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
            <RefreshCw size={22} className="animate-spin text-rose-500 mx-auto mb-1.5" />
            <p className="text-xs">Memuat daftar paket promo Flash Sale...</p>
          </div>
        ) : flashSales.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
            <Flame size={36} className="text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-white">Belum Ada Paket Flash Sale</h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-sm mx-auto">
              Klik tombol Buat Promo Baru untuk menambahkan promo diskon voucher hotspot.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-3 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Buat Promo Pertama</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {flashSales.map((item) => {
              const isExpired = item.is_expired;
              const isSoldOut = item.is_sold_out;
              const quotaPercent = Math.min(100, Math.round(((item.quota_sold || 0) / (item.quota_limit || 1)) * 100));

              return (
                <div
                  key={item.id}
                  className={`bg-slate-900/90 border rounded-xl p-3.5 relative overflow-hidden transition-all shadow-sm flex flex-col justify-between ${
                    !item.is_active
                      ? 'border-slate-800 opacity-60'
                      : isExpired
                      ? 'border-amber-900/40 bg-gradient-to-b from-slate-900 to-amber-950/15'
                      : 'border-rose-900/40 hover:border-rose-500/50 bg-gradient-to-b from-slate-900 to-rose-950/15'
                  }`}
                >
                  {/* Status Banner */}
                  <div className="flex items-center justify-between gap-1.5 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-xs">
                        {item.badge_label || 'FLASH SALE'}
                      </span>
                      {item.discount_percent && item.discount_percent > 0 ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Hemat {item.discount_percent}%
                        </span>
                      ) : null}
                    </div>

                    {/* Toggle Active Button */}
                    <button
                      onClick={() => handleToggleStatus(item.id, item.is_active)}
                      className={`p-0.5 rounded transition text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                        item.is_active
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-slate-500 hover:text-slate-400'
                      }`}
                      title={item.is_active ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                    >
                      {item.is_active ? <ToggleRight size={18} className="text-emerald-400" /> : <ToggleLeft size={18} />}
                      <span className="text-[10px]">{item.is_active ? 'Aktif' : 'Nonaktif'}</span>
                    </button>
                  </div>

                  {/* Title & Subtitle */}
                  <div className="space-y-0.5 mb-2.5">
                    <h3 className="text-sm font-bold text-white line-clamp-1">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {item.subtitle || 'Promo diskon voucher hotspot'}
                    </p>
                    <div className="text-[11px] text-slate-300 font-medium flex items-center gap-1 pt-0.5 truncate">
                      <Wifi size={11} className="text-rose-400 shrink-0" />
                      <span className="truncate">Paket: <strong className="text-white">{item.target_package_name || 'Voucher Hotspot'}</strong></span>
                      {item.router_name && <span className="text-slate-500 font-mono text-[10px]">({item.router_name})</span>}
                    </div>
                  </div>

                  {/* Pricing Box - Compact */}
                  <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 mb-2.5">
                    <div className="flex items-baseline justify-between">
                      <div>
                        {item.original_price > item.promo_price && (
                          <div className="text-[10px] text-slate-500 line-through font-mono">
                            {formatRupiah(item.original_price)}
                          </div>
                        )}
                        <div className="text-base font-black text-rose-400 tracking-tight font-mono">
                          {formatRupiah(item.promo_price)}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-300 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded">
                          Maks. {item.max_per_user}x/akun
                        </span>
                      </div>
                    </div>

                    {/* Quota Progress */}
                    <div className="mt-2 pt-2 border-t border-slate-800/60 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Kuota Terjual:</span>
                        <span className="font-mono text-white font-bold">
                          {item.quota_sold} / {item.quota_limit}
                          {isSoldOut && <span className="text-rose-400 ml-1">(Habis)</span>}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isSoldOut ? 'bg-rose-500' : 'bg-gradient-to-r from-rose-500 to-amber-400'
                          }`}
                          style={{ width: `${quotaPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* End Time Info */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2.5 pb-1.5 border-b border-slate-800/60">
                    <span className="flex items-center gap-1">
                      <Clock size={11} className={isExpired ? 'text-amber-500' : 'text-rose-400'} />
                      <span>Berakhir:</span>
                    </span>
                    <span className={`font-mono text-[11px] ${isExpired ? 'text-amber-400 font-bold' : 'text-slate-300'}`}>
                      {isExpired ? 'Promo Berakhir' : new Date(item.end_time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* Action Buttons - Compact */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      onClick={() => {
                        setSelectedBuyerCampaignId(item.id);
                        fetchBuyers(item.id);
                        const buyersSection = document.getElementById('buyers-section');
                        if (buyersSection) buyersSection.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Lihat Pembeli Paket Ini"
                    >
                      <Users size={12} className="text-amber-400" />
                      <span>Pembeli ({item.quota_sold})</span>
                    </button>

                    <button
                      onClick={() => handleResetQuota(item.id, item.title)}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                      title="Reset Kuota Terjual ke 0"
                    >
                      <RotateCcw size={13} />
                    </button>

                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                      title="Edit Promo"
                    >
                      <Edit3 size={13} />
                    </button>

                    <button
                      onClick={() => handleDeletePromo(item.id, item.title)}
                      className="p-1 bg-slate-800 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 rounded-lg transition cursor-pointer"
                      title="Hapus Promo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Database Buyers Section - Compact */}
      <div id="buyers-section" className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Database size={16} className="text-rose-500" />
              Database Pembeli Voucher Flash Sale
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Riwayat riil voucher promo yang dibeli pelanggan melalui portal mandiri (PostgreSQL & MikroTik).
            </p>
          </div>

          {/* Campaign Selector Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium shrink-0">Filter:</span>
            <select
              value={selectedBuyerCampaignId}
              onChange={(e) => {
                setSelectedBuyerCampaignId(e.target.value);
                fetchBuyers(e.target.value);
              }}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="all">Semua Paket Flash Sale</option>
              {flashSales.map(fs => (
                <option key={fs.id} value={fs.id}>
                  {fs.title} ({fs.target_package_name || 'Voucher'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari pelanggan, no HP, kode voucher, invoice..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0">
            {(['all', 'unused', 'active', 'expired'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition shrink-0 cursor-pointer ${
                  statusFilter === st
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {st === 'all' && 'Semua'}
                {st === 'unused' && 'Belum Login'}
                {st === 'active' && 'Aktif di WiFi'}
                {st === 'expired' && 'Expired'}
              </button>
            ))}
          </div>
        </div>

        {/* Table of Buyers - Compact Rows */}
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Invoice & Waktu</th>
                <th className="py-2 px-3">Pelanggan</th>
                <th className="py-2 px-3">Paket / Kampanye</th>
                <th className="py-2 px-3">Kode Voucher</th>
                <th className="py-2 px-3">Nominal</th>
                <th className="py-2 px-3">Status Pemakaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-xs">
              {buyersLoading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    <RefreshCw size={18} className="animate-spin text-rose-500 mx-auto mb-1" />
                    Memuat data pembeli...
                  </td>
                </tr>
              ) : filteredBuyers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                    Tidak ada transaksi pembeli yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredBuyers.map((b) => (
                  <tr key={b.invoice_id || b.voucher_id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2 px-3">
                      <div className="font-mono text-white text-xs">{b.invoice_number}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(b.purchased_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </td>

                    <td className="py-2 px-3">
                      <div className="text-white font-semibold text-xs">{b.customer_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{b.customer_phone || '-'}</div>
                    </td>

                    <td className="py-2 px-3">
                      <div className="text-slate-200 text-xs">{b.package_name}</div>
                      {b.flash_sale_title && (
                        <div className="text-[10px] text-rose-400 flex items-center gap-1 truncate max-w-[200px]">
                          <Flame size={10} className="shrink-0" />
                          <span className="truncate">{b.flash_sale_title}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-bold text-amber-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-xs">
                          {b.voucher_code}
                        </span>
                        <button
                          onClick={() => copyToClipboard(b.voucher_code, b.invoice_id)}
                          className="text-slate-500 hover:text-white transition p-0.5 cursor-pointer"
                          title="Salin Kode Voucher"
                        >
                          {copiedId === b.invoice_id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                      {b.voucher_password && b.voucher_password !== b.voucher_code && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Pass: {b.voucher_password}
                        </div>
                      )}
                    </td>

                    <td className="py-2 px-3 font-bold text-white text-xs">
                      {formatRupiah(b.amount)}
                      <div className="text-[10px] text-emerald-400 font-normal">{b.payment_method}</div>
                    </td>

                    <td className="py-2 px-3">
                      {b.usage_status === 'active' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktif di WiFi
                        </span>
                      )}
                      {b.usage_status === 'unused' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          Belum Dipakai
                        </span>
                      )}
                      {b.usage_status === 'expired' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                          Expired
                        </span>
                      )}
                      {b.first_login_at && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                          <Clock size={10} />
                          Login: {new Date(b.first_login_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Flash Sale - Compact & Desktop Friendly */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-rose-950/70 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Flame size={17} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingId ? 'Edit Paket Flash Sale' : 'Buat Paket Promo Flash Sale Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Konfigurasi diskon, target paket, dan timer countdown
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePromo} className="p-4 space-y-3">
              {modalError && (
                <div className="p-2.5 bg-rose-950/50 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-400" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-12 gap-2.5">
                {/* Judul Promo */}
                <div className="col-span-12 sm:col-span-8 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Judul Promo *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                    placeholder="Contoh: ⚡ Promo Hotspot Spesial"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>

                {/* Badge Label */}
                <div className="col-span-12 sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Label Badge</label>
                  <input
                    type="text"
                    value={formData.badge_label}
                    onChange={(e) => setFormData(p => ({ ...p, badge_label: e.target.value }))}
                    placeholder="FLASH SALE"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Subtitle */}
                <div className="col-span-12 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Deskripsi / Subtitle</label>
                  <input
                    type="text"
                    value={formData.subtitle}
                    onChange={(e) => setFormData(p => ({ ...p, subtitle: e.target.value }))}
                    placeholder="Contoh: Dapatkan voucher hotspot dengan harga spesial sebelum kuota berakhir!"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Target Paket Voucher */}
                <div className="col-span-12 sm:col-span-7 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300">Pilih Paket Hotspot Target *</label>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {availablePackages.length > 0 ? `${availablePackages.length} paket siap jual` : 'Memuat...'}
                    </span>
                  </div>
                  <select
                    value={formData.target_package_id || ''}
                    onChange={(e) => handlePackageSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="">
                      {availablePackages.length === 0 ? '-- Memuat paket yang memiliki profil... --' : '-- Pilih Paket Hotspot (Sesuai Profil MikroTik) --'}
                    </option>
                    {availablePackages.map(pkg => (
                      <option key={pkg.profile_id || pkg.id} value={pkg.profile_id || pkg.id}>
                        {pkg.package_name || pkg.profile_name} — Rp {Number(pkg.price || 0).toLocaleString('id-ID')}{pkg.profile_name ? ` (Profile: ${pkg.profile_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Router */}
                <div className="col-span-12 sm:col-span-5 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Router MikroTik (Opsional)</label>
                  <select
                    value={formData.router_id || ''}
                    onChange={(e) => setFormData(p => ({ ...p, router_id: e.target.value || null }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="">Semua Router / Otomatis</option>
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                    ))}
                  </select>
                </div>

                {/* 4 Quick Metric Inputs in a neat horizontal row */}
                {/* Harga Normal */}
                <div className="col-span-6 sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Harga Normal (Rp)</label>
                  <input
                    type="number"
                    value={formData.original_price}
                    onChange={(e) => setFormData(p => ({ ...p, original_price: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                {/* Harga Promo */}
                <div className="col-span-6 sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-rose-400">Harga Promo (Rp) *</label>
                  <input
                    type="number"
                    value={formData.promo_price}
                    onChange={(e) => setFormData(p => ({ ...p, promo_price: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-rose-800/80 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 focus:outline-none focus:border-rose-500 font-mono font-bold"
                    required
                  />
                </div>

                {/* Kuota Limit */}
                <div className="col-span-6 sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Batas Kuota Total</label>
                  <input
                    type="number"
                    value={formData.quota_limit}
                    onChange={(e) => setFormData(p => ({ ...p, quota_limit: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                {/* Maks per Akun */}
                <div className="col-span-6 sm:col-span-3 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Batas/Akun</label>
                  <input
                    type="number"
                    value={formData.max_per_user}
                    onChange={(e) => setFormData(p => ({ ...p, max_per_user: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                {/* Waktu Berakhir Promo (Countdown Picker with Native Trigger & Live Indonesian Preview) */}
                <div className="col-span-12 space-y-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-[11px] font-bold text-rose-300 flex items-center gap-1">
                      <Calendar size={13} className="text-rose-400" />
                      <span>Waktu Berakhir Promo (Countdown)</span>
                    </label>
                    {/* Preset Buttons */}
                    <div className="flex items-center gap-1 text-[10px] flex-wrap">
                      <span className="text-slate-500 text-[10px] mr-0.5">Preset:</span>
                      <button type="button" onClick={() => applyPresetEndTime(6)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">+6 Jam</button>
                      <button type="button" onClick={() => applyPresetEndTime(12)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">+12 Jam</button>
                      <button type="button" onClick={() => applyPresetEndTime(24)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">+24 Jam</button>
                      <button type="button" onClick={() => applyPresetEndTime(48)} className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">+48 Jam</button>
                      <button type="button" onClick={applyWeekendPreset} className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800/60 hover:bg-rose-900 text-rose-300 cursor-pointer">Weekend</button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      ref={dateInputRef}
                      type="datetime-local"
                      value={formatToLocalDateTimeString(formData.end_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          const localD = new Date(e.target.value);
                          setFormData(p => ({ ...p, end_time: localD.toISOString() }));
                        }
                      }}
                      onClick={openDatePicker}
                      onFocus={openDatePicker}
                      className="w-full bg-slate-900 border border-slate-700 hover:border-rose-500 focus:border-rose-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono cursor-pointer transition pr-9"
                    />
                    <button
                      type="button"
                      onClick={openDatePicker}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-rose-400 hover:text-rose-300 p-1 rounded transition cursor-pointer"
                      title="Buka Kalender & Waktu"
                    >
                      <Calendar size={14} />
                    </button>
                  </div>

                  {/* Live Human-Readable Date Display to avoid any mistakes */}
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-black/40 border border-amber-500/20 px-2 py-1 rounded-md font-medium">
                    <Clock size={12} className="text-amber-400 shrink-0" />
                    <span className="truncate">
                      <strong>Jadwal:</strong> {formatHumanDatePreview(formData.end_time)}
                    </span>
                  </div>
                </div>

                {/* Teks Tombol */}
                <div className="col-span-12 sm:col-span-7 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">Teks Tombol Beli</label>
                  <input
                    type="text"
                    value={formData.button_text}
                    onChange={(e) => setFormData(p => ({ ...p, button_text: e.target.value }))}
                    placeholder="Beli Promo Flash Sale"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Status Aktif */}
                <div className="col-span-12 sm:col-span-5 flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg w-full">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-rose-500 focus:ring-rose-500 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs font-bold text-white">Status Promo Aktif</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer - Compact */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-xs transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-bold rounded-lg text-xs shadow-md shadow-rose-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Buat Promo Sekarang')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
