import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Wifi, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Phone, 
  MapPin, 
  Key, 
  Edit, 
  ShieldCheck, 
  Zap,
  Tag
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

interface PackageItem {
  id: string;
  name: string;
  type: string;
  price: number;
  speed_limit: string;
  validity_days: number;
}

interface CustomerItem {
  id: string;
  user_id?: string;
  name: string;
  phone_number: string;
  address?: string;
  connection_type: 'pppoe' | 'hotspot';
  pppoe_username?: string;
  pppoe_password?: string;
  package_id: string;
  package_name?: string;
  package_price?: number;
  package_type?: string;
  speed_limit?: string;
  status: 'active' | 'isolated' | 'pending';
  linked_user_email?: string;
  arabpay_user_id?: string;
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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [connectionType, setConnectionType] = useState<'pppoe' | 'hotspot'>('pppoe');
  const [pppoeUsername, setPppoeUsername] = useState('');
  const [pppoePassword, setPppoePassword] = useState('');
  const [packageId, setPackageId] = useState('');
  const [status, setStatus] = useState<'active' | 'isolated' | 'pending'>('active');

  const fetchData = async () => {
    setLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const [resCust, resPkg] = await Promise.all([
        fetch(`${apiUrl}/api/customers`),
        fetch(`${apiUrl}/api/packages`)
      ]);
      const dataCust = await resCust.json();
      const dataPkg = await resPkg.json();

      if (dataCust.success && Array.isArray(dataCust.customers)) {
        setCustomers(dataCust.customers);
      }
      if (dataPkg.success && Array.isArray(dataPkg.packages)) {
        setPackages(dataPkg.packages);
        if (dataPkg.packages.length > 0 && !packageId) {
          setPackageId(dataPkg.packages[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch customers/packages data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setName('');
    setPhoneNumber('');
    setAddress('');
    setConnectionType('pppoe');
    setPppoeUsername('');
    setPppoePassword('');
    if (packages.length > 0) setPackageId(packages[0].id);
    setStatus('active');
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneNumber.trim() || !packageId) {
      setToastMsg({ type: 'error', text: 'Nama, Nomor HP, dan Paket Internet wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone_number: phoneNumber.trim(),
          address: address.trim(),
          connection_type: connectionType,
          pppoe_username: pppoeUsername.trim() || null,
          pppoe_password: pppoePassword.trim() || null,
          package_id: packageId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ 
          type: 'success', 
          text: `Pelanggan "${data.customer.name}" berhasil didaftarkan! ${data.autoLinkedArabPay ? '⚡ Akun ArabPay langsung terhubung!' : ' (Belum terhubung ArabPay).'}` 
        });
        setShowAddModal(false);
        resetForm();
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal mendaftarkan pelanggan.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal terhubung ke Database API.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (c: CustomerItem) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhoneNumber(c.phone_number);
    setAddress(c.address || '');
    setConnectionType(c.connection_type || 'pppoe');
    setPppoeUsername(c.pppoe_username || '');
    setPppoePassword(c.pppoe_password || '');
    setPackageId(c.package_id);
    setStatus(c.status);
    setShowEditModal(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !name.trim() || !phoneNumber.trim() || !packageId) {
      setToastMsg({ type: 'error', text: 'Nama, Nomor HP, dan Paket Internet wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone_number: phoneNumber.trim(),
          address: address.trim(),
          connection_type: connectionType,
          pppoe_username: pppoeUsername.trim() || null,
          pppoe_password: pppoePassword.trim() || null,
          package_id: packageId,
          status
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: `Data pelanggan "${name}" berhasil diperbarui!` });
        setShowEditModal(false);
        setEditingCustomer(null);
        resetForm();
        fetchData();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui data pelanggan.' });
      }
    } catch (err) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui data pelanggan.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone_number.includes(searchTerm) ||
    (c.address && c.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.pppoe_username && c.pppoe_username.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.package_name && c.package_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      {/* Header */}
      <HeaderBar
        title="Pelanggan RT/RW Net"
        subtitle={`Total ${customers.length} Pelanggan Terdaftar (PPPoE Bulanan & Hotspot)`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Toast */}
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

        {/* Action & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama pelanggan, HP, alamat, atau username PPPoE..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <UserPlus size={16} />
              <span>+ Tambah Pelanggan RT/RW Net</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
              <span className="text-xs font-semibold">Mengambil data pelanggan RT/RW Net...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Belum ada pelanggan RT/RW Net yang terdaftar. Klik "+ Tambah Pelanggan" untuk mendaftarkan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-4 px-6">Pelanggan & Alamat</th>
                    <th className="py-4 px-6">Tipe Koneksi & PPPoE</th>
                    <th className="py-4 px-6">Paket Internet & Tarif</th>
                    <th className="py-4 px-6">Integrasi ArabPay</th>
                    <th className="py-4 px-6">Status Layanan</th>
                    <th className="py-4 px-6 text-right">Kelola</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-all">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-800 text-sm">{c.name}</div>
                        <div className="text-emerald-600 font-mono font-semibold text-[11px]">📞 {c.phone_number}</div>
                        {c.address && (
                          <div className="text-slate-400 text-[11px] truncate max-w-[200px]" title={c.address}>📍 {c.address}</div>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          c.connection_type === 'pppoe' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}>
                          {c.connection_type === 'pppoe' ? <Globe size={12} /> : <Wifi size={12} />}
                          {c.connection_type === 'pppoe' ? 'PPPoE Bulanan' : 'Hotspot Bulanan'}
                        </span>
                        {c.pppoe_username && (
                          <div className="text-[11px] font-mono text-slate-600 mt-1">User: <span className="font-bold">{c.pppoe_username}</span></div>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-800">{c.package_name || 'Paket Kustom'}</div>
                        <div className="text-slate-500 font-mono text-[11px]">
                          Rp {Number(c.package_price || 0).toLocaleString('id-ID')} / Bln 
                          {c.speed_limit && <span className="ml-1.5 text-indigo-600 font-bold">({c.speed_limit})</span>}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        {c.user_id ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-bold">
                            <ShieldCheck size={12} />
                            Terhubung ArabPay SSO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-[10px] font-semibold italic">
                            Belum Terhubung SSO
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          c.status === 'active' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : c.status === 'isolated' 
                            ? 'bg-rose-100 text-rose-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {c.status === 'active' ? '● Aktif' : c.status === 'isolated' ? '🔒 Terisolir' : '⏳ Pending'}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => openEditModal(c)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200 inline-flex items-center gap-1.5"
                        >
                          <Edit size={13} />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal Tambah Pelanggan RT/RW Net */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Tambah Pelanggan RT/RW Net Baru</h3>
                  <p className="text-xs text-slate-400">Daftarkan pelanggan tanpa perlu akun ArabPay awal</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Pelanggan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp (Kunci Auto-Sync)</label>
                  <input
                    type="tel"
                    required
                    placeholder="Contoh: 085746520724"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Koneksi Internet</label>
                  <select
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-bold text-slate-800"
                  >
                    <option value="pppoe">🌐 PPPoE Bulanan (Kabel/Radio)</option>
                    <option value="hotspot">📶 Hotspot Bulanan (WiFi)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Paket Internet</label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all font-extrabold text-blue-900"
                >
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — Rp {Number(p.price).toLocaleString('id-ID')} / Bln ({p.speed_limit})
                    </option>
                  ))}
                </select>
              </div>

              {connectionType === 'pppoe' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">PPPoE Username</label>
                    <input
                      type="text"
                      placeholder="budi_home"
                      value={pppoeUsername}
                      onChange={(e) => setPppoeUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">PPPoE Password</label>
                    <input
                      type="password"
                      placeholder="password..."
                      value={pppoePassword}
                      onChange={(e) => setPppoePassword(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Pemasangan / Blok Rumah</label>
                <textarea
                  rows={2}
                  placeholder="Jl. Merdeka No. 12, RT 02/RW 05..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan Pelanggan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Pelanggan */}
      {showEditModal && editingCustomer && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit Pelanggan RT/RW Net</h3>
                  <p className="text-xs text-slate-400">Ubah paket internet, status isolir, atau data koneksi</p>
                </div>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditingCustomer(null); }} className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap Pelanggan</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp</label>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status Layanan Internet</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-bold text-slate-800"
                  >
                    <option value="active">● Aktif (Layanan Berjalan)</option>
                    <option value="isolated">🔒 Terisolir (Belum Bayar / Suspend)</option>
                    <option value="pending">⏳ Pending (Menunggu Pemasangan)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Koneksi</label>
                  <select
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-bold text-slate-800"
                  >
                    <option value="pppoe">🌐 PPPoE Bulanan</option>
                    <option value="hotspot">📶 Hotspot Bulanan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Paket Internet</label>
                  <select
                    value={packageId}
                    onChange={(e) => setPackageId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-extrabold text-indigo-900"
                  >
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — Rp {Number(p.price).toLocaleString('id-ID')} ({p.speed_limit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {connectionType === 'pppoe' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">PPPoE Username</label>
                    <input
                      type="text"
                      value={pppoeUsername}
                      onChange={(e) => setPppoeUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-900 mb-1">PPPoE Password</label>
                    <input
                      type="password"
                      value={pppoePassword}
                      onChange={(e) => setPppoePassword(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Pemasangan</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => { setShowEditModal(false); setEditingCustomer(null); }} className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer">Batal</button>
                <button type="submit" disabled={submitLoading} className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md cursor-pointer flex items-center gap-2">
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Memperbarui...' : 'Simpan Perubahan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
