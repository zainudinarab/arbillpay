import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

async function inject() {
  console.log('🚀 Injecting Owner document directly to Cloud Firestore (arbillpay)...');
  try {
    // 1. Inject to users collection: users/019f74af9fcdWDgDxM8g
    await setDoc(doc(db, 'users', '019f74af9fcdWDgDxM8g'), {
      id: '019f74af9fcdWDgDxM8g',
      username: 'zainudinarab',
      name: 'Zainudin Arab (Owner)',
      email: 'ketua11@gmail.com',
      phone_number: '085746520724',
      role: 'owner',
      password: 'zainudinarab',
      updated_at: new Date().toISOString()
    }, { merge: true });

    // 2. Also inject to settings/merchant_credentials
    await setDoc(doc(db, 'settings', 'merchant_credentials'), {
      client_id: 'AP24228873',
      owner_user_id: '019f74af9fcdWDgDxM8g',
      owner_phone: '085746520724',
      owner_username: 'zainudinarab',
      owner_password: 'zainudinarab',
      installed: true,
      updated_at: new Date().toISOString()
    }, { merge: true });

    console.log('✅ SUCCESS! Owner document (users/019f74af9fcdWDgDxM8g) and settings/merchant_credentials successfully injected into Cloud Firestore!');
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR Injecting to Cloud Firestore:', err);
    process.exit(1);
  }
}

inject();
