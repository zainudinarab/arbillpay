import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDTKOdu9vth6hywTM8GqXOSBg8EtXnfH90",
  authDomain: "arbillpay.firebaseapp.com",
  projectId: "arbillpay",
  storageBucket: "arbillpay.firebasestorage.app",
  messagingSenderId: "953600438953",
  appId: "1:953600438953:web:5c96e50dfc22ce78162fb8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function purgeAllData() {
  console.log('🧹 Starting cleanup of customers & invoices collections in Cloud Firestore...');
  
  try {
    // 1. Purge customers
    const custColl = collection(db, 'customers');
    const custSnap = await getDocs(custColl);
    console.log(`🔍 Found ${custSnap.docs.length} customer documents to purge.`);
    
    for (const d of custSnap.docs) {
      await deleteDoc(doc(db, 'customers', d.id));
      console.log(`  ❌ Deleted customer: ${d.id}`);
    }

    // 2. Purge invoices
    const invColl = collection(db, 'invoices');
    const invSnap = await getDocs(invColl);
    console.log(`🔍 Found ${invSnap.docs.length} invoice documents to purge.`);
    
    for (const d of invSnap.docs) {
      await deleteDoc(doc(db, 'invoices', d.id));
      console.log(`  ❌ Deleted invoice: ${d.id}`);
    }

    console.log('✅ ALL CUSTOMER AND INVOICE DATA HAS BEEN FULLY PURGED FROM CLOUD FIRESTORE!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error purging data:', err);
    process.exit(1);
  }
}

purgeAllData();
