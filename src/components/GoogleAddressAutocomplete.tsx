import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Sparkles, Loader2, Check, Hash, Building2, Map } from 'lucide-react';
import { ALL_38_PROVINCES, fetchPostalCode } from '../services/indonesiaRegionService';

export interface FullAddressSelection {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  dusun: string;
  kode_pos: string;
}

interface GoogleAddressAutocompleteProps {
  value: FullAddressSelection;
  onChange: (updated: FullAddressSelection) => void;
  darkTheme?: boolean;
}

// Popular Indonesian Regions Local Search Database (Fast Local Cache)
const POPULAR_INDONESIAN_LOCATIONS = [
  { desa: 'CUKIR', kecamatan: 'DIWEK', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61471' },
  { desa: 'KWARON', kecamatan: 'DIWEK', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61471' },
  { desa: 'DIWEK', kecamatan: 'DIWEK', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61471' },
  { desa: 'JATIREJO', kecamatan: 'DIWEK', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61471' },
  { desa: 'PETERONGAN', kecamatan: 'PETERONGAN', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61481' },
  { desa: 'KEBONAGUNG', kecamatan: 'PETERONGAN', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61481' },
  { desa: 'SUMOBITO', kecamatan: 'SUMOBITO', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61483' },
  { desa: 'MOJOWARNO', kecamatan: 'MOJOWARNO', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61475' },
  { desa: 'JOMBANG', kecamatan: 'JOMBANG', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61411' },
  { desa: 'CANDIMULYO', kecamatan: 'JOMBANG', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61413' },
  { desa: 'KRIAN', kecamatan: 'KRIAN', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61262' },
  { desa: 'WARU', kecamatan: 'WARU', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61256' },
  { desa: 'WONOKROMO', kecamatan: 'WONOKROMO', kabupaten: 'KOTA SURABAYA', provinsi: 'JAWA TIMUR', zip: '60243' },
  { desa: 'TEBING TINGGI', kecamatan: 'TEBING TINGGI', kabupaten: 'KABUPATEN KEPULAUAN MERANTI', provinsi: 'RIAU', zip: '28751' },
  { desa: 'BANDUNG', kecamatan: 'SUMUR BANDUNG', kabupaten: 'KOTA BANDUNG', provinsi: 'JAWA BARAT', zip: '40111' },
  { desa: 'KEBAYORAN BARU', kecamatan: 'KEBAYORAN BARU', kabupaten: 'KOTA ADM. JAKARTA SELATAN', provinsi: 'DKI JAKARTA', zip: '12110' },
  { desa: 'MALANG', kecamatan: 'KLOJEN', kabupaten: 'KOTA MALANG', provinsi: 'JAWA TIMUR', zip: '65111' }
];

export const GoogleAddressAutocomplete: React.FC<GoogleAddressAutocompleteProps> = ({
  value,
  onChange,
  darkTheme = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search API & Local Cache dynamically
  const handleSearchChange = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const cleanQ = q.trim().toLowerCase();
    setLoading(true);

    // 1. Local Database Search
    const localMatches = POPULAR_INDONESIAN_LOCATIONS.filter(item => 
      item.desa.toLowerCase().includes(cleanQ) ||
      item.kecamatan.toLowerCase().includes(cleanQ) ||
      item.kabupaten.toLowerCase().includes(cleanQ) ||
      item.provinsi.toLowerCase().includes(cleanQ)
    );

    // 2. Online API Search via Postal Code / Region API
    let onlineMatches: any[] = [];
    try {
      const res = await fetch(`https://kodedopos.github.io/api/search.json?q=${encodeURIComponent(cleanQ)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.data && Array.isArray(json.data)) {
          onlineMatches = json.data.slice(0, 8).map((item: any) => ({
            desa: (item.urban || item.village || '').toUpperCase(),
            kecamatan: (item.subdistrict || item.district || '').toUpperCase(),
            kabupaten: (item.city || item.regency || '').toUpperCase(),
            provinsi: (item.province || '').toUpperCase(),
            zip: String(item.postalcode || item.postal_code || '')
          }));
        }
      }
    } catch (e) {}

    // Combine & Deduplicate
    const combined = [...localMatches, ...onlineMatches];
    const uniqueMap = new Map();
    combined.forEach(item => {
      const key = `${item.desa}_${item.kecamatan}_${item.kabupaten}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, item);
    });

    const finalResults = Array.from(uniqueMap.values()).slice(0, 8);
    setSuggestions(finalResults);
    setIsOpen(finalResults.length > 0);
    setLoading(false);
  };

  const handleSelectSuggestion = (item: any) => {
    onChange({
      ...value,
      provinsi: item.provinsi,
      kabupaten: item.kabupaten,
      kecamatan: item.kecamatan,
      desa: item.desa,
      kode_pos: item.zip || value.kode_pos || ''
    });
    setSearchQuery(`${item.desa}, ${item.kecamatan}, ${item.kabupaten}, ${item.provinsi}`);
    setIsOpen(false);
  };

  const bgContainer = darkTheme ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const bgInput = darkTheme ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500';
  const dropdownBg = darkTheme ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-xl';

  return (
    <div className="space-y-4">
      {/* Search Input Autocomplete ala Google Maps */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className={`text-xs font-bold flex items-center gap-1.5 ${darkTheme ? 'text-amber-400' : 'text-blue-600'}`}>
            <Map className="w-4 h-4 text-amber-500" />
            Pencarian Alamat Instant (ala Google Maps)
          </label>

          <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold flex items-center gap-1">
            <Sparkles size={11} /> Auto Fill 1-Klik
          </span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
            placeholder="Ketik Desa / Kecamatan / Kabupaten (Contoh: Cukir, Jombang)..."
            className={`w-full pl-10 pr-9 py-2.5 rounded-2xl border text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${bgInput}`}
          />
          {loading && (
            <Loader2 className="w-4 h-4 absolute right-3 top-3.5 animate-spin text-blue-500" />
          )}
        </div>

        {/* Dropdown Suggestions List */}
        {isOpen && suggestions.length > 0 && (
          <div className={`absolute left-0 right-0 top-full mt-1.5 rounded-2xl border max-h-64 overflow-y-auto z-50 p-1.5 ${dropdownBg}`}>
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className={`w-full text-left p-2.5 rounded-xl transition flex items-start gap-2.5 cursor-pointer ${
                  darkTheme ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-blue-50 text-slate-800'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0 mt-0.5">
                  <MapPin size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs flex items-center justify-between">
                    <span>Desa {item.desa}</span>
                    {item.zip && (
                      <span className="text-[10px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                        {item.zip}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    Kec. {item.kecamatan}, {item.kabupaten}, {item.provinsi}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Manual Detail Fields & Selected Address Summary */}
      <div className={`p-4 rounded-2xl border ${bgContainer} space-y-3.5`}>
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Building2 size={13} className="text-blue-500" />
            Detail Alamat Terisi:
          </span>
          {value.desa && (
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <Check size={12} /> Alamat Valid
            </span>
          )}
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 ${darkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
            Dusun / RT RW / Alamat Jalan <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={value.dusun || ''}
            onChange={(e) => onChange({ ...value, dusun: e.target.value })}
            placeholder="Contoh: Dusun Krajan RT 02 RW 01 / Jl. Pemuda No. 5"
            className={`w-full px-3.5 py-2 rounded-xl border text-xs font-sans transition focus:outline-none ${bgInput}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${darkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Desa / Kelurahan
            </label>
            <input
              type="text"
              value={value.desa || ''}
              onChange={(e) => onChange({ ...value, desa: e.target.value.toUpperCase() })}
              placeholder="Desa"
              className={`w-full px-3 py-2 rounded-xl border text-xs font-sans uppercase ${bgInput}`}
            />
          </div>

          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${darkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Kecamatan
            </label>
            <input
              type="text"
              value={value.kecamatan || ''}
              onChange={(e) => onChange({ ...value, kecamatan: e.target.value.toUpperCase() })}
              placeholder="Kecamatan"
              className={`w-full px-3 py-2 rounded-xl border text-xs font-sans uppercase ${bgInput}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${darkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Kabupaten / Kota
            </label>
            <input
              type="text"
              value={value.kabupaten || ''}
              onChange={(e) => onChange({ ...value, kabupaten: e.target.value.toUpperCase() })}
              placeholder="Kabupaten/Kota"
              className={`w-full px-3 py-2 rounded-xl border text-xs font-sans uppercase ${bgInput}`}
            />
          </div>

          <div>
            <label className={`block text-[11px] font-semibold mb-1 ${darkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
              Provinsi
            </label>
            <input
              type="text"
              value={value.provinsi || ''}
              onChange={(e) => onChange({ ...value, provinsi: e.target.value.toUpperCase() })}
              placeholder="Provinsi"
              className={`w-full px-3 py-2 rounded-xl border text-xs font-sans uppercase ${bgInput}`}
            />
          </div>
        </div>

        <div>
          <label className={`block text-[11px] font-semibold mb-1 ${darkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            Kode Pos (Otomatis Terisi)
          </label>
          <div className="relative">
            <Hash className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={value.kode_pos || ''}
              onChange={(e) => onChange({ ...value, kode_pos: e.target.value })}
              placeholder="Kode Pos"
              className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs font-mono font-bold ${bgInput}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleAddressAutocomplete;
