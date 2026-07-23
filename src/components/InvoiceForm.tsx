import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Calendar, 
  UserPlus, 
  Calculator,
  Save,
  Check
} from 'lucide-react';
import { Invoice, Client, InvoiceItem, BusinessProfile } from '../types';
import { formatCurrency } from '../utils';

interface InvoiceFormProps {
  clients: Client[];
  profile: BusinessProfile;
  t: any;
  onSaveInvoice: (invoice: Invoice) => void;
  setCurrentView: (view: string) => void;
  onQuickAddClient: (client: Client) => void;
  invoiceToEdit?: Invoice | null;
}

export default function InvoiceForm({
  clients,
  profile,
  t,
  onSaveInvoice,
  setCurrentView,
  onQuickAddClient,
  invoiceToEdit
}: InvoiceFormProps) {
  const [selectedClientId, setSelectedClientId] = useState(invoiceToEdit ? invoiceToEdit.client.id : (clients[0]?.id || ''));
  const [issueDate, setIssueDate] = useState(invoiceToEdit ? invoiceToEdit.issueDate : new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    if (invoiceToEdit) return invoiceToEdit.dueDate;
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 14); // Default 14 days payment term
    return nextWeek.toISOString().split('T')[0];
  });
  
  // Line Items
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (invoiceToEdit) return invoiceToEdit.items;
    return [
      { id: 'item-1', description: 'Jasa Pembuatan Website Kantor', quantity: 1, price: 10000000, amount: 10000000 }
    ];
  });
  
  // Tax / PPN configuration
  const [taxRate, setTaxRate] = useState<number>(invoiceToEdit ? invoiceToEdit.taxRate : 11); // PPN 11% is standard in Indonesia
  const [notes, setNotes] = useState(invoiceToEdit ? (invoiceToEdit.notes || '') : '');
  
  // Selected Payment Methods for this invoice
  const [selectedMethods, setSelectedMethods] = useState<string[]>(invoiceToEdit ? invoiceToEdit.enabledPaymentMethods : ['qris', 'gopay', 'ovo', 'dana', 'bank_transfer']);

  // Quick Client Add inside form
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [qcName, setQcName] = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcCompany, setQcCompany] = useState('');

  // Auto-calculated totals
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}`,
      description: '',
      quantity: 1,
      price: 0,
      amount: 0
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) return; // Must have at least 1 item
    setItems(items.filter(it => it.id !== id));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    const updated = items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'price') {
          const qty = field === 'quantity' ? Number(value) : item.quantity;
          const prc = field === 'price' ? Number(value) : item.price;
          updatedItem.amount = qty * prc;
        }
        return updatedItem;
      }
      return item;
    });
    setItems(updated);
  };

  const handleQuickClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcName || !qcPhone) return;

    const newClient: Client = {
      id: `c-${Date.now()}`,
      name: qcName,
      email: qcEmail || '-',
      phone: qcPhone,
      company: qcCompany
    };

    onQuickAddClient(newClient);
    setSelectedClientId(newClient.id);
    
    // Reset
    setQcName('');
    setQcEmail('');
    setQcPhone('');
    setQcCompany('');
    setShowQuickClient(false);
  };

  const handleToggleMethod = (id: string) => {
    if (selectedMethods.includes(id)) {
      setSelectedMethods(selectedMethods.filter(m => m !== id));
    } else {
      setSelectedMethods([...selectedMethods, id]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find(c => c.id === selectedClientId);
    if (!client) return;

    // Validate items
    const invalidItem = items.some(it => !it.description || it.quantity <= 0 || it.price <= 0);
    if (invalidItem) {
      alert(profile.language === 'id' ? 'Silakan lengkapi deskripsi, jumlah dan harga untuk semua item.' : 'Please fill all item descriptions, quantities and prices.');
      return;
    }

    const newInvoice: Invoice = {
      id: invoiceToEdit ? invoiceToEdit.id : `inv-${Date.now()}`,
      invoiceNumber: invoiceToEdit ? invoiceToEdit.invoiceNumber : `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      client,
      issueDate,
      dueDate,
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      status: invoiceToEdit ? invoiceToEdit.status : 'pending',
      notes,
      enabledPaymentMethods: selectedMethods,
      isArchived: invoiceToEdit ? invoiceToEdit.isArchived : false
    };

    onSaveInvoice(newInvoice);
    setCurrentView('invoices');
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 md:px-8 z-10 flex items-center gap-3">
        <button 
          onClick={() => setCurrentView('invoices')}
          className="p-1.5 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-sans font-bold text-lg md:text-xl text-slate-800">
            {invoiceToEdit 
              ? (profile.language === 'id' ? 'Edit Tagihan' : 'Edit Invoice') 
              : t.newInvoice
            }
          </h1>
          <p className="text-xs text-slate-400">
            {invoiceToEdit 
              ? (profile.language === 'id' ? 'Perbarui rincian tagihan Anda' : 'Update your invoice details') 
              : (profile.language === 'id' ? 'Buat tagihan baru instan' : 'Create an instant new invoice')
            }
          </p>
        </div>
      </header>

      {/* Main Form */}
      <main className="p-4 md:p-8 max-w-4xl mx-auto">
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Card: Client & Dates */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-400 tracking-wider uppercase">Informasi Dasar</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Client Selector Row */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t.selectClient}</label>
                  <button
                    type="button"
                    onClick={() => setShowQuickClient(true)}
                    className="text-xs font-bold text-[#2563EB] hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>{t.addNewClientBtn}</span>
                  </button>
                </div>
                
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                >
                  <option value="">-- Pilih Klien / Penerima --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t.issueDate}</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t.dueDate}</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Quick Client Add Overlay Popup */}
          {showQuickClient && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-sans font-bold text-base text-slate-800">{t.addClientTitle}</h3>
                  <button 
                    type="button"
                    onClick={() => setShowQuickClient(false)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
                  >
                    &times;
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={qcName}
                      onChange={(e) => setQcName(e.target.value)}
                      placeholder="e.g. Budi Santoso"
                      className="w-full px-3.5 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                   <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Email</label>
                    <input
                      type="email"
                      value={qcEmail}
                      onChange={(e) => setQcEmail(e.target.value)}
                      placeholder="budi@example.com"
                      className="w-full px-3.5 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">No. HP *</label>
                    <input
                      type="tel"
                      required
                      value={qcPhone}
                      onChange={(e) => setQcPhone(e.target.value)}
                      placeholder="081234..."
                      className="w-full px-3.5 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Perusahaan</label>
                    <input
                      type="text"
                      value={qcCompany}
                      onChange={(e) => setQcCompany(e.target.value)}
                      placeholder="PT Angkasa Jaya"
                      className="w-full px-3.5 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-50">
                    <button
                      type="button"
                      onClick={() => setShowQuickClient(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickClientSubmit}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-600 rounded-lg cursor-pointer"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card: Line Items */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-50 pb-3">
              <h3 className="font-sans font-bold text-sm text-slate-400 tracking-wider uppercase">Item Tagihan</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>{t.addItem}</span>
              </button>
            </div>

            {/* List of items */}
            <div className="space-y-4 divide-y divide-slate-50">
              {items.map((item, index) => (
                <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4 first:pt-0">
                  <span className="w-6 h-6 rounded-full bg-slate-50 text-slate-400 text-xs font-bold flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  
                  {/* Item Description */}
                  <div className="flex-1 w-full space-y-1">
                    <label className="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Deskripsi Item</label>
                    <input
                      type="text"
                      required
                      value={item.description}
                      onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                      placeholder="e.g. Jasa Desain Grafis Mandiri"
                      className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="w-full sm:w-20 space-y-1">
                    <label className="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Jumlah</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Price */}
                  <div className="w-full sm:w-36 space-y-1">
                    <label className="sm:hidden text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Harga Satuan (Rp)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={item.price}
                      onChange={(e) => handleItemChange(item.id, 'price', e.target.value)}
                      placeholder="Harga Satuan"
                      className="w-full px-3 py-2 bg-slate-50 border-0 rounded-xl text-xs font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
                    />
                  </div>

                  {/* Calculated total of item */}
                  <div className="w-full sm:w-32 text-right hidden sm:block">
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total</span>
                    <span className="font-sans font-bold text-sm text-slate-800">{formatCurrency(item.amount, profile.currency)}</span>
                  </div>

                  {/* Delete Item row */}
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={items.length === 1}
                    className="p-2 hover:bg-rose-50 text-slate-300 hover:text-rose-600 rounded-xl disabled:opacity-30 cursor-pointer self-end sm:self-auto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Payment Methods Toggle */}
          <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-sans font-bold text-sm text-slate-400 tracking-wider uppercase">Metode Pembayaran yang Diizinkan</h3>
            <p className="text-xs text-slate-400">
              Centang metode pembayaran e-wallet dan bank Indonesia yang ingin Anda tampilkan pada tagihan ini.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
              {[
                { id: 'qris', label: 'QRIS (Gopay/OVO)' },
                { id: 'gopay', label: 'GoPay' },
                { id: 'ovo', label: 'OVO' },
                { id: 'dana', label: 'DANA' },
                { id: 'bank_transfer', label: 'Bank Transfer' }
              ].map((m) => {
                const isChecked = selectedMethods.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleMethod(m.id)}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      isChecked 
                        ? 'border-blue-600 bg-blue-50/20 text-[#2563EB] font-bold' 
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    <span className="text-xs">{m.label}</span>
                    {isChecked && (
                      <Check size={12} className="mx-auto mt-1 bg-blue-600 text-white rounded-full p-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card: Calculations Summary & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Notes */}
            <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
              <h3 className="font-sans font-bold text-sm text-slate-400 tracking-wider uppercase">Catatan Tambahan</h3>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Terima kasih atas kerja samanya. Pembayaran ditunggu sebelum tanggal jatuh tempo."
                className="w-full px-3.5 py-2.5 bg-slate-50 border-0 rounded-xl text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:bg-white transition-all text-slate-700"
              />
            </div>

            {/* Subtotal / Tax / Total */}
            <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3 flex flex-col justify-between">
              <h3 className="font-sans font-bold text-sm text-slate-400 tracking-wider uppercase">Rincian Total</h3>
              
              <div className="space-y-2 pt-2 text-sm">
                <div className="flex justify-between text-slate-500 font-medium">
                  <span>{t.subtotal}</span>
                  <span className="font-sans font-bold text-slate-700">{formatCurrency(subtotal, profile.currency)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <div className="flex items-center gap-1">
                    <span>{t.tax}</span>
                    <input
                      type="number"
                      min="0"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className="w-12 px-1.5 py-0.5 bg-slate-100 border-0 rounded text-center text-xs font-bold text-slate-700"
                    />
                    <span>%</span>
                  </div>
                  <span className="font-sans font-bold text-slate-700">{formatCurrency(taxAmount, profile.currency)}</span>
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-between items-end">
                  <span className="text-base font-bold text-slate-800">{t.total}</span>
                  <span className="font-sans font-extrabold text-xl text-[#2563EB]">
                    {formatCurrency(total, profile.currency)}
                  </span>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-50 mt-4">
                <button
                  type="button"
                  onClick={() => setCurrentView('invoices')}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl border border-slate-100 cursor-pointer text-center"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={!selectedClientId || items.length === 0}
                  className="flex-1 py-3 text-xs font-bold text-white bg-[#2563EB] hover:bg-blue-700 disabled:opacity-40 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save size={16} />
                  <span>
                    {invoiceToEdit 
                      ? (profile.language === 'id' ? 'Simpan Perubahan' : 'Save Changes') 
                      : t.createInvoiceBtn
                    }
                  </span>
                </button>
              </div>

            </div>
          </div>

        </form>

      </main>
    </div>
  );
}
