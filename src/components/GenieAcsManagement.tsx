import { getApiUrl } from '../config/api';
import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Server, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Zap, 
  Wifi, 
  RotateCw, 
  Settings, 
  Link2, 
  Activity,
  Signal,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Edit,
  Globe,
  Lock,
  User,
  Sliders,
  AlertTriangle,
  Eye,
  EyeOff,
  Cpu,
  Power,
  Trash2
} from 'lucide-react';
import HeaderBar from './HeaderBar';

interface GenieAcsManagementProps {
  profile: any;
  t: any;
  onLogout?: () => void;
}

export default function GenieAcsManagement({ profile, t, onLogout }: GenieAcsManagementProps) {
  const [activeTab, setActiveTab] = useState<'devices' | 'settings'>('devices');
  
  // GenieACS Server Settings State
  const [serverUrl, setServerUrl] = useState<string>('http://192.168.201.238:7557');
  const [nbiUsername, setNbiUsername] = useState<string>('admin');
  const [nbiPassword, setNbiPassword] = useState<string>('admin');
  const [connStatus, setConnStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');

  // Devices & Customers State
  const [devices, setDevices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [testLoading, setTestLoading] = useState<boolean>(false);
  
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all' | 'online' | 'offline'

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Device Management Modal State
  const [selectedDeviceForManage, setSelectedDeviceForManage] = useState<any | null>(null);
  const [manageTab, setManageTab] = useState<'info' | 'wifi' | 'wan' | 'customer' | 'danger'>('info');
  const [deviceDetail, setDeviceDetail] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false);

  // Form Fields for Manage Modal
  const [selectedSsidIndex, setSelectedSsidIndex] = useState<string>('1');
  const [modalWifiSsid, setModalWifiSsid] = useState<string>('');
  const [modalWifiPassword, setModalWifiPassword] = useState<string>('');
  const [modalWifiEnabled, setModalWifiEnabled] = useState<boolean>(true);
  const [showWifiPassword, setShowWifiPassword] = useState<boolean>(false);
  const [isWifiSaving, setIsWifiSaving] = useState<boolean>(false);

  const [modalWanUsername, setModalWanUsername] = useState<string>('');
  const [modalWanPassword, setModalWanPassword] = useState<string>('');
  const [modalWanVlan, setModalWanVlan] = useState<string>('');
  const [modalWanConnIndex, setModalWanConnIndex] = useState<string>('1');
  const [modalPppIndex, setModalPppIndex] = useState<string>('1');
  const [showWanPassword, setShowWanPassword] = useState<boolean>(false);
  const [isWanSaving, setIsWanSaving] = useState<boolean>(false);

  const [modalSelectedCustomerId, setModalSelectedCustomerId] = useState<string>('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>('');
  const [isCustomerSaving, setIsCustomerSaving] = useState<boolean>(false);

  const [isActionRunning, setIsActionRunning] = useState<boolean>(false);

  const parseJsonResponse = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Respons server bukan JSON (HTTP ${res.status})`);
    }
  };

  // Fetch Settings, Devices, and Customers
  const fetchData = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const [sRes, dRes, cRes] = await Promise.all([
        fetch(`${apiUrl}/api/genieacs/settings`).catch(() => null),
        fetch(`${apiUrl}/api/genieacs/devices`).catch(() => null),
        fetch(`${apiUrl}/api/customers`).catch(() => null)
      ]);

      if (sRes) {
        const sData = await parseJsonResponse(sRes);
        if (sData.success && sData.settings) {
          setServerUrl(sData.settings.url || 'http://192.168.201.238:7557');
          setNbiUsername(sData.settings.username || 'admin');
          setNbiPassword(sData.settings.password || 'admin');
          setConnStatus(sData.settings.status || 'unknown');
        }
      }

      if (dRes) {
        const dData = await parseJsonResponse(dRes);
        if (dData.success && Array.isArray(dData.devices)) {
          setDevices(dData.devices);
          setConnStatus('connected');
        }
      }

      if (cRes) {
        const cData = await parseJsonResponse(cRes);
        if (cData.success && Array.isArray(cData.customers)) {
          setCustomers(cData.customers);
        }
      }
    } catch (err: any) {
      console.error('GenieACS Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Save Settings & Test Connection
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: serverUrl,
          username: nbiUsername,
          password: nbiPassword
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setConnStatus(data.status || 'connected');
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal terhubung ke GenieACS Server.' });
        setConnStatus('disconnected');
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal tes koneksi: ${err.message}` });
      setConnStatus('disconnected');
    } finally {
      setTestLoading(false);
    }
  };

  // Sync GenieACS ONUs to Customer DB
  const handleSyncGenieAcsToCustomers = async () => {
    setSyncLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/sync-customers`, {
        method: 'POST'
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal singkronisasi GenieACS.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Error singkronisasi: ${err.message}` });
    } finally {
      setSyncLoading(false);
    }
  };

  // Open Device Management Modal
  const openManageModal = async (device: any, initialTab: 'info' | 'wifi' | 'wan' | 'customer' | 'danger' = 'info') => {
    setSelectedDeviceForManage(device);
    setManageTab(initialTab);
    setIsDetailLoading(true);
    setDeviceDetail(null);

    // Initial default values from basic list item
    setModalWifiSsid(device.wifi_ssid || 'Wi-Fi');
    setModalWifiPassword('');
    setModalWifiEnabled(true);
    setModalWanUsername('');
    setModalWanPassword('');
    setModalWanVlan('');
    setModalWanConnIndex('1');
    setModalPppIndex('1');
    setShowWifiPassword(false);
    setShowWanPassword(false);
    setModalSelectedCustomerId('');
    setCustomerSearchTerm('');

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(device.id)}/detail`);
      const data = await parseJsonResponse(res);
      if (data.success && data.device) {
        const dev = data.device;
        setDeviceDetail(dev);
        if (dev.wlans && dev.wlans.length > 0) {
          const first = dev.wlans[0];
          setSelectedSsidIndex(first.index || '1');
          setModalWifiSsid(first.ssid || '');
          setModalWifiEnabled(first.enabled ?? true);
        } else {
          setSelectedSsidIndex('1');
          setModalWifiSsid(dev.wlan?.ssid || device.wifi_ssid || '');
          setModalWifiEnabled(dev.wlan?.enabled ?? true);
        }
        setModalWanUsername(dev.wan?.username || '');
        setModalWanVlan(dev.wan?.vlan_id || '');
        setModalWanConnIndex(dev.wan?.wan_conn_index || '1');
        setModalPppIndex(dev.wan?.ppp_index || '1');
        if (dev.customer?.id) {
          setModalSelectedCustomerId(dev.customer.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load device detail:', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Reboot ONU Device via TR-069
  const handleRebootDevice = async (deviceId: string, deviceName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin me-reboot ONU / ONT "${deviceName}" via TR-069?`)) return;

    setActionLoadingId(deviceId);
    setIsActionRunning(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(deviceId)}/reboot`, {
        method: 'POST'
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengirim perintah reboot.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal reboot: ${err.message}` });
    } finally {
      setActionLoadingId(null);
      setIsActionRunning(false);
    }
  };

  // Factory Reset ONU via TR-069
  const handleFactoryResetDevice = async (deviceId: string, deviceName: string) => {
    const confirmPrompt = window.prompt(
      `PERINGATAN KERAS: Factory Reset akan menghapus seluruh konfigurasi ONT "${deviceName}" ke setelan pabrik!\n\nKetik kata "RESET" untuk mengonfirmasi:`
    );
    if (confirmPrompt !== 'RESET') {
      alert('Tindakan Factory Reset dibatalkan.');
      return;
    }

    setIsActionRunning(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(deviceId)}/factory-reset`, {
        method: 'POST'
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setSelectedDeviceForManage(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal melakukan factory reset.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal factory reset: ${err.message}` });
    } finally {
      setIsActionRunning(false);
    }
  };

  // Refresh Parameter Object (Inform) via TR-069
  const handleRefreshDeviceObject = async (deviceId: string) => {
    setIsActionRunning(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(deviceId)}/refresh`, {
        method: 'POST'
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        // Re-fetch detail
        if (selectedDeviceForManage) {
          openManageModal(selectedDeviceForManage, manageTab);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengirim task refresh.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal refresh: ${err.message}` });
    } finally {
      setIsActionRunning(false);
    }
  };

  // Save Wi-Fi Config
  const handleSaveWifiConfig = async () => {
    if (!selectedDeviceForManage || !modalWifiSsid) return;

    setIsWifiSaving(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(selectedDeviceForManage.id)}/wifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: modalWifiSsid,
          password: modalWifiPassword,
          enabled: modalWifiEnabled,
          ssid_index: selectedSsidIndex
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui Wi-Fi ONU.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal simpan Wi-Fi: ${err.message}` });
    } finally {
      setIsWifiSaving(false);
    }
  };

  // Save WAN / PPPoE Config
  const handleSaveWanConfig = async () => {
    if (!selectedDeviceForManage || !modalWanUsername) {
      alert('Username PPPoE wajib diisi.');
      return;
    }

    setIsWanSaving(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(selectedDeviceForManage.id)}/wan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: modalWanUsername,
          password: modalWanPassword,
          vlan_id: modalWanVlan,
          wan_conn_index: modalWanConnIndex || '1',
          ppp_index: modalPppIndex || '1'
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui konfigurasi WAN.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal simpan WAN: ${err.message}` });
    } finally {
      setIsWanSaving(false);
    }
  };

  // Link Customer to Device SN
  const handleLinkCustomer = async (customerId: string | null) => {
    if (!selectedDeviceForManage) return;

    setIsCustomerSaving(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(selectedDeviceForManage.id)}/link-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          sn: selectedDeviceForManage.sn || selectedDeviceForManage.id
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
        if (selectedDeviceForManage) {
          openManageModal(selectedDeviceForManage, 'customer');
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengubah tautan pelanggan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal menautkan: ${err.message}` });
    } finally {
      setIsCustomerSaving(false);
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    if (statusFilter === 'online' && !d.is_online) return false;
    if (statusFilter === 'offline' && d.is_online) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchSn = d.sn?.toLowerCase().includes(q) || d.id?.toLowerCase().includes(q);
      const matchModel = d.product_class?.toLowerCase().includes(q);
      const matchCust = d.customer_name?.toLowerCase().includes(q);
      const matchIp = d.external_ip?.toLowerCase().includes(q);
      if (!matchSn && !matchModel && !matchCust && !matchIp) return false;
    }
    return true;
  });

  // Filtered customers for linking dropdown
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearchTerm.trim()) return true;
    const q = customerSearchTerm.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.customer_code?.toLowerCase().includes(q) ||
      c.pppoe_username?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  const totalDevices = devices.length;
  const onlineCount = devices.filter(d => d.is_online).length;
  const offlineCount = totalDevices - onlineCount;

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="GenieACS TR-069 OLT & ONU Management"
        subtitle="Manajemen dan Pemantauan ONU/ONT OLT FTTH via TR-069 Auto Configuration Server"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Toast Notification */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Top Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
              <Radio size={24} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">TOTAL ONU / ONT</span>
              <span className="text-2xl font-black text-slate-800">{totalDevices}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <Signal size={24} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">ONU ONLINE</span>
              <span className="text-2xl font-black text-emerald-600">{onlineCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <Activity size={24} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">ONU OFFLINE / LOS</span>
              <span className="text-2xl font-black text-rose-600">{offlineCount}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
              connStatus === 'connected' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              <Server size={24} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">STATUS ACS NBI</span>
              <span className={`text-sm font-extrabold block ${
                connStatus === 'connected' ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {connStatus === 'connected' ? '⚡ TERHUBUNG' : '❌ TERPUTUS'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Radio size={15} />
            <span>Daftar Perangkat ONU / ONT ({totalDevices})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Settings size={15} />
            <span>Pengaturan Server GenieACS</span>
          </button>
        </div>

        {/* TAB 1: DEVICES LIST */}
        {activeTab === 'devices' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Toolbar Filters */}
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari Serial Number (SN ONU), Model, IP, Nama Pelanggan..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
                >
                  <option value="all">Semua Status</option>
                  <option value="online">🟢 Online</option>
                  <option value="offline">🔴 Offline / LOS</option>
                </select>

                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  title="Muat Ulang Data"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin text-sky-600' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  onClick={handleSyncGenieAcsToCustomers}
                  disabled={syncLoading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Zap size={14} className={syncLoading ? 'animate-spin' : ''} />
                  <span>{syncLoading ? 'Menyingkronkan...' : '⚡ Singkron ke Pelanggan'}</span>
                </button>
              </div>
            </div>

            {/* Table Devices */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                    <th className="py-3.5 px-4">PERANGKAT ONU / SN</th>
                    <th className="py-3.5 px-4">PELANGGAN TERHUBUNG</th>
                    <th className="py-3.5 px-4">MODEL / PROD</th>
                    <th className="py-3.5 px-4">SIGNAL POWER (RX)</th>
                    <th className="py-3.5 px-4">WI-FI SSID</th>
                    <th className="py-3.5 px-4 text-center">STATUS TR-069</th>
                    <th className="py-3.5 px-4 text-right">PENGATURAN & AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                        <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-sky-500" />
                        <span>Memuat data ONU dari GenieACS Server...</span>
                      </td>
                    </tr>
                  ) : filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                        Belum ada ONU / ONT yang terdeteksi dari GenieACS Server.
                        <p className="text-[11px] font-normal mt-1">Pastikan GenieACS Server aktif di menu Pengaturan Server.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60 transition-all">
                        {/* SN / Device ID */}
                        <td className="py-3.5 px-4 space-y-0.5">
                          <div className="font-mono font-black text-slate-900 flex items-center gap-1.5">
                            <span>{d.sn || d.id}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <span>{d.manufacturer || 'ZTE'}</span>
                            {d.external_ip && <span className="text-sky-600 font-mono">• {d.external_ip}</span>}
                          </div>
                        </td>

                        {/* Customer Name */}
                        <td className="py-3.5 px-4">
                          {d.customer_name ? (
                            <div>
                              <div className="font-extrabold text-slate-800 flex items-center gap-1">
                                <span>{d.customer_name}</span>
                              </div>
                              <div className="text-[10px] font-mono text-sky-600">{d.customer_code}</div>
                            </div>
                          ) : (
                            <button
                              onClick={() => openManageModal(d, 'customer')}
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer flex items-center gap-1"
                              title="Klik untuk menautkan ke Pelanggan Arbill"
                            >
                              <Link2 size={10} />
                              <span>⚠️ Belum Ditautkan</span>
                            </button>
                          )}
                        </td>

                        {/* Model */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          {d.product_class || 'ONT/ONU'}
                        </td>

                        {/* Signal Rx Power */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-black border ${
                            d.rx_power_num && d.rx_power_num >= -24
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : d.rx_power_num && d.rx_power_num >= -28
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {d.rx_power || '-19.5 dBm'}
                          </span>
                        </td>

                        {/* Wi-Fi SSID */}
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {d.wifi_ssid || '-'}
                        </td>

                        {/* Status TR-069 */}
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                            d.is_online
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border-rose-200'
                          }`}>
                            {d.is_online ? '🟢 Online' : '🔴 Offline'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Tombol Utama Atur Perangkat */}
                            <button
                              onClick={() => openManageModal(d, 'info')}
                              className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                              title="Kelola & Atur Perangkat (TR-069)"
                            >
                              <Sliders size={13} />
                              <span>Atur</span>
                            </button>

                            {/* Tombol Pintas Wi-Fi */}
                            <button
                              onClick={() => openManageModal(d, 'wifi')}
                              className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl border border-sky-200 transition-all cursor-pointer"
                              title="Konfigurasi Wi-Fi Remote TR-069"
                            >
                              <Wifi size={14} />
                            </button>

                            {/* Tombol Pintas WAN */}
                            <button
                              onClick={() => openManageModal(d, 'wan')}
                              className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl border border-indigo-200 transition-all cursor-pointer"
                              title="Konfigurasi WAN / PPPoE"
                            >
                              <Globe size={14} />
                            </button>

                            {/* Tombol Pintas Reboot */}
                            <button
                              onClick={() => handleRebootDevice(d.id, d.sn || d.id)}
                              disabled={actionLoadingId === d.id}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl border border-rose-200 transition-all cursor-pointer disabled:opacity-50"
                              title="Reboot ONU via TR-069"
                            >
                              <RotateCw size={14} className={actionLoadingId === d.id ? 'animate-spin' : ''} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Pengaturan GenieACS NBI API Server</h3>
                <p className="text-xs text-slate-400">Konfigurasi alamat Host Server GenieACS untuk komunikasi TR-069 OLT / ONU</p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL Host GenieACS NBI API (Port 7557) *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: http://192.168.201.238:7557 atau http://localhost:7557"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Default NBI (Northbound Interface) API port GenieACS adalah <strong>7557</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NBI Username</label>
                  <input
                    type="text"
                    placeholder="admin"
                    value={nbiUsername}
                    onChange={(e) => setNbiUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NBI Password</label>
                  <input
                    type="password"
                    placeholder="admin"
                    value={nbiPassword}
                    onChange={(e) => setNbiPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={testLoading}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {testLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{testLoading ? 'Pengujian...' : '⚡ Simpan & Tes Koneksi NBI'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MODAL: ATUR PERANGKAT (DEVICE MANAGEMENT TR-069) */}
        {selectedDeviceForManage && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base text-white">Kelola Perangkat ONU / ONT</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                        selectedDeviceForManage.is_online
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                      }`}>
                        {selectedDeviceForManage.is_online ? '🟢 Online' : '🔴 Offline'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">
                      SN: <strong className="text-white">{selectedDeviceForManage.sn || selectedDeviceForManage.id}</strong>
                      <span className="mx-2">•</span>
                      {selectedDeviceForManage.product_class || 'ONT'} ({selectedDeviceForManage.manufacturer || 'ZTE'})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDeviceForManage(null)}
                  className="text-slate-400 hover:text-white font-bold text-2xl cursor-pointer p-1"
                >
                  &times;
                </button>
              </div>

              {/* Modal Tab Switcher */}
              <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 bg-slate-50 overflow-x-auto">
                <button
                  onClick={() => setManageTab('info')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 ${
                    manageTab === 'info'
                      ? 'border-sky-600 text-sky-600 bg-white font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Activity size={14} />
                  <span>Informasi & Status</span>
                </button>

                <button
                  onClick={() => setManageTab('wifi')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 ${
                    manageTab === 'wifi'
                      ? 'border-sky-600 text-sky-600 bg-white font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Wifi size={14} />
                  <span>Wi-Fi (WLAN)</span>
                </button>

                <button
                  onClick={() => setManageTab('wan')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 ${
                    manageTab === 'wan'
                      ? 'border-sky-600 text-sky-600 bg-white font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe size={14} />
                  <span>WAN / PPPoE</span>
                </button>

                <button
                  onClick={() => setManageTab('customer')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 ${
                    manageTab === 'customer'
                      ? 'border-sky-600 text-sky-600 bg-white font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Link2 size={14} />
                  <span>Tautkan Pelanggan</span>
                </button>

                <button
                  onClick={() => setManageTab('danger')}
                  className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border-b-2 ${
                    manageTab === 'danger'
                      ? 'border-rose-600 text-rose-600 bg-white font-black'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <AlertTriangle size={14} />
                  <span>Zona Bahaya</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {isDetailLoading && !deviceDetail ? (
                  <div className="py-12 text-center text-slate-400 font-bold">
                    <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-sky-500" />
                    <span>Membaca parameter TR-069 dari ONT...</span>
                  </div>
                ) : (
                  <>
                    {/* TAB 1: INFORMASI & TELEMETRI */}
                    {manageTab === 'info' && (
                      <div className="space-y-5">
                        {/* Status Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Redaman Optik (RX)</span>
                            <span className={`text-base font-black font-mono block mt-0.5 ${
                              selectedDeviceForManage.rx_power_num >= -24 ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {deviceDetail?.optical?.rx_power || selectedDeviceForManage.rx_power || '-19.5 dBm'}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">IP WAN PPPoE</span>
                            <span className="text-sm font-black font-mono text-sky-700 block mt-0.5 truncate">
                              {deviceDetail?.wan?.ip_address || selectedDeviceForManage.external_ip || '-'}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Uptime ONT</span>
                            <span className="text-sm font-black font-mono text-slate-800 block mt-0.5">
                              {deviceDetail?.uptime_seconds ? `${Math.floor(deviceDetail.uptime_seconds / 3600)} jam` : '-'}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Status WAN</span>
                            <span className="text-xs font-black uppercase text-emerald-700 block mt-0.5">
                              {deviceDetail?.wan?.connection_status || 'Connected'}
                            </span>
                          </div>
                        </div>

                        {/* Parameter Details Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-between">
                            <span>Parameter TR-069 (CWMP)</span>
                            <span className="text-[10px] text-slate-400">Diperbarui via GenieACS</span>
                          </div>

                          <div className="divide-y divide-slate-100 text-xs">
                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Serial Number (SN):</span>
                              <span className="col-span-2 font-mono font-bold text-slate-800">
                                {deviceDetail?.sn || selectedDeviceForManage.sn || selectedDeviceForManage.id}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Model / Product Class:</span>
                              <span className="col-span-2 font-mono font-bold text-slate-800">
                                {deviceDetail?.product_class || selectedDeviceForManage.product_class || '-'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Pabrikan (Manufacturer):</span>
                              <span className="col-span-2 font-bold text-slate-800">
                                {deviceDetail?.manufacturer || selectedDeviceForManage.manufacturer || 'ZTE'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Versi Software / Firmware:</span>
                              <span className="col-span-2 font-mono font-bold text-slate-800">
                                {deviceDetail?.software_version || '-'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Versi Hardware:</span>
                              <span className="col-span-2 font-mono font-bold text-slate-800">
                                {deviceDetail?.hardware_version || '-'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">MAC Address WAN:</span>
                              <span className="col-span-2 font-mono font-bold text-slate-800">
                                {deviceDetail?.wan?.mac_address || '-'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Akun Pelanggan Terhubung:</span>
                              <span className="col-span-2">
                                {deviceDetail?.customer ? (
                                  <span className="font-extrabold text-sky-700">
                                    {deviceDetail.customer.name} ({deviceDetail.customer.customer_code})
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-bold">Belum ditautkan ke pelanggan</span>
                                )}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 px-4 py-2.5">
                              <span className="text-slate-400 font-bold">Terakhir Inform (CWMP):</span>
                              <span className="col-span-2 text-slate-600">
                                {selectedDeviceForManage.last_inform || 'Baru saja'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Connected Devices (LAN / Wi-Fi Hosts) */}
                        {deviceDetail?.connected_hosts && deviceDetail.connected_hosts.length > 0 && (
                          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Radio size={14} className="text-sky-600" />
                                <span>Perangkat Client Terhubung (Wi-Fi & LAN)</span>
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-mono">
                                {deviceDetail.connected_hosts.length} Perangkat
                              </span>
                            </div>
                            <div className="divide-y divide-slate-100 text-xs max-h-48 overflow-y-auto">
                              {deviceDetail.connected_hosts.map((h: any, idx: number) => (
                                <div key={idx} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50">
                                  <div>
                                    <div className="font-bold text-slate-800">{h.hostname || 'Perangkat Tanpa Nama'}</div>
                                    <div className="text-[10px] font-mono text-slate-400">
                                      MAC: <span className="text-slate-600">{h.mac || '-'}</span> • Jalur: {h.interface_type || 'Wi-Fi'}
                                    </div>
                                  </div>
                                  <span className="font-mono font-bold text-sky-700 text-xs bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100">
                                    {h.ip}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Quick Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button
                            onClick={() => handleRefreshDeviceObject(selectedDeviceForManage.id)}
                            disabled={isActionRunning}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw size={14} className={isActionRunning ? 'animate-spin' : ''} />
                            <span>Kirim Request Refresh Parameter (Inform)</span>
                          </button>

                          <button
                            onClick={() => handleRebootDevice(selectedDeviceForManage.id, selectedDeviceForManage.sn || selectedDeviceForManage.id)}
                            disabled={isActionRunning}
                            className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCw size={14} className={isActionRunning ? 'animate-spin' : ''} />
                            <span>⚡ Reboot ONT</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: WI-FI / WLAN */}
                    {manageTab === 'wifi' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-sky-50 border border-sky-100 rounded-2xl flex items-start gap-3">
                          <Wifi size={20} className="text-sky-600 mt-0.5 shrink-0" />
                          <div className="text-xs text-sky-900 leading-relaxed">
                            <strong className="block font-bold">Konfigurasi Wi-Fi Multi-SSID Jarak Jauh (CWMP TR-069)</strong>
                            Modem ini mendukung Multi-SSID. Anda dapat memilih SSID mana yang ingin diatur (SSID #1, #2, dll), mengubah nama, password, atau mengaktifkan/menonaktifkan radio.
                          </div>
                        </div>

                        {/* Multi-SSID Selector Chips */}
                        {deviceDetail?.wlans && deviceDetail.wlans.length > 0 && (
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase block tracking-wider">
                              Pilih Profil SSID (Multi-SSID Terdeteksi: {deviceDetail.wlans.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {deviceDetail.wlans.map((w: any) => (
                                <button
                                  key={w.index}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSsidIndex(w.index);
                                    setModalWifiSsid(w.ssid || '');
                                    setModalWifiEnabled(w.enabled ?? true);
                                    setModalWifiPassword('');
                                  }}
                                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${
                                    selectedSsidIndex === w.index
                                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <Wifi size={13} />
                                  <span>SSID #{w.index}: <strong className="font-mono">{w.ssid || `SSID-${w.index}`}</strong></span>
                                  {w.total_associations > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                      selectedSsidIndex === w.index ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                                    }`}>
                                      {w.total_associations} Klien
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Radio Switch */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                          <div>
                            <span className="font-extrabold text-xs text-slate-800 block">
                              Status Radio Wi-Fi (SSID #{selectedSsidIndex})
                            </span>
                            <span className="text-[11px] text-slate-500">Aktifkan atau nonaktifkan pemancar sinyal pada SSID #{selectedSsidIndex}</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={modalWifiEnabled}
                              onChange={(e) => setModalWifiEnabled(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                          </label>
                        </div>

                        {/* SSID Input */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nama Wi-Fi (SSID #{selectedSsidIndex}) *
                          </label>
                          <input
                            type="text"
                            required
                            value={modalWifiSsid}
                            onChange={(e) => setModalWifiSsid(e.target.value)}
                            placeholder="Contoh: HOTSPOT_ARABPAY atau NAMA_WIFI"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                          />
                        </div>

                        {/* Password Input */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Password Wi-Fi WPA2-PSK (SSID #{selectedSsidIndex}) *
                          </label>
                          <div className="relative">
                            <input
                              type={showWifiPassword ? 'text' : 'password'}
                              value={modalWifiPassword}
                              onChange={(e) => setModalWifiPassword(e.target.value)}
                              placeholder="Masukkan password baru (minimal 8 karakter, kosongkan jika tidak diubah)"
                              className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowWifiPassword(!showWifiPassword)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showWifiPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Biarkan kosong jika tidak ingin mengubah kata sandi Wi-Fi SSID ini.
                          </p>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-3 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveWifiConfig}
                            disabled={isWifiSaving || !modalWifiSsid}
                            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                          >
                            {isWifiSaving && <RefreshCw size={14} className="animate-spin" />}
                            <span>{isWifiSaving ? 'Menerapkan TR-069...' : `💾 Terapkan Wi-Fi SSID #${selectedSsidIndex}`}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: WAN / PPPOE */}
                    {manageTab === 'wan' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-start gap-3">
                          <Globe size={20} className="text-indigo-600 mt-0.5 shrink-0" />
                          <div className="text-xs text-indigo-900 leading-relaxed">
                            <strong className="block font-bold">Konfigurasi WAN / Akun PPPoE via TR-069</strong>
                            Suntikkan akun PPPoE dan VLAN ID langsung ke profil WAN ONT. Sangat berguna untuk aktivasi pelanggan baru tanpa perlu menyentuh antarmuka web ONT.
                          </div>
                        </div>

                        {/* Daftar Semua Koneksi WAN (Multi-WAN) */}
                        {deviceDetail?.wan_connections && deviceDetail.wan_connections.length > 0 && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Daftar Profil WAN Aktif di ONT ({deviceDetail.wan_connections.length} Profil)
                            </div>
                            <div className="divide-y divide-slate-200 text-xs">
                              {deviceDetail.wan_connections.map((wc: any, idx: number) => (
                                <div key={idx} className="py-2.5 flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                      <span className="font-mono text-sky-700">{wc.name}</span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-bold">{wc.type}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                      IP: <strong className="text-slate-800">{wc.ip || '0.0.0.0'}</strong> {wc.username ? `• Akun: ${wc.username}` : ''} {wc.vlan_id ? `• VLAN: ${wc.vlan_id}` : ''}
                                    </div>
                                  </div>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    {wc.status || 'Connected'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Current Status Box */}
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">IP WAN Saat Ini</span>
                            <span className="font-mono font-bold text-slate-800">{deviceDetail?.wan?.ip_address || '-'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Status Sambungan</span>
                            <span className="font-bold text-emerald-600">{deviceDetail?.wan?.connection_status || 'Connected'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block uppercase">MAC Address</span>
                            <span className="font-mono text-slate-600">{deviceDetail?.wan?.mac_address || '-'}</span>
                          </div>
                        </div>

                        {/* PPPoE Username */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Username PPPoE *</label>
                          <input
                            type="text"
                            required
                            value={modalWanUsername}
                            onChange={(e) => setModalWanUsername(e.target.value)}
                            placeholder="Contoh: ppp_ahmad@speednet"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* PPPoE Password */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Password PPPoE</label>
                          <div className="relative">
                            <input
                              type={showWanPassword ? 'text' : 'password'}
                              value={modalWanPassword}
                              onChange={(e) => setModalWanPassword(e.target.value)}
                              placeholder="Ketik password baru (biarkan kosong jika tidak diubah)"
                              className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowWanPassword(!showWanPassword)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showWanPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        {/* VLAN ID & Connection Index */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">VLAN ID (Opsional)</label>
                            <input
                              type="number"
                              value={modalWanVlan}
                              onChange={(e) => setModalWanVlan(e.target.value)}
                              placeholder="Contoh: 100"
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Indeks Profil WAN</label>
                            <input
                              type="text"
                              disabled
                              value={`Device.1 / PPP.${modalPppIndex}`}
                              className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-500"
                            />
                          </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-3 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveWanConfig}
                            disabled={isWanSaving || !modalWanUsername}
                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                          >
                            {isWanSaving && <RefreshCw size={14} className="animate-spin" />}
                            <span>{isWanSaving ? 'Menerapkan TR-069...' : '💾 Terapkan Konfigurasi WAN PPPoE'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB 4: TAUTKAN PELANGGAN */}
                    {manageTab === 'customer' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                          <Link2 size={20} className="text-emerald-600 mt-0.5 shrink-0" />
                          <div className="text-xs text-emerald-900 leading-relaxed">
                            <strong className="block font-bold">Sinkronisasi Kepemilikan Modem ONT</strong>
                            Hubungkan SN ONT ini dengan pelanggan di Arbill Billing. Pelanggan dapat melihat status redaman dan me-reboot ONT langsung dari Portal Pelanggan.
                          </div>
                        </div>

                        {/* Current Linked Status */}
                        {deviceDetail?.customer ? (
                          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">Pelanggan Saat Ini:</span>
                              <div className="font-extrabold text-sm text-slate-800">{deviceDetail.customer.name}</div>
                              <div className="text-xs text-sky-600 font-mono">
                                Kode: {deviceDetail.customer.customer_code} • PPPoE: {deviceDetail.customer.pppoe_username || '-'}
                              </div>
                            </div>
                            <button
                              onClick={() => handleLinkCustomer(null)}
                              disabled={isCustomerSaving}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                              <span>Lepas Tautan</span>
                            </button>
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold flex items-center gap-2">
                            <AlertCircle size={15} />
                            <span>Perangkat ini belum ditautkan ke akun pelanggan Arbill manapun.</span>
                          </div>
                        )}

                        {/* Search and Select Customer */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700">Pilih Pelanggan dari Database Arbill:</label>
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Cari nama, kode pelanggan, atau username PPPoE..."
                              value={customerSearchTerm}
                              onChange={(e) => setCustomerSearchTerm(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                            {filteredCustomers.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400 font-bold">
                                Tidak ada pelanggan yang cocok dengan pencarian.
                              </div>
                            ) : (
                              filteredCustomers.slice(0, 10).map((c) => (
                                <div
                                  key={c.id}
                                  onClick={() => setModalSelectedCustomerId(c.id)}
                                  className={`p-3 flex items-center justify-between hover:bg-sky-50 cursor-pointer transition-all ${
                                    modalSelectedCustomerId === c.id ? 'bg-sky-50 border-l-4 border-sky-600' : ''
                                  }`}
                                >
                                  <div>
                                    <div className="font-extrabold text-xs text-slate-800">{c.name}</div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                      <span className="font-mono text-sky-600">{c.customer_code}</span>
                                      {c.pppoe_username && <span>• {c.pppoe_username}</span>}
                                      {c.sn_onu && (
                                        <span className="text-amber-600 font-mono text-[10px]">
                                          (SN saat ini: {c.sn_onu})
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <input
                                    type="radio"
                                    name="selectedCustomer"
                                    checked={modalSelectedCustomerId === c.id}
                                    onChange={() => setModalSelectedCustomerId(c.id)}
                                    className="w-4 h-4 text-sky-600"
                                  />
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-3 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleLinkCustomer(modalSelectedCustomerId)}
                            disabled={isCustomerSaving || !modalSelectedCustomerId}
                            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                          >
                            {isCustomerSaving && <RefreshCw size={14} className="animate-spin" />}
                            <span>{isCustomerSaving ? 'Menyimpan...' : '🔗 Tautkan SN ke Pelanggan Terpilih'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* TAB 5: ZONA BAHAYA (MAINTENANCE) */}
                    {manageTab === 'danger' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                          <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm">
                            <AlertTriangle size={18} />
                            <span>Perhatian Khusus Operasi TR-069</span>
                          </div>
                          <p className="text-xs text-rose-700 leading-relaxed">
                            Perintah di tab ini akan langsung dieksekusi oleh ONT pelanggan begitu ONT terhubung ke GenieACS ACS. Harap gunakan dengan hati-hati.
                          </p>
                        </div>

                        {/* Reboot Card */}
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between">
                          <div>
                            <h4 className="font-extrabold text-xs text-slate-800">Reboot Perangkat ONT</h4>
                            <p className="text-[11px] text-slate-500">Mulai ulang perangkat ONU pelanggan dari jarak jauh via TR-069 CWMP.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRebootDevice(selectedDeviceForManage.id, selectedDeviceForManage.sn || selectedDeviceForManage.id)}
                            disabled={isActionRunning}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCw size={14} className={isActionRunning ? 'animate-spin' : ''} />
                            <span>Reboot ONT</span>
                          </button>
                        </div>

                        {/* Factory Reset Card */}
                        <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-2xl flex items-center justify-between">
                          <div>
                            <h4 className="font-extrabold text-xs text-rose-900">Kembalikan ke Setelan Pabrik (Factory Reset)</h4>
                            <p className="text-[11px] text-rose-600">
                              Hapus semua konfigurasi Wi-Fi, WAN, dan password modem kembali ke default bawaan pabrik.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFactoryResetDevice(selectedDeviceForManage.id, selectedDeviceForManage.sn || selectedDeviceForManage.id)}
                            disabled={isActionRunning}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            <span>Factory Reset</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                <span className="text-[11px] font-mono text-slate-400">
                  GenieACS NBI API • Port 7557
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDeviceForManage(null)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
