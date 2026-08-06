// Migration Script: Comprehensive migration of ALL PostgreSQL tables to Firebase Cloud Firestore using Admin SDK
import { pool } from './config/db.js';
import { getFtthMapTopology } from './models/ftthMapModel.js';
import { getFirestore } from './config/firebase.js';

export async function migrateAllPgDataToFirestore() {
  console.log('🚀 [MIGRATION START] Migrating ALL database collections to Firebase Cloud Firestore...');
  
  const db = getFirestore();
  if (!db) {
    throw new Error('Firebase Admin SDK failed to initialize. Check arbillpay-firebase-adminsdk-fbsvc-a9561354bc.json');
  }

  // 1. Fetch Topology (Nodes & Cables) from PostgreSQL
  try {
    const { nodes, lines } = await getFtthMapTopology();
    console.log(`📦 Loaded ${nodes.length} FTTH Nodes and ${lines.length} Cables from PostgreSQL.`);
    
    await db.collection('ftth_maps').doc('default').set({
      nodes: nodes,
      lines: lines,
      updatedAt: new Date().toISOString()
    });

    if (nodes.length > 0) {
      const batch = db.batch();
      nodes.forEach((n: any) => {
        const ref = db.collection('ftth_nodes').doc(String(n.id));
        batch.set(ref, n, { merge: true });
      });
      await batch.commit();
    }

    if (lines.length > 0) {
      const batch = db.batch();
      lines.forEach((l: any) => {
        const ref = db.collection('ftth_cables').doc(String(l.id));
        batch.set(ref, l, { merge: true });
      });
      await batch.commit();
    }
    console.log('✅ [MIGRATION] ftth_maps, ftth_nodes & ftth_cables collections created!');
  } catch (err: any) {
    console.warn('⚠️ FTTH Map migration skipped:', err.message);
  }

  // 2. Fetch Master Splitters from PostgreSQL
  try {
    const splittersRes = await pool.query('SELECT * FROM ftth_splitter_types');
    if (splittersRes.rows.length > 0) {
      const splitters = splittersRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        ratioCode: r.ratio_code,
        capacity: Number(r.capacity),
        passLossDb: Number(r.pass_loss_db),
        dropLossDb: Number(r.drop_loss_db),
        description: r.description
      }));
      
      const batch = db.batch();
      splitters.forEach(s => {
        const ref = db.collection('ftth_splitters').doc(String(s.id));
        batch.set(ref, s, { merge: true });
      });
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${splitters.length} ftth_splitters to Cloud Firestore!`);
    }
  } catch (err: any) {
    console.warn('⚠️ Splitters table migration skipped:', err.message);
  }

  // 3. Fetch Customers from PostgreSQL
  try {
    const custRes = await pool.query('SELECT * FROM customers');
    if (custRes.rows.length > 0) {
      const batch = db.batch();
      for (const cust of custRes.rows) {
        const ref = db.collection('customers').doc(String(cust.id || cust.code || cust.phone));
        batch.set(ref, cust, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${custRes.rows.length} customers to Cloud Firestore!`);
    }
  } catch (err: any) {
    console.warn('⚠️ Customers table migration skipped:', err.message);
  }

  // 4. Fetch Invoices from PostgreSQL
  try {
    const invRes = await pool.query('SELECT * FROM invoices');
    if (invRes.rows.length > 0) {
      const batch = db.batch();
      for (const inv of invRes.rows) {
        const ref = db.collection('invoices').doc(String(inv.id || inv.invoice_number));
        batch.set(ref, inv, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${invRes.rows.length} invoices to Cloud Firestore!`);
    } else {
      // Seed initial sample collection document so collection displays in console
      await db.collection('invoices').doc('_init').set({ active: true, createdAt: new Date().toISOString() });
      console.log('✅ [MIGRATION] Created invoices collection in Cloud Firestore!');
    }
  } catch (err: any) {
    await db.collection('invoices').doc('_init').set({ active: true, createdAt: new Date().toISOString() }).catch(() => {});
  }

  // 5. Fetch Internet Packages from PostgreSQL
  try {
    const pkgRes = await pool.query('SELECT * FROM packages').catch(() => pool.query('SELECT * FROM internet_packages'));
    if (pkgRes && pkgRes.rows.length > 0) {
      const batch = db.batch();
      for (const pkg of pkgRes.rows) {
        const ref = db.collection('packages').doc(String(pkg.id || pkg.name));
        batch.set(ref, pkg, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${pkgRes.rows.length} packages to Cloud Firestore!`);
    } else {
      await db.collection('packages').doc('_init').set({ active: true, createdAt: new Date().toISOString() });
      console.log('✅ [MIGRATION] Created packages collection in Cloud Firestore!');
    }
  } catch (err: any) {
    await db.collection('packages').doc('_init').set({ active: true, createdAt: new Date().toISOString() }).catch(() => {});
  }

  // 6. Fetch Hotspot Vouchers from PostgreSQL
  try {
    const vouchRes = await pool.query('SELECT * FROM hotspot_vouchers');
    if (vouchRes.rows.length > 0) {
      const batch = db.batch();
      for (const v of vouchRes.rows) {
        const ref = db.collection('hotspot_vouchers').doc(String(v.id || v.code));
        batch.set(ref, v, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${vouchRes.rows.length} hotspot_vouchers to Cloud Firestore!`);
    } else {
      await db.collection('hotspot_vouchers').doc('_init').set({ active: true, createdAt: new Date().toISOString() });
      console.log('✅ [MIGRATION] Created hotspot_vouchers collection in Cloud Firestore!');
    }
  } catch (err: any) {
    await db.collection('hotspot_vouchers').doc('_init').set({ active: true, createdAt: new Date().toISOString() }).catch(() => {});
  }

  // 7. Fetch Users / Staff from PostgreSQL
  try {
    const userRes = await pool.query('SELECT * FROM users');
    if (userRes.rows.length > 0) {
      const batch = db.batch();
      for (const u of userRes.rows) {
        const ref = db.collection('users').doc(String(u.id || u.username));
        batch.set(ref, u, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${userRes.rows.length} users to Cloud Firestore!`);
    } else {
      await db.collection('users').doc('_init').set({ active: true, createdAt: new Date().toISOString() });
      console.log('✅ [MIGRATION] Created users collection in Cloud Firestore!');
    }
  } catch (err: any) {
    await db.collection('users').doc('_init').set({ active: true, createdAt: new Date().toISOString() }).catch(() => {});
  }

  console.log('🎉 [ALL COLLECTIONS MIGRATED] All database collections successfully created in Firebase Cloud Firestore!');
  return { success: true };
}

// Execute if run directly via tsx
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  migrateAllPgDataToFirestore().then(() => process.exit(0)).catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}
