import React, { useState, useEffect } from 'react';
import { CustomerMapModal } from './CustomerMapModal';
import { CustomerMapViewModal } from './CustomerMapViewModal';
import { 
  Users, 
  UserPlus, 
  Plus,
  MapPin,
  Search, 
  Wifi, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Phone, 
  Key, 
  Edit, 
  ShieldCheck, 
  Zap,
  Tag,
  Server,
  Radio,
  Package,
  Link2,
  Download,
  Power,
  Trash2,
  Calendar,
  Layers,
  FileText,
  Plug
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { 
  getCustomersFromFirestore, 
  saveCustomerToFirestore, 
  getPackagesFromFirestore, 
  getInvoicesFromFirestore, 
  saveInvoiceToFirestore 
} from '../services/firebaseService';
import { getApiUrl } from '../config/api';

const formatDateSafe = (dateVal: any): string => {
  if (!dateVal) return '-';
  if (typeof dateVal === 'string') {
    return dateVal.includes('T') ? dateVal.split('T')[0] : dateVal;
  }
  if (dateVal instanceof Date) {
    return dateVal.toISOString().split('T')[0];
  }
  if (typeof dateVal === 'object' && dateVal.seconds) {
    return new Date(dateVal.seconds * 1000).toISOString().split('T')[0];
  }
  return String(dateVal);
};

interface PackageItem {
  id: string;
  name: string;
  type: string;
  price: number;
  speed_limit: string;
  validity_days: number;
}

interface RouterItem {
  id: string;
  name: string;
  ip_address: string;
  api_port: number;
}

interface RouterProfileItem {
  id: string;
  router_id: string;
  name: string;
  type: string;
  rate_limit?: string;
  package_id?: string | null;
}

export interface CustomerItem {
  id: string;
  user_id?: string;
  customer_code?: string;
  name: string;
  phone_number?: string;
  address?: string;
  dusun?: string;
  desa?: string;
  kecamatan?: string;
  kabupaten?: string;
  provinsi?: string;
  connection_type: 'pppoe' | 'hotspot';
  pppoe_username?: string;
  pppoe_password?: string;
  static_ip?: string;
  installation_date?: string;
  expired_at?: string;
  grace_until?: string;
  odp_port?: string;
  sn_onu?: string;
  power_laser?: string;
  teknisi?: string;
  is_synced?: boolean;
  is_voucher?: boolean;
  package_id: string;
  router_id?: string | null;
  router_profile_id?: string | null;
  package_name?: string;
  package_price?: number;
  package_type?: string;
  speed_limit?: string;
  router_name?: string;
  router_ip?: string;
  router_profile_name?: string;
  router_profile_type?: string;
  status: 'active' | 'isolated' | 'non-active' | 'terminated' | string;
  linked_user_email?: string;
  arabpay_user_id?: string;
  latitude?: string;
  longitude?: string;
  maps_url?: string;
  created_at?: string;
}

interface CustomerManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function CustomerManagement({ profile, t, onLogout }: CustomerManagementProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<RouterProfileItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPackageFilter, setSelectedPackageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'non-active' | 'terminated'>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Map Location States
  const [showGlobalMapModal, setShowGlobalMapModal] = useState<boolean>(false);
  const [showMapPickerModal, setShowMapPickerModal] = useState<boolean>(false);
  const [mapCustomer, setMapCustomer] = useState<CustomerItem | null>(null);

  // Billing Detail Modal State
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingCustomer, setBillingCustomer] = useState<CustomerItem | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  // Live Mikrotik PPP Active Users & FTTH Map States
  const [onlineUsernames, setOnlineUsernames] = useState<string[]>([]);
  const [ftthNodes, setFtthNodes] = useState<any[]>([]);
  const [ftthLines, setFtthLines] = useState<any[]>([]);

  const isUserOnline = (c: CustomerItem) => {
    if (!c.pppoe_username) return false;
    return onlineUsernames.includes(c.pppoe_username.trim().toLowerCase());
  };

  const getFtthInfoForCustomer = (cust: CustomerItem) => {
    if (!cust || ftthNodes.length === 0) return null;

    // Match linked node on FTTH map by customer ID or username/name match
    const linkedNode = ftthNodes.find(n => 
      (n.customerId && String(n.customerId) === String(cust.id)) ||
      (n.name && cust.pppoe_username && n.name.toLowerCase().trim() === cust.pppoe_username.toLowerCase().trim()) ||
      (n.name && cust.name && n.name.toLowerCase().trim() === cust.name.toLowerCase().trim())
    );

    if (!linkedNode) return null;

    // Helper to trace parent ODP / ODC / Splitter for this linked node
    const traceParentOdp = (nodeId: string, visited = new Set<string>()): { odpName: string; odpType: string; port: number } | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const connectedCable = ftthLines.find(l => l.toId === nodeId || l.fromId === nodeId);
      if (!connectedCable) return null;

      const otherNodeId = connectedCable.fromId === nodeId ? connectedCable.toId : connectedCable.fromId;
      const otherNode = ftthNodes.find(n => n.id === otherNodeId);
      if (!otherNode) return null;

      if (otherNode.type === 'ODP' || otherNode.type === 'ODC' || otherNode.type === 'OLT' || otherNode.type === 'SPLITTER') {
        const portNum = connectedCable.fromId === otherNode.id ? (connectedCable.fromPort || 1) : (connectedCable.toPort || 1);
        return { odpName: otherNode.name || `${otherNode.type} #${otherNode.id.slice(-4)}`, odpType: otherNode.type, port: portNum };
      }

      return traceParentOdp(otherNode.id, visited);
    };

    const parentOdp = traceParentOdp(linkedNode.id);
    return {
      nodeName: linkedNode.name || `${linkedNode.type} #${linkedNode.id.slice(-4)}`,
      nodeType: linkedNode.type,
      odpName: parentOdp?.odpName || 'Belum Terhubung ODP',
      odpPort: parentOdp?.port || 1
    };
  };

  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);

  const fetchCustomerInvoices = async (cust: CustomerItem) => {
    let matchedInvoices: any[] = [];
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices?customer_id=${cust.id}`).catch(() => null);
      if (res && res.ok) {
        const data = await parseJsonResponse(res);
        if (data.success && Array.isArray(data.invoices) && data.invoices.length > 0) {
          matchedInvoices = data.invoices;
        }
      }
    } catch (err) {}

    // Fallback: Query Cloud Firestore if API didn't return invoices
    if (matchedInvoices.length === 0) {
      try {
        const fbRes = await getInvoicesFromFirestore();
        if (fbRes.success && Array.isArray(fbRes.invoices)) {
          matchedInvoices = fbRes.invoices.filter((inv: any) => 
            inv.customer_id === cust.id || 
            inv.customer_code === cust.customer_code ||
            (cust.phone_number && inv.customer_phone === cust.phone_number) ||
            (cust.pppoe_username && inv.pppoe_username === cust.pppoe_username)
          );
        }
      } catch (fbErr) {}
    }

    // Auto-generate current invoice if customer has no invoice yet
    if (matchedInvoices.length === 0) {
      const pkg = packages.find(p => p.id === cust.package_id);
      const pkgPrice = pkg ? Number(pkg.price) : 150000;
      const pkgName = pkg ? pkg.name : 'Paket Internet PPPoE';

      const generatedInvoice = {
        id: `INV-${Date.now().toString().slice(-6)}`,
        customer_id: cust.id,
        customer_code: cust.customer_code || `CUST-${cust.id.slice(-4)}`,
        customer_name: cust.name,
        customer_phone: cust.phone_number || '',
        pppoe_username: cust.pppoe_username || '',
        package_name: pkgName,
        amount: pkgPrice,
        status: cust.status === 'active' || cust.status === 'aktif' ? 'unpaid' : 'pending',
        month: new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };

      await saveInvoiceToFirestore(generatedInvoice).catch(() => null);
      matchedInvoices = [generatedInvoice];
    }

    setCustomerInvoices(matchedInvoices);
  };

  const openBillingModal = (cust: CustomerItem) => {
    setBillingCustomer(cust);
    setShowBillingModal(true);
    fetchCustomerInvoices(cust);
  };

  const handlePayInvoiceById = async (invId: string) => {
    setPayLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices/${invId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: 'Kasir / Tunai' })
      }).catch(() => null);

      if (res && res.ok) {
        const data = await parseJsonResponse(res);
        if (data.success) {
          setToastMsg({ type: 'success', text: data.message });
        }
      }

      // Always update Firestore invoice & customer status to paid & active
      const targetInv = customerInvoices.find(i => i.id === invId);
      if (targetInv) {
        const updatedInv = {
          ...targetInv,
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'Kasir / Tunai'
        };
        await saveInvoiceToFirestore(updatedInv).catch(() => null);
      }

      if (billingCustomer) {
        const updatedCust = { ...billingCustomer, status: 'active' };
        await saveCustomerToFirestore(updatedCust).catch(() => null);
        fetchCustomerInvoices(billingCustomer);
      }

      setToastMsg({ type: 'success', text: 'Tagihan berhasil dilunasi & status pelanggan AKTIF!' });
      fetchData();
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memproses pembayaran.' });
    } finally {
      setPayLoading(false);
    }
  };

  const handlePayBill = async () => {
    if (!billingCustomer) return;
    setPayLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${billingCustomer.id}/pay-bill`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        if (billingCustomer) {
          fetchCustomerInvoices(billingCustomer);
        }
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal melunasi tagihan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal bayar: ${err?.message || 'Error'}` });
    } finally {
      setPayLoading(false);
    }
  };

  // Sync & Disconnect Handlers
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleSyncCustomer = async (cust: CustomerItem) => {
    setActionLoadingId(cust.id);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${cust.id}/sync-to-mikrotik`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal sinkronisasi ke Mikrotik.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal Sync: ${err?.message || 'Error'}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDisconnectCustomer = async (cust: CustomerItem) => {
    if (!window.confirm(`Putuskan sesi koneksi aktif untuk "${cust.name}" (${cust.pppoe_username})?`)) return;
    setActionLoadingId(cust.id);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${cust.id}/disconnect-ppp`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal Diskonek: ${err?.message || 'Error'}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const handleCreateBatchInvoices = async () => {
    if (!confirm('Apakah Anda yakin ingin membuat tagihan masal untuk SELURUH pelanggan PPP aktif?')) return;
    setInvoiceLoading(true);
    setToastMsg(null);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices/create-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_type: 'pppoe' })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat tagihan masal.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal membuat tagihan masal.' });
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleCreateManualInvoice = async (cust: CustomerItem) => {
    setActionLoadingId(cust.id);
    setToastMsg(null);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices/create-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: cust.id, notes: `Tagihan Manual PPPoE - ${cust.name}` })
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat tagihan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal membuat tagihan.' });
    } finally {
      setActionLoadingId(null);
      openBillingModal(cust);
    }
  };

  // Form State (Matching Screenshot 2 - Personal Data & FTTH Technical Config)
  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [dusun, setDusun] = useState('');
  const [desa, setDesa] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [installationDate, setInstallationDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'active' | 'isolated' | 'non-active' | 'terminated'>('active');

  const [pppoeUsername, setPppoeUsername] = useState('');
  const [pppoePassword, setPppoePassword] = useState('');
  const [selectedRouterId, setSelectedRouterId] = useState<string>('');
  const [packageId, setPackageId] = useState<string>('');
  const [staticIp, setStaticIp] = useState('');
  const [connectionType, setConnectionType] = useState<'pppoe'>('pppoe');
  const [expiredAt, setExpiredAt] = useState<string>('');
  const [graceUntil, setGraceUntil] = useState<string>('');

  const [odpPort, setOdpPort] = useState('');
  const [snOnu, setSnOnu] = useState('');
  const [powerLaser, setPowerLaser] = useState('-19.00');
  const [teknisi, setTeknisi] = useState('');

  // Import Modal State (Matching Screenshot 3)
  const [importRouterId, setImportRouterId] = useState<string>('');
  const [updateExistingImport, setUpdateExistingImport] = useState(true);

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

  const fetchData = async () => {
    setLoading(true);
    let loadedCustomers: any[] = [];
    let loadedPackages: any[] = [];

    try {
      const apiUrl = getApiUrl();
      if (apiUrl) {
        const [resCust, resPkg, resRtr, resProf, resActive, resMap] = await Promise.all([
          fetch(`${apiUrl}/api/customers`).catch(() => null),
          fetch(`${apiUrl}/api/packages`).catch(() => null),
          fetch(`${apiUrl}/api/routers`).catch(() => null),
          fetch(`${apiUrl}/api/router-profiles`).catch(() => null),
          fetch(`${apiUrl}/api/routers/ppp-active-users`).catch(() => null),
          fetch(`${apiUrl}/api/ftth/map`).catch(() => null)
        ]);

        if (resCust && resCust.ok) {
          const dataCust = await parseJsonResponse(resCust).catch(() => null);
          if (dataCust && dataCust.success && Array.isArray(dataCust.customers)) {
            loadedCustomers = dataCust.customers;
          }
        }
        if (resPkg && resPkg.ok) {
          const dataPkg = await parseJsonResponse(resPkg).catch(() => null);
          if (dataPkg && dataPkg.success && Array.isArray(dataPkg.packages)) {
            loadedPackages = dataPkg.packages;
          }
        }
        if (resRtr && resRtr.ok) {
          const dataRtr = await parseJsonResponse(resRtr).catch(() => null);
          if (dataRtr && dataRtr.success && Array.isArray(dataRtr.routers)) {
            setRouters(dataRtr.routers);
            if (dataRtr.routers.length > 0 && !selectedRouterId) {
              setSelectedRouterId(dataRtr.routers[0].id);
              setImportRouterId(dataRtr.routers[0].id);
            }
          }
        }
        if (resProf && resProf.ok) {
          const dataProf = await parseJsonResponse(resProf).catch(() => null);
          if (dataProf && dataProf.success && Array.isArray(dataProf.profiles)) {
            setRouterProfiles(dataProf.profiles);
          }
        }
        if (resActive && resActive.ok) {
          const dataActive = await parseJsonResponse(resActive).catch(() => null);
          if (dataActive && dataActive.success && Array.isArray(dataActive.activeUsers)) {
            setPppActiveUsers(dataActive.activeUsers);
          }
        }
        if (resMap && resMap.ok) {
          const dataMap = await parseJsonResponse(resMap).catch(() => null);
          if (dataMap && dataMap.success && dataMap.mapData) {
            setFtthNodes(dataMap.mapData.nodes || []);
            setFtthEdges(dataMap.mapData.edges || []);
          }
        }
      }
    } catch (err: any) { }

    // Merge with Firebase Cloud Firestore for instant cloud persistence
    const fbCust = await getCustomersFromFirestore();
    if (fbCust.success && Array.isArray(fbCust.customers) && fbCust.customers.length > 0) {
      const existingIds = new Set(loadedCustomers.map((c: any) => String(c.id)));
      fbCust.customers.forEach((fc: any) => {
        if (!existingIds.has(String(fc.id))) {
          loadedCustomers.push(fc);
        }
      });
    }

    const fbPkg = await getPackagesFromFirestore();
    if (fbPkg.success && Array.isArray(fbPkg.packages) && fbPkg.packages.length > 0) {
      const existingPkgIds = new Set(loadedPackages.map((p: any) => String(p.id)));
      fbPkg.packages.forEach((fp: any) => {
        if (!existingPkgIds.has(String(fp.id))) {
          loadedPackages.push(fp);
        }
      });
    }

    setCustomers(loadedCustomers.filter((c: any) => c.connection_type === 'pppoe' || !c.connection_type || c.connection_type === 'ftth'));
    setPackages(loadedPackages.filter((p: any) => p.type === 'pppoe'));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-calculate Expired & Grace dates based on Tanggal Pasang/Aktif and Paket Internet
  const autoCalculateDates = (instDateStr: string, pkgIdToUse: string) => {
    const selectedPkg = packages.find(p => p.id === pkgIdToUse);
    const baseDate = instDateStr ? new Date(instDateStr) : new Date();

    if (isNaN(baseDate.getTime())) return;

    let valDays = selectedPkg?.validity_days || 30;
    const valUnit = (selectedPkg as any)?.validity_unit || 'month';
    const valVal = (selectedPkg as any)?.validity_value || 1;
    const graceDays = (selectedPkg as any)?.grace_period_days || 5;

    const expDate = new Date(baseDate);
    if (valUnit === 'month') {
      expDate.setMonth(expDate.getMonth() + valVal);
    } else {
      expDate.setDate(expDate.getDate() + valDays);
    }

    const graceDate = new Date(expDate);
    graceDate.setDate(graceDate.getDate() + graceDays);

    setExpiredAt(expDate.toISOString().split('T')[0]);
    setGraceUntil(graceDate.toISOString().split('T')[0]);
  };

  const handleInstallationDateChange = (newDateStr: string) => {
    setInstallationDate(newDateStr);
    autoCalculateDates(newDateStr, packageId);
  };

  const handlePackageChange = (newPkgId: string) => {
    setPackageId(newPkgId);
    autoCalculateDates(installationDate, newPkgId);
  };

  const resetForm = () => {
    const randomCode = `CUST-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const today = new Date().toISOString().split('T')[0];
    const initialPkgId = packages.length > 0 ? packages[0].id : '';

    setCustomerCode(randomCode);
    setName('');
    setPhoneNumber('');
    setEmail('');
    setAddress('');
    setDusun('');
    setDesa('');
    setKecamatan('');
    setKabupaten('');
    setProvinsi('');
    setInstallationDate(today);
    setStatus('active');

    setPppoeUsername('');
    setPppoePassword('');
    setStaticIp('');
    setConnectionType('pppoe');
    
    setOdpPort('');
    setSnOnu('');
    setPowerLaser('-19.00');
    setTeknisi('');

    if (routers.length > 0) setSelectedRouterId(routers[0].id);
    if (initialPkgId) {
      setPackageId(initialPkgId);
      autoCalculateDates(today, initialPkgId);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !packageId) {
      setToastMsg({ type: 'error', text: 'Nama Pelanggan dan Paket Internet wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const matchedProfile = routerProfiles.find(rp => rp.router_id === selectedRouterId && rp.package_id === packageId);

      const res = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: customerCode,
          name: name.trim(),
          phone_number: phoneNumber.trim(),
          address: address.trim(),
          dusun: dusun.trim() || null,
          desa: desa.trim() || null,
          kecamatan: kecamatan.trim() || null,
          kabupaten: kabupaten.trim() || null,
          provinsi: provinsi.trim() || null,
          connection_type: 'pppoe',
          pppoe_username: pppoeUsername.trim() || name.toLowerCase().replace(/\s+/g, ''),
          pppoe_password: pppoePassword.trim() || '123456',
          static_ip: staticIp.trim() || null,
          installation_date: installationDate,
          expired_at: expiredAt || null,
          grace_until: graceUntil || null,
          odp_port: odpPort.trim() || null,
          sn_onu: snOnu.trim() || null,
          power_laser: powerLaser.trim() || null,
          teknisi: teknisi.trim() || null,
          package_id: packageId,
          router_id: selectedRouterId || null,
          router_profile_id: matchedProfile ? matchedProfile.id : null,
          status
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowAddModal(false);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal merilis data pelanggan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal mendaftarkan pelanggan.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (cust: CustomerItem) => {
    setEditingCustomer(cust);
    const safeId = String(cust.id || Date.now());
    setCustomerCode(cust.customer_code || `CUST-${safeId.substring(0, 5).toUpperCase()}`);
    setName(cust.name || '');
    setPhoneNumber(cust.phone_number || '');
    setAddress(cust.address || '');
    setDusun(cust.dusun || '');
    setDesa(cust.desa || '');
    setKecamatan(cust.kecamatan || '');
    setKabupaten(cust.kabupaten || '');
    setProvinsi(cust.provinsi || '');

    const safeInstDate = typeof cust.installation_date === 'string' ? cust.installation_date : new Date().toISOString();
    setInstallationDate(safeInstDate.includes('T') ? safeInstDate.split('T')[0] : safeInstDate);

    setStatus((cust.status as any) || 'active');

    setPppoeUsername(cust.pppoe_username || '');
    setPppoePassword(cust.pppoe_password || '');
    setStaticIp(cust.static_ip || '');

    const safeExp = typeof cust.expired_at === 'string' ? cust.expired_at : '';
    setExpiredAt(safeExp.includes('T') ? safeExp.split('T')[0] : safeExp);

    const safeGrace = typeof cust.grace_until === 'string' ? cust.grace_until : '';
    setGraceUntil(safeGrace.includes('T') ? safeGrace.split('T')[0] : safeGrace);

    let autoOdp = cust.odp_port || '';
    try {
      const ftthConn = getFtthInfoForCustomer(cust);
      if (!autoOdp && ftthConn) {
        autoOdp = `${ftthConn.odpName || ''} (Port ${ftthConn.odpPort || 1})`;
      }
    } catch (e) { }
    setOdpPort(autoOdp);

    setSnOnu(cust.sn_onu || '');
    setPowerLaser(cust.power_laser || '-19.00');
    setTeknisi(cust.teknisi || '');

    if (cust.router_id) setSelectedRouterId(cust.router_id);
    if (cust.package_id) setPackageId(cust.package_id);

    setShowEditModal(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !name.trim() || !packageId) {
      setToastMsg({ type: 'error', text: 'Nama dan Paket Internet wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const matchedProfile = routerProfiles.find(rp => rp.router_id === selectedRouterId && rp.package_id === packageId);
      const pkg = packages.find(p => p.id === packageId);

      const updatedCustObj: CustomerItem = {
        ...editingCustomer,
        customer_code: customerCode,
        name: name.trim(),
        phone_number: phoneNumber.trim(),
        address: address.trim(),
        dusun: dusun.trim() || null,
        desa: desa.trim() || null,
        kecamatan: kecamatan.trim() || null,
        kabupaten: kabupaten.trim() || null,
        provinsi: provinsi.trim() || null,
        connection_type: 'pppoe',
        pppoe_username: pppoeUsername.trim(),
        pppoe_password: pppoePassword.trim(),
        static_ip: staticIp.trim() || null,
        installation_date: installationDate,
        expired_at: expiredAt || null,
        grace_until: graceUntil || null,
        odp_port: odpPort.trim() || null,
        sn_onu: snOnu.trim() || null,
        power_laser: powerLaser.trim() || null,
        teknisi: teknisi.trim() || null,
        package_id: packageId,
        package_name: pkg ? pkg.name : editingCustomer.package_name,
        router_id: selectedRouterId || null,
        router_profile_id: matchedProfile ? matchedProfile.id : null,
        status: status as any
      };

      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCustObj)
      }).catch(() => null);

      // Always save to Cloud Firestore as primary database
      await saveCustomerToFirestore(updatedCustObj).catch(() => null);

      // Update local state
      setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? updatedCustObj : c));

      setToastMsg({ type: 'success', text: `Data pelanggan "${updatedCustObj.name}" berhasil diperbarui!` });
      setShowEditModal(false);
      setEditingCustomer(null);
      fetchData();
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memperbarui data pelanggan.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleImportSecrets = async () => {
    if (!importRouterId) {
      setToastMsg({ type: 'error', text: 'Pilih Server Mikrotik terlebih dahulu!' });
      return;
    }

    setImportLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${importRouterId}/import-ppp-secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_existing: updateExistingImport })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowImportModal(false);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal impor secret PPP.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal impor: ${err?.message || 'Error'}` });
    } finally {
      setImportLoading(false);
    }
  };

  // Status Filter counts (Matching Live Mikrotik Active PPP Connections)
  const activeOnlineCount = customers.filter(c => c.status === 'active' && isUserOnline(c)).length;
  const activeOfflineCount = customers.filter(c => c.status === 'active' && !isUserOnline(c)).length;
  const nonActiveCount = customers.filter(c => c.status === 'isolated' || c.status === 'non-active' || c.status === 'off' || c.status === 'pending').length;
  const terminatedCount = customers.filter(c => c.status === 'terminated').length;

  // Package Distribution Counts (Right Card in Screenshot 1)
  const packageCounts: { [pkgName: string]: number } = {};
  customers.forEach(c => {
    const pName = c.package_name || 'Default Package';
    packageCounts[pName] = (packageCounts[pName] || 0) + 1;
  });

  // Filter Customers
  const filteredCustomers = customers.filter(c => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (c.name || '').toLowerCase().includes(term) ||
                          (c.customer_code || '').toLowerCase().includes(term) ||
                          (c.pppoe_username || '').toLowerCase().includes(term) ||
                          (c.phone_number || '').includes(term) ||
                          (c.address || '').toLowerCase().includes(term) ||
                          (c.dusun || '').toLowerCase().includes(term) ||
                          (c.desa || '').toLowerCase().includes(term) ||
                          (c.kecamatan || '').toLowerCase().includes(term) ||
                          (c.kabupaten || '').toLowerCase().includes(term) ||
                          (c.provinsi || '').toLowerCase().includes(term);
    const matchesPackage = selectedPackageFilter === 'all' || c.package_id === selectedPackageFilter;
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'online' && c.status === 'active' && isUserOnline(c)) ||
                          (statusFilter === 'offline' && c.status === 'active' && !isUserOnline(c)) ||
                          (statusFilter === 'non-active' && (c.status === 'isolated' || c.status === 'non-active' || c.status === 'off' || c.status === 'pending')) ||
                          (statusFilter === 'terminated' && c.status === 'terminated');
    return matchesSearch && matchesPackage && matchesStatus;
  });

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPackageFilter, statusFilter]);

  const totalItems = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      <HeaderBar
        title="Daftar Pelanggan"
        subtitle="Manajemen Pelanggan FTTH/PPPoE, Penagihan Bulanan, dan Integrasi Mikrotik Secret"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-6 lg:p-8 space-y-6 w-full">
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

        {/* Top Header Controls (Title & Import from Mikrotik Button - Matching Screenshot 1) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-2xl font-black font-sans text-slate-800 tracking-tight">Daftar Pelanggan Rumah</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { window.location.hash = '#/map-ftth'; }}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-sans font-bold text-xs rounded-xl shadow-md shadow-sky-100 flex items-center gap-2 transition-all cursor-pointer"
            >
              <MapPin size={15} />
              <span>🗺️ Peta Jaringan FTTH</span>
            </button>

            <button
              onClick={handleCreateBatchInvoices}
              disabled={invoiceLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs rounded-xl shadow-md shadow-indigo-100 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <FileText size={15} className={invoiceLoading ? 'animate-spin' : ''} />
              <span>{invoiceLoading ? 'Memproses Tagihan...' : '🧾 Buat Tagihan Masal'}</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-bold text-xs rounded-xl shadow-md shadow-blue-100 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>Impor dari Mikrotik</span>
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs rounded-xl shadow-md shadow-emerald-100 flex items-center gap-2 transition-all cursor-pointer"
            >
              <UserPlus size={15} />
              <span>+ Pelanggan Baru</span>
            </button>
          </div>
        </div>

        {/* Status Filter Badges (Matching Screenshot 1) */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setStatusFilter('online')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border ${
              statusFilter === 'online' 
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <Globe size={14} />
            <span>Active: Online</span>
            <span className="px-2 py-0.5 rounded-full bg-white text-emerald-800 text-[11px] font-black">{activeOnlineCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('offline')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border ${
              statusFilter === 'offline' 
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm' 
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <Power size={14} />
            <span>Active: Offline</span>
            <span className="px-2 py-0.5 rounded-full bg-white text-rose-800 text-[11px] font-black">{activeOfflineCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('non-active')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border ${
              statusFilter === 'non-active' 
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm' 
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertCircle size={14} />
            <span>Non-Active</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-black">{nonActiveCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('terminated')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border ${
              statusFilter === 'terminated' 
                ? 'bg-slate-700 text-white border-slate-700 shadow-sm' 
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <CloseIcon size={14} />
            <span>Terminated</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-600 text-white text-[11px] font-black">{terminatedCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              statusFilter === 'all' ? 'text-blue-600 underline' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Tampilkan Semua
          </button>
        </div>

        {/* Main Grid: Full Width Left Customer Table + Right Package Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (Customer Table - Expanded to col-span-9) */}
          <div className="lg:col-span-9 space-y-4">
            {/* Search & Package Filter Bar (Matching Screenshot 1) */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  placeholder="Cari Nama/Kode/User..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-800"
                />
              </div>

              <select
                value={selectedPackageFilter}
                onChange={(e) => setSelectedPackageFilter(e.target.value)}
                className="w-full sm:w-48 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Semua Paket</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <button
                onClick={fetchData}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <Search size={14} />
                <span>Cari</span>
              </button>

              <button
                onClick={() => { setSearchTerm(''); setSelectedPackageFilter('all'); setStatusFilter('all'); }}
                className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw size={14} />
                <span>Reset</span>
              </button>
            </div>

            {/* Table (Matching Screenshot 1 Layout) */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
                  <span className="text-xs font-semibold">Memuat daftar pelanggan PPPoE...</span>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Tidak ada pelanggan PPPoE yang cocok dengan kriteria pencarian.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase font-black tracking-wider text-slate-500">
                        <th className="py-3 px-4">Pelanggan</th>
                        <th className="py-3 px-4">Paket</th>
                        <th className="py-3 px-4">Username / IP</th>
                        <th className="py-3 px-4">Fisik Perangkat & Redaman FO & ODP LINK INFO</th>
                        <th className="py-3 px-4 text-center">Mikrotik Sync</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-sans">
                      {paginatedCustomers.map(cust => (
                        <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* PELANGGAN (with integrated status dot) */}
                          <td className="py-3.5 px-4 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${
                                cust.status === 'active' 
                                  ? (isUserOnline(cust) ? 'bg-emerald-500 shadow-xs shadow-emerald-300 animate-pulse' : 'bg-rose-500') 
                                  : 'bg-amber-500'
                              }`} title={cust.status === 'active' ? (isUserOnline(cust) ? 'Online di Mikrotik' : 'Offline') : cust.status} />
                              <span className="font-extrabold text-slate-800 text-xs">{cust.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono pl-4.5 flex items-center gap-1.5 flex-wrap">
                              <span>{cust.customer_code || `CUST-${cust.id.substring(0, 5).toUpperCase()}`}</span>
                              {cust.latitude && cust.longitude && (
                                <a
                                  href={cust.maps_url || `https://www.google.com/maps?q=${cust.latitude},${cust.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[9.5px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 hover:bg-sky-100 transition-all inline-flex items-center gap-1"
                                  title="Klik untuk membuka titik GPS di Google Maps"
                                >
                                  <span>📍 {Number(cust.latitude).toFixed(5)}, {Number(cust.longitude).toFixed(5)}</span>
                                </a>
                              )}
                            </div>
                          </td>

                          {/* PAKET */}
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 font-bold text-[11px] text-slate-700 inline-block">
                              {cust.package_name || 'Default Package'}
                            </span>
                          </td>

                          {/* USERNAME / IP */}
                          <td className="py-3.5 px-4 space-y-0.5 font-mono">
                            <div className="text-pink-600 font-bold text-xs">{cust.pppoe_username || '-'}</div>
                            <div className="text-slate-400 text-[11px]">{cust.static_ip || 'DHCP Pool'}</div>
                          </td>

                          {/* FISIK PERANGKAT & REDAMAN FO & ODP LINK INFO */}
                          <td className="py-3.5 px-4 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isUserOnline(cust) ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1 border border-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                                  <span>ONU ONLINE</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black inline-flex items-center gap-1 border border-rose-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  <span>ONU OFFLINE</span>
                                </span>
                              )}
                            </div>

                            {/* ODP Induk Link Info */}
                            {(() => {
                              const ftthInfo = getFtthInfoForCustomer(cust);
                              if (ftthInfo) {
                                return (
                                  <div className="text-[10px] font-mono font-extrabold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 inline-flex items-center gap-1 shadow-2xs" title={`Node: ${ftthInfo.nodeName} | Penyuplai ODP: ${ftthInfo.odpName} (Port #${ftthInfo.odpPort})`}>
                                    <span>🏢 {ftthInfo.odpName}</span>
                                    <span className="bg-purple-200 text-purple-950 px-1 py-0.2 rounded text-[9px] font-black">Port #{ftthInfo.odpPort}</span>
                                  </div>
                                );
                              }
                              return (
                                <div className="text-[9.5px] font-mono text-slate-400 italic">
                                  (Belum Ditautkan ke ODP Peta)
                                </div>
                              );
                            })()}

                            <div className="text-[10px] font-mono font-bold text-slate-600 flex items-center gap-1">
                              <span>⚡ Redaman:</span>
                              <span className={
                                parseFloat(cust.power_laser || '-19.5') < -27
                                  ? 'text-rose-600 font-extrabold'
                                  : parseFloat(cust.power_laser || '-19.5') < -23
                                  ? 'text-amber-600 font-extrabold'
                                  : 'text-emerald-700 font-extrabold'
                              }>
                                {cust.power_laser || '-19.50'} dBm
                              </span>
                            </div>
                          </td>

                          {/* MIKROTIK SYNC & DISCONNECT BUTTON COLUMN */}
                          <td className="py-3.5 px-4 text-center">
                            {!cust.is_synced ? (
                              <button
                                onClick={() => handleSyncCustomer(cust)}
                                disabled={actionLoadingId === cust.id}
                                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-extrabold text-[10px] inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="Update / Push data PPPoE ke Mikrotik"
                              >
                                {actionLoadingId === cust.id ? <RefreshCw size={11} className="animate-spin" /> : <Zap size={11} />}
                                <span>Sync Mikrotik</span>
                              </button>
                            ) : isUserOnline(cust) ? (
                              <button
                                onClick={() => handleDisconnectCustomer(cust)}
                                disabled={actionLoadingId === cust.id}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-[10px] inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="Koneksi Aktif (Online) - Klik untuk diskonek/putuskan agar reconnect ulang"
                              >
                                {actionLoadingId === cust.id ? <RefreshCw size={11} className="animate-spin" /> : <Plug size={11} />}
                                <span>Diskonek</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSyncCustomer(cust)}
                                disabled={actionLoadingId === cust.id}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-extrabold text-[10px] inline-flex items-center gap-1 transition-all cursor-pointer"
                                title="Sudah ter-sync di Mikrotik - Klik untuk Update Sync ulang"
                              >
                                {actionLoadingId === cust.id ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                <span>Synced</span>
                              </button>
                            )}
                          </td>

                          {/* AKSI */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {Boolean(
                                (cust as any).latitude || 
                                cust.maps_url || 
                                ftthNodes.some(n => 
                                  (n.customerId && String(n.customerId) === String(cust.id)) ||
                                  (n.name && cust.pppoe_username && n.name.toLowerCase().trim() === cust.pppoe_username.toLowerCase().trim()) ||
                                  (n.name && cust.name && n.name.toLowerCase().trim() === cust.name.toLowerCase().trim())
                                )
                              ) && (
                                <button 
                                  onClick={() => { window.location.hash = '#/map-ftth'; }}
                                  className="p-1.5 text-sky-600 hover:text-sky-700 rounded-lg hover:bg-sky-50 transition-all cursor-pointer"
                                  title="Lihat Lokasi Pelanggan di Peta FTTH"
                                >
                                  <MapPin size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => openEditModal(cust)} 
                                className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                                title="Edit Customer"
                              >
                                <Edit size={14} />
                              </button>
                              <button 
                                onClick={() => openBillingModal(cust)}
                                className="p-1.5 text-[#2563EB] hover:text-indigo-600 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                                title="Detail & Tagihan Pelanggan"
                              >
                                <FileText size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Footer */}
                  <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-sans">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Tampilkan</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-slate-400 font-medium">per halaman</span>
                      <span className="text-slate-400 font-medium ml-2">
                        (Menampilkan <strong className="text-slate-700">{totalItems > 0 ? startIndex + 1 : 0}-{endIndex}</strong> dari <strong className="text-slate-700">{totalItems}</strong> data)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        ‹ Prev
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                          .map((page, idx, arr) => (
                            <React.Fragment key={page}>
                              {idx > 0 && arr[idx - 1] !== page - 1 && (
                                <span className="px-1 text-slate-400 font-bold">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                                  currentPage === page
                                    ? 'bg-[#2563EB] text-white shadow-sm'
                                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalItems === 0}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (JUMLAH PER PAKET Summary Card) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-[#1E293B] text-white rounded-3xl p-5 shadow-sm border border-slate-800 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 pb-3 border-b border-slate-700">
                JUMLAH PER PAKET
              </h3>

              <div className="space-y-2 text-xs">
                {Object.keys(packageCounts).length === 0 ? (
                  <div className="text-slate-400 text-xs py-2">Belum ada statistik paket.</div>
                ) : (
                  Object.entries(packageCounts).map(([pkgName, count]) => (
                    <div key={pkgName} className="flex items-center justify-between py-2 border-b border-slate-700/50">
                      <span className="font-semibold text-slate-200">{pkgName}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-black text-xs">
                        {count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal Tambah / Edit Pelanggan PPPoE (2-Columns Layout Matching Screenshot 2) */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-5xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">
                    {showEditModal ? 'Edit Data Pelanggan PPPoE' : 'Tambah Pelanggan PPPoE Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Pengaturan Data Personal & Konfigurasi Teknis Mikrotik / FTTH</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingCustomer(null); }} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* 2-Columns Form Body Matching Screenshot 2 */}
            <form onSubmit={showEditModal ? handleUpdateCustomer : handleCreateCustomer} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column Kiri: Data Personal & Penagihan (Matching Screenshot 2) */}
                <div className="space-y-4">
                  <h4 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-2">
                    <Users size={14} className="text-blue-600" />
                    Data Personal & Penagihan
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Kode Pelanggan</label>
                      <input
                        type="text"
                        value={customerCode}
                        onChange={(e) => setCustomerCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap *</label>
                      <input
                        type="text"
                        required
                        placeholder="Nama pelanggan..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">No. WhatsApp</label>
                      <input
                        type="text"
                        placeholder="08123456789"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        placeholder="pelanggan@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Structured Address Block */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">📍 Detail Alamat Lengkap & Wilayah (Filter)</span>
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Dusun / RT RW / Alamat Jalan</label>
                      <input
                        type="text"
                        placeholder="Contoh: Dusun Krajan RT 02 RW 01 / Jl. Pemuda No. 5"
                        value={dusun}
                        onChange={(e) => setDusun(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Desa / Kelurahan</label>
                        <input
                          type="text"
                          placeholder="Desa Sukamaju"
                          value={desa}
                          onChange={(e) => setDesa(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Kecamatan</label>
                        <input
                          type="text"
                          placeholder="Kec. Majujaya"
                          value={kecamatan}
                          onChange={(e) => setKecamatan(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Kabupaten / Kota</label>
                        <input
                          type="text"
                          placeholder="Kab. Bandung"
                          value={kabupaten}
                          onChange={(e) => setKabupaten(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi</label>
                        <input
                          type="text"
                          placeholder="Jawa Barat"
                          value={provinsi}
                          onChange={(e) => setProvinsi(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pemasangan / Aktif *</label>
                      <input
                        type="date"
                        required
                        value={installationDate}
                        onChange={(e) => handleInstallationDateChange(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Status Pelanggan</label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      >
                        <option value="active">Active</option>
                        <option value="isolated">Isolated (Non-Active)</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Column Kanan: Konfigurasi Teknis Mikrotik / FTTH (Matching Screenshot 2) */}
                <div className="space-y-4 bg-slate-50 p-5 rounded-3xl border border-slate-200/80">
                  <h4 className="text-xs font-extrabold text-[#1E293B] uppercase tracking-wider pb-2 border-b border-slate-200 flex items-center gap-2">
                    <Server size={14} className="text-blue-600" />
                    Konfigurasi Teknis (Mikrotik/FTTH)
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-blue-600 mb-1">PPP Username *</label>
                      <input
                        type="text"
                        required
                        placeholder="puskomnet"
                        value={pppoeUsername}
                        onChange={(e) => setPppoeUsername(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-blue-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-blue-600 mb-1">PPP Password *</label>
                      <input
                        type="text"
                        required
                        placeholder="password"
                        value={pppoePassword}
                        onChange={(e) => setPppoePassword(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-blue-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mikrotik Server</label>
                      <select
                        value={selectedRouterId}
                        onChange={(e) => setSelectedRouterId(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      >
                        {routers.map(r => (
                          <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Paket Internet *</label>
                      <select
                        value={packageId}
                        onChange={(e) => handlePackageChange(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      >
                        {packages.map(pkg => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} (Rp {Number(pkg.price).toLocaleString('id-ID')})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Auto Calculated Date & IP Pool Hint Box */}
                  {(() => {
                    const matchedPkg = packages.find(p => p.id === packageId);
                    const matchedProf = routerProfiles.find(rp => rp.router_id === selectedRouterId && rp.package_id === packageId);
                    return (
                      <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-[11px] text-blue-900 space-y-1">
                        <div className="font-extrabold flex items-center justify-between">
                          <span>⚡ Auto-Calculated dari Tanggal Pasang + Paket:</span>
                          <span className="font-mono text-blue-700">{matchedPkg?.speed_limit || 'Speed Auto'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-semibold text-blue-800">
                          <span>Masa Aktif: +{matchedPkg?.validity_days || 30} Hari</span>
                          <span>Toleransi: +{(matchedPkg as any)?.grace_period_days || 5} Hari</span>
                        </div>
                        {matchedProf && (
                          <div className="text-[10px] font-bold text-indigo-700 pt-0.5 flex items-center gap-2">
                            <span>Profile: {matchedProf.name}</span>
                            {(matchedProf as any).remote_address && <span>• IP Pool: {(matchedProf as any).remote_address}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">IP Statis (Optional)</label>
                      <input
                        type="text"
                        placeholder="192.168.98.111"
                        value={staticIp}
                        onChange={(e) => setStaticIp(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Layanan</label>
                      <input
                        type="text"
                        disabled
                        value="PPPOE"
                        className="w-full px-3.5 py-2 bg-slate-200 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  {/* Expiration dates matching Screenshot 2 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-rose-600 mb-1">Masa Aktif Hingga (Expired)</label>
                      <input
                        type="date"
                        value={expiredAt}
                        onChange={(e) => setExpiredAt(e.target.value)}
                        className="w-full px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-mono font-bold text-rose-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-600 mb-1">Batas Toleransi (Grace Until)</label>
                      <input
                        type="date"
                        value={graceUntil}
                        onChange={(e) => setGraceUntil(e.target.value)}
                        className="w-full px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-900"
                      />
                    </div>
                  </div>

                  {/* FTTH ODP & ONU Details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-700">ODP Port</label>
                        {editingCustomer && (
                          <button
                            type="button"
                            onClick={() => {
                              const conn = getFtthInfoForCustomer(editingCustomer);
                              if (conn) {
                                setOdpPort(`${conn.odpName} (Port ${conn.odpPort})`);
                                alert(`✅ ODP Port berhasil disinkronkan dari Peta FTTH:\n\n${conn.odpName} (Port ${conn.odpPort})`);
                              } else {
                                alert('⚠️ Belum ada koneksi jalur kabel ODP yang terhubung ke titik rumah pelanggan ini di Peta FTTH.');
                              }
                            }}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                            title="Ambil data ODP terhubung otomatis dari Peta FTTH"
                          >
                            <Zap size={11} />
                            <span>Sync Peta FTTH</span>
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="Contoh: ODP-RUANG-01 (Port 4)"
                        value={odpPort}
                        onChange={(e) => setOdpPort(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">SN ONU / Modem</label>
                      <input
                        type="text"
                        placeholder="ZTEGCxxxxxx"
                        value={snOnu}
                        onChange={(e) => setSnOnu(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Power Laser (dBm)</label>
                      <input
                        type="text"
                        placeholder="-19.00"
                        value={powerLaser}
                        onChange={(e) => setPowerLaser(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Teknisi</label>
                      <input
                        type="text"
                        placeholder="Nama teknisi..."
                        value={teknisi}
                        onChange={(e) => setTeknisi(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button (Matching Screenshot 2: Simpan & Push Mikrotik) */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingCustomer(null); }} 
                  className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Batal
                </button>

                <button 
                  type="submit" 
                  disabled={submitLoading} 
                  className="px-6 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>💾 Simpan & Push Mikrotik</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor dari Mikrotik (Matching Screenshot 3) */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 bg-[#1E293B] text-white flex justify-between items-center">
              <h3 className="font-sans font-bold text-base">Pilih Server Mikrotik</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer">
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">PILIH SUMBER DATA</label>
                <select
                  value={importRouterId}
                  onChange={(e) => setImportRouterId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {routers.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.ip_address})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3.5 bg-cyan-50 border border-cyan-200 rounded-2xl text-xs text-cyan-900 flex items-start gap-2.5">
                <InfoIcon size={18} className="text-cyan-600 shrink-0 mt-0.5" />
                <span>Sistem akan mengambil data Secret PPP dan menyesuaikannya dengan database lokal.</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkUpdate"
                  checked={updateExistingImport}
                  onChange={(e) => setUpdateExistingImport(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="chkUpdate" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  Update data pelanggan yang sudah ada jika ditemukan
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={handleImportSecrets}
                  disabled={importLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
                >
                  {importLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Mulai Impor</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail & Tagihan Pelanggan */}
      {showBillingModal && billingCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-2xl shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-600 to-indigo-700 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center border border-white/20">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-white">
                    Detail & Tagihan Pelanggan
                  </h3>
                  <p className="text-xs text-blue-100">{billingCustomer.name} ({billingCustomer.customer_code || 'CUST'})</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowBillingModal(false); setBillingCustomer(null); }} 
                className="text-blue-100 hover:text-white font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-slate-50/50">
              {/* Card Customer Info */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">NAMA PELANGGAN</span>
                    <span className="text-sm font-extrabold text-slate-800">{billingCustomer.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">KODE PELANGGAN</span>
                    <span className="text-xs font-mono font-bold text-blue-600">{billingCustomer.customer_code || '-'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">PPP USERNAME</span>
                    <span className="font-mono font-bold text-pink-600">{billingCustomer.pppoe_username || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">IP STATIS</span>
                    <span className="font-mono font-bold text-slate-700">{billingCustomer.static_ip || 'DHCP Pool'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">ROUTER SERVER</span>
                    <span className="font-bold text-slate-700">{billingCustomer.router_name || 'Puskomnet'}</span>
                  </div>
                </div>
              </div>

              {/* Card Paket & Penagihan */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-100">
                  <span>RINCIAN PAKET & TEMPO TAGIHAN</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {billingCustomer.package_name || 'Paket Internet PPPoE'}
                  </span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">TARIF BULANAN</span>
                    <span className="text-sm font-black text-slate-900">
                      Rp {Number(billingCustomer.package_price || 100000).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">TANGGAL PASANG</span>
                    <span className="font-bold text-slate-700">
                      {formatDateSafe(billingCustomer.installation_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">EXPIRED HINGGA</span>
                    <span className="font-bold text-rose-600">
                      {formatDateSafe(billingCustomer.expired_at)}
                    </span>
                  </div>
                </div>

                {/* Status Penagihan Card */}
                {(() => {
                  const hasPending = customerInvoices.some((inv: any) => inv.status === 'pending');
                  const isExpired = billingCustomer.expired_at && new Date(billingCustomer.expired_at) < new Date();

                  if (hasPending) {
                    return (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50/60 rounded-2xl border border-amber-200 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">STATUS PEMBAYARAN PERIODE INI</span>
                          <div className="text-sm font-black text-amber-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>Belum Lunas / Dalam Tagihan</span>
                          </div>
                          <p className="text-[11px] text-amber-700/90 font-medium">
                            Batas Toleransi (Grace Until): <strong>{formatDateSafe(billingCustomer.grace_until)}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (!isExpired) {
                    return (
                      <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50/60 rounded-2xl border border-emerald-200 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">STATUS PEMBAYARAN PERIODE INI</span>
                          <div className="text-sm font-black text-emerald-900 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                            <span>Lunas / Tidak Ada Tagihan Pending</span>
                          </div>
                          <p className="text-[11px] text-emerald-700/90 font-medium">
                            Masa aktif langganan terbayar lunas hingga <strong>{formatDateSafe(billingCustomer.expired_at)}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="p-4 bg-gradient-to-r from-rose-50 to-red-50/60 rounded-2xl border border-rose-200 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">STATUS PEMBAYARAN PERIODE INI</span>
                        <div className="text-sm font-black text-rose-900 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                          <span>Masa Aktif Habis (Isolir)</span>
                        </div>
                        <p className="text-[11px] text-rose-700/90 font-medium">
                          Masa aktif telah berakhir pada <strong>{formatDateSafe(billingCustomer.expired_at)}</strong>
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* DAFTAR INVOICE & RIWAYAT TAGIHAN PELANGGAN */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      DAFTAR INVOICE & RIWAYAT TAGIHAN PELANGGAN
                    </h4>
                    <p className="text-[11px] text-slate-400">Daftar faktur tagihan resmi untuk {billingCustomer.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCreateManualInvoice(billingCustomer)}
                    disabled={actionLoadingId === billingCustomer.id}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Plus size={14} />
                    <span>⚡ + Buat Invoice Baru</span>
                  </button>
                </div>

                {customerInvoices.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Belum ada invoice yang diterbitkan untuk pelanggan ini. Klik <strong>"⚡ + Buat Invoice Baru"</strong> di atas untuk membuat invoice baru.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {customerInvoices.map((inv) => (
                      <div key={inv.id} className="p-3.5 bg-slate-50 hover:bg-blue-50/50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs transition-all">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-blue-700">{inv.invoice_number || inv.id || 'INV-001'}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {inv.status === 'paid' ? '✅ Lunas' : '⏳ Belum Lunas'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Issued: {formatDateSafe(inv.issue_date || inv.created_at)} | Due: <strong className="text-slate-700">{formatDateSafe(inv.due_date)}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-sm text-slate-800">
                            Rp {Number(inv.amount || 0).toLocaleString('id-ID')}
                          </span>
                          {inv.status !== 'paid' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePayInvoiceById(inv.id)}
                                disabled={payLoading}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-all disabled:opacity-50"
                              >
                                💳 Bayar
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
                                    const res = await fetch(`${apiUrl}/api/invoices/${inv.id}/send-wa`, { method: 'POST' });
                                    const data = await parseJsonResponse(res);
                                    setToastMsg({ type: data.success ? 'success' : 'error', text: data.message });
                                  } catch (err: any) {
                                    setToastMsg({ type: 'error', text: `Gagal WA: ${err?.message}` });
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-all flex items-center gap-1"
                                title="Kirim Pesan WA & Link Bayar ArabPay (1-Click)"
                              >
                                <span>📱 WA</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => { setShowBillingModal(false); setBillingCustomer(null); }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>🖨️ Cetak Struk</span>
                </button>

                <button
                  type="button"
                  onClick={handlePayBill}
                  disabled={payLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  {payLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{payLoading ? 'Memproses...' : '💳 Tandai Lunas / Bayar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Customer Map View Modal */}
      {showGlobalMapModal && (
        <CustomerMapViewModal
          customers={customers}
          onClose={() => setShowGlobalMapModal(false)}
        />
      )}

      {/* Single Customer Map Location Picker Modal */}
      {showMapPickerModal && mapCustomer && (
        <CustomerMapModal
          customer={mapCustomer}
          onClose={() => { setShowMapPickerModal(false); setMapCustomer(null); }}
          onSaved={() => { fetchData(); }}
        />
      )}
    </div>
  );
}

function PauseIcon(props: any) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="6" y="4" width="4" height="16"></rect>
      <rect x="14" y="4" width="4" height="16"></rect>
    </svg>
  );
}

function CloseIcon(props: any) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  );
}

function InfoIcon(props: any) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  );
}
