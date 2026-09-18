import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  QrCode, 
  Zap, 
  ZapOff, 
  RefreshCw, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Copy, 
  ShieldCheck, 
  Sparkles,
  Volume2,
  VolumeX,
  Smartphone,
  Settings2,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { BusinessProfile } from '../types';

interface QrVoucherScannerProps {
  profile?: BusinessProfile | null;
  onBack?: () => void;
}

export default function QrVoucherScanner({ profile, onBack }: QrVoucherScannerProps) {
  const [scannerReady, setScannerReady] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);
  
  // MikroTik router fallback URL if QR contains only code
  const [customRouterUrl, setCustomRouterUrl] = useState<string>(() => {
    // Check URL search params or hash params or localStorage
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    return params.get('loginUrl') || hashParams.get('loginUrl') || 
           params.get('router') || hashParams.get('router') || 
           localStorage.getItem('arbill_hotspot_login_url') || 'http://192.168.88.1/login';
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [analyzingFile, setAnalyzingFile] = useState<boolean>(false);
  const containerId = 'arbill-qr-reader';

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setAnalyzingFile(true);
      setErrorMessage(null);
      await stopScanner();

      const fileScanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });

      const decodedText = await fileScanner.scanFile(file, true);
      setAnalyzingFile(false);
      handleScanSuccess(decodedText);
    } catch (err: any) {
      setAnalyzingFile(false);
      setErrorMessage("Tidak ditemukan QR Code yang valid pada foto tersebut. Pastikan gambar voucher terlihat terang dan jelas.");
      startScanner();
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Sound beep synthesizer via Web Audio API (offline, no external asset needed)
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // Audio context may be restricted by autoplay policy
    }
  };

  // Vibrate mobile device if supported
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 150]);
      } catch {
        // Ignore if unsupported
      }
    }
  };

  // Initialize and get available cameras
  useEffect(() => {
    let isMounted = true;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!isMounted) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back/environment camera
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('belakang') ||
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
          setScannerReady(true);
        } else {
          setErrorMessage('Tidak ada kamera yang ditemukan pada perangkat ini.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Gagal memuat daftar kamera:', err);
        // Still allow camera access attempt via default constraints
        setScannerReady(true);
      });

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, []);

  // Start scanner when camera is selected and container is ready
  useEffect(() => {
    if (scannerReady && !scanResult) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [scannerReady, selectedCameraId]);

  const startScanner = async () => {
    try {
      if (html5QrCodeRef.current) {
        await stopScanner();
      }

      setErrorMessage(null);
      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      html5QrCodeRef.current = scanner;

      const cameraConfig = selectedCameraId 
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: 'environment' };

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edgeSize = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
          return { width: Math.floor(edgeSize), height: Math.floor(edgeSize) };
        },
        aspectRatio: 1.0
      };

      await scanner.start(
        cameraConfig,
        config,
        (decodedText) => {
          handleScanSuccess(decodedText);
        },
        () => {
          // Frame scanned without QR, ignore silent error
        }
      );

      setIsScanning(true);

      // Check if torch/flashlight is supported
      try {
        const capabilities = scanner.getRunningTrackCameraCapabilities();
        if (capabilities && (capabilities as any).torchFeature) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      setIsScanning(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Harap izinkan akses kamera di browser Anda untuk memindai QR voucher.'
          : 'Gagal membuka kamera: ' + (err.message || 'Pastikan browser memiliki izin akses kamera.')
      );
    }
  };

  const stopScanner = async () => {
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch (err) {
      console.warn('Error stopping scanner:', err);
    } finally {
      setIsScanning(false);
      setTorchEnabled(false);
    }
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const nextState = !torchEnabled;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }] as any
      });
      setTorchEnabled(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  // Handle successful QR detection
  const handleScanSuccess = (decodedText: string) => {
    const cleanText = decodedText.trim();
    if (!cleanText) return;

    playBeep();
    triggerHaptic();
    stopScanner();
    setScanResult(cleanText);

    // Analyze scanned text: is it a direct URL or a raw voucher code?
    const isUrl = cleanText.startsWith('http://') || cleanText.startsWith('https://');
    let targetRedirectUrl = '';

    if (isUrl) {
      targetRedirectUrl = cleanText;
    } else {
      // Build login URL using customRouterUrl
      const base = customRouterUrl.trim();
      const delimiter = base.includes('?') ? '&' : '?';
      targetRedirectUrl = `${base}${delimiter}username=${encodeURIComponent(cleanText)}&password=${encodeURIComponent(cleanText)}`;
    }

    // Auto-redirect countdown
    setRedirecting(true);
    let timeLeft = 3;
    setCountdown(timeLeft);

    const timer = setInterval(() => {
      timeLeft -= 1;
      setCountdown(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(timer);
        window.location.href = targetRedirectUrl;
      }
    }, 1000);
  };

  const handleManualRedirect = (url: string) => {
    window.location.href = url;
  };

  const handleCopyCode = () => {
    if (!scanResult) return;
    navigator.clipboard.writeText(scanResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetScan = () => {
    setScanResult(null);
    setRedirecting(false);
    setErrorMessage(null);
    startScanner();
  };

  // Compute clean redirect target for display
  const computeTargetUrl = () => {
    if (!scanResult) return '';
    if (scanResult.startsWith('http://') || scanResult.startsWith('https://')) {
      return scanResult;
    }
    const base = customRouterUrl.trim();
    const delimiter = base.includes('?') ? '&' : '?';
    return `${base}${delimiter}username=${encodeURIComponent(scanResult)}&password=${encodeURIComponent(scanResult)}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans relative overflow-hidden select-none">
      {/* Background Decorative Glow */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-600/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-600/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Bar */}
      <header className="w-full max-w-md flex items-center justify-between z-10 pt-2 pb-4 border-b border-slate-800/80">
        <button
          onClick={() => {
            if (onBack) onBack();
            else if (window.history.length > 1) window.history.back();
            else window.location.hash = '#/portal';
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition active:scale-95 text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Kembali</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <QrCode className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
              {profile?.companyName || 'ARBILL QR'}
            </h1>
            <p className="text-[10px] text-cyan-400 font-mono tracking-wider uppercase">
              Hotspot Scanner
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition ${
              soundEnabled 
                ? 'bg-slate-900 border-slate-800 text-cyan-400' 
                : 'bg-slate-900/50 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Suara Aktif' : 'Suara Mati'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Pengaturan Router"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Router URL Settings Drawer (Optional) */}
      {showSettings && (
        <div className="w-full max-w-md mt-3 p-4 rounded-2xl bg-slate-900/95 border border-slate-800 backdrop-blur-xl z-20 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
              URL Login Gateway MikroTik
            </h3>
            <span className="text-[10px] text-slate-500">Fallback jika QR hanya kode</span>
          </div>
          <input
            type="text"
            value={customRouterUrl}
            onChange={(e) => {
              setCustomRouterUrl(e.target.value);
              localStorage.setItem('arbill_hotspot_login_url', e.target.value);
            }}
            placeholder="Contoh: http://192.168.88.1/login"
            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          />
          <p className="text-[10px] text-slate-400 mt-2">
            Default: <code className="text-cyan-400">http://192.168.88.1/login</code> atau nama DNS hotspot MikroTik Anda.
          </p>
        </div>
      )}

      {/* Main Scanner Section */}
      <main className="w-full max-w-md my-auto flex flex-col items-center justify-center z-10">
        {!scanResult ? (
          <div className="w-full flex flex-col items-center">
            {/* Viewfinder Frame */}
            <div className="relative w-full aspect-square max-w-[340px] rounded-3xl overflow-hidden border-2 border-cyan-500/40 bg-slate-900/80 shadow-2xl shadow-cyan-950/40 backdrop-blur-md">
              
              {/* HTML5 QR Code Container (video element placed here) */}
              <div id={containerId} className="w-full h-full object-cover [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

              {/* Scanning Laser Line Animation */}
              {isScanning && (
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] animate-bounce pointer-events-none opacity-80" />
              )}

              {/* Corner Reticles */}
              <div className="absolute top-4 left-4 w-7 h-7 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg pointer-events-none" />
              <div className="absolute top-4 right-4 w-7 h-7 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg pointer-events-none" />
              <div className="absolute bottom-4 left-4 w-7 h-7 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg pointer-events-none" />
              <div className="absolute bottom-4 right-4 w-7 h-7 border-b-4 border-r-4 border-cyan-400 rounded-br-lg pointer-events-none" />

              {/* Camera Action Overlay Controls */}
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3 pointer-events-auto">
                {cameras.length > 1 && (
                  <button
                    onClick={switchCamera}
                    className="px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Ganti Kamera</span>
                  </button>
                )}

                {hasTorch && (
                  <button
                    onClick={toggleTorch}
                    className={`px-3 py-1.5 rounded-full border text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition ${
                      torchEnabled 
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300' 
                        : 'bg-slate-950/80 border-slate-700/80 text-slate-200'
                    }`}
                  >
                    {torchEnabled ? <Zap className="w-3.5 h-3.5 text-amber-400" /> : <ZapOff className="w-3.5 h-3.5" />}
                    <span>Senter</span>
                  </button>
                )}
              </div>
            </div>

            {/* Core Action: Scan from Gallery */}
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileScan} 
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzingFile}
              className="w-full max-w-[340px] mt-4 py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-emerald-950/40 hover:from-cyan-900/50 hover:to-emerald-900/50 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/30 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {analyzingFile ? (
                <>
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>Menganalisis Foto Voucher...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <span>📁 Scan dari Galeri / Screenshot Foto</span>
                </>
              )}
            </button>

            {/* Helper Text */}
            <div className="mt-4 text-center px-4">
              <p className="text-sm font-semibold text-slate-200 flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Arahkan kamera ke QR Code Voucher
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Kamera akan otomatis mendeteksi dan melakukan login ke hotspot MikroTik Anda.
              </p>
            </div>

            {/* Error Message if camera failed */}
            {errorMessage && (
              <div className="w-full mt-4 p-3.5 rounded-2xl bg-red-950/50 border border-red-800/80 text-red-200 text-xs flex items-start gap-2.5 leading-relaxed">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Akses Kamera Terkendala</p>
                  <p className="text-red-300/90 mt-0.5">{errorMessage}</p>
                  <button 
                    onClick={startScanner}
                    className="mt-2.5 px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg font-semibold text-[11px] transition active:scale-95"
                  >
                    Coba Lagi
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Scan Success Card */
          <div className="w-full bg-slate-900/95 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl shadow-emerald-950/50 backdrop-blur-xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>

            <h2 className="text-lg font-bold text-white">QR Code Berhasil Terbaca!</h2>
            <p className="text-xs text-slate-400 mt-1">
              {redirecting ? `Mengarahkan ke MikroTik dalam ${countdown} detik...` : 'Voucher siap digunakan.'}
            </p>

            {/* Scanned Code Box */}
            <div className="w-full mt-4 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-left">
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Isi QR Code / Kode Voucher:</span>
                <span className="text-xs font-mono font-bold text-cyan-300 truncate block mt-0.5">
                  {scanResult}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 shrink-0 transition"
                title="Salin Kode"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            {/* Countdown Progress Bar */}
            {redirecting && (
              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((4 - countdown) / 3) * 100}%` }}
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2.5 mt-5">
              <button
                onClick={() => handleManualRedirect(computeTargetUrl())}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Login ke MikroTik Sekarang</span>
              </button>

              <button
                onClick={handleResetScan}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700/60 active:scale-[0.98] transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Ulang</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer Security Badges */}
      <footer className="w-full max-w-md flex items-center justify-between text-[11px] text-slate-500 pt-4 border-t border-slate-800/80 z-10">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>HTTPS SSL Enkripsi Kamera</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 font-mono">
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>WIFI ARABPAY</span>
        </div>
      </footer>
    </div>
  );
}
