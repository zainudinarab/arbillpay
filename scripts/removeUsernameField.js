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

async function removeUsername() {
  console.log('🧹 Removing username field from users/019f74af9fcdWDgDxM8g document...');
  try {
    const userDocRef = doc(db, 'users', '019f74af9fcdWDgDxM8g');
    await updateDoc(userDocRef, {
      username: deleteField()
    });
    console.log('✅ SUCCESS! username field deleted from users/019f74af9fcdWDgDxM8g document!');
    process.exit(0);
  } catch (err) {
    console.error('Error deleting username field:', err);
    process.exit(1);
  }
}

removeUsername();
