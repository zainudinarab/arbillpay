import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar, 
  Sliders, 
  Code, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle,
  Sparkles,
  Zap
} from 'lucide-react';
import { 
  parseIso8601, 
  isValidIso8601Duration, 
  composeIsoDuration, 
  decomposeIsoDuration,
  isoToMikrotikTime 
} from '../utils/iso8601';

export interface IsoDurationInputProps {
  label: string;
  value: string;
  onChange: (isoValue: string, isValid: boolean) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  allowMonth?: boolean;
  themeColor?: 'blue' | 'amber' | 'emerald' | 'indigo';
  icon?: any;
}

export const IsoDurationInput: React.FC<IsoDurationInputProps> = ({
  label,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Tanpa Batasan (Unlimited)',
  allowMonth = true,
  themeColor = 'blue',
  icon: IconComponent = Calendar
}) => {
  // Mode input: 'preset' (Satuan Tunggal), 'composite' (Bertingkat Hari + Jam + Menit), 'manual' (Ketik ISO Langsung)
  const [inputMode, setInputMode] = useState<'preset' | 'composite' | 'manual'>('preset');

  // State untuk Preset
  const [presetVal, setPresetVal] = useState<number>(1);
  const [presetUnit, setPresetUnit] = useState<'month' | 'day' | 'hour' | 'minute'>('month');

  // State untuk Komposit Bertingkat (Hari + Jam + Menit)
  const [compDays, setCompDays] = useState<number>(0);
  const [compHours, setCompHours] = useState<number>(0);
  const [compMinutes, setCompMinutes] = useState<number>(0);

  // State untuk Manual ISO Input
  const [manualInput, setManualInput] = useState<string>('');

  // Sinkronisasi inisial dari `value` ke form states
  useEffect(() => {
    const raw = (value || '').trim();
    setManualInput(raw);

    if (!raw) {
      if (allowEmpty) {
        return;
      }
    }

    const parsed = parseIso8601(raw);
    const decomposed = decomposeIsoDuration(raw);

    // Deteksi apakah durasi merupakan komposit (punya kombinasi hari & jam/menit)
    const isComposite = (decomposed.days || 0) > 0 && ((decomposed.hours || 0) > 0 || (decomposed.minutes || 0) > 0);

    if (isComposite) {
      setInputMode('composite');
      setCompDays(decomposed.days || 0);
      setCompHours(decomposed.hours || 0);
      setCompMinutes(decomposed.minutes || 0);
    } else if (parsed.unit === 'custom') {
      setInputMode('manual');
    } else {
      setPresetVal(parsed.val || 1);
      if (parsed.unit === 'year') {
        setPresetUnit('month');
        setPresetVal((parsed.val || 1) * 12);
      } else {
        setPresetUnit(parsed.unit as any);
      }
    }

    // Selalu populate composite state agar saat user klik tab komposit tidak kosong
    setCompDays(decomposed.days || (parsed.unit === 'day' ? parsed.val : 0));
    setCompHours(decomposed.hours || (parsed.unit === 'hour' ? parsed.val : 0));
    setCompMinutes(decomposed.minutes || (parsed.unit === 'minute' ? parsed.val : 0));
  }, [value]);

  // Validasi format
  const isCurrentEmpty = !value || value.trim() === '';
  const isValid = (allowEmpty && isCurrentEmpty) || isValidIso8601Duration(value);

  // Interpretasi manusia & format MikroTik
  const parsedPreview = parseIso8601(value);
  const mikrotikPreview = isoToMikrotikTime(value);

  // Handler pergantian di Mode Preset
  const handlePresetChange = (newVal: number, newUnit: 'month' | 'day' | 'hour' | 'minute') => {
    const num = Math.max(1, newVal || 1);
    setPresetVal(num);
    setPresetUnit(newUnit);

    let newIso = '';
    if (newUnit === 'month') newIso = `P${num}M`;
    else if (newUnit === 'day') newIso = `P${num}D`;
    else if (newUnit === 'hour') newIso = `PT${num}H`;
    else if (newUnit === 'minute') newIso = `PT${num}M`;

    setManualInput(newIso);
    onChange(newIso, true);
  };

  // Handler pergantian di Mode Komposit (Hari + Jam + Menit)
  const handleCompositeChange = (d: number, h: number, m: number) => {
    const cleanD = Math.max(0, d || 0);
    const cleanH = Math.max(0, h || 0);
    const cleanM = Math.max(0, m || 0);

    setCompDays(cleanD);
    setCompHours(cleanH);
    setCompMinutes(cleanM);

    if (cleanD === 0 && cleanH === 0 && cleanM === 0) {
      if (allowEmpty) {
        setManualInput('');
        onChange('', true);
        return;
      }
    }

    const composed = composeIsoDuration({
      days: cleanD,
      hours: cleanH,
      minutes: cleanM
    });

    setManualInput(composed);
    onChange(composed, isValidIso8601Duration(composed));
  };

  // Handler pergantian di Mode Manual ISO
  const handleManualChange = (raw: string) => {
    const upper = raw.trim().toUpperCase();
    setManualInput(upper);
    const valid = (allowEmpty && upper === '') || isValidIso8601Duration(upper);
    onChange(upper, valid);
  };

  // Template Theme Colors
  const themeStyles = {
    blue: {
      card: 'bg-blue-50/70 border-blue-200',
      header: 'text-blue-900',
      icon: 'text-blue-600',
      activeTab: 'bg-blue-600 text-white shadow-xs',
      inactiveTab: 'text-blue-700 hover:bg-blue-100/60',
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
      accentText: 'text-blue-700',
      previewBg: 'bg-white/90 border-blue-200/80',
    },
    amber: {
      card: 'bg-amber-50/70 border-amber-200',
      header: 'text-amber-900',
      icon: 'text-amber-600',
      activeTab: 'bg-amber-600 text-white shadow-xs',
      inactiveTab: 'text-amber-700 hover:bg-amber-100/60',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      accentText: 'text-amber-700',
      previewBg: 'bg-white/90 border-amber-200/80',
    },
    emerald: {
      card: 'bg-emerald-50/70 border-emerald-200',
      header: 'text-emerald-900',
      icon: 'text-emerald-600',
      activeTab: 'bg-emerald-600 text-white shadow-xs',
      inactiveTab: 'text-emerald-700 hover:bg-emerald-100/60',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      accentText: 'text-emerald-700',
      previewBg: 'bg-white/90 border-emerald-200/80',
    },
    indigo: {
      card: 'bg-indigo-50/70 border-indigo-200',
      header: 'text-indigo-900',
      icon: 'text-indigo-600',
      activeTab: 'bg-indigo-600 text-white shadow-xs',
      inactiveTab: 'text-indigo-700 hover:bg-indigo-100/60',
      badge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      accentText: 'text-indigo-700',
      previewBg: 'bg-white/90 border-indigo-200/80',
    }
  }[themeColor];

  return (
    <div className={`p-4 rounded-2xl border ${themeStyles.card} space-y-3.5`}>
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className={`text-xs font-bold ${themeStyles.header} flex items-center gap-1.5`}>
          <IconComponent size={16} className={themeStyles.icon} />
          {label}
        </label>

        {/* Tab Pilihan Mode Input */}
        <div className="flex items-center bg-white/80 p-0.5 rounded-xl border border-slate-200/80 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => {
              setInputMode('preset');
              handlePresetChange(presetVal, presetUnit);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              inputMode === 'preset' ? themeStyles.activeTab : themeStyles.inactiveTab
            }`}
          >
            <Sliders size={11} />
            <span>Satuan Tunggal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInputMode('composite');
              handleCompositeChange(compDays, compHours, compMinutes);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              inputMode === 'composite' ? themeStyles.activeTab : themeStyles.inactiveTab
            }`}
          >
            <Layers size={11} />
            <span>Hari + Jam (Bertingkat)</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode('manual')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              inputMode === 'manual' ? themeStyles.activeTab : themeStyles.inactiveTab
            }`}
          >
            <Code size={11} />
            <span>ISO Manual</span>
          </button>
        </div>
      </div>

      {/* Grid Utama: Sisi Kiri Input Kontrol, Sisi Kanan Keterangan & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* SISI KIRI: INPUT FORM (7 Kolom) */}
        <div className="lg:col-span-7 space-y-2.5">
          {/* MODE 1: SATUAN TUNGGAL (PRESET) */}
          {inputMode === 'preset' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Jumlah Angka</label>
                <input
                  type="number"
                  min="1"
                  value={presetVal}
                  onChange={(e) => handlePresetChange(parseInt(e.target.value) || 1, presetUnit)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Satuan Waktu</label>
                <select
                  value={presetUnit}
                  onChange={(e) => handlePresetChange(presetVal, e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs"
                >
                  {allowMonth && <option value="month">📅 Bulan Kalender (P...M)</option>}
                  <option value="day">📆 Hari (P...D)</option>
                  <option value="hour">⏱️ Jam (PT...H)</option>
                  <option value="minute">⚡ Menit (PT...M)</option>
                </select>
              </div>
            </div>
          )}

          {/* MODE 2: BERTINGKAT / KOMPOSIT (HARI + JAM + MENIT) */}
          {inputMode === 'composite' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {/* 1. Input Hari */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar size={11} className="text-blue-500" />
                    1. Hari (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={compDays}
                    onChange={(e) => handleCompositeChange(parseInt(e.target.value) || 0, compHours, compMinutes)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs"
                    placeholder="0"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">Kode: P{compDays || 0}D</span>
                </div>

                {/* 2. Input Jam */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Clock size={11} className="text-emerald-500" />
                    2. Jam (Hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={compHours}
                    onChange={(e) => handleCompositeChange(compDays, parseInt(e.target.value) || 0, compMinutes)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs"
                    placeholder="0"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">Kode: T{compHours || 0}H</span>
                </div>

                {/* 3. Input Menit */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Zap size={11} className="text-amber-500" />
                    3. Menit (Min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={compMinutes}
                    onChange={(e) => handleCompositeChange(compDays, compHours, parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-2xs"
                    placeholder="0"
                  />
                  <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">Kode: {compMinutes || 0}M</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                💡 Contoh: Jika Anda isi 1 Hari dan 6 Jam, otomatis dikonversi menjadi format ISO: <strong>P1DT6H</strong>.
              </p>
            </div>
          )}

          {/* MODE 3: MANUAL ISO STRING */}
          {inputMode === 'manual' && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Input Kode ISO-8601 Manual</span>
                <span className="text-[10px] font-normal text-slate-400">Contoh: PT1H, P1D, P1M, P1DT6H</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => handleManualChange(e.target.value)}
                  placeholder="Ketik kode ISO, misal: PT1H atau P1DT6H"
                  className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-xs font-mono font-bold transition-all shadow-2xs ${
                    isValid 
                      ? 'border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none' 
                      : 'border-rose-400 bg-rose-50/50 text-rose-900 focus:ring-2 focus:ring-rose-500 focus:outline-none'
                  }`}
                />
              </div>

              {/* Error warning jika format ISO tidak valid */}
              {!isValid && (
                <div className="flex items-center gap-1.5 text-rose-600 text-[11px] font-semibold pt-0.5">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>Format tidak valid! Wajib diawali &apos;P&apos; (kalender) atau &apos;PT&apos; (jam/menit). Contoh: PT1H, P30D, P1DT6H.</span>
                </div>
              )}
            </div>
          )}

          {/* Opsi Kosongkan / Unlimited jika allowEmpty */}
          {allowEmpty && (
            <div className="pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 font-medium">
                <input
                  type="checkbox"
                  checked={isCurrentEmpty}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setManualInput('');
                      onChange('', true);
                    } else {
                      handlePresetChange(1, 'hour');
                    }
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>{emptyLabel}</span>
              </label>
            </div>
          )}
        </div>

        {/* SISI KANAN: KETERANGAN, PREVIEW & PANDUAN PENULISAN (5 Kolom) */}
        <div className={`lg:col-span-5 p-3 rounded-xl border ${themeStyles.previewBg} flex flex-col justify-between space-y-2.5 shadow-2xs`}>
          {/* Box Preview Hasil */}
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
              Interpretasi Waktu & Status
            </span>

            {isCurrentEmpty ? (
              <div className="text-xs font-semibold text-slate-500 italic">
                {emptyLabel}
              </div>
            ) : (
              <div className="space-y-1">
                {/* Arti dalam Bahasa Indonesia */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-800">
                    👉 {parsedPreview.human}
                  </span>
                  {isValid ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" title="Format ISO Valid" />
                  ) : (
                    <AlertTriangle size={13} className="text-rose-500 shrink-0" title="Format Tidak Valid" />
                  )}
                </div>

                {/* Kode ISO & MikroTik Time */}
                <div className="flex items-center flex-wrap gap-1.5 text-[10px] font-mono pt-0.5">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${themeStyles.badge}`}>
                    ISO: {value || '-'}
                  </span>
                  {mikrotikPreview && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                      MikroTik: {mikrotikPreview}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cheatsheet Panduan Singkat */}
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 space-y-1 bg-slate-50/70 p-2 rounded-lg">
            <div className="font-bold text-slate-700 flex items-center gap-1">
              <HelpCircle size={11} className="text-slate-400" />
              <span>Panduan Cepat Format ISO:</span>
            </div>
            <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 text-[9.5px] font-mono text-slate-600">
              <div>&bull; <strong className="text-blue-700">P1M</strong> = 1 Bulan</div>
              <div>&bull; <strong className="text-blue-700">P1D</strong> = 1 Hari</div>
              <div>&bull; <strong className="text-emerald-700">PT1H</strong> = 1 Jam</div>
              <div>&bull; <strong className="text-emerald-700">PT30M</strong> = 30 Menit</div>
              <div className="col-span-2 text-indigo-700">&bull; <strong>P1DT6H</strong> = 1 Hari 6 Jam</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
