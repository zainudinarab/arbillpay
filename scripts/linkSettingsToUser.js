import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';

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

async function updateSettingsLink() {
  console.log('🔗 Linking settings/merchant_credentials to users table (owner_user_id: 019f74af9fcdWDgDxM8g)...');
  try {
    const docRef = doc(db, 'settings', 'merchant_credentials');
    await setDoc(docRef, {
      client_id: 'AP24228873',
      client_secret: '',
      owner_user_id: '019f74af9fcdWDgDxM8g',
      installed: true,
      updated_at: new Date().toISOString()
    });

    // Remove legacy unused fields from settings document
    await updateDoc(docRef, {
      owner_phone: deleteField(),
      owner_username: deleteField(),
      owner_password: deleteField(),
      owner_pin: deleteField(),
      pin: deleteField(),
      password: deleteField()
    }).catch(() => null);

    console.log('✅ SUCCESS! settings/merchant_credentials now contains ONLY credentials + link (owner_user_id: 019f74af9fcdWDgDxM8g)!');
    process.exit(0);
  } catch (err) {
    console.error('Error linking settings:', err);
    process.exit(1);
  }
}

updateSettingsLink();
