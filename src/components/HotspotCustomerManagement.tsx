import React, { useState, useEffect } from 'react';
import { CustomerMapModal } from './CustomerMapModal';
import { CustomerMapViewModal } from './CustomerMapViewModal';
import { 
  Wifi, 
  Search, 
  Plus, 
  RefreshCw, 
  Edit, 
  Trash2, 
  Send, 
  Download, 
  Server, 
  Zap, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  MapPin, 
  Tag, 
  UserCheck, 
  DollarSign, 
  FileText,
  AlertCircle,
  Users
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { CustomerItem as Customer } from './CustomerManagement';
import { getCustomersFromFirestore, getPackagesFromFirestore } from '../services/firebaseService';

interface HotspotCustomerManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
  onNavigateToInvoice?: (cust: Customer) => void;
}

export default function HotspotCustomerManagement({ 
  profile, 
  t, 
  onLogout,
  onNavigateToInvoice 
}: HotspotCustomerManagementProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [routers, setRouters] = useState<any[]>([]);
  const [routerProfiles, setRouterProfiles] = useState<any[]>([]);
  const [onlineUsernames, setOnlineUsernames] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPackageFilter, setSelectedPackageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'non-active' | 'terminated'>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Modals & Actions
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingCustomer, setBillingCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Map Location States
  const [showGlobalMapModal, setShowGlobalMapModal] = useState<boolean>(false);
  const [showMapPickerModal, setShowMapPickerModal] = useState<boolean>(false);
  const [mapCustomer, setMapCustomer] = useState<Customer | null>(null);
  
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchCustomerInvoices = async (cust: Customer) => {
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices?customer_id=${cust.id}`);
      const data = await parseJsonResponse(res);
      if (data.success && Array.isArray(data.invoices)) {
        setCustomerInvoices(data.invoices);
      }
    } catch (err) {}
  };

  const openBillingModal = (cust: Customer) => {
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
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        if (billingCustomer) {
          fetchCustomerInvoices(billingCustomer);
        }
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Gagal bayar: ${err?.message}` });
    } finally {
      setPayLoading(false);
    }
  };

  // Form State
  const [customerCode, setCustomerCode] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [dusun, setDusun] = useState('');
  const [desa, setDesa] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [kabupaten, setKabupaten] = useState('');
  const [provinsi, setProvinsi] = useState('');
  const [pppoeUsername, setPppoeUsername] = useState('');
  const [pppoePassword, setPppoePassword] = useState('');
  const [packageId, setPackageId] = useState('');
  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [status, setStatus] = useState<'active' | 'isolated' | 'non-active' | 'terminated'>('active');
  const [installationDate, setInstallationDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expiredAt, setExpiredAt] = useState<string>('');
  const [graceUntil, setGraceUntil] = useState<string>('');

  // Import State
  const [importRouterId, setImportRouterId] = useState('');
  const [updateExistingImport, setUpdateExistingImport] = useState(true);
  const [importLoading, setImportLoading] = useState(false);

  const parseJsonResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error('Server Express (port 3006) belum berjalan.');
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
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const [cRes, pRes, rRes, rpRes, actRes] = await Promise.all([
        fetch(`${apiUrl}/api/customers`).catch(() => null),
        fetch(`${apiUrl}/api/packages`).catch(() => null),
        fetch(`${apiUrl}/api/routers`).catch(() => null),
        fetch(`${apiUrl}/api/router-profiles`).catch(() => null),
        fetch(`${apiUrl}/api/routers/ppp-active-users`).catch(() => null)
      ]);

      if (cRes && cRes.ok) {
        const cData = await parseJsonResponse(cRes).catch(() => null);
        if (cData && cData.success && Array.isArray(cData.customers)) {
          loadedCustomers = cData.customers;
        }
      }
      if (pRes && pRes.ok) {
        const pData = await parseJsonResponse(pRes).catch(() => null);
        if (pData && pData.success && Array.isArray(pData.packages)) {
          loadedPackages = pData.packages;
        }
      }
      if (rRes && rRes.ok) {
        const rData = await parseJsonResponse(rRes).catch(() => null);
        if (rData && rData.success && Array.isArray(rData.routers)) setRouters(rData.routers);
      }
      if (rpRes && rpRes.ok) {
        const rpData = await parseJsonResponse(rpRes).catch(() => null);
        if (rpData && rpData.success && Array.isArray(rpData.profiles)) setRouterProfiles(rpData.profiles);
      }
      if (actRes && actRes.ok) {
        const actData = await parseJsonResponse(actRes).catch(() => null);
        if (actData && actData.success && Array.isArray(actData.onlineUsernames)) {
          setOnlineUsernames(actData.onlineUsernames);
        }
      }
    } catch (err: any) { }

    // Always merge with Firebase Cloud Firestore for instant serverless cloud sync
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

    setCustomers(loadedCustomers.filter((c: any) => c.connection_type === 'hotspot' && !c.is_voucher));
    setPackages(loadedPackages.filter((p: any) => p.type === 'hotspot_monthly'));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isUserOnline = (c: Customer) => {
    if (!c.pppoe_username) return false;
    return onlineUsernames.some(u => u.trim().toLowerCase() === c.pppoe_username.trim().toLowerCase());
  };

  const calculateDatesFromPackage = (pkgId: string, instDateStr: string) => {
    const selPkg = packages.find(p => p.id === pkgId);
    if (!selPkg) return;

    const baseDate = instDateStr ? new Date(instDateStr) : new Date();
    const vDays = selPkg.validity_days || 30;
    const expDate = new Date(baseDate);
    expDate.setDate(expDate.getDate() + vDays);

    const gDays = selPkg.grace_period_days || 5;
    const graceDate = new Date(expDate);
    graceDate.setDate(graceDate.getDate() + gDays);

    setExpiredAt(expDate.toISOString().split('T')[0]);
    setGraceUntil(graceDate.toISOString().split('T')[0]);
  };

  const handlePackageChange = (newPkgId: string) => {
    setPackageId(newPkgId);
    calculateDatesFromPackage(newPkgId, installationDate);
  };

  const handleInstallationDateChange = (newInstDate: string) => {
    setInstallationDate(newInstDate);
    if (packageId) {
      calculateDatesFromPackage(packageId, newInstDate);
    }
  };

  const resetForm = () => {
    setCustomerCode(`CUST-${Date.now()}`);
    setName('');
    setPhoneNumber('');
    setAddress('');
    setDusun('');
    setDesa('');
    setKecamatan('');
    setKabupaten('');
    setProvinsi('');
    setPppoeUsername('');
    setPppoePassword('');
    setPackageId(packages.length > 0 ? packages[0].id : '');
    setSelectedRouterId(routers.length > 0 ? routers[0].id : '');
    setStatus('active');
    
    const today = new Date().toISOString().split('T')[0];
    setInstallationDate(today);
    if (packages.length > 0) {
      calculateDatesFromPackage(packages[0].id, today);
    }
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCustomerCode(c.customer_code || '');
    setName(c.name);
    setPhoneNumber(c.phone_number || '');
    setAddress(c.address || '');
    setDusun(c.dusun || '');
    setDesa(c.desa || '');
    setKecamatan(c.kecamatan || '');
    setKabupaten(c.kabupaten || '');
    setProvinsi(c.provinsi || '');
    setPppoeUsername(c.pppoe_username || '');
    setPppoePassword(c.pppoe_password || '');
    setPackageId(c.package_id || '');
    setSelectedRouterId(c.router_id || '');
    setStatus(c.status || 'active');
    setInstallationDate(c.installation_date ? c.installation_date.split('T')[0] : new Date().toISOString().split('T')[0]);
    setExpiredAt(c.expired_at ? c.expired_at.split('T')[0] : '');
    setGraceUntil(c.grace_until ? c.grace_until.split('T')[0] : '');
    setShowEditModal(true);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !packageId) {
      setToastMsg({ type: 'error', text: 'Nama dan Paket Internet wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const matchedProfile = routerProfiles.find(rp => rp.router_id === selectedRouterId && (rp.package_id === packageId || rp.type === 'hotspot'));

      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: customerCode,
          name: name.trim(),
          phone_number: phoneNumber.trim() || null,
          address: address.trim() || null,
          dusun: dusun.trim() || null,
          desa: desa.trim() || null,
          kecamatan: kecamatan.trim() || null,
          kabupaten: kabupaten.trim() || null,
          provinsi: provinsi.trim() || null,
          connection_type: 'hotspot',
          pppoe_username: pppoeUsername.trim(),
          pppoe_password: pppoePassword.trim(),
          installation_date: installationDate,
          expired_at: expiredAt || null,
          grace_until: graceUntil || null,
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
        setToastMsg({ type: 'error', text: data.message || 'Gagal membuat pelanggan Hotspot.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal menambahkan pelanggan Hotspot.' });
    } finally {
      setSubmitLoading(false);
    }
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
      const matchedProfile = routerProfiles.find(rp => rp.router_id === selectedRouterId && (rp.package_id === packageId || rp.type === 'hotspot'));

      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: customerCode,
          name: name.trim(),
          phone_number: phoneNumber.trim() || null,
          address: address.trim() || null,
          dusun: dusun.trim() || null,
          desa: desa.trim() || null,
          kecamatan: kecamatan.trim() || null,
          kabupaten: kabupaten.trim() || null,
          provinsi: provinsi.trim() || null,
          connection_type: 'hotspot',
          pppoe_username: pppoeUsername.trim(),
          pppoe_password: pppoePassword.trim(),
          installation_date: installationDate,
          expired_at: expiredAt || null,
          grace_until: graceUntil || null,
          package_id: packageId,
          router_id: selectedRouterId || null,
          router_profile_id: matchedProfile ? matchedProfile.id : null,
          status
        })
      });

      const data = await parseJsonResponse(res);
      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        setShowEditModal(false);
        setEditingCustomer(null);
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui data pelanggan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal memperbarui data pelanggan.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleImportUsers = async () => {
    if (!importRouterId) {
      setToastMsg({ type: 'error', text: 'Pilih Server Mikrotik terlebih dahulu!' });
      return;
    }

    setImportLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/routers/${importRouterId}/import-hotspot-users`, {
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
        setToastMsg({ type: 'error', text: data.message || 'Gagal mengimpor user Hotspot.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal impor dari Mikrotik.' });
    } finally {
      setImportLoading(false);
    }
  };

  const handleSyncMikrotik = async (c: Customer) => {
    setActionLoadingId(c.id);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${c.id}/sync-to-mikrotik`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);

      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal sync ke Mikrotik.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Sync Gagal: ${err?.message}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDisconnect = async (c: Customer) => {
    if (!confirm(`Apakah Anda yakin ingin memutus koneksi aktif Hotspot "${c.pppoe_username}" dari Mikrotik?`)) return;

    setActionLoadingId(c.id);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${c.id}/disconnect-ppp`, {
        method: 'POST'
      });
      const data = await parseJsonResponse(res);

      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memutus koneksi.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: `Disconnect Gagal: ${err?.message}` });
    } finally {
      setActionLoadingId(null);
    }
  };

  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const handleCreateBatchInvoices = async () => {
    if (!confirm('Apakah Anda yakin ingin membuat tagihan masal untuk SELURUH pelanggan Hotspot aktif?')) return;
    setInvoiceLoading(true);
    setToastMsg(null);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices/create-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_type: 'hotspot' })
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

  const handleCreateManualInvoice = async (c: Customer) => {
    setActionLoadingId(c.id);
    setToastMsg(null);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/invoices/create-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: c.id, notes: `Tagihan Manual Hotspot Member - ${c.name}` })
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
      openBillingModal(c);
    }
  };

  const handleDeleteCustomer = async (c: Customer) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus pelanggan Hotspot "${c.name}"?`)) return;

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${c.id}`, {
        method: 'DELETE'
      });
      const data = await parseJsonResponse(res);

      if (data.success) {
        setToastMsg({ type: 'success', text: data.message });
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menghapus pelanggan.' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal menghapus pelanggan.' });
    }
  };

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
        title="Daftar Pelanggan Hotspot (Bulanan)"
        subtitle="Manajemen Pelanggan Hotspot Member Bulanan, Penagihan, dan Integrasi Mikrotik Hotspot User"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span className="text-xs font-sans font-bold">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold cursor-pointer opacity-70 hover:opacity-100">&times;</button>
          </div>
        )}

        {/* Toolbar & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama, kode, username Hotspot, no hp..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-sans text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
              />
            </div>

            <select
              value={selectedPackageFilter}
              onChange={(e) => setSelectedPackageFilter(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-sans font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">Semua Paket Hotspot</option>
              {packages.filter(p => p.type && p.type.includes('hotspot')).map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.speed_limit})</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-sans font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">Semua Status</option>
              <option value="online">🟢 Online Hotspot</option>
              <option value="offline">🔴 Offline</option>
              <option value="non-active">🟡 Non-Aktif / Isolir</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { window.location.hash = '#/map-ftth'; }}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-sans font-bold text-xs rounded-2xl shadow-md shadow-sky-100 flex items-center gap-2 transition-all cursor-pointer"
            >
              <MapPin size={15} />
              <span>🗺️ Peta Jaringan FTTH</span>
            </button>

            <button
              onClick={handleCreateBatchInvoices}
              disabled={invoiceLoading}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-indigo-100 transition-all cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
            >
              <FileText size={15} className={invoiceLoading ? 'animate-spin' : ''} />
              <span>{invoiceLoading ? 'Memproses...' : '🧾 Buat Tagihan Masal'}</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-2"
            >
              <Download size={15} />
              <span>Impor User Hotspot</span>
            </button>

            <button
              onClick={openAddModal}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-2xl shadow-lg shadow-sky-200 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Plus size={16} />
              <span>Tambah Pelanggan Hotspot</span>
            </button>
          </div>
        </div>

        {/* Customer Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Pelanggan</th>
                  <th className="py-4 px-6">Username Hotspot</th>
                  <th className="py-4 px-6">Paket Internet</th>
                  <th className="py-4 px-6">Server Router</th>
                  <th className="py-4 px-6">Masa Aktif</th>
                  <th className="py-4 px-6 text-center">Mikrotik Sync</th>
                  <th className="py-4 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-sans text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-sky-500" />
                      <span>Memuat data pelanggan Hotspot...</span>
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Belum ada pelanggan Hotspot ditemukan.
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map(c => {
                    const online = isUserOnline(c);
                    const isLoadingAction = actionLoadingId === c.id;

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        {/* Pelanggan Name & Online Dot */}
                        <td className="py-4 px-6 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span 
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${online ? 'bg-emerald-500 shadow-sm shadow-emerald-200' : c.status === 'active' ? 'bg-rose-500' : 'bg-amber-500'}`}
                              title={online ? 'Online Hotspot' : 'Offline'}
                            />
                            <div>
                              <div className="font-bold text-slate-900">{c.name}</div>
                              <div className="text-[10px] font-mono text-slate-400">{c.customer_code} • {c.phone_number || 'Tanpa HP'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Username Hotspot & Password */}
                        <td className="py-4 px-6">
                          <div className="font-mono font-bold text-sky-700">{c.pppoe_username}</div>
                          <div className="text-[10px] font-mono text-slate-400">Pass: {c.pppoe_password}</div>
                        </td>

                        {/* Paket Internet */}
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800">{c.package_name || 'Tanpa Paket'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Rp {c.package_price ? c.package_price.toLocaleString('id-ID') : '0'} • {c.speed_limit || '-'}
                          </div>
                        </td>

                        {/* Server Router */}
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-700">{c.router_name || 'Default Router'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{c.router_ip || '-'}</div>
                        </td>

                        {/* Masa Aktif */}
                        <td className="py-4 px-6">
                          <div className="font-mono text-[11px] font-bold text-slate-700">
                            {c.expired_at ? new Date(c.expired_at).toLocaleDateString('id-ID') : '-'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Pasang: {c.installation_date ? new Date(c.installation_date).toLocaleDateString('id-ID') : '-'}
                          </div>
                        </td>

                        {/* Mikrotik Sync & Disconnect */}
                        <td className="py-4 px-6 text-center">
                          {!c.is_synced ? (
                            <button
                              onClick={() => handleSyncMikrotik(c)}
                              disabled={isLoadingAction}
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-1.5 transition-all"
                            >
                              {isLoadingAction ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                              <span>Sync Mikrotik</span>
                            </button>
                          ) : online ? (
                            <button
                              onClick={() => handleDisconnect(c)}
                              disabled={isLoadingAction}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-xl shadow-sm cursor-pointer inline-flex items-center gap-1.5 transition-all"
                            >
                              {isLoadingAction ? <RefreshCw size={12} className="animate-spin" /> : <XCircle size={12} />}
                              <span>Diskonek</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSyncMikrotik(c)}
                              disabled={isLoadingAction}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[10px] rounded-lg inline-flex items-center gap-1 hover:bg-emerald-100 transition-all cursor-pointer"
                              title="Klik untuk re-sync manual"
                            >
                              <CheckCircle2 size={11} />
                              <span>Synced</span>
                            </button>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right space-x-2">
                          {Boolean((c as any).latitude || c.maps_url) && (
                            <button
                              onClick={() => { window.location.hash = '#/map-ftth'; }}
                              className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl transition-all cursor-pointer"
                              title="Lihat Lokasi Pelanggan di Peta FTTH"
                            >
                              <MapPin size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => openBillingModal(c)}
                            className="p-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl transition-all cursor-pointer"
                            title="Detail & Tagihan Pelanggan"
                          >
                            <FileText size={14} />
                          </button>
                          <button
                            onClick={() => openEditModal(c)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer"
                            title="Edit Data Pelanggan"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(c)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer"
                            title="Hapus Pelanggan"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
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
                              ? 'bg-sky-600 text-white shadow-sm'
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
        </div>
      </main>

      {/* Modal Tambah Pelanggan Hotspot */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                  <Wifi size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Tambah Pelanggan Hotspot (Bulanan)</h3>
                  <p className="text-xs text-slate-400">Akun Hotspot Member Bulanan / Langganan Tetap</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Server Router Mikrotik *</label>
                  <select
                    value={selectedRouterId}
                    onChange={(e) => setSelectedRouterId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Paket Hotspot *</label>
                  <select
                    value={packageId}
                    onChange={(e) => handlePackageChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {packages.filter(p => p.type && p.type.includes('hotspot')).map(p => (
                      <option key={p.id} value={p.id}>{p.name} - Rp {p.price.toLocaleString('id-ID')} ({p.speed_limit})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ahmad Hotspot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Hotspot *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: ahmad-hs"
                    value={pppoeUsername}
                    onChange={(e) => setPppoeUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-sky-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Hotspot *</label>
                  <input
                    type="text"
                    required
                    placeholder="Password"
                    value={pppoePassword}
                    onChange={(e) => setPppoePassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="081234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pasang / Aktif *</label>
                  <input
                    type="date"
                    required
                    value={installationDate}
                    onChange={(e) => handleInstallationDateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kecamatan</label>
                    <input
                      type="text"
                      placeholder="Kec. Majujaya"
                      value={kecamatan}
                      onChange={(e) => setKecamatan(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi</label>
                    <input
                      type="text"
                      placeholder="Jawa Barat"
                      value={provinsi}
                      onChange={(e) => setProvinsi(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-sky-50/70 border border-sky-200 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-sky-900 mb-1">Tanggal Jatuh Tempo (Exp)</label>
                  <input
                    type="date"
                    value={expiredAt}
                    onChange={(e) => setExpiredAt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-mono font-bold text-sky-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">Batas Tenggang Isolir</label>
                  <input
                    type="date"
                    value={graceUntil}
                    onChange={(e) => setGraceUntil(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Pelanggan Hotspot'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Pelanggan Hotspot */}
      {showEditModal && editingCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up max-h-[92vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Edit Pelanggan Hotspot</h3>
                  <p className="text-xs text-slate-400">{editingCustomer.name} ({editingCustomer.customer_code})</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Server Router Mikrotik *</label>
                  <select
                    value={selectedRouterId}
                    onChange={(e) => setSelectedRouterId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {routers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Paket Hotspot *</label>
                  <select
                    value={packageId}
                    onChange={(e) => handlePackageChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    {packages.filter(p => p.type && p.type.includes('hotspot')).map(p => (
                      <option key={p.id} value={p.id}>{p.name} - Rp {p.price.toLocaleString('id-ID')} ({p.speed_limit})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Hotspot *</label>
                  <input
                    type="text"
                    required
                    value={pppoeUsername}
                    onChange={(e) => setPppoeUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-sky-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password Hotspot *</label>
                  <input
                    type="text"
                    required
                    value={pppoePassword}
                    onChange={(e) => setPppoePassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="081234567890"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status Pelanggan *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="active">🟢 Aktif (Active)</option>
                    <option value="isolated">🔴 Terisolir (Isolated)</option>
                    <option value="non-active">⚪ Non-Aktif (Off)</option>
                    <option value="terminated">❌ Dihentikan (Terminated)</option>
                  </select>
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
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kecamatan</label>
                    <input
                      type="text"
                      placeholder="Kec. Majujaya"
                      value={kecamatan}
                      onChange={(e) => setKecamatan(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi</label>
                    <input
                      type="text"
                      placeholder="Jawa Barat"
                      value={provinsi}
                      onChange={(e) => setProvinsi(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pasang / Aktif *</label>
                  <input
                    type="date"
                    required
                    value={installationDate}
                    onChange={(e) => handleInstallationDateChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-sky-50/70 border border-sky-200 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-sky-900 mb-1">Tanggal Jatuh Tempo (Exp)</label>
                  <input
                    type="date"
                    value={expiredAt}
                    onChange={(e) => setExpiredAt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-sky-200 rounded-xl text-xs font-mono font-bold text-sky-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-amber-900 mb-1">Batas Tenggang Isolir</label>
                  <input
                    type="date"
                    value={graceUntil}
                    onChange={(e) => setGraceUntil(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor User Hotspot dari Mikrotik */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-md shadow-2xl p-6 space-y-4 animate-slide-up">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Download size={18} className="text-sky-600" />
                Impor User Hotspot dari Mikrotik
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Server Router Mikrotik *</label>
              <select
                value={importRouterId}
                onChange={(e) => setImportRouterId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="">-- Pilih Router --</option>
                {routers.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.ip_address})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="updateExistingHs"
                checked={updateExistingImport}
                onChange={(e) => setUpdateExistingImport(e.target.checked)}
                className="rounded border-slate-300 text-sky-600"
              />
              <label htmlFor="updateExistingHs" className="text-xs font-bold text-slate-700">Update data jika username sudah ada di database</label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
              <button
                onClick={handleImportUsers}
                disabled={importLoading || !importRouterId}
                className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {importLoading && <RefreshCw size={14} className="animate-spin" />}
                <span>{importLoading ? 'Mengimpor...' : 'Mulai Impor'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail & Tagihan Pelanggan Modal (Matching CustomerManagement & Screenshot) */}
      {showBillingModal && billingCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-3xl shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
            {/* Header Gradient */}
            <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Detail & Tagihan Pelanggan</h3>
                  <p className="text-xs text-blue-100 font-mono mt-0.5">{billingCustomer.name} ({billingCustomer.customer_code || 'HOTSPOT-MEMBER'})</p>
                </div>
              </div>
              <button
                type="button"
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
                    <span className="text-[10px] text-slate-400 font-bold block">HOTSPOT USERNAME</span>
                    <span className="font-mono font-bold text-sky-600">{billingCustomer.pppoe_username || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">NO. WHATSAPP</span>
                    <span className="font-mono font-bold text-slate-700">{billingCustomer.phone_number || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">ROUTER SERVER</span>
                    <span className="font-bold text-slate-700">{billingCustomer.router_name || 'Default Router'}</span>
                  </div>
                </div>
              </div>

              {/* Card Paket & Penagihan */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center justify-between pb-2 border-b border-slate-100">
                  <span>RINCIAN PAKET & TEMPO TAGIHAN</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                    {billingCustomer.package_name || 'Paket Hotspot Member'}
                  </span>
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">TARIF BULANAN</span>
                    <span className="text-sm font-black text-slate-900">
                      Rp {Number(billingCustomer.package_price || 0).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">TANGGAL PASANG</span>
                    <span className="font-bold text-slate-700">
                      {billingCustomer.installation_date ? billingCustomer.installation_date.split('T')[0] : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">EXPIRED HINGGA</span>
                    <span className="font-bold text-rose-600">
                      {billingCustomer.expired_at ? billingCustomer.expired_at.split('T')[0] : '-'}
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
                            Batas Toleransi (Grace Until): <strong>{billingCustomer.grace_until ? billingCustomer.grace_until.split('T')[0] : '-'}</strong>
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
                            Masa aktif langganan terbayar lunas hingga <strong>{billingCustomer.expired_at ? billingCustomer.expired_at.split('T')[0] : '-'}</strong>
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
                          Masa aktif telah berakhir pada <strong>{billingCustomer.expired_at ? billingCustomer.expired_at.split('T')[0] : '-'}</strong>
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
                            <span className="font-mono font-black text-blue-700">{inv.invoice_number}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {inv.status === 'paid' ? '✅ Lunas' : '⏳ Belum Lunas'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Issued: {inv.issue_date ? inv.issue_date.split('T')[0] : '-'} | Due: <strong className="text-slate-700">{inv.due_date ? inv.due_date.split('T')[0] : '-'}</strong>
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
                  onClick={() => {
                    const pendingInv = customerInvoices.find(i => i.status !== 'paid');
                    if (pendingInv) {
                      handlePayInvoiceById(pendingInv.id);
                    }
                  }}
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
