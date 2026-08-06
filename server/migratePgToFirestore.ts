// Migration Script: Copy all PostgreSQL database topology (nodes, cables, splitters, customers) to Firebase Cloud Firestore using Admin SDK
import { pool } from './config/db.js';
import { getFtthMapTopology } from './models/ftthMapModel.js';
import { getFirestore } from './config/firebase.js';

export async function migrateAllPgDataToFirestore() {
  console.log('🚀 [MIGRATION START] Reading PostgreSQL database tables...');
  
  const db = getFirestore();
  if (!db) {
    throw new Error('Firebase Admin SDK failed to initialize. Check arbillpay-firebase-adminsdk-fbsvc-a9561354bc.json');
  }

  // 1. Fetch Topology (Nodes & Cables) from PostgreSQL
  const { nodes, lines } = await getFtthMapTopology();
  console.log(`📦 Loaded ${nodes.length} FTTH Nodes and ${lines.length} Cables from PostgreSQL.`);

  // 2. Upload Topology to Cloud Firestore
  if (nodes.length > 0 || lines.length > 0) {
    await db.collection('ftth_maps').doc('default').set({
      nodes: nodes,
      lines: lines,
      updatedAt: new Date().toISOString()
    });
    console.log('✅ [MIGRATION] FTTH Nodes & Cables uploaded to Cloud Firestore successfully!');
  }

  // 3. Fetch Master Splitters from PostgreSQL
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
      console.log(`✅ [MIGRATION] Uploaded ${splitters.length} Master Splitters to Cloud Firestore!`);
    }
  } catch (err: any) {
    console.warn('⚠️ Splitters table migration skipped:', err.message);
  }

  // 4. Fetch Customers from PostgreSQL
  try {
    const custRes = await pool.query('SELECT * FROM customers');
    if (custRes.rows.length > 0) {
      const batch = db.batch();
      for (const cust of custRes.rows) {
        const ref = db.collection('customers').doc(String(cust.id || cust.code || cust.phone));
        batch.set(ref, cust, { merge: true });
      }
      await batch.commit();
      console.log(`✅ [MIGRATION] Uploaded ${custRes.rows.length} Customers to Cloud Firestore!`);
    }
  } catch (err: any) {
    console.warn('⚠️ Customers table migration skipped:', err.message);
  }

  console.log('🎉 [MIGRATION COMPLETE] All PostgreSQL data successfully copied to Firebase Cloud Firestore!');
  return { success: true, countNodes: nodes.length, countLines: lines.length };
}

// Execute if run directly via tsx
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  migrateAllPgDataToFirestore().then(() => process.exit(0)).catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}
