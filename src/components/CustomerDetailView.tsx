import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  User,
  Wifi,
  Globe,
  Zap,
  Activity,
  MapPin,
  FileText,
  Calendar,
  Clock,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  RefreshCw,
  ExternalLink,
  Cpu,
  Plug,
  Server,
  Layers,
  Radio,
  Download,
  Share2,
  MessageCircle,
  Navigation,
  Terminal,
  RotateCcw,
  Power
} from 'lucide-react';
import { CustomerItem } from './CustomerManagement';
import { BusinessProfile } from '../types';
import { getApiUrl } from '../config/api';
import { getInvoicesFromFirestore } from '../services/firebaseService';

interface CustomerDetailViewProps {
  customer: CustomerItem;
  profile: BusinessProfile;
  isOnline: boolean;
  ftthInfo: { nodeName: string; nodeType: string; odpName: string; odpPort: number } | null;
  linkedFtthNode?: any;
  onBack: () => void;
  onEdit: (cust: CustomerItem) => void;
  onSync: (cust: CustomerItem) => void;
  onDisconnect: (cust: CustomerItem) => void;
  onApprove?: (cust: CustomerItem) => void;
  onDelete: (cust: CustomerItem) => void;
  onOpenQuickDevice: (cust: CustomerItem) => void;
  onSetGps: (cust: CustomerItem) => void;
  actionLoadingId?: string | null;
}

export default function CustomerDetailView({
  customer,
  profile,
  isOnline,
  ftthInfo,
  linkedFtthNode,
  onBack,
  onEdit,
  onSync,
  onDisconnect,
  onApprove,
  onDelete,
  onOpenQuickDevice,
  onSetGps,
  actionLoadingId
}: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'network' | 'ftth' | 'location' | 'billing' | 'logs'>('network');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Invoices state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Connection logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [logsStats, setLogsStats] = useState<{ total_bytes_in: number; total_bytes_out: number; login_count: number; logout_count: number } | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // Copy helper
  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date helper
  const formatDate = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string') return val.includes('T') ? val.split('T')[0] : val;
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'object' && val.seconds) {
      return new Date(val.seconds * 1000).toISOString().split('T')[0];
    }
    return String(val);
  };

  // Format Rupiah
  const formatRupiah = (num?: number) => {
    return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
  };

  // Direct WhatsApp sender
  const handleSendWhatsApp = (invNum?: string, amount?: number, dueDate?: string) => {
    if (!customer.phone_number) {
      alert('Nomor WhatsApp pelanggan tidak ditemukan!');
      return;
    }
    let cleanPhone = customer.phone_number.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }
    const invText = invNum ? `\n🧾 *No Tagihan*: ${invNum}\n💰 *Total*: ${formatRupiah(amount)}\n⏰ *Jatuh Tempo*: ${dueDate || '-'}\n🔗 *Bayar Online*: https://arbillpay.web.app/?view=checkout&id=${invNum}#/overview\n` : '';
    const text = `Halo Bpk/Ibu *${customer.name}*,\n\nSalam dari ${profile?.name || 'Layanan Internet'}.${invText}\nPaket Langganan: *${customer.package_name || 'Broadband'}*\nStatus Koneksi: *${isOnline ? 'Online 🟢' : 'Offline 🔴'}*\n\nJika ada kendala koneksi atau pertanyaan, silakan balas pesan ini.\nTerima kasih!`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Fetch invoices for this customer
  useEffect(() => {
    const fetchInvoices = async () => {
      setInvoicesLoading(true);
      let matched: any[] = [];
      try {
        const apiUrl = getApiUrl();
        if (apiUrl) {
          const res = await fetch(`${apiUrl}/api/invoices?customer_id=${customer.id}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.success && Array.isArray(data.invoices)) {
              matched = data.invoices;
            }
          }
        }
      } catch (e) {}

      if (matched.length === 0) {
        try {
          const fbRes = await getInvoicesFromFirestore();
          if (fbRes.success && Array.isArray(fbRes.invoices)) {
            const cId = String(customer.id || '').trim();
            const cCode = String(customer.customer_code || '').trim().toUpperCase();
            matched = fbRes.invoices.filter((inv: any) => {
              const invCustId = String(inv.customer_id || inv.client_id || '').trim();
              const invCustCode = String(inv.customer_code || '').trim().toUpperCase();
              return (cId && invCustId === cId) || (cCode && invCustCode === cCode);
            });
          }
        } catch (e) {}
      }

      setInvoices(matched);
      setInvoicesLoading(false);
    };

    fetchInvoices();
  }, [customer.id]);

  // Fetch connection logs
  useEffect(() => {
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const apiUrl = getApiUrl();
        if (apiUrl) {
          const res = await fetch(`${apiUrl}/api/customers/${customer.id}/logs`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              setLogs(data.logs || []);
              setLogsStats(data.stats || null);
            }
          }
        }
      } catch (e) {}
      setLogsLoading(false);
    };

    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [customer.id, activeTab]);

  // OLT SSH Integration state
  const [oltList, setOltList] = useState<any[]>([]);
  const [selectedOltId, setSelectedOltId] = useState<string>(customer.olt_id || '');
  const [selectedPonPort, setSelectedPonPort] = useState<string>(customer.pon_port || '1');
  const [selectedOnuId, setSelectedOnuId] = useState<string>(customer.onu_id ? String(customer.onu_id) : '1');
  const [isEditingOltLink, setIsEditingOltLink] = useState(false);
  const [savingOltLink, setSavingOltLink] = useState(false);
  const [isCheckingPower, setIsCheckingPower] = useState(false);
  const [livePowerData, setLivePowerData] = useState<{ rx_power?: number | string; tx_power?: number | string; olt_rx_power?: number | string; status?: string; raw_output?: string } | null>(null);
  const [showRawOltOutput, setShowRawOltOutput] = useState(false);
  const [isRebootingOnu, setIsRebootingOnu] = useState(false);
  const [oltActionMsg, setOltActionMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const fetchOlts = async () => {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/olts`);
        const data = await res.json();
        if (data && data.success && Array.isArray(data.olts)) {
          setOltList(data.olts);
        }
      } catch (err) {
        console.warn('Failed to load OLT list:', err);
      }
    };
    fetchOlts();
  }, []);

  const handleSaveOltLink = async () => {
    setSavingOltLink(true);
    setOltActionMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...customer,
          olt_id: selectedOltId || null,
          pon_port: selectedPonPort || null,
          onu_id: selectedOnuId ? parseInt(selectedOnuId, 10) : null
        })
      });
      const data = await res.json();
      if (data && data.success) {
        customer.olt_id = selectedOltId || undefined;
        customer.pon_port = selectedPonPort || undefined;
        customer.onu_id = selectedOnuId ? parseInt(selectedOnuId, 10) : undefined;
        const matchedOlt = oltList.find(o => o.id === selectedOltId);
        if (matchedOlt) {
          customer.olt_name = matchedOlt.name;
          customer.olt_brand = matchedOlt.brand;
          customer.olt_ip = matchedOlt.ip_address;
        } else if (!selectedOltId) {
          customer.olt_name = undefined;
          customer.olt_brand = undefined;
          customer.olt_ip = undefined;
        }
        setIsEditingOltLink(false);
        setOltActionMsg({ type: 'success', text: 'Tautan OLT berhasil disimpan!' });
      } else {
        setOltActionMsg({ type: 'error', text: data.message || 'Gagal menyimpan tautan OLT.' });
      }
    } catch (e: any) {
      setOltActionMsg({ type: 'error', text: e.message });
    } finally {
      setSavingOltLink(false);
    }
  };

  const handleCheckLivePower = async () => {
    const oltId = customer.olt_id || selectedOltId;
    const ponPort = customer.pon_port || selectedPonPort;
    const onuId = customer.onu_id || selectedOnuId;
    if (!oltId) {
      setOltActionMsg({ type: 'error', text: 'Pilih dan hubungkan perangkat OLT terlebih dahulu.' });
      return;
    }
    setIsCheckingPower(true);
    setOltActionMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${oltId}/optical-power?pon_port=${encodeURIComponent(ponPort)}&onu_id=${encodeURIComponent(onuId)}`);
      const data = await res.json();
      if (data && data.success && data.optical_power) {
        setLivePowerData(data.optical_power);
        const rx = data.optical_power.rx_power;
        if (rx !== undefined && rx !== null && !isNaN(Number(rx))) {
          customer.power_laser = String(rx);
          fetch(`${apiUrl}/api/customers/${customer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...customer, power_laser: String(rx) })
          }).catch(() => {});
        }
        setOltActionMsg({ type: 'success', text: `Berhasil membaca redaman optik live dari OLT! RX: ${data.optical_power.rx_power ?? '-'} dBm` });
      } else {
        setOltActionMsg({ type: 'error', text: data.message || 'Gagal membaca redaman optik dari OLT.' });
      }
    } catch (e: any) {
      setOltActionMsg({ type: 'error', text: e.message });
    } finally {
      setIsCheckingPower(false);
    }
  };

  const handleRebootOnu = async () => {
    const oltId = customer.olt_id || selectedOltId;
    const ponPort = customer.pon_port || selectedPonPort;
    const onuId = customer.onu_id || selectedOnuId;
    if (!oltId) {
      setOltActionMsg({ type: 'error', text: 'Pilih dan hubungkan perangkat OLT terlebih dahulu.' });
      return;
    }
    if (!window.confirm(`PERINGATAN: Apakah Anda yakin ingin me-restart modem/ONU pelanggan "${customer.name}" (Port: ${ponPort}, ONU #${onuId}) langsung dari OLT via SSH? Koneksi internet pelanggan akan terputus sebentar selama booting.`)) {
      return;
    }
    setIsRebootingOnu(true);
    setOltActionMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${oltId}/reboot-onu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pon_port: ponPort, onu_id: onuId })
      });
      const data = await res.json();
      if (data && data.success) {
        setOltActionMsg({ type: 'success', text: data.message || 'Perintah reboot berhasil dikirim ke ONU via OLT!' });
      } else {
        setOltActionMsg({ type: 'error', text: data.message || 'Gagal mengirim perintah reboot ke OLT.' });
      }
    } catch (e: any) {
      setOltActionMsg({ type: 'error', text: e.message });
    } finally {
      setIsRebootingOnu(false);
    }
  };

  // Optical power calculation
  const powerLaserNum = parseFloat(customer.power_laser || '-19.5');
  const isPowerGood = powerLaserNum >= -23 && powerLaserNum <= -14;
  const isPowerWarning = (powerLaserNum < -23 && powerLaserNum >= -27) || powerLaserNum > -14;
  const isPowerCritical = powerLaserNum < -27;

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Kembali ke tabel daftar pelanggan"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Daftar Pelanggan</span>
          </button>
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">{customer.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                customer.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                customer.status === 'isolated' ? 'bg-rose-100 text-rose-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  customer.status === 'active' ? 'bg-emerald-600' :
                  customer.status === 'isolated' ? 'bg-rose-600' : 'bg-amber-600'
                }`} />
                {customer.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
              <span>{customer.customer_code || `CUST-${customer.id.substring(0, 5).toUpperCase()}`}</span>
              <span>•</span>
              <span>{customer.package_name || 'Broadband Package'}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons Top Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {isOnline && (
            <button
              onClick={() => onDisconnect(customer)}
              disabled={actionLoadingId === customer.id}
              className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Putuskan koneksi agar PPPoE reconnect ulang"
            >
              {actionLoadingId === customer.id ? <RefreshCw size={14} className="animate-spin" /> : <Plug size={14} />}
              <span>Diskonek</span>
            </button>
          )}

          <button
            onClick={() => onSync(customer)}
            disabled={actionLoadingId === customer.id}
            className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              customer.is_synced
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
            }`}
            title="Sinkronkan konfigurasi & kredensial ke Router Mikrotik"
          >
            {actionLoadingId === customer.id ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Zap size={14} className={customer.is_synced ? 'text-emerald-600' : 'text-amber-300'} />
            )}
            <span>{customer.is_synced ? 'Re-Sync Mikrotik' : 'Sync Mikrotik'}</span>
          </button>

          {customer.phone_number && (
            <button
              onClick={() => handleSendWhatsApp()}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Kirim pesan WhatsApp langsung ke pelanggan"
            >
              <MessageCircle size={14} />
              <span>WhatsApp</span>
            </button>
          )}

          <button
            onClick={() => onEdit(customer)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Edit data pelanggan"
          >
            <Edit size={14} />
            <span>Edit</span>
          </button>

          <button
            onClick={() => onDelete(customer)}
            disabled={actionLoadingId === customer.id}
            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-all cursor-pointer"
            title="Hapus pelanggan permanen"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        {/* Background ambient accents */}
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Main User Card */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center font-black text-xl text-white shadow-lg shrink-0">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight">{customer.name}</h2>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase flex items-center gap-1 ${
                    isOnline 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                    <span>{isOnline ? 'MIKROTIK ONLINE' : 'OFFLINE'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-300 text-xs font-mono">
                  <span>ID: {customer.customer_code || customer.id}</span>
                  {customer.phone_number && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Phone size={12} className="text-emerald-400" />
                        {customer.phone_number}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Address quick snippet */}
            <div className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded-xl p-3 flex items-start gap-2 backdrop-blur-xs">
              <MapPin size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-200">
                  {customer.address || 'Alamat belum diatur'}
                </p>
                {(customer.dusun || customer.desa || customer.kecamatan || customer.kabupaten) && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {[customer.dusun, customer.desa, customer.kecamatan, customer.kabupaten, customer.provinsi].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Metric 1: Package & Speed */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>PAKET INTERNET</span>
              <Wifi size={16} className="text-indigo-400" />
            </div>
            <div className="my-2">
              <div className="text-base font-black text-white">{customer.package_name || 'Broadband'}</div>
              <div className="text-xs text-indigo-300 font-mono mt-0.5">
                {customer.speed_limit || 'Up to 20 Mbps'}
              </div>
            </div>
            <div className="text-xs text-slate-300 border-t border-white/10 pt-2 flex items-center justify-between">
              <span>Tarif Bulanan</span>
              <div className="text-right">
                <div className="font-black text-white">
                  {formatRupiah(customer.custom_price || customer.package_price)}
                </div>
                {customer.custom_price && (
                  <div className="text-[10px] text-emerald-300 font-bold flex items-center justify-end gap-1">
                    <span>🔒 Tarif Terkunci</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Metric 2: Optical Signal & FTTH */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-xs">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold">
              <span>REDAMAN OPTIK (FO)</span>
              <Radio size={16} className={isPowerGood ? 'text-emerald-400' : isPowerWarning ? 'text-amber-400' : 'text-rose-400'} />
            </div>
            <div className="my-2">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${
                  isPowerGood ? 'text-emerald-400' : isPowerWarning ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {customer.power_laser || '-19.50'}
                </span>
                <span className="text-xs text-slate-400 font-bold">dBm</span>
              </div>
              <div className="text-[11px] font-bold mt-1">
                {isPowerGood ? (
                  <span className="text-emerald-300 flex items-center gap-1">🟢 Sinyal Sangat Baik (Ideal)</span>
                ) : isPowerWarning ? (
                  <span className="text-amber-300 flex items-center gap-1">🟡 Warning / Redaman Sedang</span>
                ) : (
                  <span className="text-rose-300 flex items-center gap-1">🔴 Kritis / High Loss</span>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-300 border-t border-white/10 pt-2 flex items-center justify-between">
              <span>ODP Penyuplai</span>
              <span className="font-mono text-purple-300 font-bold">{ftthInfo?.odpName || 'ODP Unlinked'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 text-xs font-bold">
        <button
          onClick={() => setActiveTab('network')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'network'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server size={15} />
          <span>Koneksi & Mikrotik</span>
        </button>

        <button
          onClick={() => setActiveTab('ftth')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'ftth'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Cpu size={15} />
          <span>Fisik ONU & FTTH</span>
        </button>

        <button
          onClick={() => setActiveTab('location')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'location'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MapPin size={15} />
          <span>Lokasi & Alamat GPS</span>
        </button>

        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'billing'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText size={15} />
          <span>Tagihan & Invoices ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity size={15} />
          <span>Log Sesi PPP</span>
        </button>
      </div>

      {/* Tab Content 1: Network & Mikrotik */}
      {activeTab === 'network' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PPPoE Credentials Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <ShieldCheck size={18} className="text-indigo-600" />
                <span>Kredensial Akun PPPoE</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Secret Service</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  PPPoE Username
                </label>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="font-mono font-bold text-slate-800 text-xs">{customer.pppoe_username || '-'}</span>
                  <button
                    onClick={() => copyToClipboard(customer.pppoe_username || '', 'username')}
                    className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                    title="Salin Username"
                  >
                    {copiedField === 'username' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  PPPoE Password
                </label>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {showPassword ? (customer.pppoe_password || '-') : '••••••••••••'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                      title={showPassword ? 'Sembunyikan' : 'Tampilkan Password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(customer.pppoe_password || '', 'password')}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                      title="Salin Password"
                    >
                      {copiedField === 'password' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                    Alamat IP (Static / Pool)
                  </label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-slate-700">
                    {customer.static_ip || 'DHCP Pool'}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                    Tipe Koneksi
                  </label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-slate-700 uppercase">
                    {customer.connection_type || 'PPPoE'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Router & Mikrotik Assignment */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Server size={18} className="text-indigo-600" />
                <span>Router Mikrotik & Profil</span>
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                customer.is_synced ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {customer.is_synced ? 'Tersinkronisasi' : 'Belum Tersinkron'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  Router Gateway
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">{customer.router_name || 'Router Utama (Default)'}</span>
                  <span className="text-[11px] font-mono text-slate-400">{customer.router_ip || '-'}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  Profile PPP
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">{customer.router_profile_name || 'default'}</span>
                  <span className="text-[11px] font-mono text-indigo-600 font-bold">{customer.speed_limit || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                    Tanggal Pemasangan
                  </label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{formatDate(customer.installation_date)}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                    Jatuh Tempo / Expired
                  </label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>{formatDate(customer.expired_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: FTTH & Optical */}
      {activeTab === 'ftth' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Laser Optical Power Meter */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Radio size={18} className="text-indigo-600" />
                <span>Pengukuran Daya Laser (Optical Power)</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-400">1490nm / 1310nm RX</span>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Redaman Optik Saat Ini:</span>
                <span className={`text-xl font-black font-mono ${
                  isPowerGood ? 'text-emerald-700' : isPowerWarning ? 'text-amber-700' : 'text-rose-700'
                }`}>
                  {customer.power_laser || '-19.50'} dBm
                </span>
              </div>

              {/* Progress Bar Visualizer */}
              <div className="space-y-1">
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                  {/* Good zone: -14 to -23 dBm */}
                  <div className="w-[45%] bg-emerald-500" title="Zona Ideal (-14 s.d. -23 dBm)" />
                  {/* Warning zone: -23 to -27 dBm */}
                  <div className="w-[30%] bg-amber-500" title="Zona Peringatan (-23 s.d. -27 dBm)" />
                  {/* Critical zone: < -27 dBm */}
                  <div className="w-[25%] bg-rose-500" title="Zona Kritis / Drop (< -27 dBm)" />
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>-14 dBm (Bagus)</span>
                  <span>-23 dBm</span>
                  <span>-27 dBm (Kritis)</span>
                </div>
              </div>

              <div className="text-xs text-slate-600 pt-1">
                {isPowerGood ? (
                  <p className="text-emerald-700 font-medium">
                    ✅ Kualitas sinyal serat optik <strong>sangat prima</strong>. Bebas gangguan dan latensi stabil.
                  </p>
                ) : isPowerWarning ? (
                  <p className="text-amber-700 font-medium">
                    ⚠️ Redaman berada pada batas toleransi. Pertimbangkan inspeksi konektor kabel dropcore.
                  </p>
                ) : (
                  <p className="text-rose-700 font-medium">
                    🚨 Redaman sangat tinggi (&lt; -27 dBm). Potensi sinyal loss, diskonek berulang, atau kabel tertekuk.
                  </p>
                )}
              </div>
            </div>

            {/* ONU Hardware Details */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Perangkat Modem (ONT/ONU)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Serial Number (SN)</span>
                  <span className="font-mono text-xs font-bold text-slate-800">{customer.sn_onu || '-'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Teknisi Pemasang</span>
                  <span className="text-xs font-bold text-slate-800">{customer.teknisi || 'Teknisi Utama'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ODP & FTTH Topology Connection */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-indigo-600" />
                <span>Penyuplai Jalur FTTH (ODP)</span>
              </h3>
              <button
                onClick={() => onOpenQuickDevice(customer)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Cpu size={13} />
                <span>Kelola Node</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900">ODP Induk Penyuplai:</span>
                  <span className="font-black text-purple-900 font-mono text-sm">
                    {ftthInfo?.odpName || 'Belum Ditautkan ke ODP'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-purple-800">
                  <span>Port ODP Digunakan:</span>
                  <span className="font-bold bg-purple-200/70 px-2 py-0.5 rounded text-[11px] font-mono">
                    Port #{ftthInfo?.odpPort || customer.odp_port || 1}
                  </span>
                </div>
                {linkedFtthNode && (
                  <div className="flex items-center justify-between text-xs text-purple-800 pt-1 border-t border-purple-200/60">
                    <span>Node FTTH ID:</span>
                    <span className="font-mono font-bold text-[11px]">#{linkedFtthNode.id}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons to View Map */}
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => {
                    if (linkedFtthNode) {
                      window.location.hash = `#/map-ftth?nodeId=${linkedFtthNode.id}`;
                    } else if (customer.latitude && customer.longitude) {
                      window.location.hash = `#/map-ftth?lat=${customer.latitude}&lng=${customer.longitude}`;
                    } else {
                      window.location.hash = '#/map-ftth';
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Navigation size={14} />
                  <span>Buka di Peta Topologi FTTH Interactive</span>
                </button>
              </div>
            </div>
          </div>

          {/* OLT Remote Control & Live Optical Attenuation Card */}
          <div className="md:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 shadow-xl border border-slate-700/60 space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Terminal size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <span>Remote OLT & Kontrol ONU (Direct SSH)</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Live CLI
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Inspeksi redaman laser optik & kontrol reboot modem ONU langsung melalui CLI OLT tanpa ketergantungan TR-069
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {customer.olt_id && !isEditingOltLink && (
                  <button
                    onClick={() => setIsEditingOltLink(true)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit size={13} />
                    <span>Ubah Port OLT</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Banner */}
            {oltActionMsg && (
              <div className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 ${
                oltActionMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                oltActionMsg.type === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                <div className="flex items-center gap-2">
                  {oltActionMsg.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> :
                   oltActionMsg.type === 'error' ? <AlertTriangle size={16} className="text-rose-400 shrink-0" /> :
                   <AlertCircle size={16} className="text-blue-400 shrink-0" />}
                  <span>{oltActionMsg.text}</span>
                </div>
                <button
                  onClick={() => setOltActionMsg(null)}
                  className="text-white/60 hover:text-white font-bold text-xs p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Link Edit Form (When unlinked or editing) */}
            {(isEditingOltLink || !customer.olt_id) && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                    {customer.olt_id ? 'Perbarui Port / OLT Pelanggan' : 'Tautkan Pelanggan ke Perangkat OLT'}
                  </h4>
                  {customer.olt_id && (
                    <button
                      onClick={() => setIsEditingOltLink(false)}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Pilih OLT
                    </label>
                    <select
                      value={selectedOltId}
                      onChange={(e) => setSelectedOltId(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                    >
                      <option value="">-- Pilih OLT Fisik --</option>
                      {oltList.map((olt) => (
                        <option key={olt.id} value={olt.id}>
                          {olt.name} ({olt.brand} - {olt.ip_address})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Port PON
                    </label>
                    <input
                      type="text"
                      value={selectedPonPort}
                      onChange={(e) => setSelectedPonPort(e.target.value)}
                      placeholder="Contoh: 1 atau gpon-olt_1/1/1"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      ONU ID / ONT ID
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="128"
                      value={selectedOnuId}
                      onChange={(e) => setSelectedOnuId(e.target.value)}
                      placeholder="1 s/d 128"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {customer.olt_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOltId('');
                        setSelectedPonPort('1');
                        setSelectedOnuId('1');
                        handleSaveOltLink();
                      }}
                      disabled={savingOltLink}
                      className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      Lepas Tautan OLT
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveOltLink}
                    disabled={savingOltLink || (!selectedOltId && !customer.olt_id)}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    {savingOltLink ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>Simpan Perubahan OLT</span>
                  </button>
                </div>
              </div>
            )}

            {/* Linked Status & Control Panel */}
            {customer.olt_id && !isEditingOltLink && (
              <div className="space-y-4">
                {/* OLT Meta & Specs Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Perangkat OLT</span>
                    <span className="font-black text-white text-xs">{customer.olt_name || 'OLT Terhubung'}</span>
                    <span className="text-[10px] text-indigo-300 font-mono block mt-0.5">{customer.olt_ip || '-'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Port PON OLT</span>
                    <span className="font-mono font-black text-emerald-400 text-xs">Port #{customer.pon_port || '1'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">ONU / ONT ID</span>
                    <span className="font-mono font-black text-indigo-300 text-xs">ID #{customer.onu_id || '1'}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Status Registrasi OLT</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{livePowerData?.status || 'Online / Configured'}</span>
                    </span>
                  </div>
                </div>

                {/* Live Optical Attenuation Indicators */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>RX Power (Modem ONU)</span>
                      <Radio size={14} className="text-emerald-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-2xl font-black text-emerald-400 font-mono">
                        {livePowerData?.rx_power ?? customer.power_laser ?? '-'}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">dBm</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Daya sinyal optik yang diterima ONU dari OLT</p>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>TX Power (Modem ONU)</span>
                      <Zap size={14} className="text-amber-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-2xl font-black text-amber-400 font-mono">
                        {livePowerData?.tx_power ?? '+2.45'}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">dBm</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Daya pancar laser dari ONU ke OLT</p>
                  </div>

                  <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>OLT RX Power (SFP Port)</span>
                      <Activity size={14} className="text-indigo-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 pt-1">
                      <span className="text-2xl font-black text-indigo-400 font-mono">
                        {livePowerData?.olt_rx_power ?? '-20.12'}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">dBm</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Daya balik yang diterima port SFP OLT</p>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCheckLivePower}
                    disabled={isCheckingPower}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
                  >
                    {isCheckingPower ? <RefreshCw size={15} className="animate-spin" /> : <Radio size={15} />}
                    <span>{isCheckingPower ? 'Mengecek ke OLT via SSH...' : '📡 Cek Redaman Live via OLT SSH'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRebootOnu}
                    disabled={isRebootingOnu}
                    className="py-3 px-5 rounded-xl bg-rose-600/90 hover:bg-rose-600 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
                    title="Kirim perintah reboot ke modem ONU pelanggan dari CLI OLT"
                  >
                    {isRebootingOnu ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    <span>{isRebootingOnu ? 'Mereboot ONU...' : '🔄 Reboot Modem (ONU)'}</span>
                  </button>

                  {livePowerData?.raw_output && (
                    <button
                      type="button"
                      onClick={() => setShowRawOltOutput(!showRawOltOutput)}
                      className="py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Terminal size={14} />
                      <span>{showRawOltOutput ? 'Tutup Log CLI' : 'Log Terminal'}</span>
                    </button>
                  )}
                </div>

                {/* Raw CLI Output Drawer */}
                {showRawOltOutput && livePowerData?.raw_output && (
                  <div className="mt-3 bg-black/80 rounded-2xl p-4 border border-slate-800 text-[11px] font-mono text-emerald-400 space-y-1">
                    <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800 text-[10px]">
                      <span>RAW SSH OUTPUT DARI OLT</span>
                      <span>VT100 PTY</span>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 pt-1">
                      {livePowerData.raw_output}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content 3: Location & GPS */}
      {activeTab === 'location' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Detailed Address Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <MapPin size={18} className="text-rose-600" />
                <span>Alamat Lengkap Pelanggan</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Wilayah Administratif</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Alamat Jalan / Patokan</span>
                <span className="font-bold text-slate-800 text-xs">{customer.address || '-'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Dusun / RT-RW</span>
                  <span className="font-bold text-slate-800">{customer.dusun || '-'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Desa / Kelurahan</span>
                  <span className="font-bold text-slate-800">{customer.desa || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Kecamatan</span>
                  <span className="font-bold text-slate-800">{customer.kecamatan || '-'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Kabupaten / Kota</span>
                  <span className="font-bold text-slate-800">{customer.kabupaten || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Provinsi</span>
                  <span className="font-bold text-slate-800">{customer.provinsi || '-'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Kode Pos</span>
                  <span className="font-mono font-bold text-slate-800">{customer.kode_pos || '-'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* GPS Coordinates & Map Link */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Navigation size={18} className="text-indigo-600" />
                <span>Titik Koordinat GPS</span>
              </h3>
              <button
                onClick={() => onSetGps(customer)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <MapPin size={13} />
                <span>Atur Titik Peta</span>
              </button>
            </div>

            <div className="space-y-3">
              {customer.latitude && customer.longitude ? (
                <>
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-sky-900">Koordinat (Lat, Lng):</span>
                      <button
                        onClick={() => copyToClipboard(`${customer.latitude}, ${customer.longitude}`, 'gps')}
                        className="text-sky-600 hover:text-sky-800 p-1 transition-colors"
                        title="Salin Koordinat"
                      >
                        {copiedField === 'gps' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                    <div className="font-mono text-sm font-black text-sky-900">
                      {Number(customer.latitude).toFixed(6)}, {Number(customer.longitude).toFixed(6)}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-2">
                    <a
                      href={customer.maps_url || `https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                    >
                      <ExternalLink size={14} />
                      <span>Buka di Google Maps</span>
                    </a>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
                  <MapPin size={28} className="text-amber-500 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Titik Koordinat Belum Diatur</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tentukan titik lokasi rumah pelanggan untuk mempermudah navigasi teknisi & kalkulasi topologi FTTH.
                    </p>
                  </div>
                  <button
                    onClick={() => onSetGps(customer)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <MapPin size={14} />
                    <span>+ Tentukan Titik GPS Sekarang</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: Invoices & Billing */}
      {activeTab === 'billing' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" />
                <span>Riwayat Tagihan & Pembayaran Pelanggan</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daftar semua invoice tagihan bulanan pelanggan ini beserta status verifikasi ArabPay.
              </p>
            </div>
          </div>

          {invoicesLoading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw size={24} className="animate-spin text-indigo-600" />
              <span className="text-xs font-semibold">Memuat riwayat invoice...</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <FileText size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Belum ada riwayat tagihan untuk pelanggan ini.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tagihan akan dibuat otomatis oleh scheduler auto-billing atau dibuat manual.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase font-black tracking-wider text-slate-400 bg-slate-50/50">
                    <th className="py-2.5 px-3">No Invoice</th>
                    <th className="py-2.5 px-3">Periode</th>
                    <th className="py-2.5 px-3">Total Tagihan</th>
                    <th className="py-2.5 px-3">Jatuh Tempo</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {invoices.map((inv: any) => {
                    const invNumber = inv.invoice_number || inv.id;
                    const isPaid = inv.status === 'paid' || inv.status === 'settled';
                    const amount = inv.amount || inv.total || 0;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-indigo-600">
                          {invNumber}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700">
                          {inv.period || inv.package_name || customer.package_name || '-'}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800">
                          {formatRupiah(amount)}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {formatDate(inv.due_date)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPaid ? 'Lunas' : 'Belum Lunas'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleSendWhatsApp(invNumber, amount, formatDate(inv.due_date))}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                              title="Kirim Info Tagihan via WhatsApp"
                            >
                              <MessageCircle size={14} />
                            </button>
                            <a
                              href={`https://arbillpay.web.app/?view=checkout&id=${invNumber}#/overview`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer inline-flex items-center"
                              title="Buka Halaman Checkout Pembayaran ArabPay"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content 5: Connection Logs & Sessions */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Activity size={18} className="text-emerald-600" />
                <span>Log Sesi Koneksi PPPoE Mikrotik</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Riwayat login, logout, IP session, dan ringkasan pemakaian bandwidth.
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          {logsStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Download</span>
                <span className="font-mono text-sm font-black text-indigo-600">{formatBytes(logsStats.total_bytes_out)}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Upload</span>
                <span className="font-mono text-sm font-black text-emerald-600">{formatBytes(logsStats.total_bytes_in)}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Jumlah Login</span>
                <span className="font-mono text-sm font-black text-slate-800">{logsStats.login_count || 0}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Jumlah Logout</span>
                <span className="font-mono text-sm font-black text-slate-800">{logsStats.logout_count || 0}</span>
              </div>
            </div>
          )}

          {logsLoading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw size={24} className="animate-spin text-emerald-600" />
              <span className="text-xs font-semibold">Memuat riwayat log sesi...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <Activity size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-600">Belum ada catatan log koneksi untuk pelanggan ini.</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Log akan dicatat secara otomatis ketika pelanggan terhubung / terputus dari Mikrotik.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase font-black tracking-wider text-slate-400 bg-slate-50/50">
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">IP Address</th>
                    <th className="py-2.5 px-3">MAC / Caller ID</th>
                    <th className="py-2.5 px-3">Uptime / Durasi</th>
                    <th className="py-2.5 px-3">Trafik (DL / UL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {logs.map((log: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                        {formatDate(log.created_at || log.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          log.action === 'login' || log.status === 'online'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {log.action || log.status || 'event'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {log.ip_address || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                        {log.caller_id || log.mac_address || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {log.uptime || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                        {formatBytes(log.bytes_out || 0)} / {formatBytes(log.bytes_in || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
