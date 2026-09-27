import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit,
  Trash2,
  Zap,
  ShieldCheck,
  Globe,
  Activity,
  Radio,
  Eye,
  EyeOff,
  Link2,
  Power,
  RotateCcw,
  Terminal,
  MapPin,
  Layers,
  Cpu,
  Gauge,
  Sliders,
  Sparkles,
  Wifi,
  X
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { getApiUrl } from '../config/api';

export interface OltItem {
  id: string;
  name: string;
  brand: 'zte' | 'huawei' | 'vsol' | 'hsgq' | 'bdcom' | 'fiberhome' | 'generic';
  model?: string;
  ip_address: string;
  ssh_port?: number;
  telnet_port?: number;
  protocol?: 'ssh' | 'telnet';
  username: string;
  password?: string;
  enable_password?: string;
  snmp_port?: number;
  snmp_community?: string;
  total_pon_ports?: number;
  linked_node_id?: string | null;
  linked_node_name?: string | null;
  linked_node_type?: string | null;
  customer_count?: number;
  status?: string;
  last_checked_at?: string;
  created_at?: string;
}

export interface MapNodeItem {
  id: string;
  name: string;
  type: string;
  lat: string | number;
  lng: string | number;
}

export interface OnuListItem {
  id?: string;
  olt_id?: string;
  pon_port: string | number;
  onu_id: number;
  sn: string;
  name?: string | null;
  customer_id?: string | null;
  status: 'online' | 'offline' | 'los' | 'dying-gasp' | 'unknown';
  distance_m?: number | null;
  rx_power?: number | null;
  tx_power?: number | null;
  rx_power_dbm?: number | null;
  tx_power_dbm?: number | null;
  olt_rx_power_dbm?: number | null;
  voltage?: number | null;
  temp?: number | null;
  bias_current?: number | null;
  line_profile?: string | null;
  srv_profile?: string | null;
  last_sync_at?: string | null;
  last_down_cause?: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  pppoe_username?: string | null;
  phone_number?: string | null;
  customer_status?: string | null;
  customer_address?: string | null;
}

interface OltManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function OltManagement({ profile, t, onLogout }: OltManagementProps) {
  const [olts, setOlts] = useState<OltItem[]>([]);
  const [availableMapNodes, setAvailableMapNodes] = useState<MapNodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'olts' | 'onus'>('olts');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form / Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOlt, setEditingOlt] = useState<OltItem | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [brand, setBrand] = useState<'zte' | 'huawei' | 'vsol' | 'hsgq' | 'bdcom' | 'fiberhome' | 'generic'>('zte');
  const [model, setModel] = useState('C320');
  const [ipAddress, setIpAddress] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [protocol, setProtocol] = useState<'ssh' | 'telnet'>('ssh');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [enablePassword, setEnablePassword] = useState('');
  const [totalPonPorts, setTotalPonPorts] = useState(8);
  const [linkedNodeId, setLinkedNodeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // SSH Test Terminal Modal State
  const [testingOltId, setTestingOltId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    system_info?: string;
    ping_time_ms?: number;
    raw_output?: string;
  } | null>(null);
  const [showConsoleModal, setShowConsoleModal] = useState(false);

  // ONU Monitor & Local Database Cache State
  const [selectedOltForOnu, setSelectedOltForOnu] = useState<string>('');
  const [selectedPonPort, setSelectedPonPort] = useState<string>('1');
  const [onus, setOnus] = useState<OnuListItem[]>([]);
  const [loadingOnus, setLoadingOnus] = useState(false);
  const [syncingOlt, setSyncingOlt] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(true);
  const [readingOpticalId, setReadingOpticalId] = useState<string | null>(null);
  const [opticalResults, setOpticalResults] = useState<{ [onuKey: string]: { rx: number | null; tx: number | null; olt_rx: number | null; raw?: string } }>({});
  const [rebootingId, setRebootingId] = useState<string | null>(null);
  const [uncfgList, setUncfgList] = useState<any[]>([]);
  const [scanningUncfg, setScanningUncfg] = useState(false);

  // Customers for link / registration
  const [customers, setCustomers] = useState<any[]>([]);

  // Manual Register ONU Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regPonPort, setRegPonPort] = useState('1');
  const [regOnuId, setRegOnuId] = useState('');
  const [regSn, setRegSn] = useState('');
  const [regName, setRegName] = useState('');
  const [regCustomerId, setRegCustomerId] = useState('');
  const [regLineProfile, setRegLineProfile] = useState('default');
  const [regSrvProfile, setRegSrvProfile] = useState('default');
  const [registering, setRegistering] = useState(false);

  // Link Customer Modal State
  const [linkingOnu, setLinkingOnu] = useState<OnuListItem | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedCustomerForLink, setSelectedCustomerForLink] = useState('');
  const [savingLink, setSavingLink] = useState(false);

  // Fetch OLTs list
  const fetchOlts = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts`);
      const data = await res.json();
      if (data.success) {
        setOlts(data.olts || []);
        setAvailableMapNodes(data.available_map_nodes || []);
        if (data.olts && data.olts.length > 0 && !selectedOltForOnu) {
          setSelectedOltForOnu(data.olts[0].id);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memuat daftar OLT' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Koneksi API gagal: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/customers`);
      const data = await res.json();
      if (Array.isArray(data)) setCustomers(data);
      else if (data.customers && Array.isArray(data.customers)) setCustomers(data.customers);
    } catch (_) {}
  };

  useEffect(() => {
    fetchOlts();
    fetchCustomers();
  }, []);

  const resetForm = () => {
    setName('');
    setBrand('zte');
    setModel('C320');
    setIpAddress('');
    setSshPort(22);
    setProtocol('ssh');
    setUsername('admin');
    setPassword('');
    setEnablePassword('');
    setTotalPonPorts(8);
    setLinkedNodeId('');
    setShowPassword(false);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item: OltItem) => {
    setEditingOlt(item);
    setName(item.name);
    setBrand(item.brand);
    setModel(item.model || 'C320');
    setIpAddress(item.ip_address);
    setSshPort(item.ssh_port || 22);
    setProtocol(item.protocol || 'ssh');
    setUsername(item.username);
    setPassword(item.password || '');
    setEnablePassword(item.enable_password || '');
    setTotalPonPorts(item.total_pon_ports || 8);
    setLinkedNodeId(item.linked_node_id || '');
    setShowPassword(false);
    setShowEditModal(true);
  };

  const handleCreateOlt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !ipAddress || !username || !password) {
      setToastMsg({ type: 'error', text: 'Nama OLT, IP Address, Username, dan Password wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand,
          model,
          ip_address: ipAddress,
          ssh_port: sshPort,
          protocol,
          username,
          password,
          enable_password: enablePassword,
          total_pon_ports: totalPonPorts,
          linked_node_id: linkedNodeId || null
        })
      });

      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowAddModal(false);
        resetForm();
        fetchOlts();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyimpan OLT.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal menyimpan OLT: ${err.message}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateOlt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOlt) return;

    setSubmitLoading(true);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${editingOlt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brand,
          model,
          ip_address: ipAddress,
          ssh_port: sshPort,
          protocol,
          username,
          password,
          enable_password: enablePassword,
          total_pon_ports: totalPonPorts,
          linked_node_id: linkedNodeId || null
        })
      });

      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowEditModal(false);
        setEditingOlt(null);
        fetchOlts();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui OLT.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal memperbarui OLT: ${err.message}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteOlt = async (item: OltItem) => {
    if (!window.confirm(`Hapus perangkat OLT "${item.name}" (${item.ip_address})?`)) return;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchOlts();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus OLT' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    }
  };

  const handleTestConnection = async (item: OltItem) => {
    setTestingOltId(item.id);
    setTestResult(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${item.id}/test-connection`, { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      setShowConsoleModal(true);
      fetchOlts();
    } catch (err: any) {
      setTestResult({ success: false, message: `Error: ${err.message}` });
      setShowConsoleModal(true);
    } finally {
      setTestingOltId(null);
    }
  };

  // Fetch ONU list for selected OLT and PON Port (Mendukung Cache Database Lokal)
  const fetchOnus = async (forceLive = false) => {
    if (!selectedOltForOnu) return;
    setLoadingOnus(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/onus?pon_port=${selectedPonPort}${forceLive ? '&live=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        setOnus(data.onus || []);
        setLastSyncAt(data.last_sync || null);
        setFromCache(Boolean(data.from_cache));
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membaca ONU dari OLT' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal load ONU: ${err.message}` });
    } finally {
      setLoadingOnus(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'onus' && selectedOltForOnu) {
      fetchOnus(false);
    }
  }, [activeTab, selectedOltForOnu, selectedPonPort]);

  // Tarik Data dari OLT via SSH (Sync Database Cache)
  const handleSyncOlt = async () => {
    if (!selectedOltForOnu) return;
    setSyncingOlt(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pon_port: selectedPonPort })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message || 'Sinkronisasi berhasil!' });
        fetchOnus(false);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal sinkronisasi data OLT' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal sync OLT: ${err.message}` });
    } finally {
      setSyncingOlt(false);
    }
  };

  // Registrasi ONU Baru Manual ke OLT & Database
  const handleRegisterOnu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOltForOnu) return;
    if (!regSn.trim()) {
      setToastMsg({ type: 'error', text: 'Nomor Serial (SN) ONU wajib diisi!' });
      return;
    }

    setRegistering(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/register-onu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pon_port: regPonPort || selectedPonPort,
          onu_id: regOnuId ? parseInt(regOnuId) : undefined,
          sn: regSn.trim(),
          name: regName.trim(),
          customer_id: regCustomerId || undefined,
          line_profile: regLineProfile || 'default',
          srv_profile: regSrvProfile || 'default'
        })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowRegisterModal(false);
        setRegSn('');
        setRegName('');
        setRegOnuId('');
        setRegCustomerId('');
        fetchOnus(false);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mendaftarkan ONU' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    } finally {
      setRegistering(false);
    }
  };

  // Hapus / Deregister ONU dari OLT
  const handleDeleteOnu = async (onu: OnuListItem) => {
    if (!selectedOltForOnu) return;
    if (!window.confirm(`Yakin ingin menghapus ONU ${onu.pon_port}:${onu.onu_id} (${onu.sn}) dari OLT dan database? Perangkat akan di-deregister!`)) return;

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/delete-onu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pon_port: onu.pon_port, onu_id: onu.onu_id })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setOnus(prev => prev.filter(o => !(String(o.pon_port) === String(onu.pon_port) && o.onu_id === onu.onu_id)));
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus ONU' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    }
  };

  // Simpan tautan pelanggan ke ONU
  const handleSaveLinkCustomer = async () => {
    if (!selectedOltForOnu || !linkingOnu) return;
    setSavingLink(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/link-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onu_db_id: linkingOnu.id || `${selectedOltForOnu}_${linkingOnu.pon_port}_${linkingOnu.onu_id}`,
          customer_id: selectedCustomerForLink || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowLinkModal(false);
        setLinkingOnu(null);
        fetchOnus(false);
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menautkan pelanggan' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    } finally {
      setSavingLink(false);
    }
  };

  // Uji koneksi SNMP ke OLT
  const handleTestSnmp = async (olt: OltItem) => {
    try {
      setToastMsg({ type: 'success', text: `Menguji SNMP ke ${olt.ip_address}:${olt.snmp_port || 161}...` });
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${olt.id}/test-snmp`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setToastMsg({
          type: 'success',
          text: `SNMP OK (${data.sysName || olt.name}) - Uptime: ${data.uptime || '-'}`
        });
      } else {
        setToastMsg({
          type: 'error',
          text: data.message || 'SNMP Timeout / Gagal terhubung'
        });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Uji SNMP gagal: ${err.message}` });
    }
  };

  // Read optical power for an ONU
  const handleCheckOpticalPower = async (onu: OnuListItem) => {
    const onuKey = `${onu.pon_port}:${onu.onu_id}`;
    setReadingOpticalId(onuKey);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/optical-power?pon_port=${onu.pon_port}&onu_id=${onu.onu_id}`);
      const data = await res.json();
      if (data.success && data.reading) {
        setOpticalResults(prev => ({
          ...prev,
          [onuKey]: {
            rx: data.reading.rx_power_dbm,
            tx: data.reading.tx_power_dbm,
            olt_rx: data.reading.olt_rx_power_dbm,
            raw: data.reading.raw_output
          }
        }));
        // Update di state onus agar langsung tampil di kolom Redaman
        setOnus(prev => prev.map(o => (String(o.pon_port) === String(onu.pon_port) && o.onu_id === onu.onu_id) ? { ...o, rx_power: data.reading.rx_power_dbm } : o));
        setToastMsg({
          type: 'success',
          text: `Redaman ONU ${onu.pon_port}:${onu.onu_id}: Rx ${data.reading.rx_power_dbm ?? '-'} dBm | OLT Rx ${data.reading.olt_rx_power_dbm ?? '-'} dBm`
        });
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membaca redaman optik' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal baca redaman: ${err.message}` });
    } finally {
      setReadingOpticalId(null);
    }
  };

  // Reboot ONU
  const handleRebootOnu = async (onu: OnuListItem) => {
    const onuKey = `${onu.pon_port}:${onu.onu_id}`;
    if (!window.confirm(`Kirim perintah REBOOT ke OLT untuk merestart modem ONU ${onu.pon_port}:${onu.onu_id} (${onu.customer_name || onu.sn})?`)) return;

    setRebootingId(onuKey);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/reboot-onu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pon_port: onu.pon_port, onu_id: onu.onu_id })
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal me-reboot ONU' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Error reboot: ${err.message}` });
    } finally {
      setRebootingId(null);
    }
  };

  // Scan unconfigured ONUs
  const handleScanUnconfigured = async () => {
    if (!selectedOltForOnu) return;
    setScanningUncfg(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/olts/${selectedOltForOnu}/unconfigured-onus`);
      const data = await res.json();
      if (data.success) {
        setUncfgList(data.unconfigured_onus || []);
        if (data.unconfigured_onus && data.unconfigured_onus.length > 0) {
          setToastMsg({ type: 'success', text: `Ditemukan ${data.unconfigured_onus.length} modem baru belum di-register!` });
        } else {
          setToastMsg({ type: 'success', text: 'Tidak ada modem baru yang belum di-register pada OLT ini.' });
        }
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message });
    } finally {
      setScanningUncfg(false);
    }
  };

  const filteredOlts = olts.filter(o => 
    o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.ip_address.includes(searchTerm) ||
    o.brand.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOltItem = olts.find(o => o.id === selectedOltForOnu);

  // Helper formatting attenuation color
  const getRxPowerBadge = (rxInput: number | string | null | undefined) => {
    if (rxInput === null || rxInput === undefined || rxInput === '') return <span className="text-slate-400 font-mono">-</span>;
    const rx = typeof rxInput === 'number' ? rxInput : parseFloat(String(rxInput));
    if (isNaN(rx)) return <span className="text-slate-400 font-mono">-</span>;

    if (rx >= -23.0 && rx <= -15.0) {
      return (
        <span className="px-2 py-0.5 rounded-full font-mono font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
          🟢 {rx.toFixed(2)} dBm (Bagus)
        </span>
      );
    }
    if (rx < -23.0 && rx >= -26.99) {
      return (
        <span className="px-2 py-0.5 rounded-full font-mono font-black text-xs bg-amber-100 text-amber-800 border border-amber-300">
          🟡 {rx.toFixed(2)} dBm (Waspada)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full font-mono font-black text-xs bg-rose-100 text-rose-800 border border-rose-300">
        🔴 {rx.toFixed(2)} dBm (Kritis / Drop)
      </span>
    );
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Manajemen Perangkat OLT & Kontrol ONU"
        subtitle="Kelola Perangkat OLT Fisik (ZTE, Huawei, VSOL, HSGQ) via SSH: Uji Redaman Optik, Status PON, dan Remote Reboot ONU"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Toast Alert */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-xs ${
            toastMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <div className="flex items-center gap-2.5">
              {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="cursor-pointer text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}

        {/* Top Stats Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">Total OLT Terdaftar</span>
              <span className="text-2xl font-black text-slate-800">{olts.length}</span>
              <span className="text-[11px] text-slate-500 block mt-0.5">Unit OLT Fisik</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl border border-blue-100 shadow-2xs">
              <Server size={22} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">Status SSH Siap</span>
              <span className="text-2xl font-black text-emerald-600">
                {olts.filter(o => o.status === 'online').length}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-0.5">Online & Responsif</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl border border-emerald-100 shadow-2xs">
              <Activity size={22} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">Total Port PON</span>
              <span className="text-2xl font-black text-indigo-600">
                {olts.reduce((acc, cur) => acc + (cur.total_pon_ports || 8), 0)}
              </span>
              <span className="text-[11px] text-indigo-600 block mt-0.5">Kanal Fiber Laser</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl border border-indigo-100 shadow-2xs">
              <Radio size={22} />
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 block mb-1">Tertaut Node Peta</span>
              <span className="text-2xl font-black text-amber-600">
                {olts.filter(o => o.linked_node_id).length}
              </span>
              <span className="text-[11px] text-amber-600 block mt-0.5">Dari {availableMapNodes.length} Node OLT Peta</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xl border border-amber-100 shadow-2xs">
              <MapPin size={22} />
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-3xl border border-slate-100 shadow-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('olts')}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'olts'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Server size={15} />
              <span>Daftar Perangkat OLT ({olts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('onus')}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'onus'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Gauge size={15} />
              <span>Monitor Port PON & Redaman ONU</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchOlts}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer font-bold disabled:opacity-50"
              title="Segarkan data OLT"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-md shadow-blue-100 flex items-center gap-2 cursor-pointer transition-all hover:scale-[1.02]"
            >
              <Plus size={16} />
              <span>+ Tambah Perangkat OLT</span>
            </button>
          </div>
        </div>

        {/* ================= TAB 1: DAFTAR OLT ================= */}
        {activeTab === 'olts' && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
              <Search size={18} className="text-slate-400 ml-1" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama OLT, IP address, atau merek (ZTE, Huawei, VSOL)..."
                className="w-full bg-transparent text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
              )}
            </div>

            {loading ? (
              <div className="p-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
                <RefreshCw size={24} className="animate-spin text-blue-600" />
                <span className="text-xs font-bold">Memuat daftar perangkat OLT dari server...</span>
              </div>
            ) : filteredOlts.length === 0 ? (
              <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 space-y-3">
                <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-2xl mx-auto border border-blue-100">
                  🔌
                </div>
                <h4 className="font-extrabold text-slate-800 text-base">Belum Ada Perangkat OLT yang Terdaftar</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Daftarkan OLT Anda (ZTE C300/C320, Huawei, VSOL, dll.) untuk memantau redaman optik dan merestart modem pelanggan langsung lewat SSH.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-2xl shadow-sm cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus size={15} />
                  <span>Daftarkan OLT Sekarang</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredOlts.map((olt) => (
                  <div
                    key={olt.id}
                    className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
                  >
                    <div>
                      {/* Header Badge */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border ${
                          olt.status === 'online'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${olt.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                          <span>{olt.status === 'online' ? 'SSH Ready' : 'Offline'}</span>
                        </span>

                        <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {olt.brand.toUpperCase()} {olt.model || ''}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-slate-800 text-base group-hover:text-blue-600 transition-colors flex items-center gap-2">
                        <span>{olt.name}</span>
                      </h3>

                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>IP & Port SSH</span>
                          <span className="font-mono font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            {olt.ip_address}:{olt.ssh_port || 22}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>Kapasitas PON</span>
                          <span className="font-bold text-slate-700">
                            {olt.total_pon_ports || 8} Port PON
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>Tautan Node Peta FTTH</span>
                          {olt.linked_node_name ? (
                            <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1 text-[11px]">
                              <MapPin size={11} />
                              <span>{olt.linked_node_name}</span>
                            </span>
                          ) : (
                            <span className="font-bold text-slate-400 italic text-[11px]">
                              Belum ditautkan
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-slate-500 pt-1.5 border-t border-slate-100">
                          <span>Pelanggan Terhubung</span>
                          <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                            {olt.customer_count || 0} Pelanggan
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTestConnection(olt)}
                          disabled={testingOltId === olt.id}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                          title="Uji koneksi SSH ke OLT"
                        >
                          <Terminal size={12} className={testingOltId === olt.id ? 'animate-spin' : ''} />
                          <span>{testingOltId === olt.id ? 'Menguji...' : 'Tes SSH'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTestSnmp(olt)}
                          className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Uji koneksi SNMP ke OLT"
                        >
                          <Activity size={12} />
                          <span>Tes SNMP</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOltForOnu(olt.id);
                            setSelectedPonPort('1');
                            setActiveTab('onus');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Buka monitor port PON dan redaman ONU"
                        >
                          <Gauge size={12} />
                          <span>Monitor ONU</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(olt)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                          title="Edit konfigurasi OLT"
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteOlt(olt)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                          title="Hapus OLT"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: MONITOR PORT PON & REDAMAN ONU ================= */}
        {activeTab === 'onus' && (
          <div className="space-y-4">
            {/* OLT & PON Port Selector Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Pilih Perangkat OLT</label>
                  <select
                    value={selectedOltForOnu}
                    onChange={(e) => setSelectedOltForOnu(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                  >
                    {olts.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.brand.toUpperCase()} - {o.ip_address})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Pilih Port PON</label>
                  <select
                    value={selectedPonPort}
                    onChange={(e) => setSelectedPonPort(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[130px]"
                  >
                    {Array.from({ length: selectedOltItem?.total_pon_ports || 8 }, (_, i) => i + 1).map(portNum => (
                      <option key={portNum} value={String(portNum)}>
                        Port PON {portNum}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedOltItem && (
                  <div className="self-end pb-1">
                    <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5">
                      <span>Protokol:</span>
                      <strong className="font-mono">{selectedOltItem.protocol?.toUpperCase()}</strong>
                      <span>(Port {selectedOltItem.ssh_port || 22})</span>
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <Zap size={13} className="text-amber-500 fill-amber-500" />
                  <span className="font-bold text-slate-700">Cache DB Lokal</span>
                  {lastSyncAt && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({new Date(lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSyncOlt}
                  disabled={syncingOlt}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                  title="Tarik data ONU live dari OLT via SSH dan simpan ke database"
                >
                  <RefreshCw size={14} className={syncingOlt ? 'animate-spin' : ''} />
                  <span>{syncingOlt ? 'Menyinkronkan...' : 'Tarik Data OLT (Sync SSH)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRegPonPort(selectedPonPort);
                    setRegOnuId('');
                    setRegSn('');
                    setRegName('');
                    setRegCustomerId('');
                    setShowRegisterModal(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus size={14} />
                  <span>+ Daftarkan ONU Manual</span>
                </button>

                <button
                  type="button"
                  onClick={handleScanUnconfigured}
                  disabled={scanningUncfg}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                  title="Pindai modem baru yang dicolok di lapangan tapi belum di-register"
                >
                  <Sparkles size={14} className={scanningUncfg ? 'animate-spin' : ''} />
                  <span>{scanningUncfg ? 'Memindai...' : 'Scan Modem Baru'}</span>
                </button>
              </div>
            </div>

            {/* Unconfigured ONUs Alert Box (if any found) */}
            {uncfgList.length > 0 && (
              <div className="p-4 rounded-3xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600" />
                    <strong className="text-xs font-black">
                      Ditemukan {uncfgList.length} Modem Baru Belum Di-Register (Unconfigured / Auto-Find):
                    </strong>
                  </div>
                  <button onClick={() => setUncfgList([])} className="text-xs text-amber-700 hover:text-amber-900 cursor-pointer">Tutup</button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                  {uncfgList.map((u, idx) => (
                    <div key={idx} className="bg-white p-2.5 rounded-xl border border-amber-200 text-xs font-mono flex items-center justify-between shadow-2xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Port: {u.pon_port}</span>
                        <strong className="text-slate-800 text-xs">{u.sn}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRegPonPort(String(u.pon_port).replace(/[^0-9]/g, '') || selectedPonPort);
                          setRegSn(u.sn);
                          setRegName(`ONU_${u.sn.substring(0, 6)}`);
                          setShowRegisterModal(true);
                        }}
                        className="px-2 py-1 rounded text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer transition-all"
                      >
                        + Daftarkan
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ONUs Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {loadingOnus ? (
                <div className="p-16 text-center text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw size={24} className="animate-spin text-blue-600" />
                  <span className="text-xs font-bold">Memuat data ONU dari database lokal (Port PON {selectedPonPort})...</span>
                </div>
              ) : onus.length === 0 ? (
                <div className="p-16 text-center text-slate-400 space-y-3">
                  <Radio size={36} className="mx-auto text-slate-300" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Tidak Ada ONU di Port PON {selectedPonPort}</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Klik tombol "Tarik Data OLT (Sync SSH)" untuk menarik data live dari OLT, atau klik "+ Daftarkan ONU Manual" untuk mendaftarkan modem baru.
                  </p>
                  <button
                    type="button"
                    onClick={handleSyncOlt}
                    disabled={syncingOlt}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} className={syncingOlt ? 'animate-spin' : ''} />
                    <span>Tarik Data OLT (Sync SSH)</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Port:ONU ID</th>
                        <th className="py-3 px-4">Serial Number (SN)</th>
                        <th className="py-3 px-4">Nama / Deskripsi</th>
                        <th className="py-3 px-4">Pelanggan Terkait</th>
                        <th className="py-3 px-4">Status Laser</th>
                        <th className="py-3 px-4">Jarak Kabel</th>
                        <th className="py-3 px-4">Redaman Optik (Rx dBm)</th>
                        <th className="py-3 px-4 text-right">Aksi Kontrol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {onus.map((onu) => {
                        const onuKey = `${onu.pon_port}:${onu.onu_id}`;
                        const opt = opticalResults[onuKey];
                        const isReadingOpt = readingOpticalId === onuKey;
                        const isRebooting = rebootingId === onuKey;
                        const rxVal = opt ? opt.rx : (onu.rx_power ?? onu.rx_power_dbm);

                        return (
                          <tr key={onuKey} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-mono font-black text-slate-800">
                              PON {onu.pon_port} : #{onu.onu_id}
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-slate-600">
                              {onu.sn}
                            </td>

                            <td className="py-3 px-4 text-slate-700 font-bold">
                              {onu.name || `ONU_${onu.onu_id}`}
                            </td>

                            <td className="py-3 px-4">
                              {onu.customer_name ? (
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <strong className="text-slate-800 font-extrabold block text-xs">{onu.customer_name}</strong>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {onu.pppoe_username ? `PPP: ${onu.pppoe_username}` : onu.customer_code}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLinkingOnu(onu);
                                      setSelectedCustomerForLink(onu.customer_id || '');
                                      setShowLinkModal(true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-all cursor-pointer"
                                    title="Ubah relasi pelanggan"
                                  >
                                    <Edit size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinkingOnu(onu);
                                    setSelectedCustomerForLink('');
                                    setShowLinkModal(true);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-all border border-blue-200"
                                >
                                  <Link2 size={11} />
                                  <span>+ Hubungkan</span>
                                </button>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                                onu.status === 'online'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : onu.status === 'dying-gasp'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  onu.status === 'online' ? 'bg-emerald-500' : onu.status === 'dying-gasp' ? 'bg-amber-500' : 'bg-rose-500'
                                }`}></span>
                                <span>{onu.status}</span>
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-slate-600">
                              {onu.distance_m ? `${onu.distance_m} m` : '-'}
                            </td>

                            <td className="py-3 px-4">
                              {rxVal !== null && rxVal !== undefined ? (
                                <div className="space-y-0.5">
                                  {getRxPowerBadge(rxVal)}
                                  {opt && opt.olt_rx !== null && opt.olt_rx !== undefined && (
                                    <span className="block text-[10px] text-slate-400 font-mono">
                                      OLT Rx: {Number(opt.olt_rx).toFixed(2)} dBm
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCheckOpticalPower(onu)}
                                  disabled={isReadingOpt}
                                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Radio size={11} className={isReadingOpt ? 'animate-spin text-blue-600' : ''} />
                                  <span>{isReadingOpt ? 'Membaca...' : 'Ukur Redaman'}</span>
                                </button>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCheckOpticalPower(onu)}
                                  disabled={isReadingOpt}
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold transition-all cursor-pointer disabled:opacity-50"
                                  title="Cek redaman optik live realtime dari OLT"
                                >
                                  <Radio size={13} className={isReadingOpt ? 'animate-spin' : ''} />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRebootOnu(onu)}
                                  disabled={isRebooting}
                                  className="px-2.5 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50"
                                  title="Kirim perintah restart ONU ke OLT"
                                >
                                  <RotateCcw size={11} className={isRebooting ? 'animate-spin' : ''} />
                                  <span>{isRebooting ? 'Rebooting...' : 'Reboot'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteOnu(onu)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                                  title="Hapus / Deregister ONU dari OLT & Database"
                                >
                                  <Trash2 size={13} />
                                </button>
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
          </div>
        )}
      </main>

      {/* ================= MODAL TAMBAH / EDIT OLT ================= */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Server size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">
                    {showEditModal ? 'Edit Perangkat OLT' : 'Tambah Perangkat OLT Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Konfigurasi Akses SSH & Pemetaan Node Peta FTTH</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingOlt(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={showEditModal ? handleUpdateOlt : handleCreateOlt} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama OLT *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: OLT Pusat C320"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Merek / Brand OLT *</label>
                  <select
                    value={brand}
                    onChange={(e) => {
                      const b = e.target.value as any;
                      setBrand(b);
                      if (b === 'zte') setModel('C320');
                      else if (b === 'huawei') setModel('MA5608T');
                      else if (b === 'vsol') setModel('V1600G1');
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="zte">ZTE (C300 / C320 / C220)</option>
                    <option value="huawei">Huawei (MA5608T / MA5683T / MA5800)</option>
                    <option value="vsol">VSOL (GPON / EPON Pizza Box)</option>
                    <option value="hsgq">HSGQ (GPON / EPON)</option>
                    <option value="bdcom">BDCom (GPON / EPON)</option>
                    <option value="fiberhome">FiberHome (AN5516)</option>
                    <option value="generic">Generic / Other OLT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">IP Address OLT *</label>
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="Contoh: 10.10.10.2 atau 192.168.1.100"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Port SSH</label>
                    <input
                      type="number"
                      value={sshPort}
                      onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Jumlah Port PON</label>
                    <select
                      value={totalPonPorts}
                      onChange={(e) => setTotalPonPorts(parseInt(e.target.value) || 8)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="4">4 Port PON</option>
                      <option value="8">8 Port PON</option>
                      <option value="16">16 Port PON</option>
                      <option value="32">32 Port PON</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Username Login SSH *</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin atau zte"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700">Password SSH *</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[10px] text-blue-600 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{showPassword ? 'Sembunyikan' : 'Lihat'}</span>
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password SSH OLT"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Enable Password (Opsional)</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={enablePassword}
                    onChange={(e) => setEnablePassword(e.target.value)}
                    placeholder="Khusus ZTE/Huawei mode enable"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tautkan ke Node Peta FTTH</label>
                  <select
                    value={linkedNodeId}
                    onChange={(e) => setLinkedNodeId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Tidak Ditautkan --</option>
                    {availableMapNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        📍 {n.name} ({n.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100 text-blue-900 text-[11px] space-y-1">
                <strong className="font-extrabold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-blue-600" />
                  Keamanan & Driver Otomatis:
                </strong>
                <p>
                  Kredensial SSH disimpan di database server Arbill. Driver secara otomatis menonaktifkan paging terminal (terminal length 0) dan mengeksekusi pembacaan redaman optik per milidetik.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Zap size={14} className={submitLoading ? 'animate-spin' : ''} />
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Perangkat OLT'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TERMINAL HASIL TES SSH ================= */}
      {showConsoleModal && testResult && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 text-slate-100 rounded-3xl w-full max-w-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" />
                <span className="font-mono text-xs font-bold">Hasil Uji Koneksi SSH OLT</span>
              </div>
              <button
                onClick={() => setShowConsoleModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto font-mono text-xs flex-1">
              <div className={`p-3 rounded-xl border flex items-center gap-2 ${
                testResult.success ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800' : 'bg-rose-950/40 text-rose-300 border-rose-800'
              }`}>
                {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{testResult.message}</span>
              </div>

              {testResult.ping_time_ms !== undefined && (
                <div className="text-slate-400 text-[11px]">
                  Response Latency: <strong className="text-emerald-400">{testResult.ping_time_ms} ms</strong>
                </div>
              )}

              {testResult.system_info && (
                <div className="space-y-1">
                  <span className="text-slate-400 text-[11px] block">Output CLI OLT (Version/Prompt):</span>
                  <pre className="p-3 bg-slate-950 rounded-xl text-emerald-400 text-[11px] border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                    {testResult.system_info}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowConsoleModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL REGISTRASI ONU MANUAL ================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg border border-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">Daftarkan ONU Baru Manual</h3>
                  <p className="text-xs text-slate-400">Registrasi modem langsung ke OLT {selectedOltItem?.name || ''}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterOnu} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Port PON *</label>
                  <select
                    value={regPonPort}
                    onChange={(e) => setRegPonPort(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {Array.from({ length: selectedOltItem?.total_pon_ports || 8 }, (_, i) => i + 1).map(p => (
                      <option key={p} value={String(p)}>Port PON {p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nomor ONU ID (1-128)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="128"
                    value={regOnuId}
                    onChange={(e) => setRegOnuId(e.target.value)}
                    placeholder="Auto (ID Kosong Terkecil)"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Biarkan kosong untuk otomatis</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Serial Number (SN) ONU *</label>
                <input
                  type="text"
                  value={regSn}
                  onChange={(e) => setRegSn(e.target.value)}
                  placeholder="Contoh: ZTEGc4a3583c atau HWTCb3b2e1a0"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama / Deskripsi ONU</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Contoh: Budi_Santoso atau Rumah_Pak_RT"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Hubungkan ke Pelanggan Arbill</label>
                <select
                  value={regCustomerId}
                  onChange={(e) => {
                    setRegCustomerId(e.target.value);
                    const selected = customers.find(c => c.id === e.target.value);
                    if (selected && !regName) {
                      setRegName(selected.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">-- Pilih Pelanggan (Opsional) --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.pppoe_username ? `PPP: ${c.pppoe_username}` : c.customer_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Line Profile</label>
                  <input
                    type="text"
                    value={regLineProfile}
                    onChange={(e) => setRegLineProfile(e.target.value)}
                    placeholder="default"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Srv Profile</label>
                  <input
                    type="text"
                    value={regSrvProfile}
                    onChange={(e) => setRegSrvProfile(e.target.value)}
                    placeholder="default"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <strong>Catatan Pendaftaran:</strong>
                <p>
                  Sistem Arbill akan mengirim perintah CLI ke OLT via SSH dan menyimpan nomor ONU ID & SN ini ke tabel database lokal, sehingga OLT tidak perlu di-polling terus-menerus.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus size={14} className={registering ? 'animate-spin' : ''} />
                  <span>{registering ? 'Mendaftarkan...' : 'Daftarkan ke OLT'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL HUBUNGKAN PELANGGAN ================= */}
      {showLinkModal && linkingOnu && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-md border border-slate-100 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Link2 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base">Hubungkan ONU ke Pelanggan</h3>
                  <p className="text-xs text-slate-400 font-mono">PON {linkingOnu.pon_port} : #{linkingOnu.onu_id} ({linkingOnu.sn})</p>
                </div>
              </div>
              <button
                onClick={() => { setShowLinkModal(false); setLinkingOnu(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Pilih Pelanggan Arbill</label>
                <select
                  value={selectedCustomerForLink}
                  onChange={(e) => setSelectedCustomerForLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="">-- [ Lepaskan Tautan / Belum Terhubung ] --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.pppoe_username ? `PPP: ${c.pppoe_username}` : c.customer_code}) {c.phone_number ? `- ${c.phone_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100 text-blue-900 text-[11px]">
                Dengan menautkan pelanggan, status laser ONU ({linkingOnu.status}) dan redaman optik live akan langsung tampil di kartu detail pelanggan dan titik peta FTTH.
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => { setShowLinkModal(false); setLinkingOnu(null); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveLinkCustomer}
                  disabled={savingLink}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} className={savingLink ? 'animate-spin' : ''} />
                  <span>{savingLink ? 'Menyimpan...' : 'Simpan Tautan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
