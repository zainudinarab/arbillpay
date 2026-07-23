import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Building, 
  MapPin,
  ChevronRight,
  UserPlus,
  Trash2,
  Pencil,
  AlertTriangle,
  LayoutGrid,
  List
} from 'lucide-react';
import { Client, BusinessProfile } from '../types';
import HeaderBar from './HeaderBar';

interface ClientListProps {
  clients: Client[];
  onAddClient: (client: Client) => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  profile: BusinessProfile;
  t: any;
  onLogout?: () => void;
}

export default function ClientList({
  clients,
  onAddClient,
  onEditClient,
  onDeleteClient,
  profile,
  t,
  onLogout
}: ClientListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  
  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [partnerType, setPartnerType] = useState<'client' | 'supplier' | 'both'>('client');

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleOpenAddForm = () => {
    setEditingClient(null);
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setAddress('');
    setPartnerType('client');
    setShowForm(true);
  };

  const handleOpenEditForm = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setEmail(client.email === '-' ? '' : client.email);
    setPhone(client.phone);
    setCompany(client.company || '');
    setAddress(client.address || '');
    setPartnerType(client.type || 'client');
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setCompany('');
    setAddress('');
    setPartnerType('client');
    setEditingClient(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    if (editingClient) {
      const updatedClient: Client = {
        ...editingClient,
        name,
        email: email || '-',
        phone,
        company,
        address,
        type: partnerType
      };
      onEditClient(updatedClient);
    } else {
      const newClient: Client = {
        id: `c-${Date.now()}`,
        name,
        email: email || '-',
        phone,
        company,
        address,
        type: partnerType
      };
      onAddClient(newClient);
    }
    
    // Reset Form
    handleCloseForm();
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <HeaderBar
        title={t.clients}
        subtitle={profile.language === 'id' ? `Total ${clients.length} klien terdaftar` : `Total ${clients.length} registered clients`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Container */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        
        {/* Form Modal (Tambah/Edit Klien) */}
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-lg shadow-2xl overflow-hidden animate-slide-up">
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-sans font-bold text-lg text-slate-800">
                  {editingClient 
                    ? (profile.language === 'id' ? 'Edit Data Klien' : 'Edit Client Details') 
                    : t.addClientTitle
                  }
                </h3>
                <button 
                  onClick={handleCloseForm}
                  className="text-slate-400 hover:text-slate-600 font-sans font-bold text-xl cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nama */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Budi Santoso"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Tipe Mitra */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block">Tipe Mitra *</label>
                    <select
                      value={partnerType}
                      onChange={(e) => setPartnerType(e.target.value as 'client' | 'supplier' | 'both')}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    >
                      <option value="client">{profile.language === 'id' ? 'Klien' : 'Client'}</option>
                      <option value="supplier">{profile.language === 'id' ? 'Suplier' : 'Supplier'}</option>
                      <option value="both">{profile.language === 'id' ? 'Klien & Suplier' : 'Client & Supplier'}</option>
                    </select>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="budi@example.com"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Telepon */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500 block">Nomor HP *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="081234567..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Perusahaan */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block">Perusahaan</label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="PT Maju Karya Nusantara"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Alamat */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-500 block">Alamat</label>
                    <textarea
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Nama Jalan, Blok, Kota..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>
                </div>

                 {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
                  <button
                    type="button"
                    onClick={handleCloseForm}
                    className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-600 rounded-xl cursor-pointer"
                  >
                    {t.save}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Custom Delete Confirmation Modal */}
        {clientToDelete && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-md shadow-2xl p-6 space-y-6 text-center animate-slide-up">
              {/* Alert Warning Icon */}
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
                <AlertTriangle size={28} />
              </div>
              
              {/* Content */}
              <div className="space-y-2">
                <h3 className="font-sans font-bold text-lg text-slate-800">
                  {profile.language === 'id' ? 'Hapus Data Mitra?' : 'Delete Partner?'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  {profile.language === 'id' 
                    ? `Apakah Anda yakin ingin menghapus mitra "${clientToDelete.name}"? Mitra yang terhubung dengan tagihan tidak akan terpengaruh.`
                    : `Are you sure you want to delete partner "${clientToDelete.name}"? Connected invoices will remain untouched.`
                  }
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setClientToDelete(null)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {profile.language === 'id' ? 'Batalkan' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteClient(clientToDelete.id);
                    setClientToDelete(null);
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-rose-100"
                >
                  {profile.language === 'id' ? 'Hapus' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar & View Mode Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-0 rounded-xl text-sm font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
            />
          </div>

          {/* View Mode Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center self-start sm:self-auto shrink-0 border border-slate-200/50">
            <button
              onClick={() => setViewMode('card')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                viewMode === 'card' 
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid size={14} />
              <span>{profile.language === 'id' ? 'Kartu' : 'Card'}</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                viewMode === 'table' 
                  ? 'bg-white text-slate-800 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List size={14} />
              <span>{profile.language === 'id' ? 'Tabel' : 'Table'}</span>
            </button>
          </div>
        </div>

        {/* Clients/Partners Listing */}
        {filteredClients.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center text-slate-400 text-sm">
            {profile.language === 'id' ? 'Tidak ada mitra yang cocok' : 'No matching partners'}
          </div>
        ) : viewMode === 'table' ? (
          /* Table View Mode */
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="p-4 pl-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{profile.language === 'id' ? 'Mitra' : 'Partner'}</th>
                    <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{profile.language === 'id' ? 'Telepon' : 'Phone'}</th>
                    <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{profile.language === 'id' ? 'Alamat' : 'Address'}</th>
                    <th className="p-4 pr-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider text-right">{profile.language === 'id' ? 'Aksi' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-600 font-medium">
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Mitra Column */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2563EB] font-sans font-extrabold text-sm flex items-center justify-center shrink-0">
                            {client.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-800 text-sm truncate block">{client.name}</span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold ${
                                client.type === 'supplier' 
                                  ? 'bg-purple-50 text-purple-600 border border-purple-100' 
                                  : client.type === 'both'
                                  ? 'bg-blue-50 text-blue-600 border border-blue-100'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              }`}>
                                {client.type === 'supplier' 
                                  ? (profile.language === 'id' ? 'Suplier' : 'Supplier')
                                  : client.type === 'both'
                                  ? (profile.language === 'id' ? 'Klien & Suplier' : 'Client & Supplier')
                                  : (profile.language === 'id' ? 'Klien' : 'Client')
                                }
                              </span>
                            </div>
                            {client.company && (
                              <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{client.company}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email Column */}
                      <td className="p-4">
                        <a href={`mailto:${client.email}`} className="hover:text-[#2563EB] font-sans truncate block max-w-[180px]">
                          {client.email}
                        </a>
                      </td>

                      {/* Phone Column */}
                      <td className="p-4 font-sans">
                        {client.phone ? (
                          <a href={`tel:${client.phone}`} className="hover:text-[#2563EB]">
                            {client.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Address Column */}
                      <td className="p-4 max-w-[200px] truncate text-slate-500">
                        {client.address || <span className="text-slate-400">-</span>}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditForm(client)}
                            className="p-1.5 text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                            title={profile.language === 'id' ? 'Edit Mitra' : 'Edit Partner'}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setClientToDelete(client)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                            title={profile.language === 'id' ? 'Hapus Mitra' : 'Delete Partner'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Card View Mode */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredClients.map((client) => (
              <div 
                key={client.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all p-6 space-y-4 relative group"
              >
                {/* Header Profile */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] font-sans font-extrabold text-lg flex items-center justify-center">
                      {client.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-sans font-bold text-base text-slate-800 leading-tight">{client.name}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          client.type === 'supplier' 
                            ? 'bg-purple-50 text-purple-600 border border-purple-100' 
                            : client.type === 'both'
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {client.type === 'supplier' 
                            ? (profile.language === 'id' ? 'Suplier' : 'Supplier')
                            : client.type === 'both'
                            ? (profile.language === 'id' ? 'Klien & Suplier' : 'Client & Supplier')
                            : (profile.language === 'id' ? 'Klien' : 'Client')
                          }
                        </span>
                      </div>
                      {client.company && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium mt-1">
                          <Building size={12} />
                          <span>{client.company}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions (Edit and Delete) */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
                    {/* Edit Client Action */}
                    <button
                      onClick={() => handleOpenEditForm(client)}
                      className="p-1.5 text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                      title={profile.language === 'id' ? 'Edit Mitra' : 'Edit Partner'}
                    >
                      <Pencil size={14} />
                    </button>
                    
                    {/* Delete Client Action */}
                    <button
                      onClick={() => setClientToDelete(client)}
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      title={profile.language === 'id' ? 'Hapus Mitra' : 'Delete Partner'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Contact Details */}
                <div className="space-y-2 border-t border-slate-50 pt-3">
                  {/* Email */}
                  <div className="flex items-center gap-2.5 text-xs font-medium text-slate-500">
                    <Mail size={14} className="text-slate-400 shrink-0" />
                    <a href={`mailto:${client.email}`} className="hover:text-[#2563EB] truncate">{client.email}</a>
                  </div>

                  {/* Phone */}
                  {client.phone && (
                    <div className="flex items-center gap-2.5 text-xs font-medium text-slate-500">
                      <Phone size={14} className="text-slate-400 shrink-0" />
                      <a href={`tel:${client.phone}`} className="hover:text-[#2563EB]">{client.phone}</a>
                    </div>
                  )}

                  {/* Address */}
                  {client.address && (
                    <div className="flex items-start gap-2.5 text-xs font-medium text-slate-500">
                      <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2 leading-relaxed">{client.address}</span>
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}
