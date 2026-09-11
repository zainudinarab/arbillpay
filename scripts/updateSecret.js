import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const newSecret = process.argv[2];

if (!newSecret) {
  console.log('⚠️ Usage: node scripts/updateSecret.js <NEW_CLIENT_SECRET>');
  process.exit(1);
}

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

async function updateSecret() {
  console.log(`🔐 Updating client_secret in Firebase Firestore to: ${newSecret}...`);
  try {
    const docRef = doc(db, 'settings', 'merchant_credentials');
    await updateDoc(docRef, {
      client_secret: newSecret,
      updated_at: new Date().toISOString()
    });
    console.log('✅ UPDATE COMPLETE! Client Secret in Firebase Firestore updated successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error updating client_secret:', err);
    process.exit(1);
  }
}

updateSecret();
