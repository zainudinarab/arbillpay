/**
 * Types for ArbillPay - Indonesian E-Wallet & WiFi Management System
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
  unitPrice?: number;
  amount: number;
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: Client;
  issueDate: string;
  dueDate: string;
  startDate?: string;
  endDate?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number; // percentage (e.g. 11 for PPN 11%)
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  notes?: string;
  paymentDate?: string;
  enabledPaymentMethods?: string[]; // e.g. ['qris', 'gopay', 'ovo', 'dana', 'bca']
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

export type UserRole = 'owner' | 'kasir' | 'pelanggan';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  phone_number?: string;
  phone?: string;
  user_id?: string;
  token?: string;
  arabpay_user_id?: string;
  arabpay_balance?: number;
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
  themeColor?: 'blue' | 'emerald' | 'violet' | 'rose' | 'amber' | 'dark';
  mapLat?: number;
  mapLng?: number;
  mapZoom?: number;
  waGatewayToken?: string;
  waGatewayUrl?: string;
  storageUsed: number; // in GB
  storageMax: number; // in GB
}

export interface CustomerPortalSection {
  id: 'announcement' | 'hero' | 'flash_sale' | 'wallet_widget' | 'quick_billing' | 'vouchers' | 'monthly_packages' | 'contact_footer';
  label: string;
  enabled: boolean;
  order: number;
  variant?: 'grid' | 'list' | 'carousel';
  columns?: 1 | 2 | 3;
}

export interface CustomerPortalConfig {
  template_theme: 'dark_glass' | 'clean_light' | 'mikhmon_compact' | 'voucher_store';
  primary_color: 'emerald' | 'indigo' | 'rose' | 'sky' | 'amber';
  voucher_columns?: 1 | 2 | 3;
  branding: {
    hotspot_name: string;
    tagline: string;
    contact_phone: string;
    logo_url?: string;
    banner_url?: string;
  };
  announcement: {
    enabled: boolean;
    text: string;
    type: 'info' | 'promo' | 'warning';
  };
  flash_sale?: {
    enabled: boolean;
    title: string;
    subtitle: string;
    badge_label: string;
    end_time: string; // ISO datetime string e.g. "2026-09-30T23:59:59"
    discount_text: string;
    target_package_id?: string;
    target_package_name?: string;
    original_price?: number;
    promo_price?: number;
    quota_limit?: number;
    quota_sold?: number;
    max_per_user?: number;
    button_text: string;
  };
  sections: CustomerPortalSection[];
}


