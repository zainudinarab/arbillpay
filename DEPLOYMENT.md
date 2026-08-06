# Dokumentasi Integrasi GitHub & Automatic Deployment Firebase Hosting (`arbillpay`)

Dokumen ini menjelaskan alur **Otomatisasi Deployment (CI/CD)** dari repository GitHub `zainudinarab/arbillpay` ke **Firebase Hosting** dan **Cloud Firestore**.

---

## 🔄 Alur Kerja Otomatisasi (CI/CD Flow)

```text
[ Developer Commit & Push Kode ke GitHub ]
                   │
                   ▼
      [ GitHub Actions Auto-Trigger ]
                   │
                   ▼
   [ npm ci ──> npm run build ──> Deploy ]
                   │
                   ▼
 [ Website Otomatis Aktif di Firebase Hosting ]
           (arbillpay.web.app)
```

Setiap kali Anda menjalankan perintah:
```bash
git add .
git commit -m "Update fitur baru"
git push origin main
```
Sistem **GitHub Actions** akan secara otomatis me-build aplikasi dan memperbarui situs web di **Firebase Hosting** tanpa perlu campur tangan manual lagi!

---

## 🔑 Pengaturan GitHub Secrets (Satu Kali Setup di GitHub)

Agar GitHub Actions dapat melakukan deploy ke Firebase secara aman, tambahkan Secrets berikut di GitHub Repository Anda:

1. Buka Repository GitHub: **https://github.com/zainudinarab/arbillpay**
2. Masuk ke menu **Settings** -> **Secrets and variables** -> **Actions**.
3. Klik **New repository secret** dan masukkan:

| Secret Name | Value / Isi Secret |
| :--- | :--- |
| **`FIREBASE_SERVICE_ACCOUNT_ARBILLPAY`** | Salin seluruh isi teks file `arbillpay-firebase-adminsdk-fbsvc-a9561354bc.json` |
| **`VITE_FIREBASE_API_KEY`** | `AIzaSyDTKOdu9vth6hywTM8GqXOSBg8EtXnfH90` |
| **`VITE_FIREBASE_PROJECT_ID`** | `arbillpay` |
| **`VITE_FIREBASE_AUTH_DOMAIN`** | `arbillpay.firebaseapp.com` |

---

## 📂 Struktur Berkas Workflow GitHub Actions

* Berkas CI/CD Workflow: **`.github/workflows/deploy-firebase.yml`**
* Kredensial Firebase Admin SDK: `arbillpay-firebase-adminsdk-fbsvc-a9561354bc.json` *(Dilindungi oleh `.gitignore` agar aman tidak bocor ke publik)*.
* Konfigurasi Database Driver: `.env` (`DB_DRIVER=firebase`).

---

## 🛠️ Perintah Manual (Fallback CLI Deployment)

Jika sewaktu-waktu Anda ingin melakukan deploy cepat langsung dari komputer lokal tanpa melalui GitHub:

```bash
npm run deploy:firebase
```
