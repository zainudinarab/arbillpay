import { Client, Invoice, PaymentGateway, BusinessProfile } from '../types';

export const defaultClients: Client[] = [
  {
    id: 'c-1',
    name: 'Budi Santoso',
    email: 'budi@angkasajaya.co.id',
    phone: '081234567890',
    company: 'PT Angkasa Jaya',
    address: 'Jl. Jendral Sudirman No. 45, Jakarta Selatan'
  },
  {
    id: 'c-2',
    name: 'Siti Aminah',
    email: 'siti@majubersama.com',
    phone: '085678901234',
    company: 'CV Maju Bersama',
    address: 'Jl. Asia Afrika No. 12, Bandung'
  },
  {
    id: 'c-3',
    name: 'Hendra Wijaya',
    email: 'hendra@berkahmandiri.id',
    phone: '081987654321',
    company: 'Toko Berkah Mandiri',
    address: 'Ruko Artha Gading Blok B No. 9, Jakarta Utara'
  },
  {
    id: 'c-4',
    name: 'Dewi Lestari',
    email: 'dewi@nusantaradigital.co.id',
    phone: '082133445566',
    company: 'PT Nusantara Digital',
    address: 'Gedung Cyber 2 Lantai 18, Jakarta Selatan'
  }
];

export const defaultInvoices: Invoice[] = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-001',
    client: defaultClients[0],
    issueDate: '2026-06-24',
    dueDate: '2026-07-08',
    status: 'paid',
    paymentMethod: 'QRIS',
    paymentDate: '2026-06-25',
    notes: 'Jasa pembuatan landing page dan setup domain.',
    enabledPaymentMethods: ['qris', 'gopay', 'ovo', 'dana', 'bank_transfer'],
    items: [
      { id: 'i-1', description: 'Jasa Pembuatan Landing Page Company Profile', quantity: 1, price: 12000000, amount: 12000000 },
      { id: 'i-2', description: 'Setup Hosting & Domain (.co.id) 1 Tahun', quantity: 1, price: 2000000, amount: 2000000 }
    ],
    subtotal: 14000000,
    taxRate: 11, // PPN 11%
    taxAmount: 1540000,
    total: 15540000
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-2026-002',
    client: defaultClients[1],
    issueDate: '2026-06-22',
    dueDate: '2026-07-15',
    status: 'pending',
    notes: 'Pengadaan lisensi software desain kreatif bulanan.',
    enabledPaymentMethods: ['gopay', 'ovo', 'dana', 'bank_transfer'],
    items: [
      { id: 'i-3', description: 'Lisensi Adobe Creative Cloud for Teams', quantity: 5, price: 1500000, amount: 7500000 },
      { id: 'i-4', description: 'Biaya Administrasi & Setup Akun', quantity: 1, price: 500000, amount: 500000 }
    ],
    subtotal: 8000000,
    taxRate: 11,
    taxAmount: 880000,
    total: 8880000
  },
  {
    id: 'inv-3',
    invoiceNumber: 'INV-2026-003',
    client: defaultClients[3],
    issueDate: '2026-05-15',
    dueDate: '2026-05-30',
    status: 'overdue',
    notes: 'Jasa konsultasi pengembangan sistem IT tahap 1.',
    enabledPaymentMethods: ['bank_transfer'],
    items: [
      { id: 'i-5', description: 'Consulting Fee - IT Architecture Design', quantity: 1, price: 25000000, amount: 25000000 }
    ],
    subtotal: 25000000,
    taxRate: 11,
    taxAmount: 2750000,
    total: 27750000
  },
  {
    id: 'inv-4',
    invoiceNumber: 'INV-2026-004',
    client: defaultClients[2],
    issueDate: '2026-06-18',
    dueDate: '2026-07-02',
    status: 'paid',
    paymentMethod: 'GoPay',
    paymentDate: '2026-06-19',
    notes: 'Pembelian printer kantor laserjet warna.',
    enabledPaymentMethods: ['qris', 'gopay', 'dana'],
    items: [
      { id: 'i-6', description: 'Printer HP Color LaserJet Pro', quantity: 1, price: 4500000, amount: 4500000 }
    ],
    subtotal: 4500000,
    taxRate: 0,
    taxAmount: 0,
    total: 4500000
  },
  {
    id: 'inv-5',
    invoiceNumber: 'INV-2026-06-05',
    client: defaultClients[1],
    issueDate: '2026-06-10',
    dueDate: '2026-06-25',
    status: 'paid',
    paymentMethod: 'DANA',
    paymentDate: '2026-06-12',
    notes: 'Pembelian ATK dan perlengkapan inventaris kantor.',
    enabledPaymentMethods: ['gopay', 'ovo', 'dana'],
    items: [
      { id: 'i-7', description: 'Kertas A4 Sinar Dunia 70gsm', quantity: 20, price: 50000, amount: 1000000 },
      { id: 'i-8', description: 'Tinta Printer Epson Black & Color Set', quantity: 2, price: 600000, amount: 1200000 }
    ],
    subtotal: 2200000,
    taxRate: 11,
    taxAmount: 242000,
    total: 2442000
  }
];

export const defaultGateways: PaymentGateway[] = [
  {
    id: 'qris',
    name: 'QRIS',
    displayName: 'QRIS (Gopay, OVO, Dana, LinkAja)',
    iconName: 'QrCode',
    isActive: true,
    type: 'qris',
    payoutShare: 45,
    colorClass: 'bg-rose-500 text-white',
    accountNumber: 'NMID-102030405060',
    accountName: 'BILLAVA MERCHANT'
  },
  {
    id: 'gopay',
    name: 'GoPay',
    displayName: 'GoPay E-Wallet',
    iconName: 'Wallet',
    isActive: true,
    type: 'ewallet',
    payoutShare: 25,
    colorClass: 'bg-teal-600 text-white',
    accountNumber: '081234567890',
    accountName: 'PT Angkasa Jaya'
  },
  {
    id: 'ovo',
    name: 'OVO',
    displayName: 'OVO E-Wallet',
    iconName: 'CreditCard',
    isActive: true,
    type: 'ewallet',
    payoutShare: 15,
    colorClass: 'bg-indigo-700 text-white',
    accountNumber: '081234567890',
    accountName: 'PT Angkasa Jaya'
  },
  {
    id: 'dana',
    name: 'DANA',
    displayName: 'DANA E-Wallet',
    iconName: 'Smartphone',
    isActive: true,
    type: 'ewallet',
    payoutShare: 10,
    colorClass: 'bg-blue-600 text-white',
    accountNumber: '081234567890',
    accountName: 'PT Angkasa Jaya'
  },
  {
    id: 'linkaja',
    name: 'LinkAja',
    displayName: 'LinkAja E-Wallet',
    iconName: 'Coins',
    isActive: false,
    type: 'ewallet',
    payoutShare: 5,
    colorClass: 'bg-red-600 text-white',
    accountNumber: '081234567890',
    accountName: 'PT Angkasa Jaya'
  },
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    displayName: 'Transfer Bank (BCA, Mandiri, BRI)',
    iconName: ' Landmark',
    isActive: true,
    type: 'bank',
    payoutShare: 5,
    colorClass: 'bg-blue-800 text-white',
    accountNumber: '8012-3456-7890',
    accountName: 'Budi Santoso'
  }
];

export const defaultBusinessProfile: BusinessProfile = {
  name: 'Budi Santoso',
  role: 'Direktur Keuangan',
  companyName: 'Nusa Karya Studio',
  email: 'budi@nusakaryastudio.id',
  phone: '081234567890',
  address: 'Gedung Co-Working Space Lt. 3, Jl. Kemang Raya No. 10, Jakarta Selatan',
  logoUrl: '',
  taxId: '01.234.567.8-012.000', // NPWP
  currency: 'IDR',
  language: 'id',
  themeColor: 'blue',
  storageUsed: 6.4,
  storageMax: 10
};
