import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  Filter, 
  ChevronRight, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  FileDown,
  Pencil,
  Archive,
  RotateCcw
} from 'lucide-react';
import { Invoice, BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';
import HeaderBar from './HeaderBar';

interface InvoiceListProps {
  invoices: Invoice[];
  onArchiveInvoice: (id: string) => void;
  onRestoreInvoice: (id: string) => void;
  onDeleteInvoicePermanently: (id: string) => void;
  onEditInvoice: (invoice: Invoice) => void;
  profile: BusinessProfile;
  t: any;
  setCurrentView: (view: string) => void;
  setSelectedInvoice: (invoice: Invoice) => void;
  onQuickInvoice: () => void;
  onLogout?: () => void;
}

type FilterStatus = 'all' | 'paid' | 'pending' | 'overdue' | 'archived';

export default function InvoiceList({
  invoices,
  onArchiveInvoice,
  onRestoreInvoice,
  onDeleteInvoicePermanently,
  onEditInvoice,
  profile,
  t,
  setCurrentView,
  setSelectedInvoice,
  onQuickInvoice,
  onLogout
}: InvoiceListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

  // Filter invoices logic
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.client.company && inv.client.company.toLowerCase().includes(searchTerm.toLowerCase()));
      
    if (statusFilter === 'archived') {
      return matchesSearch && inv.isArchived === true;
    }

    if (inv.isArchived === true) return false;

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && inv.status === statusFilter;
  });

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <HeaderBar
        title={t.invoices}
        subtitle={profile.language === 'id' ? `Total ${invoices.length} tagihan tercatat` : `Total ${invoices.length} recorded invoices`}
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      {/* Main Container */}
      <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        
        {/* Controls: Search and Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          {/* Search Box */}
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

          {/* Filter Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                statusFilter === 'all'
                  ? 'bg-blue-50 text-[#2563EB]'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {profile.language === 'id' ? 'Semua' : 'All'}
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                statusFilter === 'paid'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <CheckCircle size={12} />
              <span>{t.paid}</span>
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                statusFilter === 'pending'
                  ? 'bg-amber-50 text-amber-600'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Clock size={12} />
              <span>{t.pending}</span>
            </button>
            <button
              onClick={() => setStatusFilter('overdue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                statusFilter === 'overdue'
                  ? 'bg-rose-50 text-rose-600'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <AlertCircle size={12} />
              <span>{t.overdue}</span>
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                statusFilter === 'archived'
                  ? 'bg-purple-50 text-purple-600'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Archive size={12} />
              <span>{profile.language === 'id' ? 'Arsip' : 'Archive'}</span>
            </button>
          </div>
        </div>

        {/* Desktop View Table */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="p-4 pl-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.invoiceId}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.clientName}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.issueDate}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.dueDate}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.amount}</th>
                  <th className="p-4 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider">{t.status}</th>
                  <th className="p-4 pr-6 text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wider text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">
                      {profile.language === 'id' ? 'Tidak ada tagihan yang cocok' : 'No matching invoices'}
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => (
                    <tr 
                      key={inv.id}
                      className="hover:bg-slate-50/60 transition-all cursor-pointer group"
                      onClick={() => {
                        setSelectedInvoice(inv);
                        setCurrentView('invoice-detail');
                      }}
                    >
                      <td className="p-4 pl-6">
                        <span className="font-sans font-semibold text-sm text-slate-800 group-hover:text-[#2563EB] transition-colors">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2563EB] font-bold text-xs flex items-center justify-center shrink-0">
                            {inv.client.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-sans font-semibold text-xs text-slate-700 leading-tight">{inv.client.name}</p>
                            {inv.client.company && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{inv.client.company}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-medium text-slate-500">
                        {formatDate(inv.issueDate, profile.language)}
                      </td>
                      <td className="p-4 text-xs font-medium text-slate-500">
                        {formatDate(inv.dueDate, profile.language)}
                      </td>
                      <td className="p-4 font-sans font-bold text-sm text-slate-800">
                        {formatCurrency(inv.total, profile.currency)}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          inv.status === 'paid' 
                            ? 'bg-emerald-50 text-emerald-600' 
                            : inv.status === 'pending'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-rose-50 text-rose-600'
                        }`}>
                          {inv.status === 'paid' ? (
                            <CheckCircle size={12} />
                          ) : inv.status === 'pending' ? (
                            <Clock size={12} />
                          ) : (
                            <AlertCircle size={12} />
                          )}
                          <span>
                            {inv.status === 'paid' ? t.paid : inv.status === 'pending' ? t.pending : t.overdue}
                          </span>
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {inv.isArchived ? (
                            <>
                              <button
                                onClick={() => onRestoreInvoice(inv.id)}
                                className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all cursor-pointer"
                                title={profile.language === 'id' ? "Kembalikan dari Arsip" : "Restore from Archive"}
                              >
                                <RotateCcw size={16} />
                              </button>
                              <button
                                onClick={() => onDeleteInvoicePermanently(inv.id)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer"
                                title={profile.language === 'id' ? "Hapus Permanen" : "Delete Permanently"}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => onEditInvoice(inv)}
                                className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all cursor-pointer"
                                title={profile.language === 'id' ? "Edit Tagihan" : "Edit Invoice"}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => onArchiveInvoice(inv.id)}
                                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
                                title={profile.language === 'id' ? "Arsipkan" : "Archive"}
                              >
                                <Archive size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden space-y-3">
          {filteredInvoices.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 text-center text-slate-400 text-sm">
              {profile.language === 'id' ? 'Tidak ada tagihan yang cocok' : 'No matching invoices'}
            </div>
          ) : (
            filteredInvoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => {
                  setSelectedInvoice(inv);
                  setCurrentView('invoice-detail');
                }}
                className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3 cursor-pointer active:scale-[0.99] transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-sans font-bold text-slate-800 text-sm">{inv.invoiceNumber}</span>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{inv.client.name}</p>
                  </div>
                  
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    inv.status === 'paid' 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : inv.status === 'pending'
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-rose-50 text-rose-600'
                  }`}>
                    {inv.status === 'paid' ? t.paid : inv.status === 'pending' ? t.pending : t.overdue}
                  </span>
                </div>

                <div className="border-t border-slate-50 pt-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">{t.dueDate}</span>
                    <span className="text-xs text-slate-600 font-medium">{formatDate(inv.dueDate, profile.language)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">{t.amount}</span>
                    <span className="font-sans font-extrabold text-sm text-[#2563EB]">{formatCurrency(inv.total, profile.currency)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-2 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {inv.isArchived ? (
                    <>
                      <button
                        onClick={() => onRestoreInvoice(inv.id)}
                        className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
                      >
                        <RotateCcw size={14} />
                        <span>{profile.language === 'id' ? 'Pulihkan' : 'Restore'}</span>
                      </button>
                      <button
                        onClick={() => onDeleteInvoicePermanently(inv.id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
                      >
                        <Trash2 size={14} />
                        <span>{profile.language === 'id' ? 'Hapus' : 'Delete'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onEditInvoice(inv)}
                        className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
                      >
                        <Pencil size={14} />
                        <span>{profile.language === 'id' ? 'Edit' : 'Edit'}</span>
                      </button>
                      <button
                        onClick={() => onArchiveInvoice(inv.id)}
                        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
                      >
                        <Archive size={14} />
                        <span>{profile.language === 'id' ? 'Arsip' : 'Archive'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

      </main>
    </div>
  );
}
