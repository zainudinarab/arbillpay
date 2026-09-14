import React, { useState, useEffect } from 'react';
import {
  Palette,
  Layout,
  Type,
  Smartphone,
  Monitor,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  RotateCcw,
  ExternalLink,
  Sparkles,
  Wifi,
  Wallet,
  FileText,
  Package,
  MessageCircle,
  Megaphone,
  Check,
  Grid,
  List,
  AlertCircle
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile, CustomerPortalConfig, CustomerPortalSection } from '../types';

const defaultEditorConfig: CustomerPortalConfig = {
  template_theme: 'dark_glass',
  primary_color: 'emerald',
  branding: {
    hotspot_name: 'ARBILL Hotspot & Internet',
    tagline: 'Internet Cepat, Beli Voucher Instan & Bayar Tagihan Mudah',
    contact_phone: '081234567890',
    logo_url: '',
    banner_url: ''
  },
  announcement: {
    enabled: true,
    text: 'Beli voucher WiFi sekarang lebih mudah via QRIS & Saldo ArabPay! Aktif otomatis 24 Jam.',
    type: 'info'
  },
  sections: [
    { id: 'announcement', label: 'Teks Berjalan / Pengumuman', enabled: true, order: 1 },
    { id: 'hero', label: 'Banner Sambutan & Info Hotspot', enabled: true, order: 2 },
    { id: 'wallet_widget', label: 'Widget Saldo & Akun ArabPay', enabled: true, order: 3 },
    { id: 'quick_billing', label: 'Form Cek & Bayar Tagihan Cepat', enabled: true, order: 4 },
    { id: 'vouchers', label: 'Katalog Voucher Hotspot', enabled: true, order: 5, variant: 'grid' },
    { id: 'monthly_packages', label: 'Paket Internet Bulanan / Pendaftaran Baru', enabled: true, order: 6 },
    { id: 'contact_footer', label: 'Tombol Bantuan WhatsApp CS', enabled: true, order: 7 }
  ]
};

const THEMES = [
  {
    id: 'dark_glass',
    name: 'Dark Glassmorphism',
    tag: 'Populer & Modern',
    desc: 'Latar gelap elegan dengan kartu efek kaca transparan dan aksen neon bercahaya.',
    previewBg: 'bg-slate-950 border-slate-800 text-white',
    accentColor: 'from-emerald-500 to-teal-400'
  },
  {
    id: 'clean_light',
    name: 'Clean Light Minimalist',
    tag: 'Cerah & Ramah Pengguna',
    desc: 'Latar putih bersih modern dengan kartu shadow lembut, sangat nyaman dibaca.',
    previewBg: 'bg-slate-50 border-slate-200 text-slate-900',
    accentColor: 'from-emerald-600 to-emerald-500'
  },
  {
    id: 'mikhmon_compact',
    name: 'Mikhmon Hotspot Style',
    tag: 'Ultra Cepat & Ringkas',
    desc: 'Gaya portal hotspot klasik yang sangat hemat kuota dan cepat dimuat di segala HP.',
    previewBg: 'bg-slate-100 border-slate-300 text-slate-800',
    accentColor: 'from-blue-600 to-indigo-600'
  },
  {
    id: 'voucher_store',
    name: 'E-Commerce Voucher Store',
    tag: 'Fokus Katalog Jualan',
    desc: 'Model toko digital dengan etalase paket voucher besar dan banner promosi mencolok.',
    previewBg: 'bg-indigo-950/90 border-indigo-800 text-white',
    accentColor: 'from-amber-500 to-rose-500'
  }
];

const ACCENT_COLORS = [
  { id: 'emerald', label: 'Emerald Green', bgClass: 'bg-emerald-500', ringClass: 'ring-emerald-400' },
  { id: 'indigo', label: 'Indigo Purple', bgClass: 'bg-indigo-500', ringClass: 'ring-indigo-400' },
  { id: 'rose', label: 'Rose Pink', bgClass: 'bg-rose-500', ringClass: 'ring-rose-400' },
  { id: 'sky', label: 'Sky Blue', bgClass: 'bg-sky-500', ringClass: 'ring-sky-400' },
  { id: 'amber', label: 'Amber Gold', bgClass: 'bg-amber-500', ringClass: 'ring-amber-400' }
];

interface PortalTemplateEditorProps {
  profile: BusinessProfile;
}

export default function PortalTemplateEditor({ profile }: PortalTemplateEditorProps) {
  const [config, setConfig] = useState<CustomerPortalConfig>(defaultEditorConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [activeTab, setActiveTab] = useState<'themes' | 'layout' | 'branding'>('themes');

  useEffect(() => {
    fetchCurrentConfig();
  }, []);

  const fetchCurrentConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal-config');
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (e) {
      console.warn('Gagal memuat konfigurasi portal:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/portal-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(data.message || 'Gagal menyimpan konfigurasi.');
      }
    } catch (err: any) {
      alert('Error menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    if (!window.confirm('Kembalikan susunan template dan tata letak ke standar awal?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/portal-config/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config || defaultEditorConfig);
        alert('Konfigurasi berhasil dikembalikan ke standar.');
      }
    } catch (err: any) {
      alert('Gagal reset: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Section Re-order Helpers
  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newSections = [...config.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;

    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    // Update order numbers
    newSections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    setConfig(prev => ({ ...prev, sections: newSections }));
  };

  const toggleSection = (index: number) => {
    const newSections = [...config.sections];
    newSections[index].enabled = !newSections[index].enabled;
    setConfig(prev => ({ ...prev, sections: newSections }));
  };

  const toggleVoucherVariant = (variant: 'grid' | 'list') => {
    const newSections = config.sections.map(s => {
      if (s.id === 'vouchers') {
        return { ...s, variant };
      }
      return s;
    });
    setConfig(prev => ({ ...prev, sections: newSections }));
  };

  const sortedSections = [...config.sections].sort((a, b) => (a.order || 0) - (b.order || 0));

  const getSectionIcon = (id: string) => {
    switch (id) {
      case 'announcement': return <Megaphone size={16} className="text-amber-500" />;
      case 'hero': return <Wifi size={16} className="text-emerald-500" />;
      case 'wallet_widget': return <Wallet size={16} className="text-indigo-500" />;
      case 'quick_billing': return <FileText size={16} className="text-blue-500" />;
      case 'vouchers': return <Package size={16} className="text-purple-500" />;
      case 'monthly_packages': return <Sparkles size={16} className="text-teal-500" />;
      case 'contact_footer': return <MessageCircle size={16} className="text-emerald-400" />;
      default: return <Layout size={16} className="text-slate-400" />;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <HeaderBar
        title="Editor Tampilan Pelanggan (Template & Layout Builder)"
        subtitle="Atur tema visual, susun model tata letak komponen portal publik, dan lihat pratinjau live secara real-time."
        profile={profile}
      />

      {/* Action Header Bar */}
      <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Palette size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">
                Tema Aktif: <span className="text-indigo-600 capitalize">{config.template_theme.replace('_', ' ')}</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                {config.sections.filter(s => s.enabled).length} Modul Aktif
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Perubahan yang Anda simpan akan langsung diterapkan pada semua pengunjung portal pelanggan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleResetDefault}
            disabled={saving}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Kembalikan ke susunan standar"
          >
            <RotateCcw size={14} />
            Reset Standar
          </button>

          <a
            href="/#/customer"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Buka halaman pelanggan di tab baru"
          >
            <ExternalLink size={14} />
            Buka Portal
          </a>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            className={`px-5 py-2 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer ${
              saveSuccess
                ? 'bg-emerald-600 shadow-emerald-600/25'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/25'
            }`}
          >
            {saving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Menyimpan...
              </>
            ) : saveSuccess ? (
              <>
                <Check size={15} />
                Tersimpan & Aktif!
              </>
            ) : (
              <>
                <Save size={15} />
                Simpan & Terapkan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: Left Editor (55%) & Right Live Preview (45%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= LEFT COLUMN: EDITOR CONTROLS ================= */}
        <div className="lg:col-span-7 space-y-4">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 bg-white/60 p-2 rounded-2xl border">
            <button
              type="button"
              onClick={() => setActiveTab('themes')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'themes'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Palette size={15} />
              1. Pilihan Tema
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('layout')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'layout'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layout size={15} />
              2. Susun Model Tata Letak
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('branding')}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'branding'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Type size={15} />
              3. Teks & Branding
            </button>
          </div>

          {/* TAB 1: THEMES PRESET SELECTION */}
          {activeTab === 'themes' && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Pilih Preset Tema Desain</h3>
                  <p className="text-xs text-slate-500">Tentukan nuansa tampilan visual yang sesuai dengan citra usaha WiFi Anda.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {THEMES.map(t => {
                  const isSelected = config.template_theme === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setConfig(prev => ({ ...prev, template_theme: t.id as any }))}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 shadow-md shadow-indigo-600/10'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                            {t.tag}
                          </span>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                          }`}>
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>

                        <h4 className="font-bold text-sm text-slate-900">{t.name}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">{t.desc}</p>
                      </div>

                      {/* Mini Preview Bar */}
                      <div className={`mt-3 p-2.5 rounded-xl border ${t.previewBg} flex items-center justify-between text-[11px]`}>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${t.accentColor}`}></span>
                          <span>Preview Kartu</span>
                        </div>
                        <span className="text-[10px] opacity-75 font-mono">Rp 5.000</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Accent Color Picker */}
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">Warna Aksen Tombol & Sorotan</label>
                <div className="flex items-center gap-3">
                  {ACCENT_COLORS.map(c => {
                    const isSelected = config.primary_color === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, primary_color: c.id as any }))}
                        className={`w-8 h-8 rounded-full ${c.bgClass} flex items-center justify-center transition-all cursor-pointer ${
                          isSelected ? `ring-4 ${c.ringClass} scale-110 shadow-md` : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        title={c.label}
                      >
                        {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                      </button>
                    );
                  })}
                  <span className="text-xs text-slate-500 capitalize ml-2">
                    Aksen: <strong className="text-slate-800">{config.primary_color}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODULAR LAYOUT BUILDER */}
          {activeTab === 'layout' && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Penyusun Tata Letak Modul (Layout Builder)</h3>
                  <p className="text-xs text-slate-500">
                    Gunakan tombol panah untuk mengatur urutan posisi atas/bawah, dan tombol switch untuk menyembunyikan/menampilkan modul.
                  </p>
                </div>
              </div>

              {/* Section List */}
              <div className="space-y-2.5">
                {sortedSections.map((section, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === sortedSections.length - 1;

                  return (
                    <div
                      key={section.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        section.enabled
                          ? 'bg-slate-50/90 border-slate-200 shadow-sm'
                          : 'bg-slate-100/50 border-dashed border-slate-300 opacity-60'
                      }`}
                    >
                      {/* Left: Icon & Label */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
                          {getSectionIcon(section.id)}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{section.label}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-600">
                              #{section.order}
                            </span>
                          </div>

                          {/* Specific sub-options for vouchers */}
                          {section.id === 'vouchers' && section.enabled && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-slate-500">Model Tampilan Paket:</span>
                              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => toggleVoucherVariant('grid')}
                                  className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 cursor-pointer ${
                                    section.variant !== 'list' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Grid size={11} /> Grid Kotak
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleVoucherVariant('list')}
                                  className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 cursor-pointer ${
                                    section.variant === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <List size={11} /> List Ringkas
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Order & Visibility Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Up Button */}
                        <button
                          type="button"
                          onClick={() => moveSection(idx, 'up')}
                          disabled={isFirst}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer"
                          title="Pindah ke atas"
                        >
                          <ArrowUp size={14} />
                        </button>

                        {/* Down Button */}
                        <button
                          type="button"
                          onClick={() => moveSection(idx, 'down')}
                          disabled={isLast}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 cursor-pointer"
                          title="Pindah ke bawah"
                        >
                          <ArrowDown size={14} />
                        </button>

                        {/* Visibility Toggle Button */}
                        <button
                          type="button"
                          onClick={() => toggleSection(idx)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                            section.enabled
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                          }`}
                          title={section.enabled ? 'Sembunyikan modul ini' : 'Tampilkan modul ini'}
                        >
                          {section.enabled ? (
                            <>
                              <Eye size={13} />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={13} />
                              <span>Nonaktif</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: BRANDING & CUSTOM TEXT */}
          {activeTab === 'branding' && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Kustomisasi Branding & Teks Sambutan</h3>
                  <p className="text-xs text-slate-500">Ubah teks judul, slogan, pengumuman promo, dan nomor WhatsApp CS bantuan.</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Brand / Hotspot WiFi</label>
                  <input
                    type="text"
                    value={config.branding.hotspot_name}
                    onChange={(e) => setConfig(prev => ({ ...prev, branding: { ...prev.branding, hotspot_name: e.target.value } }))}
                    placeholder="Contoh: ARBILL Hotspot & Internet"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Slogan / Tagline Sambutan</label>
                  <input
                    type="text"
                    value={config.branding.tagline}
                    onChange={(e) => setConfig(prev => ({ ...prev, branding: { ...prev.branding, tagline: e.target.value } }))}
                    placeholder="Contoh: Internet Cepat, Beli Voucher Instan & Bayar Tagihan Mudah"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp CS Bantuan</label>
                  <input
                    type="text"
                    value={config.branding.contact_phone}
                    onChange={(e) => setConfig(prev => ({ ...prev, branding: { ...prev.branding, contact_phone: e.target.value } }))}
                    placeholder="Contoh: 081234567890 (otomatis terhubung saat diklik pelanggan)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Announcement Running Text */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Pesan Pengumuman / Running Text</label>
                    <button
                      type="button"
                      onClick={() => setConfig(prev => ({ ...prev, announcement: { ...prev.announcement, enabled: !prev.announcement.enabled } }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${
                        config.announcement.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {config.announcement.enabled ? 'Tampilkan' : 'Disembunyikan'}
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={config.announcement.text}
                    onChange={(e) => setConfig(prev => ({ ...prev, announcement: { ...prev.announcement, text: e.target.value } }))}
                    placeholder="Tulis pengumuman promo voucher atau jadwal maintenance..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT COLUMN: INTERACTIVE LIVE PREVIEW ================= */}
        <div className="lg:col-span-5 space-y-3 sticky top-6">
          {/* Device Mockup Switcher Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 pl-2">
              <Eye size={15} className="text-indigo-600" />
              Live Preview Pelanggan
            </span>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  previewDevice === 'mobile' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Smartphone size={13} />
                HP (Mobile)
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice('desktop')}
                className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  previewDevice === 'desktop' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Monitor size={13} />
                Laptop
              </button>
            </div>
          </div>

          {/* Device Frame Container */}
          <div className={`mx-auto transition-all ${
            previewDevice === 'mobile'
              ? 'max-w-[340px] rounded-[36px] border-[10px] border-slate-900 shadow-2xl p-1 bg-slate-900'
              : 'w-full rounded-2xl border-4 border-slate-800 shadow-xl p-1 bg-slate-800'
          }`}>
            {/* Screen Mockup Area */}
            <div className={`overflow-y-auto max-h-[580px] rounded-[24px] text-left transition-all ${
              config.template_theme === 'clean_light'
                ? 'bg-slate-50 text-slate-900'
                : config.template_theme === 'mikhmon_compact'
                ? 'bg-slate-100 text-slate-800'
                : config.template_theme === 'voucher_store'
                ? 'bg-[#0f172a] text-white'
                : 'bg-[#030712] text-white'
            }`}>
              {/* Mini Mock Navbar */}
              <div className={`px-4 py-2.5 border-b flex items-center justify-between text-xs sticky top-0 z-10 backdrop-blur-md ${
                config.template_theme === 'clean_light'
                  ? 'bg-white/90 border-slate-200 text-slate-800'
                  : 'bg-slate-950/80 border-slate-800 text-white'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-white text-[10px] bg-${config.primary_color}-600`}>
                    <Wifi size={13} />
                  </div>
                  <span className="font-extrabold text-[11px] truncate max-w-[130px]">
                    {config.branding.hotspot_name || 'ARBILL WiFi'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-${config.primary_color}-500/20 text-${config.primary_color}-400 border border-${config.primary_color}-500/30`}>
                  ● Online
                </span>
              </div>

              {/* Dynamic Live Mockup of Ordered Sections */}
              <div className="p-3 space-y-3">
                {sortedSections.filter(s => s.enabled).map((s) => {
                  if (s.id === 'announcement' && config.announcement.enabled && config.announcement.text) {
                    return (
                      <div key={s.id} className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] flex items-center gap-1.5 animate-pulse">
                        <Megaphone size={12} className="shrink-0 text-amber-400" />
                        <span className="truncate">{config.announcement.text}</span>
                      </div>
                    );
                  }

                  if (s.id === 'hero') {
                    return (
                      <div key={s.id} className={`p-4 rounded-2xl border relative overflow-hidden ${
                        config.template_theme === 'clean_light'
                          ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200 text-slate-800'
                          : 'bg-gradient-to-br from-slate-900 to-slate-950 border-slate-800'
                      }`}>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase block tracking-wider">
                          Portal Voucher Hotspot
                        </span>
                        <h4 className="font-black text-sm mt-0.5 leading-tight">
                          {config.branding.hotspot_name || 'ARBILL Hotspot'}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                          {config.branding.tagline || 'Internet Cepat, Beli Voucher Instan via QRIS'}
                        </p>
                      </div>
                    );
                  }

                  if (s.id === 'wallet_widget') {
                    return (
                      <div key={s.id} className={`p-3 rounded-2xl border flex items-center justify-between ${
                        config.template_theme === 'clean_light'
                          ? 'bg-white border-slate-200 shadow-xs text-slate-800'
                          : 'bg-slate-900/80 border-slate-800 text-white'
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Wallet size={16} />
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 block">Saldo ArabPay Anda</span>
                            <span className="text-xs font-mono font-black text-emerald-400">Rp 150.000</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 bg-emerald-600 text-white rounded-lg">
                          + Top Up
                        </span>
                      </div>
                    );
                  }

                  if (s.id === 'quick_billing') {
                    return (
                      <div key={s.id} className={`p-3 rounded-2xl border space-y-1.5 ${
                        config.template_theme === 'clean_light'
                          ? 'bg-white border-slate-200 shadow-xs'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}>
                        <span className="text-[10px] font-bold flex items-center gap-1 text-blue-400">
                          <FileText size={12} /> Cek & Bayar Tagihan Cepat
                        </span>
                        <div className="flex gap-1.5">
                          <input
                            disabled
                            placeholder="Nomor Pelanggan..."
                            className="flex-1 bg-slate-800/40 border border-slate-700/60 rounded-lg px-2 py-1 text-[10px] text-slate-300"
                          />
                          <button disabled className="px-2.5 py-1 bg-blue-600 text-white font-bold text-[10px] rounded-lg">
                            Cek
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (s.id === 'vouchers') {
                    const isGrid = s.variant !== 'list';
                    return (
                      <div key={s.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="flex items-center gap-1 text-purple-400">
                            <Package size={12} /> Paket Voucher Hotspot
                          </span>
                          <span className="text-slate-500 font-mono text-[9px]">{isGrid ? 'Mode Grid' : 'Mode List'}</span>
                        </div>

                        {isGrid ? (
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                              <span className="text-[10px] font-bold block text-white">1 Hari (24 Jam)</span>
                              <span className="text-[9px] text-emerald-400 font-mono font-bold block">Rp 5.000</span>
                              <button disabled className="w-full py-0.5 bg-emerald-600 text-white rounded text-[9px] font-bold">Beli</button>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                              <span className="text-[10px] font-bold block text-white">7 Hari (1 Minggu)</span>
                              <span className="text-[9px] text-emerald-400 font-mono font-bold block">Rp 25.000</span>
                              <button disabled className="w-full py-0.5 bg-emerald-600 text-white rounded text-[9px] font-bold">Beli</button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-[10px]">
                              <div>
                                <span className="font-bold text-white block">1 Hari (24 Jam)</span>
                                <span className="text-emerald-400 font-mono text-[9px]">Rp 5.000</span>
                              </div>
                              <button disabled className="px-3 py-1 bg-emerald-600 text-white rounded text-[9px] font-bold">Beli</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (s.id === 'monthly_packages') {
                    return (
                      <div key={s.id} className="p-2.5 rounded-2xl border border-teal-500/30 bg-teal-950/20 text-[10px] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-teal-300 block">Langganan Internet Rumah</span>
                          <span className="text-slate-400 text-[9px]">Kecepatan 20 Mbps Unlimited</span>
                        </div>
                        <span className="text-teal-400 font-bold font-mono">Daftar &rarr;</span>
                      </div>
                    );
                  }

                  if (s.id === 'contact_footer') {
                    return (
                      <div key={s.id} className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-600/30 text-emerald-400 text-center text-[10px] font-bold flex items-center justify-center gap-1.5">
                        <MessageCircle size={13} />
                        <span>Bantuan CS: {config.branding.contact_phone || 'WhatsApp'}</span>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
