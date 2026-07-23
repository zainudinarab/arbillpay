import React, { useState, useEffect } from 'react';
import { 
  X, 
  QrCode, 
  Wallet, 
  CreditCard, 
  Smartphone, 
  Coins, 
  Landmark, 
  CheckCircle, 
  AlertCircle,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Phone
} from 'lucide-react';
import { Invoice, PaymentGateway, BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface PaymentSimulatorProps {
  invoice: Invoice;
  gateways: PaymentGateway[];
  profile: BusinessProfile;
  t: any;
  onClose: () => void;
  onPaymentSuccess: (methodName: string) => void;
}

export default function PaymentSimulator({
  invoice,
  gateways,
  profile,
  t,
  onClose,
  onPaymentSuccess
}: PaymentSimulatorProps) {
  const [selectedMethodId, setSelectedMethodId] = useState<string>('qris');
  const [phoneInput, setPhoneInput] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Timer for QRIS
  const [timerSeconds, setTimerSeconds] = useState(300); // 5 minutes

  useEffect(() => {
    if (selectedMethodId === 'qris' && timerSeconds > 0 && !isSuccess) {
      const interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [selectedMethodId, timerSeconds, isSuccess]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${remSecs < 10 ? '0' : ''}${remSecs}`;
  };

  const handleCopyVa = () => {
    navigator.clipboard.writeText('8012081234567890');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleProcessPayment = () => {
    setIsProcessing(true);
    
    // Simulate API network latency
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      
      // Notify parent after celebration
      setTimeout(() => {
        const methodObj = gateways.find(g => g.id === selectedMethodId);
        onPaymentSuccess(methodObj ? methodObj.name : selectedMethodId.toUpperCase());
      }, 2000);
    }, 1500);
  };

  // Pre-filter gateways to show only those enabled for this specific invoice
  const enabledGateways = gateways.filter(gw => 
    gw.isActive && invoice.enabledPaymentMethods.includes(gw.id)
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden my-8 animate-slide-up">
        
        {/* Simulator Top Header Banner */}
        <div className="bg-slate-950 px-6 py-3.5 text-white flex items-center justify-between text-xs font-mono tracking-wider uppercase border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span>{t.paymentSimulationTitle}</span>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Checkout Main Panel */}
        {isSuccess ? (
          // SUCCESS SCREEN
          <div className="p-8 md:p-12 text-center space-y-5 flex flex-col items-center justify-center min-h-[400px] animate-scale-up">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 animate-bounce">
              <CheckCircle size={44} className="stroke-[2.5]" />
            </div>
            
            <div className="space-y-2">
              <h2 className="font-sans font-black text-2xl text-slate-800">{t.paymentSuccessMsg}</h2>
              <p className="text-sm text-slate-500">
                Tagihan <span className="font-semibold text-slate-800">{invoice.invoiceNumber}</span> telah dilunasi sepenuhnya.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl w-full max-w-md space-y-2 text-xs font-medium text-slate-500">
              <div className="flex justify-between">
                <span>Metode Pembayaran:</span>
                <span className="font-bold text-slate-800">
                  {gateways.find(g => g.id === selectedMethodId)?.displayName || selectedMethodId.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Jumlah yang Dibayar:</span>
                <span className="font-bold text-slate-800">{formatCurrency(invoice.total, profile.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tanggal Lunas:</span>
                <span className="font-bold text-slate-800">{formatDate(new Date().toISOString(), profile.language)}</span>
              </div>
            </div>

            <div className="text-xs text-slate-400 animate-pulse pt-2">
              Mengalihkan kembali ke dasbor...
            </div>
          </div>
        ) : (
          // CHECKOUT FLOW SCREEN
          <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            
            {/* Left Side: Payment Method Selectors */}
            <div className="md:col-span-2 p-6 space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-sans font-bold text-slate-400 block uppercase tracking-wider">TOTAL TAGIHAN</span>
                <h3 className="text-xl font-sans font-extrabold text-[#2563EB]">
                  {formatCurrency(invoice.total, profile.currency)}
                </h3>
                <p className="text-[11px] font-sans text-slate-400 truncate font-medium">No: {invoice.invoiceNumber}</p>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-sans font-bold text-slate-400 block uppercase tracking-wider">PILIH METODE</span>
                
                {enabledGateways.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Belum ada metode pembayaran yang diaktifkan untuk tagihan ini.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                    {enabledGateways.map((gw) => (
                      <button
                        key={gw.id}
                        onClick={() => setSelectedMethodId(gw.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          selectedMethodId === gw.id
                            ? 'border-blue-600 bg-blue-50/20 text-[#2563EB] font-bold'
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span className="text-xs font-sans font-semibold">{gw.name}</span>
                        <ChevronRight size={14} className={selectedMethodId === gw.id ? 'text-[#2563EB]' : 'text-slate-400'} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Secure checkout info */}
              <div className="pt-2 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span>Secured by Billava Gate</span>
              </div>
            </div>

            {/* Right Side: Interactive Action Detail & QR / Simulation View */}
            <div className="md:col-span-3 p-6 space-y-5 bg-slate-50/50">
              
              {/* QRIS / QR Payment Detail */}
              {selectedMethodId === 'qris' && (
                <div className="space-y-4 text-center flex flex-col items-center">
                  <div className="space-y-1.5">
                    <h4 className="font-sans font-bold text-sm text-slate-800">{t.paymentGatewayTitle}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                      {t.scanQris}
                    </p>
                  </div>

                  {/* QRIS Mock QR Canvas */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative flex flex-col items-center justify-center w-48 h-48">
                    {/* Fake complex QRIS QR Code using elegant CSS pixels / representation */}
                    <div className="w-40 h-40 bg-slate-100 rounded-lg overflow-hidden relative flex items-center justify-center p-2">
                      <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900">
                        {/* Anchor squares */}
                        <rect x="5" y="5" width="20" height="20" fill="currentColor" />
                        <rect x="8" y="8" width="14" height="14" fill="white" />
                        <rect x="11" y="11" width="8" height="8" fill="currentColor" />

                        <rect x="75" y="5" width="20" height="20" fill="currentColor" />
                        <rect x="78" y="8" width="14" height="14" fill="white" />
                        <rect x="81" y="11" width="8" height="8" fill="currentColor" />

                        <rect x="5" y="75" width="20" height="20" fill="currentColor" />
                        <rect x="8" y="78" width="14" height="14" fill="white" />
                        <rect x="11" y="81" width="8" height="8" fill="currentColor" />

                        {/* Random complex dots representation of QRIS payload */}
                        <path d="M 30,10 H 40 V 20 H 30 Z" fill="currentColor" />
                        <path d="M 50,5 H 60 V 15 H 50 Z" fill="currentColor" />
                        <path d="M 45,25 H 55 V 35 H 45 Z" fill="currentColor" />
                        <path d="M 10,35 H 20 V 45 H 10 Z" fill="currentColor" />
                        <path d="M 35,45 H 45 V 55 H 35 Z" fill="currentColor" />
                        <path d="M 60,45 H 70 V 55 H 60 Z" fill="currentColor" />
                        <path d="M 15,60 H 25 V 70 H 15 Z" fill="currentColor" />
                        <path d="M 45,65 H 55 V 75 H 45 Z" fill="currentColor" />
                        <path d="M 65,75 H 75 V 85 H 65 Z" fill="currentColor" />
                        <path d="M 80,35 H 90 V 45 H 80 Z" fill="currentColor" />
                        <path d="M 85,55 H 95 V 65 H 85 Z" fill="currentColor" />

                        {/* Centered QRIS mini logo */}
                        <rect x="38" y="38" width="24" height="24" rx="4" fill="white" />
                        <rect x="41" y="41" width="18" height="18" rx="2" fill="#E11D48" />
                      </svg>
                    </div>

                    {/* QRIS Logo overlay */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2.5 py-0.5 rounded-md border border-slate-100 shadow-sm text-[9px] font-extrabold text-rose-600">
                      QRIS
                    </div>
                  </div>

                  {/* QRIS Countdown Timer */}
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <span>Masa berlaku QR:</span>
                    <span className="text-rose-600 font-mono text-sm font-bold bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100 animate-pulse">
                      {formatTimer(timerSeconds)}
                    </span>
                  </div>
                </div>
              )}

              {/* GoPay / OVO / DANA Simulation */}
              {['gopay', 'ovo', 'dana'].includes(selectedMethodId) && (
                <div className="space-y-4">
                  <div className="space-y-1.5 text-center sm:text-left">
                    <h4 className="font-sans font-bold text-sm text-slate-800">
                      Simulasi Pembayaran {selectedMethodId.toUpperCase()}
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Lakukan simulasi pembayaran e-wallet seolah-olah Anda menekan tombol bayar di smartphone.
                    </p>
                  </div>

                  {selectedMethodId === 'ovo' && (
                    <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <label className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider block">Masukkan No. HP Terdaftar OVO</label>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="tel"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="e.g. 08123456789"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2 text-xs text-slate-500 leading-relaxed">
                    <p className="font-semibold text-slate-700 flex items-center gap-1">
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span>Skenario Penggunaan Nyata:</span>
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li>Pelanggan akan diarahkan (deeplink) ke aplikasi {selectedMethodId.toUpperCase()} di smartphone mereka.</li>
                      <li>Mereka mengonfirmasi pembayaran dengan memasukkan PIN e-wallet.</li>
                      <li>Status tagihan Anda akan berubah menjadi <span className="font-semibold text-emerald-600">Lunas (Paid)</span> secara real-time.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Bank Transfer / VA Payment Detail */}
              {selectedMethodId === 'bank_transfer' && (
                <div className="space-y-4">
                  <div className="space-y-1.5 text-center sm:text-left">
                    <h4 className="font-sans font-bold text-sm text-slate-800">Transfer Virtual Account (Mandiri / BCA)</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Silakan salin nomor rekening Virtual Account di bawah ini untuk mensimulasikan transfer antarbank.
                    </p>
                  </div>

                  {/* VA Card */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">BANK MANDIRI / BCA</span>
                        <span className="font-mono text-sm md:text-base font-extrabold text-slate-800">8012 0812 3456 7890</span>
                      </div>
                      <button
                        onClick={handleCopyVa}
                        className="p-2 border border-slate-100 hover:bg-slate-50 text-slate-600 rounded-xl cursor-pointer transition-all"
                        title="Salin Nomor VA"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>

                    <div className="border-t border-slate-50 pt-2.5">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Nama Rekening Penerima</span>
                      <span className="text-xs font-semibold text-slate-700">{profile.companyName}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive payment CTA */}
              <button
                type="button"
                onClick={handleProcessPayment}
                disabled={isProcessing}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 font-sans font-semibold text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer transition-all"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>{t.simulatePayment}</span>
                  </>
                )}
              </button>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
