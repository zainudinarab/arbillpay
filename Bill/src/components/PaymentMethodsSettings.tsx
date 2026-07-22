import React, { useState } from 'react';
import { 
  Check, 
  Settings2, 
  QrCode, 
  Wallet, 
  CreditCard, 
  Smartphone, 
  Coins, 
  Landmark,
  Save,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { PaymentGateway, BusinessProfile } from '../types';

interface PaymentMethodsSettingsProps {
  gateways: PaymentGateway[];
  onToggleGateway: (id: string) => void;
  onUpdateGatewayDetails: (id: string, details: Partial<PaymentGateway>) => void;
  profile: BusinessProfile;
  t: any;
}

export default function PaymentMethodsSettings({
  gateways,
  onToggleGateway,
  onUpdateGatewayDetails,
  profile,
  t
}: PaymentMethodsSettingsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempAccount, setTempAccount] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempShare, setTempShare] = useState<number>(0);
  const [successMsg, setSuccessMsg] = useState('');

  const getGatewayIcon = (iconName: string) => {
    switch (iconName) {
      case 'QrCode':
        return <QrCode size={20} className="text-rose-500" />;
      case 'Wallet':
        return <Wallet size={20} className="text-teal-600" />;
      case 'CreditCard':
        return <CreditCard size={20} className="text-indigo-600" />;
      case 'Smartphone':
        return <Smartphone size={20} className="text-blue-500" />;
      default:
        return <Landmark size={20} className="text-slate-500" />;
    }
  };

  const handleEditClick = (gw: PaymentGateway) => {
    setEditingId(gw.id);
    setTempAccount(gw.accountNumber || '');
    setTempName(gw.accountName || '');
    setTempShare(gw.payoutShare || 0);
  };

  const handleSave = (id: string) => {
    onUpdateGatewayDetails(id, {
      accountNumber: tempAccount,
      accountName: tempName,
      payoutShare: tempShare
    });
    setEditingId(null);
    setSuccessMsg('Metode Pembayaran berhasil diupdate!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 md:px-8 z-10 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-sans font-bold text-xl md:text-2xl text-slate-800">{t.paymentMethods}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {profile.language === 'id' 
              ? 'Konfigurasi gerbang pembayaran e-wallet dan bank Indonesia' 
              : 'Configure Indonesian e-wallet and bank payment gateways'
            }
          </p>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
        
        {/* Success Alert Banner */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-700 text-sm font-semibold animate-fade-in">
            <CheckCircle size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-sans font-bold text-lg text-slate-800">
              {profile.language === 'id' ? 'Kelola Integrasi E-Wallet & Bank' : 'Manage E-Wallet & Bank Integrations'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {profile.language === 'id'
                ? 'Aktifkan e-wallet favorit di Indonesia agar pelanggan dapat membayar langsung melalui QRIS atau transfer otomatis.'
                : 'Enable favorite e-wallets in Indonesia for clients to pay instantly via QRIS or automated bank transfer.'
              }
            </p>
          </div>

          {/* Gateways Grid */}
          <div className="space-y-4">
            {gateways.map((gw) => {
              const isEditing = editingId === gw.id;
              
              return (
                <div 
                  key={gw.id}
                  className={`border rounded-2xl p-4 md:p-5 transition-all ${
                    gw.isActive 
                      ? 'border-blue-100 bg-blue-50/10' 
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Icon & Name */}
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        {getGatewayIcon(gw.iconName)}
                      </div>
                      <div>
                        <h4 className="font-sans font-bold text-sm md:text-base text-slate-800">{gw.displayName}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded-md uppercase ${
                            gw.type === 'qris' 
                              ? 'bg-rose-50 text-rose-600' 
                              : gw.type === 'ewallet' 
                              ? 'bg-teal-50 text-teal-600' 
                              : 'bg-blue-50 text-blue-600'
                          }`}>
                            {gw.type}
                          </span>
                          {gw.accountNumber && (
                            <span className="text-xs font-mono text-slate-500">{gw.accountNumber}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controls (Toggle + Edit) */}
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      {/* Edit Button */}
                      <button
                        onClick={() => handleEditClick(gw)}
                        className="p-2 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1 transition-all"
                      >
                        <Settings2 size={14} />
                        <span>{profile.language === 'id' ? 'Atur' : 'Edit'}</span>
                      </button>

                      {/* Switch Button */}
                      <button
                        onClick={() => onToggleGateway(gw.id)}
                        className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-300 focus:outline-none cursor-pointer ${
                          gw.isActive ? 'bg-[#2563EB]' : 'bg-slate-200'
                        }`}
                      >
                        <div className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-300 ${
                          gw.isActive ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Inline Editing Form */}
                  {isEditing && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Account Number Field */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            {gw.type === 'qris' 
                              ? t.merchantQrisCode 
                              : gw.type === 'ewallet' 
                              ? t.walletPhone 
                              : t.bankAccount
                            }
                          </label>
                          <input
                            type="text"
                            value={tempAccount}
                            onChange={(e) => setTempAccount(e.target.value)}
                            placeholder="e.g. 081234567..."
                            className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                          />
                        </div>

                        {/* Account Holder Name Field */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            {gw.type === 'bank' ? t.accountName : 'Nama Akun / Merchant'}
                          </label>
                          <input
                            type="text"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            placeholder="e.g. Budi Santoso"
                            className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                          />
                        </div>

                        {/* Distribution Share Field */}
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            Porsi Distribusi (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={tempShare}
                            onChange={(e) => setTempShare(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                          />
                        </div>
                      </div>

                      {/* Edit Actions */}
                      <div className="flex justify-end gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSave(gw.id)}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-600 rounded-xl cursor-pointer flex items-center gap-1"
                        >
                          <Save size={12} />
                          <span>{t.save}</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-3xl flex items-start gap-3 text-slate-600 leading-relaxed text-xs">
          <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-sans font-bold text-slate-800">Bagaimana Cara Kerja Integrasi E-Wallet?</h4>
            <p className="font-sans">
              Setiap kali Anda menerbitkan tagihan dengan metode e-wallet (GoPay, OVO, DANA) atau QRIS yang diaktifkan, Billava akan secara dinamis menyatukannya menjadi satu kode QR QRIS tunggal atau menyediakan tautan transfer e-wallet instan untuk pelanggan Anda. Di simulator, Anda dapat melihat halaman checkout yang akan diakses oleh pelanggan Anda!
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
