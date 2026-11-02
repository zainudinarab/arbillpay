import React, { useState, useRef } from 'react';
import { 
  Gauge, 
  Activity, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Zap, 
  ShieldCheck, 
  Wifi, 
  Server
} from 'lucide-react';
import { getApiUrl } from '../config/api';

interface SpeedtestModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName?: string;
  customerId?: string;
  pppoeUsername?: string;
  packageSpeed?: string;
  packageName?: string;
}

export type TestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'completed';

export default function SpeedtestModal({
  isOpen,
  onClose,
  customerName,
  customerId,
  pppoeUsername,
  packageSpeed,
  packageName
}: SpeedtestModalProps) {
  const [phase, setPhase] = useState<TestPhase>('idle');
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [jitter, setJitter] = useState<number>(0);
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
  const [uploadSpeed, setUploadSpeed] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('Siap Menguji');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  if (!isOpen) return null;

  // Parsing angka Mbps dari packageSpeed (misal "20M/20M" -> 20, "10 Mbps" -> 10)
  const targetMbps = packageSpeed 
    ? parseFloat(packageSpeed.replace(/[^0-9.]/g, '')) || 20
    : 20;

  const startTest = async () => {
    setPhase('ping');
    setProgress(5);
    setCurrentSpeed(0);
    setPing(0);
    setJitter(0);
    setDownloadSpeed(0);
    setUploadSpeed(0);
    setErrorMessage(null);
    setStatusText('Mengukur Latensi & Jitter Lokal...');

    const apiUrl = getApiUrl();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      // 1. PING & JITTER TEST (5 putaran rapid ping)
      const pings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        await fetch(`${apiUrl}/api/speedtest/ping?t=${Date.now()}_${i}`, {
          signal: abortCtrl.signal,
          cache: 'no-store'
        });
        const t1 = performance.now();
        const rtt = Math.max(1, Math.round(t1 - t0));
        pings.push(rtt);
        setPing(rtt);
        setProgress(5 + (i + 1) * 3);
        await new Promise((r) => setTimeout(r, 80));
      }

      // Hitung Rata-rata Ping & Jitter
      const avgPing = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
      let jitterSum = 0;
      for (let i = 1; i < pings.length; i++) {
        jitterSum += Math.abs(pings[i] - pings[i - 1]);
      }
      const avgJitter = Math.max(1, Math.round(jitterSum / (pings.length - 1)));
      setPing(avgPing);
      setJitter(avgJitter);

      // 2. DOWNLOAD TEST
      setPhase('download');
      setStatusText('Menguji Kecepatan Unduh (Download Throughput)...');
      setProgress(25);

      const downloadSizeMb = targetMbps > 30 ? 25 : 15;
      const downloadStart = performance.now();
      const res = await fetch(`${apiUrl}/api/speedtest/download?size=${downloadSizeMb}&t=${Date.now()}`, {
        signal: abortCtrl.signal,
        cache: 'no-store'
      });

      if (!res.body) throw new Error('ReadableStream tidak didukung browser ini.');
      const reader = res.body.getReader();
      let bytesReceived = 0;
      let lastReport = performance.now();
      let peakDownload = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;

        const now = performance.now();
        if (now - lastReport > 120) {
          const durationSec = (now - downloadStart) / 1000;
          const bits = bytesReceived * 8;
          const mbps = Math.round(((bits / durationSec) / (1024 * 1024)) * 10) / 10;
          setCurrentSpeed(mbps);
          if (mbps > peakDownload) peakDownload = mbps;
          const downloadProgress = Math.min(65, 25 + Math.round((bytesReceived / (downloadSizeMb * 1024 * 1024)) * 40));
          setProgress(downloadProgress);
          lastReport = now;
        }
      }

      const totalDownloadDurationSec = (performance.now() - downloadStart) / 1000;
      const finalDownloadMbps = Math.round((((bytesReceived * 8) / totalDownloadDurationSec) / (1024 * 1024)) * 10) / 10;
      setDownloadSpeed(finalDownloadMbps || peakDownload);
      setCurrentSpeed(finalDownloadMbps || peakDownload);
      setProgress(68);

      // 3. UPLOAD TEST
      setPhase('upload');
      setStatusText('Menguji Kecepatan Unggah (Upload Throughput)...');
      setCurrentSpeed(0);

      // Siapkan payload upload 4-8 MB
      const uploadBytes = (targetMbps > 30 ? 8 : 4) * 1024 * 1024;
      const uploadPayload = new Uint8Array(uploadBytes);
      crypto.getRandomValues(uploadPayload.subarray(0, 1024)); // Seed random

      const uploadStart = performance.now();
      const upRes = await fetch(`${apiUrl}/api/speedtest/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: uploadPayload,
        signal: abortCtrl.signal
      });

      const upData = await upRes.json();
      const uploadDurationSec = (performance.now() - uploadStart) / 1000;
      const finalUploadMbps = upData.mbps || Math.round((((uploadBytes * 8) / uploadDurationSec) / (1024 * 1024)) * 10) / 10;
      setUploadSpeed(finalUploadMbps);
      setCurrentSpeed(finalUploadMbps);
      setProgress(100);

      // 4. SELESAI
      setPhase('completed');
      setStatusText('Pengujian Selesai');

      // Simpan hasil ke database secara silent
      fetch(`${apiUrl}/api/speedtest/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId || null,
          pppoe_username: pppoeUsername || null,
          ping_ms: avgPing,
          jitter_ms: avgJitter,
          download_mbps: finalDownloadMbps,
          upload_mbps: finalUploadMbps
        })
      }).catch(() => {});

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatusText('Pengujian dibatalkan');
      } else {
        setErrorMessage(err.message || 'Gagal menjalankan uji kecepatan');
        setPhase('completed');
      }
    }
  };

  const cancelTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPhase('idle');
    setProgress(0);
    setCurrentSpeed(0);
  };

  // Evaluasi rasio pencapaian terhadap paket
  const speedRatio = downloadSpeed > 0 ? (downloadSpeed / targetMbps) * 100 : 0;
  let qualityBadge = {
    color: 'emerald',
    text: '🟢 PRIMA & STABIL (Sesuai Paket)',
    desc: 'Kecepatan tembus batas maksimal paket langganan Anda. Jalur optik sangat lancar.'
  };

  if (speedRatio < 50) {
    qualityBadge = {
      color: 'rose',
      text: '🔴 PERLU INSPEKSI JARINGAN',
      desc: 'Kecepatan di bawah 50% dari paket. Kemungkinan ada redaman tinggi atau interferensi Wi-Fi.'
    };
  } else if (speedRatio < 85) {
    qualityBadge = {
      color: 'amber',
      text: '🟡 CUKUP BAIK (Toleransi Wi-Fi)',
      desc: 'Kecepatan berada pada batas toleransi frekuensi Wi-Fi rumahan.'
    };
  }

  // Sudut rotasi jarum gauge (-90 derajat s/d +90 derajat)
  const maxDial = Math.max(targetMbps * 1.5, 50);
  const gaugeAngle = Math.min(90, Math.max(-90, -90 + (currentSpeed / maxDial) * 180));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl max-w-lg w-full border border-indigo-900/60 shadow-2xl overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-900/40 bg-black/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Gauge size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
                <span>Speedtest Server Lokal</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  On-Net
                </span>
              </h3>
              <p className="text-[10px] text-indigo-300/70">
                Uji langsung ke Server ISP lokal tanpa beban transit internasional
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              cancelTest();
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Target Profile Bar */}
        <div className="px-6 py-2.5 bg-indigo-950/40 border-b border-indigo-900/30 flex items-center justify-between text-xs text-indigo-200/80">
          <div className="flex items-center gap-1.5 truncate">
            <Wifi size={14} className="text-indigo-400 shrink-0" />
            <span className="truncate">
              {customerName ? <b>{customerName}</b> : 'Pelanggan'} {packageName ? `• ${packageName}` : ''}
            </span>
          </div>
          <div className="shrink-0 font-mono font-bold text-white bg-indigo-600/30 px-2 py-0.5 rounded-md border border-indigo-500/40 text-[11px]">
            Target: {targetMbps} Mbps
          </div>
        </div>

        {/* Main Speedometer Gauge Section */}
        <div className="p-6 flex flex-col items-center justify-center space-y-4">
          {/* Animated Gauge Dial */}
          <div className="relative w-56 h-36 flex flex-col items-center justify-end">
            {/* Outer Semi-Circle Track */}
            <div className="absolute inset-0 rounded-t-full border-12 border-slate-800 border-b-0 pointer-events-none" />
            
            {/* Active Colored Arc */}
            <div 
              className={`absolute inset-0 rounded-t-full border-12 border-b-0 transition-all duration-300 pointer-events-none ${
                phase === 'download' ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]' :
                phase === 'upload' ? 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.5)]' :
                'border-emerald-500'
              }`}
              style={{
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%)`,
                opacity: phase === 'idle' ? 0.3 : 1
              }}
            />

            {/* Gauge Needle Pointer */}
            <div 
              className="absolute bottom-0 w-1.5 h-24 bg-gradient-to-t from-white to-indigo-400 rounded-full origin-bottom transition-transform duration-200"
              style={{ transform: `rotate(${gaugeAngle}deg)` }}
            />
            <div className="absolute bottom-0 w-4 h-4 rounded-full bg-white shadow-lg -mb-2" />

            {/* Speed Value Number Display */}
            <div className="relative z-10 text-center -mb-2">
              <span className="text-4xl font-black font-mono tracking-tight text-white drop-shadow-md">
                {currentSpeed.toFixed(1)}
              </span>
              <span className="text-[11px] font-bold text-indigo-300 block uppercase tracking-widest">
                Mbps
              </span>
            </div>
          </div>

          {/* Phase Status Banner */}
          <div className="w-full text-center">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              phase === 'completed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
              phase === 'idle' ? 'bg-slate-800 text-slate-400' :
              'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse'
            }`}>
              {statusText}
            </span>
          </div>

          {/* Progress Bar */}
          {phase !== 'idle' && phase !== 'completed' && (
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* 4 Key Metrics Cards */}
          <div className="grid grid-cols-4 gap-2.5 w-full pt-1">
            {/* Ping */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Ping</span>
              <div className="flex items-baseline justify-center gap-0.5 pt-0.5">
                <span className="text-base font-black text-amber-400 font-mono">{ping}</span>
                <span className="text-[9px] text-slate-500 font-bold">ms</span>
              </div>
            </div>

            {/* Jitter */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 text-center">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Jitter</span>
              <div className="flex items-baseline justify-center gap-0.5 pt-0.5">
                <span className="text-base font-black text-amber-300 font-mono">{jitter}</span>
                <span className="text-[9px] text-slate-500 font-bold">ms</span>
              </div>
            </div>

            {/* Download */}
            <div className={`border rounded-2xl p-2.5 text-center transition-all ${
              phase === 'download' ? 'bg-indigo-950/60 border-indigo-500 shadow-md' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <span className="text-[9px] uppercase font-bold text-indigo-300 flex items-center justify-center gap-0.5">
                <ArrowDownCircle size={10} />
                <span>Unduh</span>
              </span>
              <div className="flex items-baseline justify-center gap-0.5 pt-0.5">
                <span className="text-base font-black text-indigo-400 font-mono">
                  {downloadSpeed ? downloadSpeed.toFixed(1) : '-'}
                </span>
                <span className="text-[9px] text-slate-500 font-bold">Mb</span>
              </div>
            </div>

            {/* Upload */}
            <div className={`border rounded-2xl p-2.5 text-center transition-all ${
              phase === 'upload' ? 'bg-purple-950/60 border-purple-500 shadow-md' : 'bg-slate-900/80 border-slate-800'
            }`}>
              <span className="text-[9px] uppercase font-bold text-purple-300 flex items-center justify-center gap-0.5">
                <ArrowUpCircle size={10} />
                <span>Unggah</span>
              </span>
              <div className="flex items-baseline justify-center gap-0.5 pt-0.5">
                <span className="text-base font-black text-purple-400 font-mono">
                  {uploadSpeed ? uploadSpeed.toFixed(1) : '-'}
                </span>
                <span className="text-[9px] text-slate-500 font-bold">Mb</span>
              </div>
            </div>
          </div>

          {/* Quality Analysis Card (After completed) */}
          {phase === 'completed' && downloadSpeed > 0 && (
            <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  <span>Kualitas Koneksi:</span>
                </span>
                <span className={`font-black text-[11px] ${
                  qualityBadge.color === 'emerald' ? 'text-emerald-400' :
                  qualityBadge.color === 'amber' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {qualityBadge.text}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {qualityBadge.desc}
              </p>
              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/80 font-mono">
                <span>Pencapaian: {Math.min(100, Math.round(speedRatio))}% dari {targetMbps} Mbps</span>
                <span>Server: Arbill Local Server</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="w-full p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="w-full pt-2">
            {phase === 'idle' || phase === 'completed' ? (
              <button
                type="button"
                onClick={startTest}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <Zap size={16} />
                <span>{phase === 'completed' ? 'Uji Ulang Kecepatan' : 'Mulai Uji Kecepatan'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelTest}
                className="w-full py-3 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <X size={15} />
                <span>Batalkan Pengujian</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

