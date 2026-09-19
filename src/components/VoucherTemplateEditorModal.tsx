import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Code, 
  Eye, 
  RotateCcw, 
  Save, 
  Check, 
  X, 
  Sparkles, 
  Copy, 
  Sliders, 
  FileText, 
  Laptop, 
  Receipt, 
  Grid 
} from 'lucide-react';
import QRCode from 'qrcode';

export interface VoucherPrintItem {
  id: string;
  code: string;
  password?: string;
  profile_name?: string;
  package_name?: string;
  package_price?: number | string;
  rate_limit?: string;
  uptime_limit?: string;
  validity?: string;
  dns_name?: string;
  hotspot_ip?: string;
}

export interface VoucherTemplatePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'grid' | 'thermal' | 'compact' | 'custom';
  html: string;
  css: string;
}

export const VOUCHER_TEMPLATE_PRESETS: VoucherTemplatePreset[] = [
  {
    id: 'mikhmon-default',
    name: 'Mikhmon QR Style (Default Grid A4)',
    icon: 'grid',
    description: 'Format standar Mikhmon dengan QR Code di kiri, kredensial di kanan, dan badge paket.',
    category: 'grid',
    html: `<div class="voucher-card">
  <div class="voucher-header">
    <span class="hotspot-name">{{hotspot_name}}</span>
    <span class="profile-badge">{{profile_name}}</span>
  </div>
  <div class="voucher-body">
    <div class="qr-box">
      {{qr_code}}
      <span class="scan-label">Scan to Login</span>
    </div>
    <div class="credentials-box">
      <div class="cred-row">
        <span class="cred-label">KODE VOUCHER</span>
        <span class="cred-value">{{username}}</span>
      </div>
      <div class="cred-row pass-row">
        <span class="cred-label">PASSWORD</span>
        <span class="cred-pass">{{password}}</span>
      </div>
      <div class="login-url-text">Login: <strong>{{dns_name}}</strong></div>
    </div>
  </div>
  <div class="voucher-footer">
    <span class="voucher-price">{{price}}</span>
    <span class="voucher-validity">{{validity}}</span>
  </div>
</div>`,
    css: `.voucher-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (max-width: 768px) {
  .voucher-grid { grid-template-columns: repeat(2, 1fr); }
}
@media print {
  .voucher-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; padding: 0 !important; }
}
.voucher-card {
  background: #ffffff;
  border: 2px solid #0f172a;
  border-radius: 10px;
  padding: 9px;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  color: #0f172a;
}
.voucher-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1.5px solid #e2e8f0;
  padding-bottom: 4px;
  margin-bottom: 6px;
}
.hotspot-name {
  font-size: 11px;
  font-weight: 900;
  color: #d97706;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.profile-badge {
  font-size: 9px;
  font-weight: 800;
  background: #f1f5f9;
  color: #334155;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
}
.voucher-body {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}
.qr-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #ffffff;
  padding: 3px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  flex-shrink: 0;
}
.voucher-qr {
  width: 64px;
  height: 64px;
  display: block;
}
.scan-label {
  font-size: 7px;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  margin-top: 2px;
  letter-spacing: -0.2px;
}
.credentials-box {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.cred-row {
  margin-bottom: 3px;
}
.cred-label {
  display: block;
  font-size: 7.5px;
  font-weight: 800;
  color: #64748b;
  letter-spacing: 0.5px;
}
.cred-value {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1px;
  color: #020617;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: all;
}
.cred-pass {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
}
.login-url-text {
  font-size: 7.5px;
  color: #64748b;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.login-url-text strong {
  color: #0f172a;
}
.voucher-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1.5px solid #e2e8f0;
  padding-top: 4px;
  margin-top: 6px;
}
.voucher-price {
  font-size: 11px;
  font-weight: 900;
  color: #047857;
}
.voucher-validity {
  font-size: 9px;
  font-weight: 800;
  color: #64748b;
  font-family: ui-monospace, monospace;
}
@media print {
  body { background: white !important; }
  .voucher-card { box-shadow: none !important; border-color: black !important; }
}`
  },
  {
    id: 'thermal-58',
    name: 'Struk Thermal POS (58mm Kasir)',
    icon: 'receipt',
    description: 'Format satu kolom vertikal ramping untuk printer struk thermal bluetooth 58mm.',
    category: 'thermal',
    html: `<div class="thermal-ticket">
  <div class="thermal-header">
    <div class="thermal-title">{{hotspot_name}}</div>
    <div class="thermal-sub">STRUK VOUCHER WIFI HOTSPOT</div>
    <div class="thermal-line">--------------------------------</div>
  </div>
  <div class="thermal-info">
    <div class="thermal-row"><span>Paket:</span><strong>{{profile_name}}</strong></div>
    <div class="thermal-row"><span>Durasi:</span><strong>{{validity}}</strong></div>
    <div class="thermal-row"><span>Harga:</span><strong>{{price}}</strong></div>
    <div class="thermal-line">--------------------------------</div>
  </div>
  <div class="thermal-code-section">
    <div class="thermal-label">KODE VOUCHER / USERNAME</div>
    <div class="thermal-code">{{username}}</div>
    <div class="thermal-pass-row">PASSWORD: <span class="thermal-pass">{{password}}</span></div>
  </div>
  <div class="thermal-qr-box">
    {{qr_code}}
    <div class="thermal-qr-tip">Scan QR di atas untuk Login Langsung</div>
  </div>
  <div class="thermal-footer">
    <div class="thermal-line">--------------------------------</div>
    <div>Buka Browser: <strong>{{dns_name}}</strong></div>
    <div class="thermal-thanks">Terima Kasih & Selamat Menikmati!</div>
  </div>
</div>`,
    css: `.voucher-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px;
  font-family: 'Courier New', Courier, monospace;
}
.thermal-ticket {
  width: 210px; /* 58mm standard printable area */
  background: #ffffff;
  color: #000000;
  padding: 10px 8px;
  border: 1px dashed #cbd5e1;
  text-align: center;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  margin: 0 auto;
}
.thermal-title { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
.thermal-sub { font-size: 8.5px; font-weight: bold; margin-top: 2px; }
.thermal-line { font-size: 10px; margin: 4px 0; overflow: hidden; white-space: nowrap; }
.thermal-info { font-size: 10px; text-align: left; }
.thermal-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
.thermal-code-section { margin: 6px 0; }
.thermal-label { font-size: 8.5px; font-weight: bold; }
.thermal-code { font-size: 17px; font-weight: 900; letter-spacing: 2px; margin: 3px 0; border: 1.5px solid #000; padding: 3px 0; }
.thermal-pass-row { font-size: 10px; margin-top: 3px; }
.thermal-pass { font-size: 12px; font-weight: 900; }
.thermal-qr-box { margin: 8px auto 4px auto; display: flex; flex-direction: column; align-items: center; }
.voucher-qr { width: 85px; height: 85px; display: block; }
.thermal-qr-tip { font-size: 8px; margin-top: 3px; font-weight: bold; }
.thermal-footer { font-size: 8.5px; line-height: 1.4; }
.thermal-thanks { font-weight: bold; margin-top: 2px; }
@media print {
  .voucher-grid { padding: 0 !important; gap: 0 !important; }
  .thermal-ticket { border: none !important; width: 100% !important; max-width: 58mm !important; padding: 6px 0 !important; }
}`
  },
  {
    id: 'thermal-80',
    name: 'Struk Thermal POS (80mm Kasir)',
    icon: 'receipt',
    description: 'Format lebih lapang untuk printer struk kasir 80mm dengan QR besar dan tabel rincian.',
    category: 'thermal',
    html: `<div class="thermal80-ticket">
  <div class="thermal80-header">
    <div class="thermal80-title">{{hotspot_name}}</div>
    <div class="thermal80-sub">BUKTI AKSES INTERNET WI-FI</div>
    <div class="thermal80-div">========================================</div>
  </div>
  <table class="thermal80-table">
    <tr><td>Paket</td><td>: {{profile_name}}</td></tr>
    <tr><td>Masa Aktif</td><td>: {{validity}}</td></tr>
    <tr><td>Kecepatan</td><td>: {{rate_limit}}</td></tr>
    <tr><td>Harga</td><td>: <strong>{{price}}</strong></td></tr>
  </table>
  <div class="thermal80-div">----------------------------------------</div>
  <div class="thermal80-body">
    <div class="thermal80-left">
      <div class="thermal80-box">
        <span class="thermal80-lbl">USERNAME / KODE:</span>
        <span class="thermal80-code">{{username}}</span>
        <span class="thermal80-lbl">PASSWORD:</span>
        <span class="thermal80-pass">{{password}}</span>
      </div>
      <div class="thermal80-hint">Login: <strong>http://{{dns_name}}</strong></div>
    </div>
    <div class="thermal80-right">
      {{qr_code}}
      <span class="thermal80-qrhint">SCAN LOGIN</span>
    </div>
  </div>
  <div class="thermal80-footer">
    <div class="thermal80-div">========================================</div>
    <div>Simpan struk ini sebagai bukti akses hotspot</div>
  </div>
</div>`,
    css: `.voucher-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px;
  font-family: 'Courier New', Courier, monospace;
}
.thermal80-ticket {
  width: 290px; /* 80mm printable width */
  background: #ffffff;
  color: #000000;
  padding: 12px 10px;
  border: 1px dashed #cbd5e1;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  margin: 0 auto;
}
.thermal80-header { text-align: center; }
.thermal80-title { font-size: 16px; font-weight: 900; text-transform: uppercase; }
.thermal80-sub { font-size: 10px; font-weight: bold; margin-top: 2px; }
.thermal80-div { font-size: 10px; margin: 4px 0; overflow: hidden; white-space: nowrap; }
.thermal80-table { width: 100%; font-size: 11px; border-collapse: collapse; margin: 4px 0; }
.thermal80-table td { padding: 1px 0; }
.thermal80-body { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; }
.thermal80-left { flex: 1; text-align: left; }
.thermal80-box { border: 1.5px solid #000; padding: 4px 6px; border-radius: 4px; }
.thermal80-lbl { font-size: 8.5px; font-weight: bold; display: block; }
.thermal80-code { font-size: 16px; font-weight: 900; letter-spacing: 1px; display: block; }
.thermal80-pass { font-size: 13px; font-weight: 900; display: block; }
.thermal80-hint { font-size: 9px; margin-top: 4px; }
.thermal80-right { display: flex; flex-direction: column; align-items: center; }
.voucher-qr { width: 75px; height: 75px; display: block; }
.thermal80-qrhint { font-size: 7.5px; font-weight: bold; margin-top: 2px; }
.thermal80-footer { text-align: center; font-size: 9px; }
@media print {
  .voucher-grid { padding: 0 !important; gap: 0 !important; }
  .thermal80-ticket { border: none !important; width: 100% !important; max-width: 80mm !important; }
}`
  },
  {
    id: 'compact-card',
    name: 'Kartu Mini Compact (Hemat Kertas A4)',
    icon: 'file-text',
    description: 'Ukuran kartu padat dan kecil. Sangat hemat kertas, muat hingga 18-24 voucher dalam 1 lembar A4.',
    category: 'compact',
    html: `<div class="mini-card">
  <div class="mini-top">
    <span class="mini-title">{{hotspot_name}}</span>
    <span class="mini-price">{{price}}</span>
  </div>
  <div class="mini-mid">
    <div class="mini-qr">{{qr_code}}</div>
    <div class="mini-creds">
      <div class="mini-lbl">KODE / USER:</div>
      <div class="mini-code">{{username}}</div>
      <div class="mini-pass-txt">Pass: <strong>{{password}}</strong></div>
      <div class="mini-url">{{dns_name}}</div>
    </div>
  </div>
  <div class="mini-bot">
    <span>{{profile_name}}</span>
    <span>{{validity}}</span>
  </div>
</div>`,
    css: `.voucher-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 6px;
  font-family: system-ui, sans-serif;
}
@media (max-width: 768px) {
  .voucher-grid { grid-template-columns: repeat(2, 1fr); }
}
@media print {
  .voucher-grid { grid-template-columns: repeat(4, 1fr) !important; gap: 4px !important; padding: 0 !important; }
}
.mini-card {
  background: #ffffff;
  border: 1.5px solid #1e293b;
  border-radius: 6px;
  padding: 6px;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  color: #0f172a;
}
.mini-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 2px;
  margin-bottom: 4px;
}
.mini-title { font-size: 9px; font-weight: 900; color: #b45309; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-price { font-size: 9px; font-weight: 900; color: #047857; }
.mini-mid { display: flex; align-items: center; gap: 6px; }
.mini-qr { flex-shrink: 0; }
.voucher-qr { width: 48px; height: 48px; display: block; border: 1px solid #cbd5e1; border-radius: 3px; }
.mini-creds { flex: 1; min-width: 0; text-align: left; }
.mini-lbl { font-size: 6.5px; font-weight: bold; color: #64748b; }
.mini-code { font-family: monospace; font-size: 11px; font-weight: 900; color: #020617; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-pass-txt { font-size: 8px; color: #334155; }
.mini-url { font-size: 7px; color: #64748b; margin-top: 1px; }
.mini-bot {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #e2e8f0;
  margin-top: 4px;
  padding-top: 2px;
  font-size: 7.5px;
  color: #475569;
  font-weight: 700;
}`
  },
  {
    id: 'cyber-modern',
    name: 'Modern Cyber Badge (Elegan & Bergaya)',
    icon: 'sparkles',
    description: 'Gaya modern beraksen gelap & border neon elegan untuk kafe, warkop modern, atau gaming.',
    category: 'custom',
    html: `<div class="cyber-card">
  <div class="cyber-header">
    <span class="cyber-brand">{{hotspot_name}}</span>
    <span class="cyber-tag">{{profile_name}}</span>
  </div>
  <div class="cyber-core">
    <div class="cyber-qr-frame">
      {{qr_code}}
    </div>
    <div class="cyber-info">
      <span class="cyber-code-label">ACCESS CODE</span>
      <span class="cyber-code-val">{{username}}</span>
      <span class="cyber-pass-label">PASS: <strong class="cyber-pass-val">{{password}}</strong></span>
      <span class="cyber-link">URL: {{dns_name}}</span>
    </div>
  </div>
  <div class="cyber-footer">
    <span class="cyber-price">{{price}}</span>
    <span class="cyber-validity">{{validity}} • {{rate_limit}}</span>
  </div>
</div>`,
    css: `.voucher-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
@media (max-width: 768px) {
  .voucher-grid { grid-template-columns: repeat(2, 1fr); }
}
@media print {
  .voucher-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
}
.cyber-card {
  background: #ffffff;
  border: 2px solid #2563eb;
  border-radius: 12px;
  padding: 10px;
  box-sizing: border-box;
  page-break-inside: avoid;
  break-inside: avoid;
  color: #0f172a;
}
.cyber-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 5px;
  margin-bottom: 8px;
}
.cyber-brand { font-size: 11px; font-weight: 900; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; }
.cyber-tag { font-size: 9px; font-weight: 800; background: #dbeafe; color: #1e40af; padding: 2px 7px; border-radius: 9999px; }
.cyber-core { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.cyber-qr-frame { background: #ffffff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 4px; flex-shrink: 0; }
.voucher-qr { width: 62px; height: 62px; display: block; }
.cyber-info { flex: 1; min-width: 0; text-align: left; }
.cyber-code-label { display: block; font-size: 7.5px; font-weight: 800; color: #64748b; letter-spacing: 0.8px; }
.cyber-code-val { display: block; font-family: ui-monospace, monospace; font-size: 14px; font-weight: 900; color: #0f172a; letter-spacing: 1px; }
.cyber-pass-label { display: block; font-size: 8.5px; color: #475569; margin-top: 2px; }
.cyber-pass-val { font-family: ui-monospace, monospace; color: #1e293b; }
.cyber-link { display: block; font-size: 7.5px; color: #94a3b8; margin-top: 3px; }
.cyber-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1.5px solid #f1f5f9;
  padding-top: 5px;
}
.cyber-price { font-size: 12px; font-weight: 900; color: #2563eb; }
.cyber-validity { font-size: 9px; font-weight: 800; color: #64748b; font-family: ui-monospace, monospace; }`
  }
];

// Available placeholders that can be clicked to insert into editor
export const AVAILABLE_VARIABLES = [
  { tag: '{{username}}', desc: 'Kode Voucher / Username' },
  { tag: '{{password}}', desc: 'Password login' },
  { tag: '{{qr_code}}', desc: 'Tag Gambar QR Code Otomatis' },
  { tag: '{{price}}', desc: 'Harga Paket (misal: Rp 5.000)' },
  { tag: '{{profile_name}}', desc: 'Nama Paket / Profil Hotspot' },
  { tag: '{{validity}}', desc: 'Masa Aktif / Uptime' },
  { tag: '{{rate_limit}}', desc: 'Batas Kecepatan (misal: 5 Mbps)' },
  { tag: '{{hotspot_name}}', desc: 'Nama Hotspot / Usaha' },
  { tag: '{{dns_name}}', desc: 'Domain Router Hotspot (ar.net)' },
  { tag: '{{login_url}}', desc: 'Full URL Login Hotspot' },
  { tag: '{{qr_src}}', desc: 'Data URL Base64 Gambar QR' },
  { tag: '{{num}}', desc: 'Nomor urut voucher (1, 2, 3..)' },
];

interface VoucherTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotspotName?: string;
  dnsName?: string;
  sampleVouchers?: VoucherPrintItem[];
  onApplyTemplate?: (template: { id: string; html: string; css: string }) => void;
}

export default function VoucherTemplateEditorModal({
  isOpen,
  onClose,
  hotspotName = 'AR-NET HOTSPOT',
  dnsName = 'ar.net',
  sampleVouchers = [],
  onApplyTemplate
}: VoucherTemplateEditorModalProps) {
  // Active Preset or Custom
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return localStorage.getItem('arbill_voucher_active_template_id') || 'mikhmon-default';
  });

  const [templateHtml, setTemplateHtml] = useState<string>(() => {
    const saved = localStorage.getItem('arbill_voucher_custom_html');
    if (saved) return saved;
    const def = VOUCHER_TEMPLATE_PRESETS.find(p => p.id === 'mikhmon-default');
    return def ? def.html : VOUCHER_TEMPLATE_PRESETS[0].html;
  });

  const [templateCss, setTemplateCss] = useState<string>(() => {
    const saved = localStorage.getItem('arbill_voucher_custom_css');
    if (saved) return saved;
    const def = VOUCHER_TEMPLATE_PRESETS.find(p => p.id === 'mikhmon-default');
    return def ? def.css : VOUCHER_TEMPLATE_PRESETS[0].css;
  });

  const [activeTab, setActiveTab] = useState<'html' | 'css'>('html');
  const [saveToast, setSaveToast] = useState(false);
  const [previewQrMap, setPreviewQrMap] = useState<{ [key: string]: string }>({});

  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const cssTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Mock vouchers for preview if none provided
  const previewVouchers: VoucherPrintItem[] = sampleVouchers.length > 0 ? sampleVouchers.slice(0, 6) : [
    {
      id: 'demo-1',
      code: 'vc79dbfl',
      password: 'vc79dbfl',
      profile_name: 'Paket 3 Jam Full',
      package_price: 3000,
      rate_limit: '5 Mbps',
      validity: '3 Jam',
      dns_name: dnsName || 'ar.net'
    },
    {
      id: 'demo-2',
      code: 'vch9d4ez',
      password: 'vch9d4ez',
      profile_name: 'Paket 12 Jam Aktif',
      package_price: 5000,
      rate_limit: '7 Mbps',
      validity: '12 Jam',
      dns_name: dnsName || 'ar.net'
    },
    {
      id: 'demo-3',
      code: 'vcebl1s1',
      password: 'vcebl1s1',
      profile_name: 'Paket 24 Jam Unlimited',
      package_price: 10000,
      rate_limit: '10 Mbps',
      validity: '24 Jam',
      dns_name: dnsName || 'ar.net'
    }
  ];

  // Pre-generate QR codes for preview vouchers (batched to prevent unnecessary re-renders)
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const cleanDns = (dnsName || 'ar.net').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

    Promise.all(
      previewVouchers.map(async (v) => {
        const pass = v.password || v.code;
        const loginUrl = `http://${cleanDns}/login?username=${encodeURIComponent(v.code)}&password=${encodeURIComponent(pass)}`;
        try {
          const url = await QRCode.toDataURL(loginUrl, {
            width: 160,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' }
          });
          return { code: v.code, url };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (isMounted) {
        setPreviewQrMap((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            if (r) next[r.code] = r.url;
          });
          return next;
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, dnsName]);

  if (!isOpen) return null;

  // Change preset
  const handleSelectPreset = (preset: VoucherTemplatePreset) => {
    setSelectedPresetId(preset.id);
    setTemplateHtml(preset.html);
    setTemplateCss(preset.css);
  };

  // Insert variable tag into current cursor position
  const handleInsertVariable = (tag: string) => {
    const targetRef = activeTab === 'html' ? htmlTextareaRef.current : cssTextareaRef.current;
    if (!targetRef) return;

    const start = targetRef.selectionStart;
    const end = targetRef.selectionEnd;
    const currentVal = activeTab === 'html' ? templateHtml : templateCss;
    const updatedVal = currentVal.substring(0, start) + tag + currentVal.substring(end);

    if (activeTab === 'html') {
      setTemplateHtml(updatedVal);
    } else {
      setTemplateCss(updatedVal);
    }

    setTimeout(() => {
      targetRef.focus();
      targetRef.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Save changes
  const handleSave = () => {
    localStorage.setItem('arbill_voucher_active_template_id', selectedPresetId);
    localStorage.setItem('arbill_voucher_custom_html', templateHtml);
    localStorage.setItem('arbill_voucher_custom_css', templateCss);

    if (onApplyTemplate) {
      onApplyTemplate({
        id: selectedPresetId,
        html: templateHtml,
        css: templateCss
      });
    }

    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  // Reset to preset default
  const handleResetToDefault = () => {
    const preset = VOUCHER_TEMPLATE_PRESETS.find(p => p.id === selectedPresetId) || VOUCHER_TEMPLATE_PRESETS[0];
    setTemplateHtml(preset.html);
    setTemplateCss(preset.css);
  };

  // Compiler: compiles HTML template with voucher variables
  const compileVoucherHtml = (voucher: VoucherPrintItem, index: number): string => {
    const cleanDns = (voucher.dns_name || dnsName || 'ar.net').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const pass = voucher.password || voucher.code;
    const loginUrl = `http://${cleanDns}/login?username=${encodeURIComponent(voucher.code)}&password=${encodeURIComponent(pass)}`;
    const QR_FALLBACK_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#f8fafc" rx="8"/><rect x="25" y="25" width="110" height="110" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="#94a3b8">QR Voucher</text></svg>'
    )}`;
    const qrDataUrl = previewQrMap[voucher.code] || QR_FALLBACK_SVG;
    const priceDisplay = voucher.package_price ? `Rp ${Number(voucher.package_price).toLocaleString('id-ID')}` : 'GRATIS';

    let rendered = templateHtml;

    // Replace all placeholders
    rendered = rendered.replace(/\{\{username\}\}/gi, voucher.code);
    rendered = rendered.replace(/\{\{code\}\}/gi, voucher.code);
    rendered = rendered.replace(/\{\{password\}\}/gi, pass);
    rendered = rendered.replace(/\{\{price\}\}/gi, priceDisplay);
    rendered = rendered.replace(/\{\{profile_name\}\}/gi, voucher.profile_name || voucher.package_name || 'Voucher Hotspot');
    rendered = rendered.replace(/\{\{rate_limit\}\}/gi, voucher.rate_limit || 'High Speed');
    rendered = rendered.replace(/\{\{validity\}\}/gi, voucher.validity || voucher.uptime_limit || 'Aktif');
    rendered = rendered.replace(/\{\{hotspot_name\}\}/gi, hotspotName);
    rendered = rendered.replace(/\{\{dns_name\}\}/gi, cleanDns);
    rendered = rendered.replace(/\{\{login_url\}\}/gi, loginUrl);
    rendered = rendered.replace(/\{\{num\}\}/gi, String(index + 1));
    rendered = rendered.replace(/\{\{qr_src\}\}/gi, qrDataUrl);
    rendered = rendered.replace(/\{\{qr_code\}\}/gi, `<img src="${qrDataUrl}" class="voucher-qr" alt="QR Login" />`);

    return rendered;
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-7xl shadow-2xl overflow-hidden flex flex-col h-[94vh]">
        
        {/* Top Header Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>Pengaturan & Editor Template Cetak Voucher</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Gaya Mikhmon
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Atur desain dan tata letak cetak sesuka hati dengan HTML & CSS kustom
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Kembalikan template ke pengaturan standar preset"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset Default</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95"
            >
              {saveToast ? <Check size={14} className="animate-bounce" /> : <Save size={14} />}
              <span>{saveToast ? 'Tersimpan!' : 'Simpan Template'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Preset Selector Strip */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-thin">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Sparkles size={12} className="text-amber-400" />
            Pilih Preset:
          </span>

          {VOUCHER_TEMPLATE_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition cursor-pointer shrink-0 border ${
                  isSelected 
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20' 
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {p.category === 'thermal' ? <Receipt size={13} /> : p.category === 'compact' ? <FileText size={13} /> : <Grid size={13} />}
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Main Split Body: Editor on Left, Live Preview on Right */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Left Panel: HTML & CSS Code Editor */}
          <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 min-w-0 bg-slate-950">
            {/* Editor Sub-Tabs & Variable Toolbar */}
            <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('html')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'html'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Code size={13} />
                  <span>HTML Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('css')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'css'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText size={13} />
                  <span>CSS Styling</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400">
                {activeTab === 'html' ? 'Susun kartu & tag variabel' : 'Gaya tampilan & cetak (@media print)'}
              </div>
            </div>

            {/* Clickable Variable Tags Strip */}
            <div className="p-2 bg-slate-900/50 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
              <span className="text-[10px] font-bold text-amber-400/90 shrink-0 uppercase tracking-tight pl-1">
                + Sisipkan Tag:
              </span>
              {AVAILABLE_VARIABLES.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsertVariable(v.tag)}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-300 rounded-md text-[10px] font-mono border border-slate-700 hover:border-amber-500/40 transition whitespace-nowrap cursor-pointer shrink-0"
                  title={`Klik untuk menyisipkan ${v.desc}`}
                >
                  {v.tag}
                </button>
              ))}
            </div>

            {/* Textarea Code Editor */}
            <div className="flex-1 relative p-3 overflow-hidden">
              {activeTab === 'html' ? (
                <textarea
                  ref={htmlTextareaRef}
                  value={templateHtml}
                  onChange={(e) => setTemplateHtml(e.target.value)}
                  className="w-full h-full bg-slate-950 text-emerald-400 font-mono text-xs p-3 rounded-2xl border border-slate-800 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40 resize-none leading-relaxed tracking-wide select-text"
                  placeholder="Ketik kode HTML kartu voucher di sini..."
                  spellCheck={false}
                />
              ) : (
                <textarea
                  ref={cssTextareaRef}
                  value={templateCss}
                  onChange={(e) => setTemplateCss(e.target.value)}
                  className="w-full h-full bg-slate-950 text-sky-300 font-mono text-xs p-3 rounded-2xl border border-slate-800 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40 resize-none leading-relaxed tracking-wide select-text"
                  placeholder="Ketik kode CSS di sini..."
                  spellCheck={false}
                />
              )}
            </div>
          </div>

          {/* Right Panel: Live Split Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-slate-900/60">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Eye size={15} className="text-amber-400" />
                <span className="text-xs font-extrabold text-white">Live Real-time Print Preview</span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  (Simulasi hasil cetak)
                </span>
              </div>

              <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                Domain: <strong className="text-amber-400 font-mono">{dnsName || 'ar.net'}</strong>
              </span>
            </div>

            {/* Rendered Preview Canvas */}
            <div className="flex-1 p-4 overflow-y-auto bg-slate-200 flex justify-center items-start">
              <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-4 overflow-hidden min-h-[300px] border border-slate-300">
                {/* Embedded Scoped Style from Editor */}
                <style dangerouslySetInnerHTML={{ __html: templateCss }} />

                {/* Voucher Grid Rendered with Compiled HTML */}
                <div className="voucher-grid">
                  {previewVouchers.map((v, i) => (
                    <div 
                      key={v.id}
                      dangerouslySetInnerHTML={{ __html: compileVoucherHtml(v, i) }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Bar */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Laptop size={14} className="text-amber-400" />
            <span>Template ini akan otomatis digunakan saat Admin mengklik tombol <strong>Cetak / Print Voucher</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={() => {
                handleSave();
                onClose();
              }}
              className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-extrabold shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
            >
              Terapkan & Gunakan Template Ini
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
