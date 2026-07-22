/**
 * Types for Billava - Indonesian Invoice Web Mobile App
 */

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address?: string;
  company?: string;
  type?: 'client' | 'supplier' | 'both';
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  price: number; // in IDR
  amount: number;
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: Client;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number; // percentage (e.g. 11 for PPN 11%)
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  notes?: string;
  paymentDate?: string;
  enabledPaymentMethods: string[]; // e.g. ['qris', 'gopay', 'ovo', 'dana', 'bca']
  isArchived?: boolean;
}

export interface PaymentGateway {
  id: string;
  name: string;
  displayName: string;
  iconName: string;
  isActive: boolean;
  type: 'ewallet' | 'qris' | 'bank';
  payoutShare: number; // percentage of use for charts
  colorClass: string;
  accountNumber?: string;
  accountName?: string;
}

export interface BusinessProfile {
  name: string;
  role: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
  taxId?: string; // NPWP
  currency: 'IDR' | 'USD';
  language: 'id' | 'en';
  storageUsed: number; // in GB
  storageMax: number; // in GB
}
