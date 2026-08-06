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
  Globe
} from 'lucide-react';
import HeaderBar from './HeaderBar';

interface GenieAcsManagementProps {
  profile: any;
  t: any;
  onLogout?: () => void;
}

export default function GenieAcsManagement({ profile, t, onLogout }: GenieAcsManagementProps) {
  const [activeTab, setActiveTab] = useState<'devices' | 'sync' | 'settings'>('devices');
  
  // GenieACS Server Settings State
  const [serverUrl, setServerUrl] = useState<string>('http://localhost:7557');
  const [nbiUsername, setNbiUsername] = useState<string>('');
  const [nbiPassword, setNbiPassword] = useState<string>('');
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

  // Wi-Fi Configuration Modal State
  const [selectedDeviceForWifi, setSelectedDeviceForWifi] = useState<any | null>(null);
  const [wifiSsid, setWifiSsid] = useState<string>('');
  const [wifiPassword, setWifiPassword] = useState<string>('');
  const [wifiSaving, setWifiSaving] = useState<boolean>(false);

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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const [sRes, dRes, cRes] = await Promise.all([
        fetch(`${apiUrl}/api/genieacs/settings`).catch(() => null),
        fetch(`${apiUrl}/api/genieacs/devices`).catch(() => null),
        fetch(`${apiUrl}/api/customers`).catch(() => null)
      ]);

      if (sRes) {
        const sData = await parseJsonResponse(sRes);
        if (sData.success && sData.settings) {
          setServerUrl(sData.settings.url || 'http://localhost:7557');
          setNbiUsername(sData.settings.username || '');
          setNbiPassword(sData.settings.password || '');
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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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

  // Reboot ONU Device via TR-069
  const handleRebootDevice = async (deviceId: string, deviceName: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin me-reboot ONU / ONT "${deviceName}"?`)) return;

    setActionLoadingId(deviceId);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
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
    }
  };

  // Open Wi-Fi Modal
  const openWifiModal = (dev: any) => {
    setSelectedDeviceForWifi(dev);
    setWifiSsid(dev.wifi_ssid || 'HOME-WIFI');
    setWifiPassword(dev.wifi_password || '12345678');
  };

  // Save Wi-Fi Config to ONU via TR-069
  const handleSaveWifiConfig = async () => {
    if (!selectedDeviceForWifi || !wifiSsid) return;

    setWifiSaving(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/genieacs/devices/${encodeURIComponent(selectedDeviceForWifi.id)}/wifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: wifiSsid,
          password: wifiPassword
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setSelectedDeviceForWifi(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui Wi-Fi ONU.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal simpan Wi-Fi: ${err.message}` });
    } finally {
      setWifiSaving(false);
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
      if (!matchSn && !matchModel && !matchCust) return false;
    }
    return true;
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
                    placeholder="Cari Serial Number (SN ONU), Model, Nama Pelanggan..."
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
                  onClick={handleSyncGenieAcsToCustomers}
                  disabled={syncLoading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncLoading ? 'animate-spin' : ''} />
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
                    <th className="py-3.5 px-4 text-right">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
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
                          <div className="font-mono font-black text-slate-900">{d.sn || d.id}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{d.manufacturer || 'ZTE / Huawei'}</div>
                        </td>

                        {/* Customer Name */}
                        <td className="py-3.5 px-4">
                          {d.customer_name ? (
                            <div>
                              <div className="font-extrabold text-slate-800">{d.customer_name}</div>
                              <div className="text-[10px] font-mono text-sky-600">{d.customer_code}</div>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              ⚠️ Belum Terhubung
                            </span>
                          )}
                        </td>

                        {/* Model */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          {d.product_class || 'F663NV3'}
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
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => openWifiModal(d)}
                            className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg transition-all cursor-pointer"
                            title="Konfigurasi Wi-Fi Remote TR-069"
                          >
                            <Wifi size={14} />
                          </button>

                          <button
                            onClick={() => handleRebootDevice(d.id, d.sn || d.id)}
                            disabled={actionLoadingId === d.id}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                            title="Reboot ONU via TR-069"
                          >
                            <RotateCw size={14} className={actionLoadingId === d.id ? 'animate-spin' : ''} />
                          </button>
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
                  placeholder="Contoh: http://30.30.0.175:7557 atau http://localhost:7557"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">NBI Username (Opsional)</label>
                  <input
                    type="text"
                    placeholder="Kosongkan jika tidak ada auth"
                    value={nbiUsername}
                    onChange={(e) => setNbiUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">NBI Password (Opsional)</label>
                  <input
                    type="password"
                    placeholder="Password API"
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

        {/* Modal Remote Wi-Fi Config */}
        {selectedDeviceForWifi && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
                    <Wifi size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Remote Setting Wi-Fi ONU</h3>
                    <p className="text-xs text-sky-200">{selectedDeviceForWifi.sn || selectedDeviceForWifi.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedDeviceForWifi(null)} className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer">&times;</button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Wi-Fi SSID *</label>
                  <input
                    type="text"
                    required
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Wi-Fi WPA2 *</label>
                  <input
                    type="text"
                    required
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={() => setSelectedDeviceForWifi(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                  <button
                    type="button"
                    onClick={handleSaveWifiConfig}
                    disabled={wifiSaving || !wifiSsid}
                    className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    {wifiSaving && <RefreshCw size={14} className="animate-spin" />}
                    <span>{wifiSaving ? 'Mengirim TR-069...' : '⚡ Kirim Perintah ke ONU'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
