import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

dotenv.config();

export interface FirebaseConfig {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
}

let firestoreInstance: any = null;

export function getFirestore() {
  // Jika DB_DRIVER diatur ke postgres, jangan hubungi Firebase sama sekali
  if (process.env.DB_DRIVER === 'postgres') {
    return null;
  }

  if (firestoreInstance) return firestoreInstance;

  const projectId = process.env.FIREBASE_PROJECT_ID || 'arbillpay';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  try {
    if (!getApps().length) {
      const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'arbillpay-firebase-adminsdk-fbsvc-a9561354bc.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
          credential: cert(serviceAccount)
        });
        console.log(`✅ Firebase Admin SDK berhasil terhubung via Service Account: ${path.basename(serviceAccountPath)}`);
      } else if (clientEmail && privateKey) {
        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log(`✅ Firebase Admin SDK terhubung via Env Credentials (${projectId})`);
      } else {
        // Jangan inisialisasi tanpa kredensial karena akan memicu Unhandled Rejection
        return null;
      }
    }
    firestoreInstance = getAdminFirestore();
    return firestoreInstance;
  } catch (err: any) {
    return null;
  }
}
