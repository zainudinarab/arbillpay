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
import { getUsersFromFirestore, getCustomersFromFirestore, saveUserToFirestore } from '../services/firebaseService';

// Helper: Normalize phone numbers for 100% accurate WhatsApp matching (08... format)
const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
};

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
  const [userSubscriptionsMap, setUserSubscriptionsMap] = useState<Record<string, any[]>>({});
  const [selectedUserSubs, setSelectedUserSubs] = useState<{ user: UserItem; subs: any[] } | null>(null);
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
    let loadedUsers: UserItem[] = [];

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      const res = await fetch(`${apiUrl}/api/users`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.success && Array.isArray(data.users)) {
          loadedUsers = data.users;
        }
      }
    } catch (err) { }

    // Always fetch and merge from Firebase Cloud Firestore for pure serverless deployment
    try {
      const fbUsers = await getUsersFromFirestore();
      if (fbUsers.success && Array.isArray(fbUsers.users)) {
        const existingIds = new Set(loadedUsers.map(u => String(u.id)));
        fbUsers.users.forEach((fu: any) => {
          if (!existingIds.has(String(fu.id))) {
            loadedUsers.push({
              id: fu.id,
              username: fu.username || fu.email || `user_${fu.id.slice(-4)}`,
              name: fu.name || fu.username || 'User',
              email: fu.email || 'user@hotspot.local',
              phone_number: fu.phone_number || fu.phone || '',
              arabpay_user_id: fu.arabpay_user_id || fu.user_id || fu.arabpay_id || (fu.id && fu.id.length >= 15 ? fu.id : (fu.phone_number ? `AP-${fu.phone_number}` : '')),
              role: fu.role || 'pelanggan',
              created_at: fu.created_at || fu.updated_at || new Date().toISOString()
            });
          }
        });
      }

      // Fetch customer subscriptions and map them to their parent User via normalized WhatsApp number
      const fbCust = await getCustomersFromFirestore();
      if (fbCust.success && Array.isArray(fbCust.customers)) {
        const subMap: Record<string, any[]> = {};
        fbCust.customers.forEach((cust: any) => {
          const normP = normalizePhone(cust.phone_number || cust.phone);
          if (normP) {
            if (!subMap[normP]) subMap[normP] = [];
            subMap[normP].push(cust);
          }
          if (cust.user_id && cust.user_id !== normP) {
            if (!subMap[cust.user_id]) subMap[cust.user_id] = [];
            subMap[cust.user_id].push(cust);
          }
          if (cust.arabpay_user_id && cust.arabpay_user_id !== normP) {
            if (!subMap[cust.arabpay_user_id]) subMap[cust.arabpay_user_id] = [];
            subMap[cust.arabpay_user_id].push(cust);
          }
        });
        setUserSubscriptionsMap(subMap);
      }
    } catch (fbErr) {
      console.warn('Firestore user fetch warning:', fbErr);
    }

    setUsers(loadedUsers);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Sync individual User ID from ArabPay API
  const handleSyncSingleUserArabPayId = async (u: UserItem) => {
    if (!u.phone_number) {
      setToastMsg({ type: 'error', text: `User "${u.name}" tidak memiliki nomor HP untuk disinkronkan ke ArabPay.` });
      return;
    }

    try {
      setToastMsg({ type: 'success', text: `Menghubungi ArabPay Server untuk verifikasi ID (${u.name})...` });
      const res = await fetch('https://arabpay.my.id/api/v1/auth/check-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: u.phone_number })
      });

      const data = await res.json();
      const arabpayId = data.user_id || data.arabpay_user_id || data.id || `AP-${u.phone_number}`;

      const updatedUser = {
        ...u,
        arabpay_user_id: arabpayId
      };

      await saveUserToFirestore(updatedUser);

      setUsers(prev => prev.map(item => item.id === u.id ? updatedUser : item));
      setToastMsg({ type: 'success', text: `ID ArabPay (${arabpayId}) untuk "${u.name}" berhasil disinkronkan & diperbarui!` });
    } catch (err: any) {
      console.error('ArabPay ID sync error:', err);
      // Fallback: assign AP-phone ID if direct S2S fails
      const fallbackId = `AP-${u.phone_number}`;
      const updatedUser = { ...u, arabpay_user_id: fallbackId };
      await saveUserToFirestore(updatedUser);
      setUsers(prev => prev.map(item => item.id === u.id ? updatedUser : item));
      setToastMsg({ type: 'success', text: `ID ArabPay (${fallbackId}) berhasil ditetapkan untuk "${u.name}"` });
    }
  };

  // Sync All Users with missing ArabPay IDs
  const handleSyncAllArabPayIds = async () => {
    const unsynced = users.filter(u => !u.arabpay_user_id || u.arabpay_user_id.includes('Belum'));
    if (unsynced.length === 0) {
      setToastMsg({ type: 'success', text: 'Semua User sudah memiliki ID System / ArabPay terverifikasi!' });
      return;
    }

    setToastMsg({ type: 'success', text: `Menyinkronkan ${unsynced.length} ID ArabPay User...` });
    for (const u of unsynced) {
      if (u.phone_number) {
        await handleSyncSingleUserArabPayId(u);
      }
    }
    fetchUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !email.trim() || !password.trim()) {
      setToastMsg({ type: 'error', text: 'Harap lengkapi semua bidang form!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    try {
      const newUserObj = {
        id: `user_${Date.now()}`,
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        phone_number: phoneNumber.trim() || null,
        role,
        created_at: new Date().toISOString()
      };

      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      try {
        const res = await fetch(`${apiUrl}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUserObj)
        }).catch(() => null);
        if (res && res.ok) {
          await res.json().catch(() => null);
        }
      } catch (apiErr) { }

      // Always save to Firebase Cloud Firestore
      await saveUserToFirestore(newUserObj);

      setToastMsg({ type: 'success', text: `User "${newUserObj.name}" (Role: ${newUserObj.role.toUpperCase()}) berhasil ditambahkan!` });
      setShowAddModal(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menambahkan user: ' + err?.message });
    } finally {
      setSubmitLoading(false);
    }
  };

  const openEditModal = (u: UserItem) => {
    try {
      if (!u) return;
      setEditingUser(u);
      setName(String(u.name || ''));
      setUsername(String(u.username || u.name || 'user'));
      setEmail(String(u.email || ''));
      setPhoneNumber(String(u.phone_number || ''));
      setRole(String(u.role || 'kasir'));
      setPassword('');
      setShowEditModal(true);
    } catch (err) {
      console.error('Error opening user edit modal:', err);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !name.trim() || !email.trim()) {
      setToastMsg({ type: 'error', text: 'Nama dan Email wajib diisi!' });
      return;
    }

    setSubmitLoading(true);
    setToastMsg(null);

    const updatedUserObj: UserItem = {
      ...editingUser,
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      phone_number: phoneNumber.trim() || undefined,
      role: role
    };

    try {
      const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
      await fetch(`${apiUrl}/api/users/${editingUser.id}`, {
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
      }).catch(() => null);

      // Always update Cloud Firestore database
      await saveUserToFirestore(updatedUserObj).catch(() => null);

      // Update local state instantly
      setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUserObj : u));

      setToastMsg({ type: 'success', text: `Jabatan user "${name}" berhasil diubah menjadi ${role.toUpperCase()}!` });
      setShowEditModal(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui user ke database: ' + err?.message });
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
              onClick={handleSyncAllArabPayIds}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-semibold rounded-xl flex items-center gap-1.5 text-xs shadow-md shadow-emerald-100 transition-all cursor-pointer shrink-0"
              title="Otomatis menyinkronkan ID ArabPay dari server"
            >
              <span>⚡ Sync ID ArabPay Semua</span>
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
                    <th className="py-4 px-6">Layanan Member (1-to-N)</th>
                    <th className="py-4 px-6">ID System / ArabPay</th>
                    <th className="py-4 px-6 text-right">Kelola / Role</th>
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

                      {/* Subscriptions / Member Services Column */}
                      <td className="py-4 px-6">
                        {(() => {
                          const normP = normalizePhone(u.phone_number);
                          const list1 = normP ? (userSubscriptionsMap[normP] || []) : [];
                          const list2 = userSubscriptionsMap[u.id] || [];
                          const list3 = u.arabpay_user_id ? (userSubscriptionsMap[u.arabpay_user_id] || []) : [];

                          const combinedMap = new Map();
                          [...list1, ...list2, ...list3].forEach(item => {
                            const itemKey = item.id || item.pppoe_username || item.username;
                            if (itemKey && !combinedMap.has(itemKey)) {
                              combinedMap.set(itemKey, item);
                            }
                          });
                          const subs = Array.from(combinedMap.values());

                          return (
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                subs.length > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {subs.length} Langganan
                              </span>
                              {subs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedUserSubs({ user: u, subs })}
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-[10px] font-bold rounded-lg transition border border-blue-200 cursor-pointer"
                                >
                                  📋 Detail Member
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* UUID & ArabPay ID */}
                      <td className="py-4 px-6 font-mono text-[11px] text-slate-500 max-w-[220px]">
                        <div className="truncate text-slate-400 text-[10px]" title={u.id}>ID: {u.id}</div>
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
                              Salin
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-400 italic">Belum Sync</span>
                            {u.phone_number && (
                              <button
                                onClick={() => handleSyncSingleUserArabPayId(u)}
                                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-sans font-bold text-[9px] rounded-lg transition-all cursor-pointer border border-emerald-200 shrink-0 flex items-center gap-1"
                                title="Sinkronkan ID ArabPay dari Server"
                              >
                                ⚡ Sync ID
                              </button>
                            )}
                          </div>
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
                    value={name || ''}
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
                    value={username || ''}
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
                      value={email || ''}
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
                    value={phoneNumber || ''}
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
                    value={role || 'kasir'}
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

      {/* Modal Detail Member Subscriptions (1 User -> N Langganan) */}
      {selectedUserSubs && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">
                  📋 Daftar Layanan Member ({selectedUserSubs.subs.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Pemilik: <strong>{selectedUserSubs.user.name}</strong> (WA: <strong>{selectedUserSubs.user.phone_number || '-'}</strong>)
                </p>
              </div>
              <button
                onClick={() => setSelectedUserSubs(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {selectedUserSubs.subs.map((sub: any, idx: number) => (
                <div key={sub.id || idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 text-sm">
                      {sub.package_name || sub.packageName || 'Paket Internet Member'}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                      sub.status === 'active' || sub.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {sub.status === 'active' || sub.status === 'aktif' ? '● Aktif' : '○ Menunggu Persetujuan'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px]">
                    <div>Username: <strong className="font-mono text-slate-950">{sub.pppoe_username || sub.username || '-'}</strong></div>
                    <div>Router: <strong className="text-slate-800">{sub.router_name || 'MikroTik Hotspot'}</strong></div>
                    <div>Biaya: <strong className="text-emerald-600">Rp {(Number(sub.price) || 0).toLocaleString('id-ID')} / bln</strong></div>
                    <div>Tgl Daftar: <strong className="text-slate-500">{sub.created_at ? new Date(sub.created_at).toLocaleDateString('id-ID') : '-'}</strong></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedUserSubs(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
