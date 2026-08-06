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
    const custId = String(customer.id || `cust_${Date.now()}`);
    const custRef = doc(db, 'customers', custId);
    await setDoc(custRef, sanitizeForFirestore({
      ...customer,
      id: custId,
      updated_at: new Date().toISOString()
    }), { merge: true });
    return { success: true, id: custId };
  } catch (err: any) {
    console.error('[FIREBASE FIRESTORE ERROR] Failed to save customer:', err);
    throw err;
  }
};

export const getCustomersFromFirestore = async () => {
  try {
    const custColl = collection(db, 'customers');
    const snapshot = await getDocs(custColl);
    const customers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
    await setDoc(invRef, sanitizeForFirestore({
      ...invoice,
      id: invId,
      updated_at: new Date().toISOString()
    }), { merge: true });
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
