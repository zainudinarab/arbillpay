import React, { useState, useEffect } from 'react';
import { 
  fetchProvinces, 
  fetchRegencies, 
  fetchDistricts, 
  fetchVillages, 
  fetchPostalCode, 
  RegionItem, 
  VillageItem 
} from '../services/indonesiaRegionService';
import { MapPin, Search, Check, ChevronDown, Loader2, Sparkles, Hash } from 'lucide-react';

export interface AddressData {
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  desa: string;
  dusun: string;
  kode_pos: string;
}

interface IndonesianAddressFormProps {
  value: AddressData;
  onChange: (updated: AddressData) => void;
  darkTheme?: boolean;
}

export const IndonesianAddressForm: React.FC<IndonesianAddressFormProps> = ({
  value,
  onChange,
  darkTheme = false
}) => {
  const [provinces, setProvinces] = useState<RegionItem[]>([]);
  const [regencies, setRegencies] = useState<RegionItem[]>([]);
  const [districts, setDistricts] = useState<RegionItem[]>([]);
  const [villages, setVillages] = useState<VillageItem[]>([]);

  const [selectedProvId, setSelectedProvId] = useState<string>('');
  const [selectedRegId, setSelectedRegId] = useState<string>('');
  const [selectedDistId, setSelectedDistId] = useState<string>('');

  const [loadingProv, setLoadingProv] = useState<boolean>(false);
  const [loadingReg, setLoadingReg] = useState<boolean>(false);
  const [loadingDist, setLoadingDist] = useState<boolean>(false);
  const [loadingVill, setLoadingVill] = useState<boolean>(false);
  const [loadingPostal, setLoadingPostal] = useState<boolean>(false);

  // Load Provinces on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingProv(true);
    fetchProvinces().then(data => {
      if (isMounted) {
        setProvinces(data);
        setLoadingProv(false);

        // Find initial selected province ID if value.provinsi exists
        if (value.provinsi) {
          const matched = data.find(p => p.name === value.provinsi.toUpperCase());
          if (matched) setSelectedProvId(matched.id);
        }
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Load Regencies when Province changes
  useEffect(() => {
    if (!selectedProvId) {
      setRegencies([]);
      return;
    }
    let isMounted = true;
    setLoadingReg(true);
    fetchRegencies(selectedProvId).then(data => {
      if (isMounted) {
        setRegencies(data);
        setLoadingReg(false);

        if (value.kabupaten) {
          const matched = data.find(r => r.name === value.kabupaten.toUpperCase());
          if (matched) setSelectedRegId(matched.id);
        }
      }
    });
    return () => { isMounted = false; };
  }, [selectedProvId]);

  // Load Districts when Regency changes
  useEffect(() => {
    if (!selectedRegId) {
      setDistricts([]);
      return;
    }
    let isMounted = true;
    setLoadingDist(true);
    fetchDistricts(selectedRegId).then(data => {
      if (isMounted) {
        setDistricts(data);
        setLoadingDist(false);

        if (value.kecamatan) {
          const matched = data.find(d => d.name === value.kecamatan.toUpperCase());
          if (matched) setSelectedDistId(matched.id);
        }
      }
    });
    return () => { isMounted = false; };
  }, [selectedRegId]);

  // Load Villages when District changes
  useEffect(() => {
    if (!selectedDistId) {
      setVillages([]);
      return;
    }
    let isMounted = true;
    setLoadingVill(true);
    fetchVillages(selectedDistId).then(data => {
      if (isMounted) {
        setVillages(data);
        setLoadingVill(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedDistId]);

  // Handle Province Select
  const handleProvChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provId = e.target.value;
    const selected = provinces.find(p => p.id === provId);
    setSelectedProvId(provId);
    setSelectedRegId('');
    setSelectedDistId('');
    setRegencies([]);
    setDistricts([]);
    setVillages([]);

    onChange({
      ...value,
      provinsi: selected ? selected.name : '',
      kabupaten: '',
      kecamatan: '',
      desa: ''
    });
  };

  // Handle Regency Select
  const handleRegChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const regId = e.target.value;
    const selected = regencies.find(r => r.id === regId);
    setSelectedRegId(regId);
    setSelectedDistId('');
    setDistricts([]);
    setVillages([]);

    onChange({
      ...value,
      kabupaten: selected ? selected.name : '',
      kecamatan: '',
      desa: ''
    });
  };

  // Handle District Select
  const handleDistChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const distId = e.target.value;
    const selected = districts.find(d => d.id === distId);
    setSelectedDistId(distId);
    setVillages([]);

    const distName = selected ? selected.name : '';
    onChange({
      ...value,
      kecamatan: distName,
      desa: ''
    });

    // Auto lookup postal code by district name
    if (distName) {
      setLoadingPostal(true);
      fetchPostalCode(`${distName} ${value.kabupaten}`).then(zip => {
        setLoadingPostal(false);
        if (zip) {
          onChange({
            ...value,
            kecamatan: distName,
            kode_pos: zip
          });
        }
      });
    }
  };

  // Handle Village Select
  const handleVillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const villId = e.target.value;
    const selected = villages.find(v => v.id === villId);
    const villName = selected ? selected.name : '';

    onChange({
      ...value,
      desa: villName
    });

    // Auto lookup exact postal code by Village + District
    if (villName) {
      setLoadingPostal(true);
      fetchPostalCode(`${villName} ${value.kecamatan}`).then(zip => {
        setLoadingPostal(false);
        if (zip) {
          onChange({
            ...value,
            desa: villName,
            kode_pos: zip
          });
        }
      });
    }
  };

  const bgInput = darkTheme ? 'bg-slate-800/80 border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500';
  const labelColor = darkTheme ? 'text-slate-300' : 'text-slate-700';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          <h4 className={`text-xs font-bold uppercase tracking-wider ${darkTheme ? 'text-blue-400' : 'text-blue-600'}`}>
            Wilayah & Alamat Indonesia (Autocomplete Akurat)
          </h4>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          <Sparkles className="w-3 h-3 mr-1" /> Auto Kode Pos
        </span>
      </div>

      {/* Row 1: Dusun / Alamat Jalan */}
      <div>
        <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
          Dusun / RT RW / Alamat Jalan <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={value.dusun || ''}
          onChange={(e) => onChange({ ...value, dusun: e.target.value })}
          placeholder="Contoh: Dusun Krajan RT 02 RW 01 / Jl. Pemuda No. 5"
          className={`w-[#100%] w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${bgInput}`}
          required
        />
      </div>

      {/* Row 2: Provinsi & Kabupaten */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Provinsi */}
        <div>
          <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
            Provinsi {loadingProv && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500 ml-1" />}
          </label>
          <div className="relative">
            <select
              value={selectedProvId}
              onChange={handleProvChange}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm appearance-none transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${bgInput}`}
            >
              <option value="">-- Pilih Provinsi --</option>
              {provinces.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-40" />
          </div>
        </div>

        {/* Kabupaten / Kota */}
        <div>
          <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
            Kabupaten / Kota {loadingReg && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500 ml-1" />}
          </label>
          <div className="relative">
            <select
              value={selectedRegId}
              onChange={handleRegChange}
              disabled={!selectedProvId}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm appearance-none transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Kabupaten/Kota --</option>
              {regencies.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-40" />
          </div>
        </div>
      </div>

      {/* Row 3: Kecamatan & Desa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Kecamatan */}
        <div>
          <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
            Kecamatan {loadingDist && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500 ml-1" />}
          </label>
          <div className="relative">
            <select
              value={selectedDistId}
              onChange={handleDistChange}
              disabled={!selectedRegId}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm appearance-none transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Kecamatan --</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-40" />
          </div>
        </div>

        {/* Desa / Kelurahan */}
        <div>
          <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
            Desa / Kelurahan {loadingVill && <Loader2 className="inline w-3 h-3 animate-spin text-blue-500 ml-1" />}
          </label>
          <div className="relative">
            <select
              value={villages.find(v => v.name === value.desa?.toUpperCase())?.id || ''}
              onChange={handleVillChange}
              disabled={!selectedDistId}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm appearance-none transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 ${bgInput}`}
            >
              <option value="">-- Pilih Desa/Kelurahan --</option>
              {villages.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-40" />
          </div>
        </div>
      </div>

      {/* Row 4: Kode Pos (Auto-filled or Editable) */}
      <div className="w-full md:w-1/2">
        <label className={`block text-xs font-semibold mb-1.5 ${labelColor}`}>
          Kode Pos <span className="text-emerald-500 text-[11px] font-normal">(Otomatis Terisi)</span> {loadingPostal && <Loader2 className="inline w-3 h-3 animate-spin text-emerald-500 ml-1" />}
        </label>
        <div className="relative">
          <Hash className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={value.kode_pos || ''}
            onChange={(e) => onChange({ ...value, kode_pos: e.target.value })}
            placeholder="Contoh: 61471"
            maxLength={6}
            className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border text-sm font-mono transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${bgInput}`}
          />
        </div>
      </div>
    </div>
  );
};

export default IndonesianAddressForm;
