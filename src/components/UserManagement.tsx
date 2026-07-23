import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  UserPlus, 
  Search, 
  ShieldCheck, 
  User, 
  Key, 
  Mail, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Phone,
  Wrench,
  Megaphone,
  Edit
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';

interface UserItem {
  id: string;
  username: string;
  name: string;
  email: string;
  phone_number?: string;
  arabpay_user_id?: string;
  role: 'owner' | 'teknisi' | 'marketing' | 'kasir' | 'pelanggan' | string;
  created_at?: string;
}

interface UserManagementProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export default function UserManagement({ profile, t, onLogout }: UserManagementProps) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State (Add & Edit)
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<string>('kasir');
  const [password, setPassword] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/users`);
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users from database API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !email.trim() || !password.trim()) {
      setToastMsg({ type: 'error', text: 'Harap lengkapi semua bidang form!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim() || null,
          role,
          password
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: `User "${data.user.name}" (Role: ${data.user.role.toUpperCase()}) berhasil ditambahkan!` });
        setShowAddModal(false);
        resetForm();
        fetchUsers();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal menambahkan user' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal terhubung ke Database API.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setName(u.name);
    setUsername(u.username);
    setEmail(u.email);
    setPhoneNumber(u.phone_number || '');
    setRole(u.role);
    setPassword('');
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !name.trim() || !email.trim()) {
      setToastMsg({ type: 'error', text: 'Nama dan Email wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          phone_number: phoneNumber.trim() || null,
          role,
          password: password.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: 'success', text: data.message || `Jabatan user "${name}" berhasil diubah menjadi ${role.toUpperCase()}!` });
        setShowEditModal(false);
        setEditingUser(null);
        resetForm();
        fetchUsers();
      } else {
        setToastMsg({ type: 'error', text: data.message || 'Gagal memperbarui user' });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui user ke database.' });
    } finally {
      setSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setUsername('');
    setEmail('');
    setPhoneNumber('');
    setPassword('');
    setRole('kasir');
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.phone_number && u.phone_number.includes(searchTerm))
  );

  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'owner':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-xs font-semibold">
            <ShieldCheck size={14} className="text-amber-600" />
            Owner (Super Admin)
          </span>
        );
      case 'teknisi':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-full text-xs font-semibold">
            <Wrench size={14} className="text-indigo-600" />
            Teknisi / Lapangan
          </span>
        );
      case 'marketing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200/60 rounded-full text-xs font-semibold">
            <Megaphone size={14} className="text-purple-600" />
            Marketing / Sales
          </span>
        );
      case 'kasir':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-full text-xs font-semibold">
            <UserCheck size={14} className="text-blue-600" />
            Kasir / Operator
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200/60 rounded-full text-xs font-semibold">
            <User size={14} className="text-slate-500" />
            Pelanggan WiFi
          </span>
        );
    }
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen">
      {/* Header */}
      <HeaderBar
        title="Pengguna Sistem"
        subtitle={`Total ${users.length} Akun Terdaftar (Owner, Teknisi, Marketing, Kasir, Pelanggan)`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Content */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Notification Toast */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
            toastMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
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
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, username, email, atau role (teknisi, marketing...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Refresh Data Users"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => { resetForm(); setShowAddModal(true); }}
              className="py-2.5 px-5 bg-[#2563EB] hover:bg-blue-700 text-white font-sans font-semibold rounded-xl flex items-center gap-2 text-xs shadow-md shadow-blue-100 transition-all cursor-pointer shrink-0"
            >
              <UserPlus size={16} />
              <span>+ Tambah Pengguna Baru</span>
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw size={24} className="animate-spin text-[#2563EB]" />
              <span className="text-xs font-semibold">Mengambil data pengguna dari database VPS...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Tidak ada pengguna yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-4 px-6">Pengguna & Username</th>
                    <th className="py-4 px-6">Kontak Email & HP</th>
                    <th className="py-4 px-6">Hak Akses (Role)</th>
                    <th className="py-4 px-6">ID System / ArabPay</th>
                    <th className="py-4 px-6 text-right">Kelola / Angkat Jabatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-all">
                      {/* Name & Avatar */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] font-bold flex items-center justify-center text-sm border border-blue-100">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{u.name}</div>
                            <div className="text-slate-400 text-xs">@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      {/* Email & Phone */}
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-700">{u.email}</div>
                        {u.phone_number && (
                          <div className="text-[11px] font-mono text-emerald-600 font-semibold mt-0.5">📞 {u.phone_number}</div>
                        )}
                      </td>

                      {/* Role Badge */}
                      <td className="py-4 px-6">
                        {getRoleBadge(u.role)}
                      </td>

                      {/* UUID & ArabPay ID */}
                      <td className="py-4 px-6 font-mono text-[11px] text-slate-500 max-w-[220px]">
                        <div className="truncate" title={u.id}>ID: {u.id}</div>
                        {u.arabpay_user_id ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-emerald-600 font-bold truncate" title={u.arabpay_user_id}>AP-ID: {u.arabpay_user_id}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(u.arabpay_user_id!);
                                setToastMsg({ text: `ID ArabPay (${u.arabpay_user_id}) berhasil disalin!`, type: 'success' });
                              }}
                              className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-sans font-bold text-[9px] rounded transition-all cursor-pointer border border-emerald-200 shrink-0"
                              title="Salin ID ArabPay ke clipboard"
                            >
                              Salin ID
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">Belum terhubung ArabPay</div>
                        )}
                      </td>

                      {/* Edit Role Button */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => openEditModal(u)}
                          className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all cursor-pointer border border-indigo-200/60 inline-flex items-center gap-1.5 shadow-2xs"
                        >
                          <Edit size={13} />
                          <span>Edit Role</span>
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

      {/* Modal Tambah Pengguna Baru */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center border border-blue-100">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Tambah Pengguna Baru</h3>
                  <p className="text-xs text-slate-400">Pilih role Owner, Teknisi, Marketing, Kasir, atau Pelanggan</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form Modal */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Andi Wijaya"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: andi_pos"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="andi@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp (Opsional)</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="Contoh: 085746520724"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hak Akses (Role Staf)</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all text-slate-700 font-bold"
                  >
                    <option value="owner">👑 Owner (Super Admin)</option>
                    <option value="teknisi">🔧 Teknisi / Staf Lapangan</option>
                    <option value="marketing">📢 Marketing / Penjualan</option>
                    <option value="kasir">🛒 Kasir / Operator POS</option>
                    <option value="pelanggan">👤 Pelanggan WiFi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      placeholder="Password login..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 rounded-xl shadow-md shadow-blue-100 cursor-pointer flex items-center gap-2"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Menyimpan...' : 'Simpan User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit / Angkat Jabatan Staf */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200">
                  <Edit size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-800">Edit & Angkat Jabatan Pengguna</h3>
                  <p className="text-xs text-slate-500">Ubah peran menjadi Teknisi, Marketing, Owner, Kasir, dll.</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form Modal Edit */}
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WhatsApp (Opsional)</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Jabatan / Role Picker */}
              <div>
                <label className="block text-xs font-bold text-indigo-700 mb-1">👑 Angkat Jabatan Staf (Hak Akses Role)</label>
                {editingUser.role === 'owner' ? (
                  <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-bold flex items-center gap-2">
                    <ShieldCheck size={18} className="text-amber-600 shrink-0" />
                    <span>🛡️ Akun Owner Utama Dilindungi: Role Owner (Super Admin) tidak dapat diturunkan demi keamanan sistem!</span>
                  </div>
                ) : (
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all text-indigo-900 font-extrabold"
                  >
                    <option value="owner">👑 Owner (Super Admin)</option>
                    <option value="teknisi">🔧 Teknisi / Staf Lapangan</option>
                    <option value="marketing">📢 Marketing / Penjualan</option>
                    <option value="kasir">🛒 Kasir / Operator POS</option>
                    <option value="pelanggan">👤 Pelanggan WiFi</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password Baru (Opsional - Kosongkan jika tidak diubah)</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Kosongkan jika tidak ingin mengubah password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingUser(null); }}
                  className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-100 cursor-pointer flex items-center gap-2"
                >
                  {submitLoading && <RefreshCw size={14} className="animate-spin" />}
                  <span>{submitLoading ? 'Memperbarui...' : 'Simpan Perubahan Role'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
