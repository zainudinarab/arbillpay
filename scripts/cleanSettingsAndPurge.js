import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, deleteField } from 'firebase/firestore';

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

async function clean() {
  console.log('🧹 Cleaning settings/merchant_credentials to remove user password fields...');
  try {
    const docRef = doc(db, 'settings', 'merchant_credentials');
    await updateDoc(docRef, {
      owner_password: deleteField(),
      owner_pin: deleteField(),
      pin: deleteField(),
      password: deleteField()
    });
    console.log('✅ CLEANUP COMPLETE: All user password fields removed from settings collection! Password lives EXCLUSIVELY in users table!');
    process.exit(0);
  } catch (err) {
    console.error('Error cleaning settings:', err);
    process.exit(1);
  }
}

clean();
