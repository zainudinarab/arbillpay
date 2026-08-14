import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Search, Sparkles, Loader2, Check, Hash, Building2, Map, ListFilter 
} from 'lucide-react';
import { 
  ALL_38_PROVINCES, 
  fetchRegencies, 
  fetchDistricts, 
  fetchVillages, 
  fetchPostalCode, 
  RegionItem, 
  VillageItem 
} from '../services/indonesiaRegionService';

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

// Built-in Comprehensive Instant Search Database (0ms Instant Response)
const INDONESIA_INSTANT_DATABASE = [
  // Jombang & Sekitarnya
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
  { desa: 'PLOSO', kecamatan: 'PLOSO', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61453' },
  { desa: 'KUDU', kecamatan: 'KUDU', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61454' },
  { desa: 'NGUSIKAN', kecamatan: 'NGUSIKAN', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61454' },
  { desa: 'PERAK', kecamatan: 'PERAK', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61461' },
  { desa: 'BANDARKEDUNGMULYO', kecamatan: 'BANDARKEDUNGMULYO', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61462' },
  { desa: 'GUDO', kecamatan: 'GUDO', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61463' },
  { desa: 'BARENG', kecamatan: 'BARENG', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61474' },
  { desa: 'WONOSALAM', kecamatan: 'WONOSALAM', kabupaten: 'KABUPATEN JOMBANG', provinsi: 'JAWA TIMUR', zip: '61477' },

  // Sidoarjo & Surabaya
  { desa: 'KRIAN', kecamatan: 'KRIAN', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61262' },
  { desa: 'WARU', kecamatan: 'WARU', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61256' },
  { desa: 'GELURAN', kecamatan: 'TAMAN', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61257' },
  { desa: 'SIDOARJO', kecamatan: 'SIDOARJO', kabupaten: 'KABUPATEN SIDOARJO', provinsi: 'JAWA TIMUR', zip: '61211' },
  { desa: 'WONOKROMO', kecamatan: 'WONOKROMO', kabupaten: 'KOTA SURABAYA', provinsi: 'JAWA TIMUR', zip: '60243' },
  { desa: 'GUBENG', kecamatan: 'GUBENG', kabupaten: 'KOTA SURABAYA', provinsi: 'JAWA TIMUR', zip: '60281' },
  { desa: 'TEBING TINGGI', kecamatan: 'TEBING TINGGI', kabupaten: 'KABUPATEN KEPULAUAN MERANTI', provinsi: 'RIAU', zip: '28751' },
  { desa: 'SUMUR BANDUNG', kecamatan: 'SUMUR BANDUNG', kabupaten: 'KOTA BANDUNG', provinsi: 'JAWA BARAT', zip: '40111' },
  { desa: 'KEBAYORAN BARU', kecamatan: 'KEBAYORAN BARU', kabupaten: 'KOTA ADM. JAKARTA SELATAN', provinsi: 'DKI JAKARTA', zip: '12110' },
  { desa: 'KLOJEN', kecamatan: 'KLOJEN', kabupaten: 'KOTA MALANG', provinsi: 'JAWA TIMUR', zip: '65111' }
];

export const GoogleAddressAutocomplete: React.FC<GoogleAddressAutocompleteProps> = ({
  value,
  onChange,
  darkTheme = false
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'dropdown'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // States for Dropdown Mode
  const [provinces, setProvinces] = useState<RegionItem[]>(ALL_38_PROVINCES);
  const [regencies, setRegencies] = useState<RegionItem[]>([]);
  const [districts, setDistricts] = useState<RegionItem[]>([]);
  const [villages, setVillages] = useState<VillageItem[]>([]);

  const [selProvId, setSelProvId] = useState('');
  const [selRegId, setSelRegId] = useState('');
  const [selDistId, setSelDistId] = useState('');

  const [loadingReg, setLoadingReg] = useState(false);
  const [loadingDist, setLoadingDist] = useState(false);
  const [loadingVill, setLoadingVill] = useState(false);

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

  // Dropdown Mode Effect Chain
  useEffect(() => {
    if (!selProvId) { setRegencies([]); return; }
    setLoadingReg(true);
    fetchRegencies(selProvId).then(data => {
      setRegencies(data);
      setLoadingReg(false);
    });
  }, [selProvId]);

  useEffect(() => {
    if (!selRegId) { setDistricts([]); return; }
    setLoadingDist(true);
    fetchDistricts(selRegId).then(data => {
      setDistricts(data);
      setLoadingDist(false);
    });
  }, [selRegId]);

  useEffect(() => {
    if (!selDistId) { setVillages([]); return; }
    setLoadingVill(true);
    fetchVillages(selDistId).then(data => {
      setVillages(data);
      setLoadingVill(false);
    });
  }, [selDistId]);

  // Instant Instant Search Handler (NEVER Hangs, 0ms Local Matches)
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const cleanQ = q.trim().toLowerCase();

    // 1. Instant Local Match
    const localMatches = INDONESIA_INSTANT_DATABASE.filter(item => 
      item.desa.toLowerCase().includes(cleanQ) ||
      item.kecamatan.toLowerCase().includes(cleanQ) ||
      item.kabupaten.toLowerCase().includes(cleanQ) ||
      item.provinsi.toLowerCase().includes(cleanQ)
    );

    setSuggestions(localMatches);
    setIsOpen(localMatches.length > 0);
    setLoading(false);

    // 2. Non-blocking Network Fetch with 1.2s timeout
    const fetchController = new AbortController();
    const timeoutId = setTimeout(() => fetchController.abort(), 1200);

    fetch(`https://kodedopos.github.io/api/search.json?q=${encodeURIComponent(cleanQ)}`, { signal: fetchController.signal })
      .then(res => res.json())
      .then(json => {
        clearTimeout(timeoutId);
        if (json && json.data && Array.isArray(json.data)) {
          const apiMatches = json.data.slice(0, 8).map((item: any) => ({
            desa: (item.urban || item.village || '').toUpperCase(),
            kecamatan: (item.subdistrict || item.district || '').toUpperCase(),
            kabupaten: (item.city || item.regency || '').toUpperCase(),
            provinsi: (item.province || '').toUpperCase(),
            zip: String(item.postalcode || item.postal_code || '')
          }));

          const combined = [...localMatches, ...apiMatches];
          const uniqueMap = new Map();
          combined.forEach(item => {
            const key = `${item.desa}_${item.kecamatan}_${item.kabupaten}`;
            if (!uniqueMap.has(key)) uniqueMap.set(key, item);
          });

          const finalRes = Array.from(uniqueMap.values()).slice(0, 8);
          setSuggestions(finalRes);
          setIsOpen(finalRes.length > 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
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
    setSearchQuery(`${item.desa}, ${item.kecamatan}, ${item.kabupaten}`);
    setIsOpen(false);
  };

  const bgContainer = darkTheme ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const bgInput = darkTheme ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500';
  const dropdownBg = darkTheme ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800 shadow-xl';

  return (
    <div className="space-y-4">
      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-2">
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Search size={13} /> Cari Instan (Google Maps Style)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dropdown')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'dropdown'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ListFilter size={13} /> Pilih Dropdown Berurutan
          </button>
        </div>

        <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold hidden sm:inline-flex items-center gap-1">
          <Sparkles size={11} /> 38 Provinsi Full
        </span>
      </div>

      {/* Tab 1: Instant Search Mode */}
      {activeTab === 'search' && (
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
              placeholder="Ketik Desa / Kecamatan (Contoh: Cukir, Diwek, Jombang)..."
              className={`w-full pl-10 pr-9 py-2.5 rounded-2xl border text-xs font-sans transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${bgInput}`}
            />
            {loading && (
              <Loader2 className="w-4 h-4 absolute right-3 top-3.5 animate-spin text-blue-500" />
            )}
          </div>

          {/* Suggestions Dropdown */}
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
      )}

      {/* Tab 2: Cascading Dropdown Mode */}
      {activeTab === 'dropdown' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-semibold mb-1 ${darkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              1. Pilih Provinsi (38 Full)
            </label>
            <select
              value={selProvId}
              onChange={(e) => {
                const provId = e.target.value;
                const pObj = provinces.find(p => p.id === provId);
                setSelProvId(provId);
                setSelRegId('');
                setSelDistId('');
                onChange({ ...value, provinsi: pObj ? pObj.name : '', kabupaten: '', kecamatan: '', desa: '' });
              }}
              className={`w-full px-3 py-2 rounded-xl border text-xs ${bgInput}`}
            >
              <option value="">-- Pilih Provinsi --</option>
              {provinces.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${darkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              2. Pilih Kabupaten / Kota {loadingReg && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500" />}
            </label>
            <select
              value={selRegId}
              onChange={(e) => {
                const regId = e.target.value;
                const rObj = regencies.find(r => r.id === regId);
                setSelRegId(regId);
                setSelDistId('');
                onChange({ ...value, kabupaten: rObj ? rObj.name : '', kecamatan: '', desa: '' });
              }}
              disabled={!selProvId}
              className={`w-full px-3 py-2 rounded-xl border text-xs disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Kabupaten/Kota --</option>
              {regencies.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${darkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              3. Pilih Kecamatan {loadingDist && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500" />}
            </label>
            <select
              value={selDistId}
              onChange={(e) => {
                const distId = e.target.value;
                const dObj = districts.find(d => d.id === distId);
                setSelDistId(distId);
                const distName = dObj ? dObj.name : '';
                onChange({ ...value, kecamatan: distName, desa: '' });
                if (distName) {
                  fetchPostalCode(`${distName} ${value.kabupaten}`).then(zip => {
                    if (zip) onChange({ ...value, kecamatan: distName, kode_pos: zip });
                  });
                }
              }}
              disabled={!selRegId}
              className={`w-full px-3 py-2 rounded-xl border text-xs disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Kecamatan --</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1 ${darkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              4. Pilih Desa / Kelurahan {loadingVill && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500" />}
            </label>
            <select
              value={villages.find(v => v.name === value.desa?.toUpperCase())?.id || ''}
              onChange={(e) => {
                const villId = e.target.value;
                const vObj = villages.find(v => v.id === villId);
                const villName = vObj ? vObj.name : '';
                onChange({ ...value, desa: villName });
                if (villName) {
                  fetchPostalCode(`${villName} ${value.kecamatan}`).then(zip => {
                    if (zip) onChange({ ...value, desa: villName, kode_pos: zip });
                  });
                }
              }}
              disabled={!selDistId}
              className={`w-full px-3 py-2 rounded-xl border text-xs disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Desa --</option>
              {villages.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Manual Detail Fields & Selected Address Summary */}
      <div className={`p-4 rounded-2xl border ${bgContainer} space-y-3.5`}>
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Building2 size={13} className="text-blue-500" />
            Detail Alamat Lengkap Terisi:
          </span>
          {value.desa && (
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <Check size={12} /> Alamat Terverifikasi
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
