import React, { useState, useEffect } from 'react';
import {
  Router,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit,
  Trash2,
  Zap,
  ShieldCheck,
  Clock,
  Server,
  Globe,
  Wifi,
  Key,
  User,
  Activity,
  Radio,
  Eye,
  EyeOff,
  Sparkles,
  Shield,
  Lock
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { getApiUrl } from '../config/api';
import {
  getRoutersFromFirestore,
  saveRouterToFirestore,
  deleteRouterFromFirestore
} from '../services/firebaseService';
import RouterInterfaceModal from './RouterInterfaceModal';

export interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  api_port: number;
  username: string;
  password?: string;
  dns_name?: string;
  hotspot_ip?: string;
  snmp_enabled?: boolean;
  snmp_port?: number;
  snmp_community?: string;
  snmp_version?: string;
  snmp_username?: string;
  snmp_auth_proto?: 'SHA' | 'MD5';
  snmp_auth_pass?: string;
  snmp_priv_proto?: 'AES' | 'DES';
  snmp_priv_pass?: string;
  traffic_sampling_enabled?: boolean;
  status: 'online' | 'offline' | 'testing';
  last_synced?: string;
  profile_count?: number;
  created_at?: string;
}

export interface RouterProfileItem {
  id: string;
  router_id: string;
  name: string;
  type: 'pppoe' | 'hotspot';
  rate_limit?: string;
  synced_at?: string;
}

interface RouterManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function RouterManagement({ profile, t, onLogout }: RouterManagementProps) {
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRouter, setEditingRouter] = useState<RouterItem | null>(null);
  const [selectedRouterForProfiles, setSelectedRouterForProfiles] = useState<RouterItem | null>(null);
  const [selectedRouterForInterfaces, setSelectedRouterForInterfaces] = useState<RouterItem | null>(null);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileItem[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test Connection State
  const [testingConn, setTestingConn] = useState(false);
  const [testingCardId, setTestingCardId] = useState<string | null>(null);
  const [testConnResult, setTestConnResult] = useState<{ success: boolean; message: string } | null>(null);

  // SNMP State
  const [snmpEnabled, setSnmpEnabled] = useState(false);
  const [snmpPort, setSnmpPort] = useState('161');
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [snmpVersion, setSnmpVersion] = useState('v2c');
  const [snmpUsername, setSnmpUsername] = useState('arbill_snmp');
  const [snmpAuthProto, setSnmpAuthProto] = useState<'SHA' | 'MD5'>('SHA');
  const [snmpAuthPass, setSnmpAuthPass] = useState('');
  const [snmpPrivProto, setSnmpPrivProto] = useState<'AES' | 'DES'>('AES');
  const [snmpPrivPass, setSnmpPrivPass] = useState('');
  const [showSnmpPasswords, setShowSnmpPasswords] = useState(false);
  const [testingSnmp, setTestingSnmp] = useState(false);
  const [enablingSnmpId, setEnablingSnmpId] = useState<string | null>(null);
  const [testSnmpResult, setTestSnmpResult] = useState<{ success: boolean; message: string; sysName?: string; uptime?: string } | null>(null);
  const [trafficSamplingEnabled, setTrafficSamplingEnabled] = useState(true);
  const [togglingSamplingId, setTogglingSamplingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [dnsName, setDnsName] = useState('ar.net');
  const [hotspotIp, setHotspotIp] = useState('10.0.0.1');
  const [ipAddress, setIpAddress] = useState('30.30.0.1');
  const [apiPort, setApiPort] = useState('8728');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  const parseJsonResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error('Server Express (port 3006) belum berjalan. Jalankan `npm run server` di terminal.');
      }
      throw new Error(`Respons server bukan JSON (HTTP ${res.status})`);
    }
    return await res.json();
  };

  const handleDirectTestConnection = async (rtr: RouterItem) => {
    setTestingCardId(rtr.id);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip_address: rtr.ip_address,
          api_port: rtr.api_port,
          username: rtr.username,
          password: rtr.password || '',
          router_id: rtr.id
        })
      });
      const data = await parseJsonResponse(res);

      if (data.success) {
        setToastMsg({
          type: 'success',
          text: `⚡ Tes Koneksi Berhasil! Identity Mikrotik: "${data.identity || rtr.name}" (${rtr.ip_address}:${rtr.api_port}) | ${data.board || 'CCR Series'} (${data.version || 'RouterOS v7'})`
        });
      } else {
        setToastMsg({
          type: 'error',
          text: `⚠️ Gagal Tes Koneksi Router "${rtr.name}" (${rtr.ip_address}:${rtr.api_port}): ${data.message || 'API Port tidak merespon'}`
        });
      }
    } catch (err: any) {
      setToastMsg({
        type: 'error',
        text: `⚠️ Gagal Tes Koneksi: ${err?.message || 'Server Express offline'}`
      });
    } finally {
      setTestingCardId(null);
    }
  };

  const fetchRouters = async () => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl();
      let fetched = false;
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/routers`);
          const data = await parseJsonResponse(res);
          if (data.success && Array.isArray(data.routers)) {
            setRouters(data.routers);
            fetched = true;
          }
        } catch (apiErr) {
          console.warn('API fetch failed, falling back to direct Firestore:', apiErr);
        }
      }
      if (!fetched) {
        const fbData = await getRoutersFromFirestore();
        if (fbData.success && Array.isArray(fbData.routers)) {
          setRouters(fbData.routers as RouterItem[]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch routers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouters();
  }, []);

  const resetForm = () => {
    setName('');
    setDnsName('ar.net');
    setHotspotIp('10.0.0.1');
    setIpAddress('30.30.0.1');
    setApiPort('8728');
    setUsername('admin');
    setPassword('');
    setTestConnResult(null);
    setSnmpEnabled(false);
    setSnmpPort('161');
    setSnmpCommunity('public');
    setSnmpVersion('v2c');
    setSnmpUsername('arbill_snmp');
    setSnmpAuthProto('SHA');
    setSnmpAuthPass('');
    setSnmpPrivProto('AES');
    setSnmpPrivPass('');
    setShowSnmpPasswords(false);
    setTestSnmpResult(null);
    setTrafficSamplingEnabled(true);
  };

  const generateRandomSnmpV3Credentials = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
    const genPass = (len = 16) => {
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };
    const randSuffix = Math.random().toString(36).substring(2, 6);
    setSnmpUsername(`arbill_sec_${randSuffix}`);
    setSnmpAuthProto('SHA');
    setSnmpAuthPass(genPass(16));
    setSnmpPrivProto('AES');
    setSnmpPrivPass(genPass(16));
    setShowSnmpPasswords(true);
    setToastMsg({ type: 'success', text: '🎲 Kredensial SNMPv3 (SHA + AES) berhasil digenerate otomatis!' });
  };

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      setTestConnResult({ success: false, message: 'Harap isi IP Address router!' });
      return;
    }

    setTestingConn(true);
    setTestConnResult(null);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip_address: ipAddress.trim(),
          api_port: parseInt(apiPort) || 8728,
          username: username.trim(),
          password: password.trim(),
          router_id: editingRouter?.id || null
        })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        if (data.identity) {
          setName(data.identity);
        }
        setTestConnResult({
          success: true,
          message: data.message || `⚡ Tes Koneksi Live Berhasil! Identity Mikrotik Asli: "${data.identity}" | ${data.board} (${data.version})`
        });
      } else {
        setTestConnResult({
          success: false,
          message: data.message || '❌ Gagal terhubung ke Router.'
        });
      }
    } catch (err: any) {
      setTestConnResult({ success: false, message: `Gagal tes koneksi: ${err?.message || 'Server offline'}` });
    } finally {
      setTestingConn(false);
    }
  };

  const handleTestSnmp = async () => {
    if (!ipAddress.trim()) {
      setTestSnmpResult({ success: false, message: 'Harap isi IP Address router untuk tes SNMP!' });
      return;
    }

    setTestingSnmp(true);
    setTestSnmpResult(null);

    try {
      const apiUrl = getApiUrl();
      const body: any = {
        host: ipAddress.trim(),
        port: parseInt(snmpPort) || 161,
        community: snmpCommunity.trim() || 'public',
        version: snmpVersion,
        router_id: editingRouter?.id || null
      };
      if (snmpVersion === 'v3') {
        body.snmp_username = snmpUsername.trim() || 'arbill_snmp';
        body.snmp_auth_proto = snmpAuthProto;
        body.snmp_auth_pass = snmpAuthPass.trim();
        body.snmp_priv_proto = snmpPrivProto;
        body.snmp_priv_pass = snmpPrivPass.trim();
      }

      const res = await fetch(`${apiUrl}/api/routers/test-snmp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await parseJsonResponse(res);
      setTestSnmpResult(data);
    } catch (err: any) {
      setTestSnmpResult({ success: false, message: `Gagal tes SNMP: ${err?.message || 'Server offline'}` });
    } finally {
      setTestingSnmp(false);
    }
  };

  const handleDirectEnableSnmp = async (rtr: RouterItem) => {
    setEnablingSnmpId(rtr.id);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${rtr.id}/enable-snmp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          community: 'public',
          port: 161,
          version: 'v2c'
        })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchRouters();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengaktifkan SNMP di MikroTik.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal mengaktifkan SNMP: ${err.message}` });
    } finally {
      setEnablingSnmpId(null);
    }
  };

  const handleCreateRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !ipAddress.trim() || !username.trim()) {
      setToastMsg({ type: 'error', text: 'Nama router, IP Address, dan Username wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      let saved = false;
      const routerPayload = {
        name: name.trim(),
        dns_name: (dnsName || 'ar.net').trim(),
        hotspot_ip: (hotspotIp || '10.0.0.1').trim(),
        ip_address: ipAddress.trim(),
        api_port: parseInt(apiPort) || 8728,
        username: username.trim(),
        password: password.trim(),
        snmp_enabled: snmpEnabled,
        snmp_port: parseInt(snmpPort) || 161,
        snmp_community: snmpCommunity.trim() || 'public',
        snmp_version: snmpVersion,
        snmp_username: snmpUsername.trim() || 'arbill_snmp',
        snmp_auth_proto: snmpAuthProto,
        snmp_auth_pass: snmpAuthPass.trim(),
        snmp_priv_proto: snmpPrivProto,
        snmp_priv_pass: snmpPrivPass.trim(),
        traffic_sampling_enabled: trafficSamplingEnabled
      };

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/routers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routerPayload)
          });
          const data = await parseJsonResponse(res);
          if (data.success) {
            saved = true;
            await saveRouterToFirestore({ ...routerPayload, id: data.router?.id }).catch(() => null);
            setToastMsg({ type: 'success', text: data.message || `Router "${name}" berhasil didaftarkan!` });
            setShowAddModal(false);
            resetForm();
            fetchRouters();
            return;
          }
        } catch (apiErr) {
          console.warn('Backend API router create failed, fallback to Cloud Firestore:', apiErr);
        }
      }

      if (!saved) {
        await saveRouterToFirestore(routerPayload);
        setToastMsg({ type: 'success', text: `Router "${name}" berhasil disimpan ke Cloud Firestore!` });
        setShowAddModal(false);
        resetForm();
        fetchRouters();
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal mendaftarkan router: ${err?.message || 'Server error'}` });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (rtr: RouterItem) => {
    setEditingRouter(rtr);
    setName(rtr.name);
    setDnsName(rtr.dns_name || 'ar.net');
    setHotspotIp(rtr.hotspot_ip || '10.0.0.1');
    setIpAddress(rtr.ip_address);
    setApiPort(rtr.api_port.toString());
    setUsername(rtr.username);
    setPassword('');
    setTrafficSamplingEnabled(rtr.traffic_sampling_enabled !== false);
    setSnmpEnabled(Boolean(rtr.snmp_enabled));
    setSnmpPort((rtr.snmp_port || 161).toString());
    setSnmpCommunity(rtr.snmp_community || 'public');
    setSnmpVersion(rtr.snmp_version || 'v2c');
    setSnmpUsername(rtr.snmp_username || 'arbill_snmp');
    setSnmpAuthProto(rtr.snmp_auth_proto || 'SHA');
    setSnmpAuthPass(rtr.snmp_auth_pass || '');
    setSnmpPrivProto(rtr.snmp_priv_proto || 'AES');
    setSnmpPrivPass(rtr.snmp_priv_pass || '');
    setShowSnmpPasswords(false);
    setTestConnResult(null);
    setTestSnmpResult(null);
    setShowEditModal(true);
  };

  const handleUpdateRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRouter || !name.trim() || !ipAddress.trim() || !username.trim()) {
      setToastMsg({ type: 'error', text: 'Nama router, IP Address, dan Username wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = getApiUrl();
      let updated = false;
      const updatePayload = {
        id: editingRouter.id,
        name: name.trim(),
        dns_name: (dnsName || 'ar.net').trim(),
        hotspot_ip: (hotspotIp || '10.0.0.1').trim(),
        ip_address: ipAddress.trim(),
        api_port: parseInt(apiPort) || 8728,
        username: username.trim(),
        password: password.trim() || undefined,
        traffic_sampling_enabled: trafficSamplingEnabled,
        snmp_enabled: snmpEnabled,
        snmp_port: parseInt(snmpPort) || 161,
        snmp_community: snmpCommunity.trim() || 'public',
        snmp_version: snmpVersion,
        snmp_username: snmpUsername.trim() || 'arbill_snmp',
        snmp_auth_proto: snmpAuthProto,
        snmp_auth_pass: snmpAuthPass.trim(),
        snmp_priv_proto: snmpPrivProto,
        snmp_priv_pass: snmpPrivPass.trim()
      };

      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/routers/${editingRouter.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const data = await res.json();
          if (res.ok && data.success) {
            updated = true;
            await saveRouterToFirestore(updatePayload).catch(() => null);
            setToastMsg({ type: 'success', text: data.message || `Router "${name}" berhasil diperbarui!` });
            setShowEditModal(false);
            setEditingRouter(null);
            resetForm();
            fetchRouters();
            return;
          }
        } catch (apiErr) {
          console.warn('Backend API router update failed, fallback to Firestore:', apiErr);
        }
      }

      if (!updated) {
        await saveRouterToFirestore(updatePayload);
        setToastMsg({ type: 'success', text: `Router "${name}" berhasil diperbarui di Cloud Firestore!` });
        setShowEditModal(false);
        setEditingRouter(null);
        resetForm();
        fetchRouters();
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui data router: ' + (err?.message || 'Error') });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleTrafficSampling = async (rtr: RouterItem) => {
    const nextState = rtr.traffic_sampling_enabled === false ? true : false;
    setTogglingSamplingId(rtr.id);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${rtr.id}/toggle-traffic-sampling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({
          type: 'success',
          text: data.message || `Pengambilan data trafik ${nextState ? 'diaktifkan' : 'dinonaktifkan'}`
        });
        setRouters(prev => prev.map(item => item.id === rtr.id ? { ...item, traffic_sampling_enabled: nextState } : item));
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengubah status pengambilan data.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal toggle sampling: ${err.message}` });
    } finally {
      setTogglingSamplingId(null);
    }
  };

  const handleDeleteRouter = async (rtr: RouterItem) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data Router Mikrotik "${rtr.name}" (${rtr.ip_address})?`)) return;

    try {
      const apiUrl = getApiUrl();
      let deleted = false;
      if (apiUrl) {
        try {
          const res = await fetch(`${apiUrl}/api/routers/${rtr.id}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (data.success) {
            deleted = true;
            await deleteRouterFromFirestore(rtr.id).catch(() => null);
            setToastMsg({ type: 'success', text: data.message || 'Router berhasil dihapus.' });
            fetchRouters();
            return;
          }
        } catch (apiErr) {
          console.warn('Backend API router delete failed, fallback to Firestore:', apiErr);
        }
      }
      if (!deleted) {
        await deleteRouterFromFirestore(rtr.id);
        setToastMsg({ type: 'success', text: 'Router berhasil dihapus dari Cloud Firestore.' });
        fetchRouters();
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menghapus router: ' + (err?.message || 'Error') });
    }
  };

  const handleSyncRouterProfiles = async (rtr: RouterItem, syncType: 'pppoe' | 'hotspot' | 'all' = 'all') => {
    setSyncingId(`${rtr.id}-${syncType}`);
    setToastMsg(null);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${rtr.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_type: syncType })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchRouters();
        if (selectedRouterForProfiles?.id === rtr.id) {
          fetchRouterProfiles(rtr.id);
        }
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menyingkronkan profile dari router.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal terhubung ke Router Mikrotik API: ${err?.message || 'Error'}` });
    } finally {
      setSyncingId(null);
    }
  };

  const fetchRouterProfiles = async (routerId: string) => {
    setProfilesLoading(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/routers/${routerId}/profiles`);
      const data = await res.json();
      if (data.success && Array.isArray(data.profiles)) {
        setRouterProfiles(data.profiles);
      }
    } catch (err) {
      console.error('Failed to fetch router profiles:', err);
    } finally {
      setProfilesLoading(false);
    }
  };

  const handleViewProfiles = (rtr: RouterItem) => {
    setSelectedRouterForProfiles(rtr);
    fetchRouterProfiles(rtr.id);
  };

  const filteredRouters = routers.filter(rtr =>
    rtr.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rtr.ip_address.includes(searchTerm) ||
    rtr.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      {/* Header */}
      <HeaderBar
        title="Router Mikrotik (Multi-Router)"
        subtitle={`Total ${routers.length} Router Terhubung dengan Uji Tes Koneksi & Node RouterOS`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Toast */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Action & Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama router, IP address, atau username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchRouters}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data Router"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <Plus size={16} />
              <span>+ Tambah Router Mikrotik</span>
            </button>
          </div>
        </div>

        {/* Routers Grid */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
            <span className="text-xs font-semibold">Mengambil daftar router Mikrotik dari database...</span>
          </div>
        ) : filteredRouters.length === 0 ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100 text-sm">
            Belum ada Router Mikrotik yang terdaftar. Klik "+ Tambah Router Mikrotik" untuk menambahkan.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredRouters.map((rtr) => (
              <div
                key={rtr.id}
                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${rtr.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                      <Activity size={12} />
                      {rtr.status === 'online' ? '● Router Online' : '🔒 Router Offline'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">ID: {rtr.id}</span>
                  </div>

                  <h3 className="font-extrabold text-slate-800 text-base group-hover:text-[#2563EB] transition-colors">{rtr.name}</h3>
                  <div className="text-slate-500 font-mono text-xs font-bold mt-1 flex items-center gap-1.5">
                    <Server size={14} className="text-blue-600" />
                    <span>{rtr.ip_address}:{rtr.api_port}</span>
                  </div>
                </div>

                {/* Info Box */}
                <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <User size={14} className="text-slate-400" />
                      API Username
                    </span>
                    <span className="font-mono font-bold text-slate-800">{rtr.username}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Globe size={14} className="text-sky-500" />
                      Domain Hotspot
                    </span>
                    <span className="font-mono font-extrabold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 text-xs">
                      {rtr.dns_name || 'ar.net'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Wifi size={14} className="text-emerald-500" />
                      IP Hotspot (Login)
                    </span>
                    <span className="font-mono font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                      {rtr.hotspot_ip || '10.0.0.1'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Zap size={14} className="text-amber-500" />
                      Profile Disingkron
                    </span>
                    <button
                      onClick={() => handleViewProfiles(rtr)}
                      className="font-extrabold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md text-[11px] border border-indigo-200 transition-all cursor-pointer"
                    >
                      {rtr.profile_count || 0} Profile (Lihat)
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Radio size={14} className={rtr.snmp_enabled ? 'text-indigo-600' : 'text-slate-400'} />
                      Polling Trafik
                    </span>
                    {rtr.snmp_enabled ? (
                      <span className="font-mono font-extrabold text-[11px] flex items-center gap-1">
                        {rtr.snmp_version === 'v3' ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 shadow-2xs" title={`SNMPv3 User: ${rtr.snmp_username || 'arbill_snmp'} (AuthPriv SHA/AES)`}>
                            <ShieldCheck size={12} className="text-emerald-600" />
                            <span>SNMP v3 (UDP {rtr.snmp_port || 161})</span>
                          </span>
                        ) : (
                          <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            📡 SNMP {rtr.snmp_version || 'v2c'} (UDP {rtr.snmp_port || 161})
                          </span>
                        )}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                          ⚡ API
                        </span>
                        <button
                          onClick={() => handleDirectEnableSnmp(rtr)}
                          disabled={enablingSnmpId === rtr.id}
                          className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-[10px] rounded shadow-2xs cursor-pointer flex items-center gap-1 transition-all disabled:opacity-50"
                          title="Aktifkan SNMP di MikroTik secara otomatis via API (Tanpa buka terminal Winbox)"
                        >
                          <Zap size={10} className={enablingSnmpId === rtr.id ? 'animate-spin' : ''} />
                          <span>{enablingSnmpId === rtr.id ? 'Mengaktifkan...' : '⚡ Aktifkan SNMP'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <Activity size={14} className={rtr.traffic_sampling_enabled !== false ? 'text-emerald-500' : 'text-slate-400'} />
                      Ambil Data Trafik
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        rtr.traffic_sampling_enabled !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rtr.traffic_sampling_enabled !== false ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        <span>{rtr.traffic_sampling_enabled !== false ? 'Aktif' : 'Nonaktif'}</span>
                      </span>

                      <button
                        onClick={() => handleToggleTrafficSampling(rtr)}
                        disabled={togglingSamplingId === rtr.id}
                        className={`px-2 py-0.5 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer flex items-center gap-1 border ${
                          rtr.traffic_sampling_enabled !== false
                            ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-slate-200 hover:border-rose-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                        }`}
                        title={rtr.traffic_sampling_enabled !== false ? 'Hentikan pengambilan data trafik di background' : 'Nyalakan kembali pengambilan data trafik di background'}
                      >
                        {togglingSamplingId === rtr.id ? (
                          <RefreshCw size={10} className="animate-spin" />
                        ) : rtr.traffic_sampling_enabled !== false ? (
                          <span>⏸️ Jeda</span>
                        ) : (
                          <span>▶️ Aktifkan</span>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Singkron Terakhir:
                    </span>
                    <span className="font-mono">{rtr.last_synced ? new Date(rtr.last_synced).toLocaleString('id-ID') : 'Belum pernah'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedRouterForInterfaces(rtr)}
                    className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-[11px] rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.01]"
                    title="Buka Monitor Live Daftar Interface Port MikroTik"
                  >
                    <Activity size={13} />
                    <span>🔌 Monitor Port & Interface</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleSyncRouterProfiles(rtr, 'pppoe')}
                      disabled={syncingId === `${rtr.id}-pppoe`}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                      title="Hanya menarik PPP Profiles (PPPoE Bulanan) dari Mikrotik"
                    >
                      <Globe size={13} className={syncingId === `${rtr.id}-pppoe` ? 'animate-spin' : ''} />
                      <span>{syncingId === `${rtr.id}-pppoe` ? 'Menarik...' : '🌐 Tarik PPP Profile'}</span>
                    </button>

                    <button
                      onClick={() => handleSyncRouterProfiles(rtr, 'hotspot')}
                      disabled={syncingId === `${rtr.id}-hotspot`}
                      className="py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                      title="Hanya menarik Hotspot User Profiles (Voucher / Member) dari Mikrotik"
                    >
                      <Wifi size={13} className={syncingId === `${rtr.id}-hotspot` ? 'animate-spin' : ''} />
                      <span>{syncingId === `${rtr.id}-hotspot` ? 'Menarik...' : '📶 Tarik Hotspot Profile'}</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleDirectTestConnection(rtr)}
                      disabled={testingCardId === rtr.id}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-emerald-200 inline-flex items-center gap-1.5"
                      title="Tes koneksi live ke IP & Port Router API Mikrotik"
                    >
                      <Activity size={13} className={testingCardId === rtr.id ? 'animate-spin text-emerald-600' : 'text-emerald-600'} />
                      <span>{testingCardId === rtr.id ? 'Menguji...' : 'Tes Koneksi'}</span>
                    </button>
                    <button
                      onClick={() => openEditModal(rtr)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1"
                    >
                      <Edit size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteRouter(rtr)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-rose-200 inline-flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* View Router Profiles Modal */}
        {selectedRouterForProfiles && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-base text-slate-800">Daftar Profile Disingkron dari {selectedRouterForProfiles.name}</h3>
                    <p className="text-xs text-slate-500">IP: {selectedRouterForProfiles.ip_address}:{selectedRouterForProfiles.api_port}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedRouterForProfiles(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
              </div>

              <div className="p-6 max-h-[400px] overflow-y-auto">
                {profilesLoading ? (
                  <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                    <RefreshCw size={16} className="animate-spin text-indigo-600" />
                    <span>Memuat list profile...</span>
                  </div>
                ) : routerProfiles.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Belum ada profile yang disingkronkan dari router ini. Klik "⚡ Singkron Profile dari Router".
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {routerProfiles.map(p => (
                      <div key={p.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${p.type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}>
                            {p.type === 'pppoe' ? '🌐 PPP Profile' : '📶 Hotspot User Profile'}
                          </span>
                          <span className="font-mono font-extrabold text-slate-800 text-xs">{p.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-indigo-700 text-xs bg-indigo-50 px-2 py-0.5 rounded">{p.rate_limit || 'Tanpa Limit'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Tambah Router Baru */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-[#2563EB] flex items-center justify-center border border-blue-200">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Tambah Router Mikrotik Baru</h3>
                  <p className="text-xs text-slate-500">Konfigurasi API RouterOS dan SNMP Poller</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateRouter} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
                  {/* Kolom 1: Parameter Akses & API MikroTik */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]"></span>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Akses Router & Socket API</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Nama Router</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Router Mikrotik Utama"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Domain Hotspot</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: arab.net"
                          value={dnsName}
                          onChange={(e) => setDnsName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Domain voucher (misal: arab.net)</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">IP Hotspot (Gateway)</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: 10.0.0.1"
                          value={hotspotIp}
                          onChange={(e) => setHotspotIp(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Host login voucher (10.0.0.1)</span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">IP Address / Domain API</label>
                        <input
                          type="text"
                          required
                          placeholder="192.168.88.1"
                          value={ipAddress}
                          onChange={(e) => setIpAddress(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Host socket RouterOS API</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Port API (Default: 8728)</label>
                        <input
                          type="number"
                          required
                          placeholder="8728"
                          value={apiPort}
                          onChange={(e) => setApiPort(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Username Login Router</label>
                        <input
                          type="text"
                          required
                          placeholder="admin"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Password Login Router</label>
                      <input
                        type="password"
                        placeholder="Password Mikrotik..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                      />
                    </div>

                    {/* Tombol Test Socket API */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testingConn}
                        className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        <Radio size={14} className={testingConn ? 'animate-pulse text-amber-400' : 'text-emerald-400'} />
                        <span>{testingConn ? 'Menguji Koneksi Socket Mikrotik API...' : '⚡ Tes Koneksi Router Mikrotik (Node RouterOS)'}</span>
                      </button>

                      {testConnResult && (
                        <div className={`mt-2.5 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                          testConnResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                          {testConnResult.success ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                          <span className="text-[11px] leading-tight">{testConnResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kolom 2: SNMP Poller Settings */}
                  <div className="space-y-4">
                    {/* Background Traffic Sampling Switch */}
                    <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity size={16} className={trafficSamplingEnabled ? 'text-emerald-600' : 'text-slate-400'} />
                          <div>
                            <span className="text-xs font-extrabold text-slate-800">Ambil Data Trafik di Background</span>
                            <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${trafficSamplingEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                              {trafficSamplingEnabled ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={trafficSamplingEnabled}
                          onChange={(e) => setTrafficSamplingEnabled(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Jika diaktifkan, server secara otomatis membaca trafik router tiap 1 menit untuk grafik 30-menit & kuota harian. Jika dinonaktifkan, background polling tidak dijalankan.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">SNMP Poller (Sampling 1-Menit)</h4>
                    </div>

                    <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio size={16} className="text-indigo-600" />
                          <span className="text-xs font-extrabold text-slate-800">Aktifkan SNMP Poller</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={snmpEnabled}
                          onChange={(e) => setSnmpEnabled(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Menarik counter statistik trafik 64-bit via SNMP UDP port 161 setiap 1 menit ke Redis buffer, menghasilkan deteksi lonjakan trafik (True Peak) yang 100% akurat.
                      </p>

                      {snmpEnabled ? (
                        <div className="pt-2 border-t border-slate-200/80 space-y-3 animate-fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Port SNMP (UDP)</label>
                              <input
                                type="number"
                                value={snmpPort}
                                onChange={(e) => setSnmpPort(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="161"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Versi SNMP</label>
                              <select
                                value={snmpVersion}
                                onChange={(e) => setSnmpVersion(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                              >
                                <option value="v2c">v2c (64-bit Default)</option>
                                <option value="v3">v3 (AuthPriv - Enkripsi Teraman)</option>
                                <option value="v1">v1 (32-bit Legacy)</option>
                              </select>
                            </div>
                          </div>

                          {snmpVersion === 'v3' ? (
                            <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-200/80 space-y-3 animate-fade-in">
                              <div className="flex items-center justify-between pb-1.5 border-b border-indigo-200/60">
                                <div className="flex items-center gap-1.5 text-indigo-900 font-extrabold text-xs">
                                  <Shield size={14} className="text-indigo-600" />
                                  <span>Kredensial SNMPv3 (AuthPriv)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={generateRandomSnmpV3Credentials}
                                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 text-[11px] font-extrabold rounded-lg border border-amber-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                  title="Generate username dan password enkripsi acak yang kuat"
                                >
                                  <Sparkles size={12} className="text-amber-600" />
                                  <span>🎲 Generate Otomatis</span>
                                </button>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Username SNMPv3 (User / Community)</label>
                                <input
                                  type="text"
                                  value={snmpUsername}
                                  onChange={(e) => setSnmpUsername(e.target.value)}
                                  placeholder="arbill_snmp"
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Auth Protocol</label>
                                  <select
                                    value={snmpAuthProto}
                                    onChange={(e) => setSnmpAuthProto(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                  >
                                    <option value="SHA">SHA (Default)</option>
                                    <option value="MD5">MD5</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-slate-700">Authentication Password</label>
                                    <button
                                      type="button"
                                      onClick={() => setShowSnmpPasswords(!showSnmpPasswords)}
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      {showSnmpPasswords ? <EyeOff size={11} /> : <Eye size={11} />}
                                      <span>{showSnmpPasswords ? 'Tutup' : 'Lihat'}</span>
                                    </button>
                                  </div>
                                  <input
                                    type={showSnmpPasswords ? 'text' : 'password'}
                                    value={snmpAuthPass}
                                    onChange={(e) => setSnmpAuthPass(e.target.value)}
                                    placeholder="Min. 8 karakter password..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Privacy Protocol</label>
                                  <select
                                    value={snmpPrivProto}
                                    onChange={(e) => setSnmpPrivProto(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                  >
                                    <option value="AES">AES-128 (Default)</option>
                                    <option value="DES">DES</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Encryption Password</label>
                                  <input
                                    type={showSnmpPasswords ? 'text' : 'password'}
                                    value={snmpPrivPass}
                                    onChange={(e) => setSnmpPrivPass(e.target.value)}
                                    placeholder="Min. 8 karakter password..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200/80 text-[10px] text-emerald-800 leading-tight flex items-center gap-1.5">
                                <ShieldCheck size={13} className="shrink-0 text-emerald-600" />
                                <span>Trafik via port UDP {snmpPort} dienkripsi AES & diotentikasi SHA. 100% aman di internet.</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Community String</label>
                              <input
                                type="text"
                                value={snmpCommunity}
                                onChange={(e) => setSnmpCommunity(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="public"
                              />
                            </div>
                          )}

                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={handleTestSnmp}
                              disabled={testingSnmp}
                              className="w-full sm:w-auto px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Activity size={13} className={testingSnmp ? 'animate-spin' : ''} />
                              <span>{testingSnmp ? 'Menguji SNMP...' : '⚡ Tes Koneksi SNMP Live'}</span>
                            </button>

                            {testSnmpResult && (
                              <div className={`mt-2 p-2.5 rounded-xl border text-[11px] font-bold ${testSnmpResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                {testSnmpResult.message}
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 text-[10px] text-blue-700 leading-relaxed">
                            💡 <b>Tips:</b> Jika router menggunakan VPN / Remote Tunnel, isi Port SNMP dengan port forward tunnel UDP (misal: <code>4479</code>).
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-700">
                          SNMP dinonaktifkan. Pengambilan trafik akan menggunakan fallback polling API standar.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Footer: Pinned at bottom */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2 transition-all"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Router'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Router */}
      {showEditModal && editingRouter && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Config Router Mikrotik</h3>
                  <p className="text-xs text-slate-500">Ubah IP Address, Port, Password API, dan SNMP Poller</p>
                </div>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setEditingRouter(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateRouter} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
                  {/* Kolom 1: Parameter Akses & API MikroTik */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Akses Router & Socket API</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Nama Router</label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Domain Hotspot</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: arab.net"
                          value={dnsName}
                          onChange={(e) => setDnsName(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-indigo-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Domain voucher (misal: arab.net)</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">IP Hotspot (Gateway)</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: 10.0.0.1"
                          value={hotspotIp}
                          onChange={(e) => setHotspotIp(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Host login voucher (10.0.0.1)</span>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">IP Address / Domain API</label>
                        <input
                          type="text"
                          required
                          value={ipAddress}
                          onChange={(e) => setIpAddress(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                        <span className="text-[10px] text-slate-400">Host socket RouterOS API</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">API Port (Default: 8728)</label>
                        <input
                          type="number"
                          required
                          value={apiPort}
                          onChange={(e) => setApiPort(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Password Baru (Opsional)</label>
                      <input
                        type="password"
                        placeholder="Kosongkan jika tidak diubah..."
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                      />
                    </div>

                    {/* Tombol Test API */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={testingConn}
                        className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        <Radio size={14} className={testingConn ? 'animate-pulse text-amber-400' : 'text-emerald-400'} />
                        <span>{testingConn ? 'Menguji Koneksi Socket Mikrotik API...' : '⚡ Tes Koneksi Router Mikrotik (Node RouterOS)'}</span>
                      </button>

                      {testConnResult && (
                        <div className={`mt-2.5 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-fade-in ${
                          testConnResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                          {testConnResult.success ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                          <span className="text-[11px] leading-tight">{testConnResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kolom 2: Pengaturan Poller SNMP */}
                  <div className="space-y-4">
                    {/* Background Traffic Sampling Switch */}
                    <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity size={16} className={trafficSamplingEnabled ? 'text-emerald-600' : 'text-slate-400'} />
                          <div>
                            <span className="text-xs font-extrabold text-slate-800">Ambil Data Trafik di Background</span>
                            <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${trafficSamplingEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                              {trafficSamplingEnabled ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={trafficSamplingEnabled}
                          onChange={(e) => setTrafficSamplingEnabled(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Jika diaktifkan, server secara otomatis membaca trafik router tiap 1 menit untuk grafik 30-menit & kuota harian. Jika dinonaktifkan, background polling tidak dijalankan.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">SNMP Poller (Sampling 1-Menit)</h4>
                    </div>

                    <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio size={16} className="text-indigo-600" />
                          <span className="text-xs font-extrabold text-slate-800">Aktifkan SNMP Poller</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={snmpEnabled}
                          onChange={(e) => setSnmpEnabled(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Menarik counter statistik 64-bit via SNMP UDP port 161 setiap 1 menit ke Redis buffer, menghasilkan deteksi lonjakan trafik (True Peak) yang 100% akurat.
                      </p>

                      {snmpEnabled ? (
                        <div className="pt-2 border-t border-slate-200/80 space-y-3 animate-fade-in">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Port SNMP (UDP)</label>
                              <input
                                type="number"
                                value={snmpPort}
                                onChange={(e) => setSnmpPort(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="161"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Versi SNMP</label>
                              <select
                                value={snmpVersion}
                                onChange={(e) => setSnmpVersion(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                              >
                                <option value="v2c">v2c (64-bit Default)</option>
                                <option value="v3">v3 (AuthPriv - Enkripsi Teraman)</option>
                                <option value="v1">v1 (32-bit Legacy)</option>
                              </select>
                            </div>
                          </div>

                          {snmpVersion === 'v3' ? (
                            <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-200/80 space-y-3 animate-fade-in">
                              <div className="flex items-center justify-between pb-1.5 border-b border-indigo-200/60">
                                <div className="flex items-center gap-1.5 text-indigo-900 font-extrabold text-xs">
                                  <Shield size={14} className="text-indigo-600" />
                                  <span>Kredensial SNMPv3 (AuthPriv)</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={generateRandomSnmpV3Credentials}
                                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 text-[11px] font-extrabold rounded-lg border border-amber-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                  title="Generate username dan password enkripsi acak yang kuat"
                                >
                                  <Sparkles size={12} className="text-amber-600" />
                                  <span>🎲 Generate Otomatis</span>
                                </button>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">Username SNMPv3 (User / Community)</label>
                                <input
                                  type="text"
                                  value={snmpUsername}
                                  onChange={(e) => setSnmpUsername(e.target.value)}
                                  placeholder="arbill_snmp"
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Auth Protocol</label>
                                  <select
                                    value={snmpAuthProto}
                                    onChange={(e) => setSnmpAuthProto(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                  >
                                    <option value="SHA">SHA (Default)</option>
                                    <option value="MD5">MD5</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-slate-700">Authentication Password</label>
                                    <button
                                      type="button"
                                      onClick={() => setShowSnmpPasswords(!showSnmpPasswords)}
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      {showSnmpPasswords ? <EyeOff size={11} /> : <Eye size={11} />}
                                      <span>{showSnmpPasswords ? 'Tutup' : 'Lihat'}</span>
                                    </button>
                                  </div>
                                  <input
                                    type={showSnmpPasswords ? 'text' : 'password'}
                                    value={snmpAuthPass}
                                    onChange={(e) => setSnmpAuthPass(e.target.value)}
                                    placeholder="Min. 8 karakter password..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="sm:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Privacy Protocol</label>
                                  <select
                                    value={snmpPrivProto}
                                    onChange={(e) => setSnmpPrivProto(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                                  >
                                    <option value="AES">AES-128 (Default)</option>
                                    <option value="DES">DES</option>
                                  </select>
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Encryption Password</label>
                                  <input
                                    type={showSnmpPasswords ? 'text' : 'password'}
                                    value={snmpPrivPass}
                                    onChange={(e) => setSnmpPrivPass(e.target.value)}
                                    placeholder="Min. 8 karakter password..."
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200/80 text-[10px] text-emerald-800 leading-tight flex items-center gap-1.5">
                                <ShieldCheck size={13} className="shrink-0 text-emerald-600" />
                                <span>Trafik via port UDP {snmpPort} dienkripsi AES & diotentikasi SHA. 100% aman di internet.</span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">Community String</label>
                              <input
                                type="text"
                                value={snmpCommunity}
                                onChange={(e) => setSnmpCommunity(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                placeholder="public"
                              />
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={async () => {
                                if (!editingRouter) return;
                                if (snmpVersion === 'v3' && (!snmpAuthPass.trim() && !editingRouter.snmp_auth_pass)) {
                                  setToastMsg({ type: 'error', text: '⚠️ Harap isi Authentication Password & Encryption Password (min. 8 karakter) atau klik "🎲 Generate Otomatis" terlebih dahulu!' });
                                  return;
                                }
                                setTestingSnmp(true);
                                setTestSnmpResult(null);
                                try {
                                  const apiUrl = getApiUrl();
                                  const res = await fetch(`${apiUrl}/api/routers/${editingRouter.id}/enable-snmp`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      community: snmpVersion === 'v3' ? (snmpUsername.trim() || 'arbill_snmp') : (snmpCommunity.trim() || 'public'),
                                      port: parseInt(snmpPort) || 161,
                                      version: snmpVersion,
                                      snmp_username: snmpUsername.trim() || 'arbill_snmp',
                                      snmp_auth_proto: snmpAuthProto,
                                      snmp_auth_pass: snmpAuthPass.trim(),
                                      snmp_priv_proto: snmpPrivProto,
                                      snmp_priv_pass: snmpPrivPass.trim()
                                    })
                                  });
                                  const data = await parseJsonResponse(res);
                                  if (data.success) {
                                    setSnmpEnabled(true);
                                    setTestSnmpResult({ success: true, message: data.message });
                                    setToastMsg({ type: 'success', text: data.message });
                                    fetchRouters();
                                  } else {
                                    setTestSnmpResult({ success: false, message: data.message });
                                  }
                                } catch (e: any) {
                                  setTestSnmpResult({ success: false, message: e.message });
                                } finally {
                                  setTestingSnmp(false);
                                }
                              }}
                              disabled={testingSnmp}
                              className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Zap size={13} className={testingSnmp ? 'animate-spin' : ''} />
                              <span>{testingSnmp ? 'Mengaktifkan di MikroTik...' : '🚀 Aktifkan di MikroTik Otomatis (via API)'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleTestSnmp}
                              disabled={testingSnmp}
                              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Activity size={13} className={testingSnmp ? 'animate-spin' : ''} />
                              <span>{testingSnmp ? 'Menguji SNMP...' : '⚡ Tes Koneksi SNMP Live'}</span>
                            </button>
                          </div>

                          {testSnmpResult && (
                            <div className={`p-2.5 rounded-xl border text-[11px] font-bold ${testSnmpResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                              {testSnmpResult.message}
                            </div>
                          )}

                          <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 text-[10px] text-blue-700 leading-relaxed">
                            💡 <b>Tips:</b> Jika router menggunakan VPN / Remote Tunnel, isi Port SNMP dengan port forward tunnel UDP (misal: <code>4479</code>).
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-[11px] text-amber-700">
                          SNMP dinonaktifkan. Pengambilan trafik akan menggunakan fallback polling API standar.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Fixed Footer: Pinned at bottom */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingRouter(null); }}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2 transition-all"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Daftar Interface & Port MikroTik */}
      {selectedRouterForInterfaces && (
        <RouterInterfaceModal
          router={selectedRouterForInterfaces}
          onClose={() => setSelectedRouterForInterfaces(null)}
        />
      )}
    </div>
  );
}
