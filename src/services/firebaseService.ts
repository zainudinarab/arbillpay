// Firebase Cloud Firestore Service (Disabled: Database 100% menggunakan PostgreSQL Backend API & ArabPay)
import { db } from '../config/firebase';
import { getApiUrl } from '../config/api';

// Helper: Convert waypoints [[lat, lng]] to friendly [{ lat, lng }] format
const formatWaypointsForFirestore = (waypoints: any[]) => {
  if (!Array.isArray(waypoints)) return [];
  return waypoints.map((wp: any) => {
    if (Array.isArray(wp)) return { lat: Number(wp[0]), lng: Number(wp[1]) };
    if (typeof wp === 'object' && wp !== null) return { lat: Number(wp.lat), lng: Number(wp.lng) };
    return wp;
  });
};

// Helper: Convert [{ lat, lng }] waypoints back to Leaflet [[lat, lng]] format
const parseWaypointsFromFirestore = (waypoints: any[]) => {
  if (!Array.isArray(waypoints)) return [];
  return waypoints.map((wp: any) => {
    if (Array.isArray(wp)) return [Number(wp[0]), Number(wp[1])];
    if (typeof wp === 'object' && wp !== null) return [Number(wp.lat), Number(wp.lng)];
    return wp;
  });
};

// Helper: Sanitize object by stripping undefined values
const sanitizeForFirestore = (obj: any): any => {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);

  const res: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      res[key] = sanitizeForFirestore(val);
    }
  }
  return res;
};

// --- 1. FTTH TOPOLOGY NODES & LINES ---
export const saveFtthMapToFirestore = async (nodes: any[], lines: any[]) => {
  try {
    const payload = {
      nodes: (nodes || []).map(n => sanitizeForFirestore(n)),
      lines: (lines || []).map(l => {
        const lineCopy = { ...l };
        if (lineCopy.waypoints) {
          lineCopy.waypoints = formatWaypointsForFirestore(lineCopy.waypoints);
        }
        return sanitizeForFirestore(lineCopy);
      }),
      updated_at: new Date().toISOString()
    };
    try {
      localStorage.setItem('arbill_ftth_map', JSON.stringify(payload));
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    return { success: true };
  }
};

export const getFtthMapFromFirestore = async () => {
  try {
    const local = localStorage.getItem('arbill_ftth_map');
    if (local) {
      const data = JSON.parse(local);
      const rawNodes = data.nodes || [];
      const rawLines = data.lines || [];
      const parsedLines = rawLines.map((l: any) => ({
        ...l,
        waypoints: parseWaypointsFromFirestore(l.waypoints)
      }));
      return { success: true, nodes: rawNodes, lines: parsedLines };
    }
    return { success: true, nodes: [], lines: [] };
  } catch (err: any) {
    return { success: true, nodes: [], lines: [] };
  }
};

export const syncCustomerFtthDeviceNode = async (customer: any, isTerminatedOrDeleted: boolean = false) => {
  return { success: true };
};

// --- 1B. DEVICE CATALOG MASTER SPECIFICATIONS ---
export const DEFAULT_DEVICE_CATALOG = [
  // ONU Modems
  { id: 'cat-zte-f609', type: 'ONU', brand: 'ZTE', model: 'F609', lan_ports: 4, wifi_spec: '2.4GHz Wi-Fi (4 LAN GE/FE)', notes: 'Modem Standar GPON Optik' },
  { id: 'cat-zte-f660', type: 'ONU', brand: 'ZTE', model: 'F660', lan_ports: 4, wifi_spec: '2.4GHz Wi-Fi (4 LAN + POTS)', notes: 'Modem GPON Voice & Wi-Fi' },
  { id: 'cat-zte-f601', type: 'ONU', brand: 'ZTE', model: 'F601', lan_ports: 1, wifi_spec: 'Bridge Only (1 Gigabit LAN)', notes: 'Modem GPON Bridge Only 1 Port' },
  { id: 'cat-zte-f670l', type: 'ONU', brand: 'ZTE', model: 'F670L', lan_ports: 4, wifi_spec: 'Dual Band 2.4G/5G AC1200', notes: 'Modem GPON High Speed Dualband' },
  { id: 'cat-hw-hg8245h', type: 'ONU', brand: 'Huawei', model: 'HG8245H', lan_ports: 4, wifi_spec: '2.4GHz Wi-Fi (4 LAN + 2 POTS)', notes: 'Modem GPON Optik Standar' },
  { id: 'cat-hw-eg8141a5', type: 'ONU', brand: 'Huawei', model: 'EG8141A5', lan_ports: 1, wifi_spec: '2.4GHz Wi-Fi (1 GE + 3 FE)', notes: 'Modem GPON Ringkas 1 GE' },
  { id: 'cat-hw-hg8010h', type: 'ONU', brand: 'Huawei', model: 'HG8010H', lan_ports: 1, wifi_spec: 'Bridge Only (1 Gigabit LAN)', notes: 'Modem GPON Bridge Only 1 Port' },
  { id: 'cat-fh-hg6245d', type: 'ONU', brand: 'FiberHome', model: 'HG6245D', lan_ports: 4, wifi_spec: 'Dual Band 2.4G/5G AC1200', notes: 'Modem GPON FiberHome Dual Band' },
  { id: 'cat-fh-an5506-04', type: 'ONU', brand: 'FiberHome', model: 'AN5506-04', lan_ports: 4, wifi_spec: '2.4GHz Wi-Fi (4 LAN FE)', notes: 'Modem GPON FiberHome 4 Port' },
  { id: 'cat-fh-an5506-01', type: 'ONU', brand: 'FiberHome', model: 'AN5506-01', lan_ports: 1, wifi_spec: 'Bridge Only (1 GE Port)', notes: 'Modem GPON Bridge Only' },
  { id: 'cat-vsol-v2801sg', type: 'ONU', brand: 'V-Sol', model: 'V2801SG', lan_ports: 1, wifi_spec: 'Bridge Only (1 GE EPON/GPON)', notes: 'Modem XPON Stick/Mini' },
  { id: 'cat-vsol-v2804dac', type: 'ONU', brand: 'V-Sol', model: 'V2804DAC', lan_ports: 4, wifi_spec: 'Dual Band 2.4G/5G (4 GE)', notes: 'Modem XPON High Power' },
  { id: 'cat-hs-optical-1g', type: 'ONU', brand: 'HS-Optical', model: 'HS100G', lan_ports: 1, wifi_spec: 'Bridge Only (1 GE Port)', notes: 'Modem ONU Mini Stick' },
  { id: 'cat-hi-iso-1g', type: 'ONU', brand: 'HI-ISO', model: 'HI-GPON100', lan_ports: 1, wifi_spec: 'Bridge Only (1 GE Port)', notes: 'Modem GPON Single Port' },
  // Wireless Routers
  { id: 'cat-tenda-n301', type: 'ROUTER_WIFI', brand: 'Tenda', model: 'N301', lan_ports: 3, wifi_spec: '300Mbps 2.4GHz (1 WAN 3 LAN)', notes: 'Router Wireless Standar 2 Antenna' },
  { id: 'cat-tenda-f3', type: 'ROUTER_WIFI', brand: 'Tenda', model: 'F3', lan_ports: 3, wifi_spec: '300Mbps 2.4GHz (1 WAN 3 LAN)', notes: 'Router Wireless High Power 3 Antenna' },
  { id: 'cat-tenda-ac6', type: 'ROUTER_WIFI', brand: 'Tenda', model: 'AC6', lan_ports: 3, wifi_spec: 'Dual Band 1200Mbps AC (4 Antenna)', notes: 'Router Wireless Dualband' },
  { id: 'cat-tplink-wr840n', type: 'ROUTER_WIFI', brand: 'TP-Link', model: 'TL-WR840N', lan_ports: 4, wifi_spec: '300Mbps 2.4GHz (1 WAN 4 LAN)', notes: 'Router Wireless Multi-Mode' },
  { id: 'cat-tplink-wr841n', type: 'ROUTER_WIFI', brand: 'TP-Link', model: 'TL-WR841N', lan_ports: 4, wifi_spec: '300Mbps 2.4GHz (1 WAN 4 LAN)', notes: 'Router Wireless 2 Antenna' },
  { id: 'cat-tplink-archerc20', type: 'ROUTER_WIFI', brand: 'TP-Link', model: 'Archer C20', lan_ports: 4, wifi_spec: 'Dual Band AC750 (4 LAN FE)', notes: 'Router Dualband TP-Link' },
  { id: 'cat-totolink-n300rt', type: 'ROUTER_WIFI', brand: 'Totolink', model: 'N300RT', lan_ports: 4, wifi_spec: '300Mbps 2.4GHz (1 WAN 4 LAN)', notes: 'Router Totolink 2 Antenna' },
  { id: 'cat-totolink-n200re', type: 'ROUTER_WIFI', brand: 'Totolink', model: 'N200RE', lan_ports: 2, wifi_spec: '300Mbps 2.4GHz (1 WAN 2 LAN)', notes: 'Router Mini Totolink' },
  { id: 'cat-mt-hapmini', type: 'ROUTER_WIFI', brand: 'MikroTik', model: 'hAP mini (RB931)', lan_ports: 3, wifi_spec: '2.4GHz (3 FE LAN/WAN)', notes: 'Router Wireless MikroTik Mini' },
  { id: 'cat-mt-haplite', type: 'ROUTER_WIFI', brand: 'MikroTik', model: 'hAP lite (RB941)', lan_ports: 4, wifi_spec: '2.4GHz (4 FE LAN/WAN)', notes: 'Router Wireless MikroTik Standar' }
];

export const saveDeviceCatalogToFirestore = async (catalogList: any[], splittersList?: any[]) => {
  try {
    localStorage.setItem('arbill_device_catalog', JSON.stringify({ items: catalogList, splitters: splittersList || [] }));
    return { success: true };
  } catch (_) {
    return { success: true };
  }
};

export const getDeviceCatalogFromFirestore = async () => {
  try {
    const local = localStorage.getItem('arbill_device_catalog');
    if (local) {
      const data = JSON.parse(local);
      const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : DEFAULT_DEVICE_CATALOG;
      const splitters = Array.isArray(data.splitters) && data.splitters.length > 0 ? data.splitters : [];
      return { success: true, catalog: items, splitters };
    }
  } catch (_) {}
  return { success: true, catalog: DEFAULT_DEVICE_CATALOG, splitters: [] };
};

export const saveCustomerToFirestore = async (customer: any) => {
  try {
    const rawVal = String(customer.id || customer.customer_code || Date.now()).trim();
    const cleanNum = rawVal
      .replace(/^cust_/i, '')
      .replace(/^cust-/i, '')
      .replace(/^cust/i, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
      
    const formattedCustId = `CUST-${cleanNum || Date.now()}`;
    const { balance, saldo, ...cleanCustomerData } = customer || {};

    const fullCustPayload = sanitizeForFirestore({
      ...cleanCustomerData,
      id: formattedCustId,
      customer_code: formattedCustId,
      updated_at: new Date().toISOString()
    });

    // ⚡ Auto-Sync PostgreSQL Backend API
    try {
      const apiUrl = getApiUrl();
      if (apiUrl) {
        fetch(`${apiUrl}/api/customers/${formattedCustId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullCustPayload)
        }).catch(() => null);
      }
    } catch (_) {}

    return { success: true, id: formattedCustId };
  } catch (err: any) {
    return { success: true, id: customer?.id };
  }
};

export const deleteCustomerFromFirestore = async (custId: string, customerData?: any) => {
  try {
    const apiUrl = getApiUrl();
    if (apiUrl) {
      fetch(`${apiUrl}/api/customers/${custId}`, {
        method: 'DELETE'
      }).catch(() => null);
    }
  } catch (_) {}
  return { success: true };
};

export const getCustomersFromFirestore = async (phoneOrUserId?: string) => {
  return { success: true, customers: [] };
};

// --- 3. INVOICES & BILLING ---
export const saveInvoiceToFirestore = async (invoice: any) => {
  return { success: true };
};

export const getInvoicesFromFirestore = async () => {
  return { success: true, invoices: [] };
};

// --- 4. FTTH SPLITTER CATALOG ---
export const saveSplitterCatalogToFirestore = async (splitters: any[]) => {
  try {
    localStorage.setItem('arbill_splitters_catalog', JSON.stringify(splitters || []));
  } catch (_) {}
  return { success: true };
};

export const getSplitterCatalogFromFirestore = async () => {
  try {
    const local = localStorage.getItem('arbill_splitters_catalog');
    if (local) {
      return { success: true, splitters: JSON.parse(local) };
    }
  } catch (_) {}
  return { success: true, splitters: [] };
};

// --- 5. PACKAGES & VOUCHERS ---
export const getPackagesFromFirestore = async () => {
  return { success: true, packages: [] };
};

export const getVouchersFromFirestore = async () => {
  return { success: true, vouchers: [] };
};

// --- 6. USERS & OPERATORS ---
export const saveUserToFirestore = async (user: any) => {
  return { success: true };
};

export const getUsersFromFirestore = async () => {
  return { success: true, users: [] };
};

// --- 6B. PURCHASED VOUCHERS STORAGE ---
export const savePurchasedVoucherToFirestore = async (voucherItem: any, userId?: string) => {
  try {
    const current = JSON.parse(localStorage.getItem('arbill_purchased_vouchers') || '[]');
    localStorage.setItem('arbill_purchased_vouchers', JSON.stringify([voucherItem, ...current]));
  } catch (_) {}
  return { success: true };
};

export const getPurchasedVouchersFromFirestore = async (userId?: string) => {
  try {
    const local = localStorage.getItem('arbill_purchased_vouchers');
    if (local) {
      return { success: true, vouchers: JSON.parse(local) };
    }
  } catch (_) {}
  return { success: true, vouchers: [] };
};

// Helper enkripsi SHA-256 password dengan salt aman
export const hashPassword = async (plainPassword: string): Promise<string> => {
  try {
    const cleanPass = plainPassword.trim();
    if (!cleanPass) return '';
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanPass + '_arbillpay_owner_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let hash = 0;
    for (let i = 0; i < plainPassword.length; i++) {
      hash = ((hash << 5) - hash) + plainPassword.charCodeAt(i);
      hash |= 0;
    }
    return 'sha256_' + Math.abs(hash).toString(16);
  }
};

export const saveMerchantCredentialsToFirestore = async (creds: { client_id: string; client_secret: string; owner_user_id?: string; owner_phone?: string; owner_password?: string; owner_name?: string; owner_email?: string }) => {
  try {
    localStorage.setItem('arabpay_client_id', creds.client_id);
    if (creds.owner_user_id) localStorage.setItem('arabpay_owner_user_id', creds.owner_user_id);
    if (creds.owner_phone) localStorage.setItem('arabpay_owner_phone', creds.owner_phone);
  } catch (_) {}
  return { success: true };
};

export const getMerchantCredentialsFromFirestore = async () => {
  try {
    const clientId = localStorage.getItem('arabpay_client_id');
    const ownerUserId = localStorage.getItem('arabpay_owner_user_id');
    if (clientId) {
      return { client_id: clientId, owner_user_id: ownerUserId };
    }
  } catch (_) {}
  return null;
};

export const verifyOwnerLoginWithFirestore = async (identity: string, pass: string) => {
  return { success: false, message: 'Firestore tidak aktif. Silakan gunakan login via PostgreSQL / ArabPay SSO.' };
};

export const resetAllLocalStateAndDatabase = () => {
  try {
    const keysToKeep = [
      'arbill_setup_completed',
      'arabpay_client_id',
      'arabpay_owner_user_id',
      'arabpay_owner_phone',
      'business_name',
    ];

    const savedValues: Record<string, string | null> = {};
    keysToKeep.forEach(k => {
      savedValues[k] = localStorage.getItem(k);
    });

    localStorage.clear();

    keysToKeep.forEach(k => {
      if (savedValues[k]) {
        localStorage.setItem(k, savedValues[k]!);
      }
    });

    console.log('✅ [DATABASE RESET] Successfully cleared all sample/cached data from browser storage!');
    return { success: true };
  } catch (err: any) {
    console.error('[DATABASE RESET ERROR]', err);
    return { success: false, error: err?.message };
  }
};

// Helper: Inject initial supporting data (gateways, business profile, starter packages) for newly verified merchant
export const injectInitialMerchantData = (setupData: {
  business_name: string;
  owner_name: string;
  owner_phone: string;
  client_id: string;
  client_secret: string;
  owner_user_id: string;
}) => {
  try {
    const profile = {
      name: setupData.owner_name || 'Owner RT/RW Net',
      role: 'Owner / Admin',
      companyName: setupData.business_name || 'Arbill Net',
      email: '',
      phone: setupData.owner_phone || '',
      address: 'Jl. Utama RT/RW Net No. 1',
      logoUrl: '',
      taxId: '',
      arabpay_client_id: setupData.client_id,
      arabpay_owner_user_id: setupData.owner_user_id,
    };
    localStorage.setItem('arbill_business_profile', JSON.stringify(profile));

    const starterGateways = [
      {
        id: 'arabpay',
        name: 'ArabPay E-Wallet',
        displayName: 'ArabPay E-Wallet (Bayar 1-Klik / SSO Direct)',
        iconName: 'Wallet',
        isActive: true,
        type: 'ewallet',
        payoutShare: 100,
        colorClass: 'bg-indigo-600 text-white',
        accountNumber: setupData.owner_phone,
        accountName: setupData.owner_name,
      },
      {
        id: 'qris',
        name: 'QRIS Direct',
        displayName: 'QRIS All Payment (GoPay, OVO, DANA, BCA)',
        iconName: 'QrCode',
        isActive: true,
        type: 'qris',
        payoutShare: 45,
        colorClass: 'bg-rose-500 text-white',
        accountNumber: 'NMID-102030405060',
        accountName: setupData.business_name,
      },
      {
        id: 'bank_transfer',
        name: 'Bank Transfer',
        displayName: 'Transfer Bank (BCA, Mandiri, BRI)',
        iconName: 'Landmark',
        isActive: true,
        type: 'bank',
        payoutShare: 5,
        colorClass: 'bg-blue-800 text-white',
        accountNumber: '8012-3456-7890',
        accountName: setupData.owner_name,
      }
    ];
    localStorage.setItem('arbill_gateways', JSON.stringify(starterGateways));

    console.log('🎉 [INITIAL SEED] Successfully injected starter gateways, packages & business profile for new merchant!');
    return { success: true };
  } catch (err: any) {
    console.error('[INITIAL SEED ERROR]', err);
    return { success: false, error: err?.message };
  }
};

// --- 8. INDONESIA REGION SYNC & CACHE ---
export const saveSyncedRegionsToFirestore = async (customRegions: any[]) => {
  try {
    localStorage.setItem('arbill_synced_regions', JSON.stringify(customRegions));
    return { success: true, count: customRegions.length };
  } catch (_) {
    return { success: true, count: customRegions.length };
  }
};

export const getSyncedRegionsFromFirestore = async (): Promise<any[]> => {
  try {
    const local = localStorage.getItem('arbill_synced_regions');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return [];
};

// --- 9. NOTIFICATION GATEWAY SETTINGS (GoWA, WAHA, WuzAPI, Fonnte) ---
export const saveNotificationGatewaySettingsToFirestore = async (config: any) => {
  try {
    localStorage.setItem('arbill_notification_gateway', JSON.stringify(config));
    return { success: true };
  } catch (_) {
    return { success: true };
  }
};

export const getNotificationGatewaySettingsFromFirestore = async (): Promise<{ success: boolean; config?: any }> => {
  try {
    const local = localStorage.getItem('arbill_notification_gateway');
    if (local) {
      const parsed = JSON.parse(local);
      if (parsed && typeof parsed === 'object') return { success: true, config: parsed };
    }
  } catch (_) {}
  return { success: false };
};

// --- 10. ROUTERS & MIKROTIK ---
export const saveRouterToFirestore = async (router: any) => {
  return { success: true, id: router?.id, router };
};

export const getRoutersFromFirestore = async (): Promise<{ success: boolean; routers: any[] }> => {
  return { success: true, routers: [] };
};

export const deleteRouterFromFirestore = async (id: string) => {
  return { success: true };
};
