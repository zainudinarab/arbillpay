import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';

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

async function resetSetup() {
  console.log('🗑️ Deleting settings/merchant_credentials in Firebase Firestore to unlock SetupWizard...');
  try {
    const docRef = doc(db, 'settings', 'merchant_credentials');
    await deleteDoc(docRef);
    console.log('✅ RESET COMPLETE! SetupWizard is now unlocked. Opening /#/setup will show the wizard form.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting settings:', err);
    process.exit(1);
  }
}

resetSetup();
