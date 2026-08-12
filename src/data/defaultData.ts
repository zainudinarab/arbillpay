import { Client, Invoice, PaymentGateway, BusinessProfile } from '../types';

export const defaultClients: Client[] = [];

export const defaultInvoices: Invoice[] = [];

export const defaultGateways: PaymentGateway[] = [
  {
    id: 'qris',
    name: 'QRIS Direct',
    displayName: 'QRIS All Payment (Gopay, OVO, DANA, BCA Mobile)',
    iconName: 'QrCode',
    isActive: true,
    type: 'qris',
    payoutShare: 45,
    colorClass: 'bg-rose-500 text-white',
    accountNumber: 'NMID-102030405060',
    accountName: 'ARBILLPAY MERCHANT'
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
  name: 'zainudin arab',
  role: 'Super Admin / Owner',
  companyName: 'Arbill Telecom',
  email: 'ketua11@gmail.com',
  phone: '081234567890',
  address: 'Jl. Raya Utama Arbill No. 1, Jawa Timur',
  logoUrl: '',
  taxId: '01.234.567.8-012.000', // NPWP
  currency: 'IDR',
  language: 'id',
  themeColor: 'blue',
  mapLat: -7.2585,
  mapLng: 112.7550,
  mapZoom: 16,
  storageUsed: 6.4,
  storageMax: 10
};
