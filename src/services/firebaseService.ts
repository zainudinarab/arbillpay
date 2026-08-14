// Firebase Cloud Firestore Service for 100% Serverless Cloud Database Operations
import { db } from '../config/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';

// Helper: Convert waypoints [[lat, lng]] to Firestore-friendly [{ lat, lng }] format
const formatWaypointsForFirestore = (waypoints: any[]) => {
  if (!Array.isArray(waypoints)) return [];
  return waypoints.map((wp: any) => {
    if (Array.isArray(wp)) return { lat: Number(wp[0]), lng: Number(wp[1]) };
    if (typeof wp === 'object' && wp !== null) return { lat: Number(wp.lat), lng: Number(wp.lng) };
    return wp;
  });
};

// Helper: Convert Firestore [{ lat, lng }] waypoints back to Leaflet [[lat, lng]] format
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
    const sanitizedNodes = (nodes || []).map(n => sanitizeForFirestore(n));
    const sanitizedLines = (lines || []).map(l => {
      const lineCopy = { ...l };
      if (lineCopy.waypoints) {
        lineCopy.waypoints = formatWaypointsForFirestore(lineCopy.waypoints);
      }
      return sanitizeForFirestore(lineCopy);
    });

    const topologyRef = doc(db, 'ftth_topology', 'main_topology');
    await setDoc(topologyRef, {
      nodes: sanitizedNodes,
      lines: sanitizedLines,
      updated_at: new Date().toISOString()
    }, { merge: true });

    console.log(`[FIREBASE FIRESTORE] Successfully saved ${sanitizedNodes.length} Nodes & ${sanitizedLines.length} Lines to Cloud Firestore!`);
    return { success: true };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save FTTH Map to Firestore:', err);
    throw err;
  }
};

export const getFtthMapFromFirestore = async () => {
  try {
    const topologyRef = doc(db, 'ftth_topology', 'main_topology');
    const docSnap = await getDoc(topologyRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const rawNodes = data.nodes || [];
      const rawLines = data.lines || [];

      const parsedLines = rawLines.map((l: any) => ({
        ...l,
        waypoints: parseWaypointsFromFirestore(l.waypoints)
      }));

      return {
        success: true,
        nodes: rawNodes,
        lines: parsedLines
      };
    }
    return { success: true, nodes: [], lines: [] };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch FTTH topology from Firestore:', err?.message || err);
    return { success: false, nodes: [], lines: [] };
  }
};

// --- 2. CUSTOMERS MANAGEMENT ---
export const saveCustomerToFirestore = async (customer: any) => {
  try {
    let rawCustId = String(customer.id || customer.customer_code || `CUST-${Date.now()}`).trim();
    if (rawCustId.toLowerCase().startsWith('cust_')) {
      rawCustId = `CUST-${rawCustId.slice(5)}`;
    } else if (!rawCustId.toUpperCase().startsWith('CUST-') && !rawCustId.toUpperCase().startsWith('CUST')) {
      rawCustId = `CUST-${rawCustId}`;
    }

    const formattedCustId = rawCustId.toUpperCase();
    const custRef = doc(db, 'customers', formattedCustId);

    const { customer_code, ...cleanCustPayload } = customer;

    await setDoc(custRef, sanitizeForFirestore({
      ...cleanCustPayload,
      id: formattedCustId,
      updated_at: new Date().toISOString()
    }), { merge: true });

    return { success: true, id: formattedCustId };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save customer:', err);
    throw err;
  }
};

export const getCustomersFromFirestore = async (phoneOrUserId?: string) => {
  try {
    const custColl = collection(db, 'customers');
    const snapshot = await getDocs(custColl);
    let customers = snapshot.docs.filter(d => d.id !== '_init').map(d => ({ id: d.id, ...d.data() }));

    if (phoneOrUserId) {
      const targetStr = String(phoneOrUserId);
      const cleanTarget = targetStr.replace(/\D/g, '');
      customers = customers.filter((c: any) => {
        if (!c) return false;
        if (c.user_id && String(c.user_id) === targetStr) return true;
        if (c.phone_number) {
          const cleanPhone = String(c.phone_number).replace(/\D/g, '');
          if (cleanPhone && cleanTarget && (cleanPhone === cleanTarget || (cleanTarget.length > 5 && cleanPhone.endsWith(cleanTarget.slice(-8))))) {
            return true;
          }
        }
        return false;
      });
    }

    // Sort newest first
    customers.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return { success: true, customers };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch customers from Firestore:', err);
    return { success: false, customers: [] };
  }
};

// --- 3. INVOICES & BILLING ---
export const saveInvoiceToFirestore = async (invoice: any) => {
  try {
    const invId = String(invoice.id || `inv_${Date.now()}`);
    const invRef = doc(db, 'invoices', invId);
    
    const invoicePayload = sanitizeForFirestore({
      ...invoice,
      id: invId,
      updated_at: new Date().toISOString()
    });

    await setDoc(invRef, invoicePayload, { merge: true });

    // ⚡ Optimasi Hemat Baca: Sinkronkan ringkasan tagihan aktif di dokumen Customer terkait
    const custId = invoice.customer_id || invoice.client_id;
    if (custId) {
      try {
        const custRef = doc(db, 'customers', String(custId));
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          const isUnpaid = String(invoice.status || '').toUpperCase() === 'UNPAID';
          await setDoc(custRef, {
            has_unpaid_invoice: isUnpaid,
            current_invoice: {
              invoice_id: invId,
              invoice_number: invoice.invoice_number || invId,
              amount: invoice.amount || invoice.total_amount || 0,
              due_date: invoice.due_date || '',
              status: invoice.status || 'UNPAID'
            },
            updated_at: new Date().toISOString()
          }, { merge: true });
        }
      } catch (custErr) {
        console.warn('Could not sync invoice summary to customer document:', custErr);
      }
    }

    return { success: true, id: invId };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save invoice:', err);
    throw err;
  }
};

export const getInvoicesFromFirestore = async () => {
  try {
    const invColl = collection(db, 'invoices');
    const snapshot = await getDocs(invColl);
    const invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { success: true, invoices };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch invoices from Firestore:', err);
    return { success: false, invoices: [] };
  }
};

// --- 4. MASTER SPLITTER CATALOG ---
export const saveSplitterCatalogToFirestore = async (splitters: any[]) => {
  try {
    const catRef = doc(db, 'ftth_catalog', 'splitters');
    await setDoc(catRef, sanitizeForFirestore({
      splitters: splitters || [],
      updated_at: new Date().toISOString()
    }), { merge: true });
    return { success: true };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save splitter catalog:', err);
    throw err;
  }
};

export const getSplitterCatalogFromFirestore = async () => {
  try {
    const catRef = doc(db, 'ftth_catalog', 'splitters');
    const docSnap = await getDoc(catRef);
    if (docSnap.exists()) {
      return { success: true, splitters: docSnap.data().splitters || [] };
    }
    return { success: true, splitters: [] };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch splitters from Firestore:', err);
    return { success: false, splitters: [] };
  }
};

// --- 5. PACKAGES & VOUCHERS ---
export const getPackagesFromFirestore = async () => {
  try {
    const pkgColl = collection(db, 'packages');
    const snapshot = await getDocs(pkgColl);
    const packages = snapshot.docs.filter(d => d.id !== '_init').map(d => ({ id: d.id, ...d.data() }));
    return { success: true, packages };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch packages from Firestore:', err);
    return { success: false, packages: [] };
  }
};

export const getVouchersFromFirestore = async () => {
  try {
    const vouchColl = collection(db, 'hotspot_vouchers');
    const snapshot = await getDocs(vouchColl);
    const vouchers = snapshot.docs.filter(d => d.id !== '_init').map(d => ({ id: d.id, ...d.data() }));
    return { success: true, vouchers };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch vouchers from Firestore:', err);
    return { success: false, vouchers: [] };
  }
};

// --- 6. USERS & STAFF MANAGEMENT ---
export const saveUserToFirestore = async (user: any) => {
  try {
    const userId = String(user.id || user.arabpay_user_id || `user_${Date.now()}`);
    const userRef = doc(db, 'users', userId);
    
    // EXCLUDE balance & arabpay_balance from Firestore persistence: Saldo disimpan 100% eksklusif di ArabPay!
    const { balance, arabpay_balance, ...userDataToSave } = user;

    await setDoc(userRef, sanitizeForFirestore({
      ...userDataToSave,
      id: userId,
      updated_at: new Date().toISOString()
    }), { merge: true });
    console.log(`✅ [FIREBASE FIRESTORE] User "${user.name || user.username || userId}" saved/updated in Firestore WITHOUT storing balance (Saldo 100% eksklusif di ArabPay)!`);
    return { success: true, id: userId };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save user to Firestore:', err);
    return { success: false, error: err?.message };
  }
};

export const getUsersFromFirestore = async () => {
  try {
    const userColl = collection(db, 'users');
    const snapshot = await getDocs(userColl);
    const users = snapshot.docs.filter(d => d.id !== '_init').map(d => ({ id: d.id, ...d.data() }));
    return { success: true, users };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch users from Firestore:', err);
    return { success: false, users: [] };
  }
};

// --- 7. PURCHASED VOUCHERS HISTORY CLOUD PERSISTENCE ---
export const savePurchasedVoucherToFirestore = async (voucherItem: any, userId?: string) => {
  try {
    const docId = String(voucherItem.id || `TX-${Date.now()}`);
    const vouchRef = doc(db, 'purchased_vouchers_history', docId);
    
    await setDoc(vouchRef, sanitizeForFirestore({
      ...voucherItem,
      id: docId,
      user_id: userId || voucherItem.user_id || 'guest',
      created_at: new Date().toISOString()
    }), { merge: true });
    
    console.log(`✅ [FIREBASE FIRESTORE] Purchased Voucher "${voucherItem.packageName || voucherItem.username}" saved to Firestore server database!`);
    return { success: true, id: docId };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save purchased voucher to Firestore:', err);
    return { success: false, error: err?.message };
  }
};

export const getPurchasedVouchersFromFirestore = async (userId?: string) => {
  try {
    const vouchColl = collection(db, 'purchased_vouchers_history');
    const snapshot = await getDocs(vouchColl);
    let vouchers = snapshot.docs.filter(d => d.id !== '_init').map(d => ({ id: d.id, ...d.data() }));
    if (userId) {
      vouchers = vouchers.filter((v: any) => v.user_id === userId || v.buyer_phone === userId || v.customer_id === userId);
    }
    // Sort newest first
    vouchers.sort((a: any, b: any) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());
    return { success: true, vouchers };
  } catch (err: any) {
    console.warn('[FIREBASE FIRESTORE WARN] Could not fetch purchased vouchers from Firestore:', err);
    return { success: false, vouchers: [] };
  }
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
    // 1. Save to settings/merchant_credentials (Clean link to users table)
    const ownerUserId = creds.owner_user_id || '019f74af9fcdWDgDxM8g';
    const docRef = doc(db, 'settings', 'merchant_credentials');
    await setDoc(docRef, {
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      owner_user_id: ownerUserId,
      installed: true,
      updated_at: new Date().toISOString()
    }, { merge: true });

    // 2. Save Owner User Credentials EXCLUSIVELY to users collection with SHA-256 ENCRYPTION
    const userDocRef = doc(db, 'users', ownerUserId);
    const rawPass = creds.owner_password || '';
    const encryptedHash = rawPass ? await hashPassword(rawPass) : '';

    const userPayload: any = {
      id: ownerUserId,
      role: 'owner',
      updated_at: new Date().toISOString()
    };

    if (creds.owner_name) userPayload.name = creds.owner_name;
    if (creds.owner_email) userPayload.email = creds.owner_email;
    if (creds.owner_phone) userPayload.phone_number = creds.owner_phone;
    if (encryptedHash) {
      userPayload.password = encryptedHash;
      userPayload.password_hash = encryptedHash;
    }

    await setDoc(userDocRef, userPayload, { merge: true });

    return { success: true };
  } catch (err: any) {
    console.error('[FIRESTORE ERROR] Could not save merchant credentials:', err);
    return { success: false, error: err?.message };
  }
};

export const getMerchantCredentialsFromFirestore = async () => {
  try {
    const docRef = doc(db, 'settings', 'merchant_credentials');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.error('[FIRESTORE ERROR] Could not fetch merchant credentials:', err);
  }
  return null;
};

// Verifikasi Login Owner Langsung dari Koleksi USERS di Database Cloud Firestore dengan Enkripsi Hash
export const verifyOwnerLoginWithFirestore = async (identity: string, pass: string) => {
  try {
    const cleanId = identity.trim().toLowerCase();
    const cleanPass = pass.trim();
    const inputHash = await hashPassword(cleanPass);

    // 1. Ambil dokumen konfigurasi merchant untuk membaca link owner_user_id
    const credsDoc = await getMerchantCredentialsFromFirestore();
    const ownerUserId = credsDoc?.owner_user_id;

    // 2. Query dokumen di koleksi USERS secara dinamis
    let userDocData: any = null;
    if (ownerUserId) {
      try {
        const ownerDocRef = doc(db, 'users', ownerUserId);
        const userSnap = await getDoc(ownerDocRef);
        if (userSnap.exists()) {
          userDocData = userSnap.data();
        }
      } catch (e) {}
    }

    // Jika tidak ditemukan via ownerUserId, query koleksi users berdasarkan username, phone_number, atau email
    if (!userDocData) {
      try {
        const usersColl = collection(db, 'users');
        const snap = await getDocs(usersColl);
        const matchedDoc = snap.docs.find(d => {
          const u = d.data();
          const uPhone = String(u.phone_number || u.phone || '').trim().toLowerCase();
          const uEmail = String(u.email || '').trim().toLowerCase();
          return cleanId === uPhone || cleanId === uEmail;
        });
        if (matchedDoc) {
          userDocData = matchedDoc.data();
        }
      } catch (e) {}
    }

    // 3. Verifikasi Identitas & Password Hash secara presisi terhadap data Firestore
    if (userDocData) {
      const storedPass = String(userDocData.password || userDocData.password_hash || '').trim();
      const storedPhone = String(userDocData.phone_number || userDocData.phone || '').trim().toLowerCase();
      const storedEmail = String(userDocData.email || '').trim().toLowerCase();

      const isIdMatch = (
        (storedPhone && cleanId === storedPhone) ||
        (storedEmail && cleanId === storedEmail)
      );

      const isPassMatch = (
        (storedPass && inputHash === storedPass) ||
        (storedPass && cleanPass === storedPass)
      );

      if (isIdMatch && isPassMatch) {
        return {
          success: true,
          user: {
            id: userDocData.id || ownerUserId || 'owner',
            username: userDocData.username || cleanId,
            name: userDocData.name || userDocData.username || 'Owner',
            email: userDocData.email || '',
            phone_number: userDocData.phone_number || userDocData.phone || '',
            role: 'owner',
            arabpay_user_id: userDocData.id || ownerUserId || 'owner',
            arabpay_balance: userDocData.arabpay_balance || 150000
          }
        };
      }
    }
  } catch (err: any) {
    console.error('[FIRESTORE ERROR] Could not verify owner login:', err);
  }
  return { success: false };
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
    // 1. Business Profile
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

    // 2. Default Active Gateways (ArabPay + QRIS + Bank Transfer)
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

    // 3. Starter Package Templates
    const starterPackages = [
      {
        id: 'pkg-1',
        name: 'Paket Home 10 Mbps',
        speed: '10 Mbps',
        price: 150000,
        billingCycle: 'monthly',
        type: 'pppoe',
        description: 'Paket Internet Rumah Hemat 10 Mbps Unlimited',
        isActive: true,
      },
      {
        id: 'pkg-2',
        name: 'Paket High Speed 20 Mbps',
        speed: '20 Mbps',
        price: 250000,
        billingCycle: 'monthly',
        type: 'pppoe',
        description: 'Paket Internet Cepat 20 Mbps Unlimited Streaming & Gaming',
        isActive: true,
      },
      {
        id: 'pkg-3',
        name: 'Voucher Hotspot 24 Jam',
        speed: '5 Mbps',
        price: 5000,
        duration: '1 hari',
        type: 'hotspot',
        description: 'Voucher Hotspot Unlimited 24 Jam Masa Aktif 1 Hari',
        isActive: true,
      }
    ];
    localStorage.setItem('arbill_packages', JSON.stringify(starterPackages));

    // 4. Empty customers & invoices to start 100% clean
    localStorage.setItem('arbill_clients', JSON.stringify([]));
    localStorage.setItem('arbill_invoices', JSON.stringify([]));

    console.log('🎉 [INITIAL SEED] Successfully injected starter gateways, packages & business profile for new merchant!');
    return { success: true };
  } catch (err: any) {
    console.error('[INITIAL SEED ERROR]', err);
    return { success: false, error: err?.message };
  }
};


