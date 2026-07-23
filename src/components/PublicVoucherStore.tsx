import React, { useState } from 'react';
import { Wifi, Zap, ShieldCheck, QrCode, ArrowRight, CheckCircle2, Star, Smartphone, LogIn, CreditCard, Sparkles } from 'lucide-react';
import { formatCurrency } from '../utils';

interface PublicVoucherStoreProps {
  onBuyVoucher: (packageItem: any) => void;
  onOpenAdminLogin: () => void;
}

export const wifiPackages = [
  {
    id: 'pkg-1',
    name: 'Paket Hemat 24 Jam',
    speed: '10 Mbps',
    duration: '24 Jam (1 Hari)',
    price: 5000,
    popular: false,
    badge: 'Ekonomis',
    features: ['Kecepatan hingga 10 Mbps', 'Unlimited Kuota (FUP High)', 'Bisa 2 Perangkat', 'Aktif 24 Jam']
  },
  {
    id: 'pkg-2',
    name: 'Paket Mingguan Super',
    speed: '20 Mbps',
    duration: '7 Hari (1 Minggu)',
    price: 25000,
    popular: true,
    badge: 'Terlaris 🔥',
    features: ['Kecepatan hingga 20 Mbps', 'Unlimited Kuota 100%', 'Bisa 3 Perangkat', 'Bisa Main Game Online & Streaming Full HD']
  },
  {
    id: 'pkg-3',
    name: 'Paket Bulanan Unlimited',
    speed: '50 Mbps',
    duration: '30 Hari (1 Bulan)',
    price: 85000,
    popular: false,
    badge: 'Paling Hemat',
    features: ['Kecepatan hingga 50 Mbps', 'Unlimited Tanpa FUP', 'Bisa 5 Perangkat', 'Dukungan Prioritas 24/7']
  }
];

export default function PublicVoucherStore({ onBuyVoucher, onOpenAdminLogin }: PublicVoucherStoreProps) {
  const [selectedPkg, setSelectedPkg] = useState<any>(null);

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased text-slate-800 flex flex-col justify-between">
      
      {/* Top Public Header Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-30 px-4 md:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Wifi size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight text-slate-800 leading-tight">Arbil WiFi Hotspot</h1>
            <p className="text-[11px] font-semibold text-slate-400">Layanan Internet Cepat & Stabil</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenAdminLogin}
            className="px-4 py-2 bg-[#0066FF] hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <LogIn size={15} />
            <span>Login Sistem / ArabPay SSO</span>
          </button>
        </div>
      </header>

      {/* Hero Banner */}
      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-10 flex-1 w-full">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-8 md:p-12 text-white shadow-xl shadow-blue-500/10 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-xl z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full border border-white/20 text-xs font-extrabold text-blue-100">
              <Sparkles size={14} className="text-amber-300" />
              <span>Internet Hotspot Otomatis 24 Jam</span>
            </div>
            <h2 className="font-extrabold text-3xl md:text-4xl tracking-tight leading-tight">
              Beli Voucher WiFi Langsung Aktif via ArabPay QRIS!
            </h2>
            <p className="text-sm text-blue-100/90 leading-relaxed">
              Tanpa perlu daftar akun ribet! Cukup pilih paket voucher, bayar secara instan menggunakan E-Wallet ArabPay / QRIS, dan kode voucher WiFi Anda akan langsung terbit otomatis.
            </p>
          </div>

          {/* Quick Illustration */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 shrink-0 w-full md:w-80 space-y-3 shadow-inner">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h4 className="font-bold text-sm">Pembayaran Aman</h4>
                <p className="text-xs text-blue-200">Terhubung langsung ArabPay</p>
              </div>
            </div>
            <div className="text-xs text-blue-100 space-y-1.5">
              <div className="flex justify-between">
                <span>Dukungan Provider:</span>
                <span className="font-bold text-white">ArabPay, QRIS, GoPay</span>
              </div>
              <div className="flex justify-between">
                <span>Kecepatan Maksimal:</span>
                <span className="font-bold text-emerald-300">Up to 50 Mbps</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section Title */}
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h3 className="font-extrabold text-2xl text-slate-800 tracking-tight">Pilih Paket Voucher Internet</h3>
          <p className="text-xs text-slate-400">Silakan pilih paket internet yang sesuai dengan kebutuhan Anda di bawah ini:</p>
        </div>

        {/* Voucher Package Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {wifiPackages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-white rounded-3xl border transition-all p-6 flex flex-col justify-between space-y-6 relative ${
                pkg.popular 
                  ? 'border-[#0066FF] ring-4 ring-blue-500/10 shadow-lg shadow-blue-500/10 scale-102' 
                  : 'border-slate-100 shadow-sm hover:border-slate-200'
              }`}
            >
              {pkg.badge && (
                <div className={`absolute -top-3 right-6 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-sm ${
                  pkg.popular ? 'bg-[#0066FF]' : 'bg-slate-800'
                }`}>
                  {pkg.badge}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h4 className="font-extrabold text-lg text-slate-800">{pkg.name}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{pkg.duration}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold block">Harga Voucher:</span>
                  <div className="font-extrabold text-2xl text-[#0066FF]">
                    {formatCurrency(pkg.price, 'IDR')}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-slate-700 block">Fasilitas Layanan:</span>
                  <ul className="space-y-2 text-xs text-slate-600 font-medium">
                    {pkg.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <button
                onClick={() => onBuyVoucher(pkg)}
                className={`w-full py-3.5 px-4 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                  pkg.popular
                    ? 'bg-[#0066FF] hover:bg-blue-700 text-white shadow-blue-500/20'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                <span>Beli Voucher via ArabPay</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-6 px-4 text-center text-xs text-slate-400 font-sans mt-12">
        <p>Powered by <span className="font-bold text-slate-700">Arbil Billing Hotspot SaaS</span> &copy; 2026. Terhubung langsung dengan <span className="font-bold text-[#0066FF]">ArabPay E-Wallet Platform</span>.</p>
      </footer>
    </div>
  );
}
