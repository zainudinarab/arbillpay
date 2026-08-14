import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

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

function hashPasswordNode(plainPassword) {
  const cleanPass = plainPassword.trim();
  return crypto.createHash('sha256').update(cleanPass + '_arbillpay_owner_salt_2026').digest('hex');
}

async function injectEncrypted() {
  const rawPass = 'zainudinarab';
  const encryptedHash = hashPasswordNode(rawPass);
  console.log(`🔐 Encrypting password '${rawPass}' -> SHA-256 Hash: ${encryptedHash}`);
  console.log('🚀 Injecting ENCRYPTED Owner password document into Cloud Firestore users collection...');

  try {
    await setDoc(doc(db, 'users', '019f74af9fcdWDgDxM8g'), {
      id: '019f74af9fcdWDgDxM8g',
      username: 'zainudinarab',
      name: 'Zainudin Arab (Owner)',
      email: 'ketua11@gmail.com',
      phone_number: '085746520724',
      role: 'owner',
      password: encryptedHash,
      password_hash: encryptedHash,
      updated_at: new Date().toISOString()
    }, { merge: true });

    console.log('✅ ENCRYPTED SUCCESS! Owner document (users/019f74af9fcdWDgDxM8g) updated with SHA-256 hash in Cloud Firestore!');
    process.exit(0);
  } catch (err) {
    console.error('❌ ERROR Injecting to Cloud Firestore:', err);
    process.exit(1);
  }
}

injectEncrypted();
