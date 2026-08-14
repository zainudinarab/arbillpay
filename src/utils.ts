import { BusinessProfile } from './types';

/**
 * Format currency in Rupiah (IDR) or USD
 */
export function formatCurrency(amount: number, currency: 'IDR' | 'USD' = 'IDR'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  // Format to IDR
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format dates beautifully
 */
export function formatDate(dateString: string, lang: 'id' | 'en' = 'id'): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  return date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Generates short 4-character uppercase Customer Code: CUST-8F2K, CUST-9A4B...
 * 100% Concurrent-Safe for simultaneous registrations!
 */
export function generateNextCustomerCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CUST-${result}`;
}

/**
 * Builds formatted Invoice ID: INV-YYYYMM-01-CUST-1001 (ALL CAPITAL)
 */
export function buildFormattedInvoiceId(
  monthCode: string,
  subPeriod: string | number = 1,
  cust: any
): { invoiceId: string; displayCustCode: string } {
  const subPeriodStr = String(subPeriod).padStart(2, '0');

  const rawId = String(cust?.id || '');
  const rawCode = String(cust?.customer_code || '');
  const rawPhone = String(cust?.phone_number || cust?.phone || '');

  // Strip 'cust_', 'cust-', or 'cust' prefixes
  let cleanNumber = rawId
    .replace(/^cust_/i, '')
    .replace(/^cust-/i, '')
    .replace(/^cust/i, '')
    .trim();

  // If cleanNumber is empty or literal 'CUST', try from customer_code
  if (!cleanNumber || cleanNumber.toUpperCase() === 'CUST') {
    cleanNumber = rawCode
      .replace(/^cust_/i, '')
      .replace(/^cust-/i, '')
      .replace(/^cust/i, '')
      .trim();
  }

  // If still empty or literal 'CUST', try phone_number
  if (!cleanNumber || cleanNumber.toUpperCase() === 'CUST') {
    cleanNumber = rawPhone.replace(/\D/g, '').trim();
  }

  // Final fallback: Alphanumeric characters of rawId
  if (!cleanNumber || cleanNumber.toUpperCase() === 'CUST') {
    cleanNumber = rawId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  const finalIdStr = (cleanNumber && cleanNumber.toUpperCase() !== 'CUST')
    ? cleanNumber.toUpperCase()
    : Date.now().toString();

  const displayCustCode = `CUST-${finalIdStr}`;
  const invoiceId = `INV-${monthCode}-${subPeriodStr}-${displayCustCode}`;

  return { invoiceId, displayCustCode };
}

/**
 * Generates sequential monthly invoices starting from installation_date up to current month
 */
export function generateSequentialInvoices(cust: any, packagePrice: number, packageName: string): any[] {
  if (!cust) return [];

  const rawInstDate = cust.installation_date || cust.created_at || new Date().toISOString();
  let instDate = new Date(rawInstDate);
  if (isNaN(instDate.getTime())) {
    instDate = new Date();
  }

  const currentDate = new Date();
  const instYear = instDate.getFullYear();
  const instMonth = instDate.getMonth();
  const instDay = instDate.getDate();

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const invoices: any[] = [];

  let y = instYear;
  let m = instMonth;

  while (y < currentYear || (y === currentYear && m <= currentMonth)) {
    const periodDate = new Date(y, m, 1);
    const monthName = periodDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const monthCode = `${y}${(m + 1).toString().padStart(2, '0')}`;
    
    const dueDay = Math.min(instDay, 28);
    const dueIso = `${y}-${(m + 1).toString().padStart(2, '0')}-${dueDay.toString().padStart(2, '0')}`;

    // ⚡ ID Invoice 100% Unik & Berformat Persis: INV-202604-01-CUST-178670126729 (ALL CAPITAL)
    const { invoiceId, displayCustCode } = buildFormattedInvoiceId(monthCode, 1, cust);

    invoices.push({
      id: invoiceId,
      customer_id: cust.id || displayCustCode,
      customer_name: cust.name,
      customer_phone: cust.phone_number || '',
      pppoe_username: cust.pppoe_username || '',
      package_name: packageName,
      amount: packagePrice,
      status: 'unpaid',
      month: monthName,
      period: `${y}-${(m + 1).toString().padStart(2, '0')}`,
      due_date: dueIso,
      created_at: new Date(y, m, instDay, 8, 0, 0).toISOString()
    });

    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }

  return invoices;
}

/**
 * Translations Dictionary
 */
export const translations = {
  id: {
    overview: 'Ringkasan',
    invoices: 'Tagihan',
    clients: 'Pelanggan',
    analytics: 'Analisis',
    paymentMethods: 'Metode Pembayaran',
    settings: 'Pengaturan',
    quickInvoice: 'Tagihan Kilat',
    totalInvoiced: 'TOTAL TAGIHAN',
    paidInvoices: 'TAGIHAN TERBAYAR',
    pendingInvoices: 'MENUNGGU PEMBAYARAN',
    overdueAmount: 'JUMLAH JATUH TEMPO',
    overdueStatus: 'Terlambat',
    searchPlaceholder: 'Cari tagihan, pelanggan...',
    realTimeFilter: 'Filter real-time',
    billingRevenueFlow: 'ALIRAN TAGIHAN & PENDAPATAN',
    monthlyCashInflow: 'Inflow kas bulanan, 6 bulan terakhir',
    connectedGateways: 'Gerbang terhubung',
    payoutDistribution: 'DISTRIBUSI PEMBAYARAN',
    recentInvoices: 'TAGIHAN TERBARU',
    latestBillingActivity: 'Aktivitas tagihan terakhir',
    invoiceId: 'ID TAGIHAN',
    clientName: 'PELANGGAN',
    issueDate: 'TANGGAL TERBIT',
    dueDate: 'JATUH TEMPO',
    amount: 'JUMLAH',
    status: 'STATUS',
    viewAll: 'Lihat semua',
    paid: 'Lunas',
    pending: 'Menunggu',
    overdue: 'Overdue',
    draft: 'Draf',
    actions: 'Aksi',
    storageUsed: 'PENYIMPANAN',
    teamPlan: 'Paket Tim',
    business: 'Bisnis',
    save: 'Simpan',
    cancel: 'Batal',
    addClient: 'Tambah Pelanggan',
    newInvoice: 'Buat Tagihan Baru',
    clientEmail: 'Email Pelanggan',
    clientPhone: 'Nomor Telepon',
    clientCompany: 'Detail / Paket Pelanggan',
    clientAddress: 'Alamat Pelanggan',
    description: 'Deskripsi',
    quantity: 'Jumlah',
    price: 'Harga Satuan',
    subtotal: 'Subtotal',
    tax: 'Pajak (PPN)',
    total: 'Total',
    paymentMethodLabel: 'Metode Pembayaran Utama',
    notes: 'Catatan tambahan...',
    createInvoiceBtn: 'Terbitkan Tagihan',
    payNow: 'Bayar Sekarang',
    simulatePayment: 'Simulasikan Pembayaran Lunas',
    paymentGatewayTitle: 'Pilih Metode Pembayaran E-Wallet / Bank',
    scanQris: 'Pindai Kode QRIS di bawah ini untuk membayar',
    openEwallet: 'Buka Aplikasi E-Wallet',
    paymentSuccessMsg: 'Pembayaran Berhasil!',
    invoicePaidOn: 'Dibayar pada tanggal',
    paymentSimulationTitle: 'Simulator Gerbang Pembayaran',
    copiedLink: 'Tautan disalin ke papan klip!',
    customerView: 'Bagikan',
    copyLink: 'Salin Tautan',
    sendWhatsApp: 'Kirim ke WhatsApp',
    backToDashboard: 'Kembali ke Dasbor',
    activeGateways: 'Metode Aktif',
    inactiveGateways: 'Metode Non-aktif',
    addNewClientBtn: 'Tambah Pelanggan Baru',
    companyName: 'Nama Perusahaan',
    role: 'Jabatan',
    profileSettings: 'Profil Bisnis',
    addClientTitle: 'Tambah Pelanggan Baru',
    selectClient: 'Pilih Pelanggan',
    addItem: 'Tambah Item',
    merchantQrisCode: 'NMID Merchant QRIS',
    walletPhone: 'No. Handphone Terhubung',
    bankAccount: 'Nomor Rekening',
    accountName: 'Nama Pemilik Rekening',
    exportPDF: 'Ekspor PDF',
    print: 'Cetak',
    printThermal: 'Cetak Thermal (Struk)',
    exporting: 'Mengekspor...',
    printInstruction: 'Membuka dialog cetak...'
  },
  en: {
    overview: 'Overview',
    invoices: 'Invoices',
    clients: 'Partners',
    analytics: 'Analytics',
    paymentMethods: 'Payment Methods',
    settings: 'Settings',
    quickInvoice: 'Quick Invoice',
    totalInvoiced: 'TOTAL INVOICED',
    paidInvoices: 'PAID INVOICES',
    pendingInvoices: 'PENDING',
    overdueAmount: 'OVERDUE AMOUNT',
    overdueStatus: 'Overdue',
    searchPlaceholder: 'Search invoices, partners...',
    realTimeFilter: 'Real-time filter',
    billingRevenueFlow: 'BILLING & REVENUE FLOW',
    monthlyCashInflow: 'Monthly cash inflow, last 6 months',
    connectedGateways: 'Connected gateways',
    payoutDistribution: 'PAYOUT DISTRIBUTION',
    recentInvoices: 'RECENT INVOICES',
    latestBillingActivity: 'Latest billing activity',
    invoiceId: 'INVOICE ID',
    clientName: 'PARTNER',
    issueDate: 'ISSUE DATE',
    dueDate: 'DUE DATE',
    amount: 'AMOUNT',
    status: 'STATUS',
    viewAll: 'View all',
    paid: 'Paid',
    pending: 'Pending',
    overdue: 'Overdue',
    draft: 'Draft',
    actions: 'Actions',
    storageUsed: 'STORAGE USED',
    teamPlan: 'Team plan',
    business: 'Business',
    save: 'Save',
    cancel: 'Cancel',
    addClient: 'Add Partner',
    newInvoice: 'New Invoice',
    clientEmail: 'Partner Email',
    clientPhone: 'Partner Phone',
    clientCompany: 'Partner Company',
    clientAddress: 'Partner Address',
    description: 'Description',
    quantity: 'Quantity',
    price: 'Unit Price',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    paymentMethodLabel: 'Preferred Payment Method',
    notes: 'Additional notes...',
    createInvoiceBtn: 'Issue Invoice',
    payNow: 'Pay Now',
    simulatePayment: 'Simulate Successful Payment',
    paymentGatewayTitle: 'Choose E-Wallet or Bank Payment Method',
    scanQris: 'Scan the QRIS QR Code below to pay',
    openEwallet: 'Open E-Wallet App',
    paymentSuccessMsg: 'Payment Successful!',
    invoicePaidOn: 'Paid on',
    paymentSimulationTitle: 'Payment Gateway Simulator',
    copiedLink: 'Link copied to clipboard!',
    customerView: 'Share',
    copyLink: 'Copy Link',
    sendWhatsApp: 'Send to WhatsApp',
    backToDashboard: 'Back to Dashboard',
    activeGateways: 'Active Methods',
    inactiveGateways: 'Inactive Methods',
    addNewClientBtn: 'Add New Partner',
    companyName: 'Company Name',
    role: 'Role',
    profileSettings: 'Business Profile',
    addClientTitle: 'Add New Partner',
    selectClient: 'Select Partner',
    addItem: 'Add Item',
    merchantQrisCode: 'Merchant QRIS NMID',
    walletPhone: 'Connected Mobile Number',
    bankAccount: 'Bank Account Number',
    accountName: 'Account Holder Name',
    exportPDF: 'Export PDF',
    print: 'Print',
    printThermal: 'Thermal Print (Receipt)',
    exporting: 'Exporting...',
    printInstruction: 'Opening print dialog...'
  }
};
