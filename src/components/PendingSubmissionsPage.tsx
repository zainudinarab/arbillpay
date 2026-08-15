import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Phone, 
  UserCheck, 
  Zap, 
  Package, 
  MapPin, 
  Trash2, 
  MessageSquare,
  Search,
  ChevronRight,
  ShieldAlert,
  Wrench,
  Truck,
  Settings,
  ArrowRight,
  Calendar,
  Check,
  Server,
  Crosshair,
  Save,
  X,
  ExternalLink,
  Compass,
  Globe
} from 'lucide-react';
import HeaderBar from './HeaderBar';
import { BusinessProfile } from '../types';
import { getCustomersFromFirestore, saveCustomerToFirestore, getFtthMapFromFirestore, saveFtthMapToFirestore } from '../services/firebaseService';
import { getApiUrl } from '../config/api';

interface PendingSubmissionsPageProps {
  profile: BusinessProfile;
  t: any;
  onLogout: () => void;
}

export const INSTALLATION_STAGES = [
  { key: 'pending', label: '1. Verifikasi Pending', shortLabel: 'Pending', icon: Zap, color: 'amber' },
  { key: 'survey', label: '2. Survei & Jadwal', shortLabel: 'Survei', icon: Truck, color: 'blue' },
  { key: 'installing', label: '3. Pasang FO & ONU', shortLabel: 'Pemasangan', icon: Wrench, color: 'indigo' },
  { key: 'testing', label: '4. Setting & Testing', shortLabel: 'Testing', icon: Settings, color: 'purple' },
  { key: 'active', label: '5. Aktif & Billing', shortLabel: 'Aktif', icon: CheckCircle2, color: 'emerald' }
];

const isPendingOrInProgress = (status: any) => {
  const s = String(status || '').toLowerCase().trim();
  return s === 'pending' || s === 'survey' || s === 'installing' || s === 'testing' || s === 'non-active' || s === 'inactive' || s === 'menunggu persetujuan' || s === 'pending_approval' || (s !== 'active' && s !== 'aktif' && s !== 'terminated' && s !== 'isolir' && s !== 'isolated' && s !== 'rejected');
};

const MapPickerComponent: React.FC<{
  lat: string;
  lng: string;
  onSelect: (lat: string, lng: string) => void;
}> = ({ lat, lng, onSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [searchAddr, setSearchAddr] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const startLat = Number(lat) || -7.54321;
  const startLng = Number(lng) || 112.12345;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [startLat, startLng],
        zoom: (lat && lng) ? 17 : 14,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      const redPinSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="38" height="38">
          <path fill="#ef4444" stroke="#ffffff" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      `;

      const pinIcon = L.divIcon({
        className: 'custom-map-picker-pin',
        html: redPinSvg,
        iconSize: [38, 38],
        iconAnchor: [19, 38]
      });

      const marker = L.marker([startLat, startLng], {
        draggable: true,
        icon: pinIcon
      }).addTo(map);

      markerRef.current = marker;

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onSelect(pos.lat.toFixed(6), pos.lng.toFixed(6));
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        marker.setLatLng([clickLat, clickLng]);
        onSelect(clickLat.toFixed(6), clickLng.toFixed(6));
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchAddr.trim() || !mapInstanceRef.current) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddr + ', Indonesia')}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        const newLat = parseFloat(first.lat);
        const newLng = parseFloat(first.lon);
        mapInstanceRef.current.setView([newLat, newLng], 17);
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        }
        onSelect(newLat.toFixed(6), newLng.toFixed(6));
      } else {
        alert('Lokasi tidak ditemukan. Coba masukkan nama desa, jalan, atau kota.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-2 mt-2">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder="Cari lokasi/alamat (contoh: Krajan, Jogoroto, Jombang)..."
          value={searchAddr}
          onChange={(e) => setSearchAddr(e.target.value)}
          className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-sans"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {isSearching ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
          <span>{isSearching ? 'Cari...' : 'Cari'}</span>
        </button>
      </form>

      <div className="relative rounded-2xl overflow-hidden border border-slate-300 shadow-md">
        <div ref={mapContainerRef} className="w-full h-64 z-10" />
        <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 text-white px-3 py-1.5 rounded-xl text-[11px] font-sans font-bold z-20 backdrop-blur-sm flex items-center justify-between">
          <span>📍 Klik lokasi di peta / geser Pin Merah ke rumah pelanggan</span>
          <span className="font-mono text-emerald-400">{lat && lng ? `${lat}, ${lng}` : 'Belum Dipilih'}</span>
        </div>
      </div>
    </div>
  );
};

export default function PendingSubmissionsPage({ profile, t, onLogout }: PendingSubmissionsPageProps) {
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Router Server & Technical Survey Modal States
  const [routers, setRouters] = useState<any[]>([]);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveyCustomer, setSurveyCustomer] = useState<any | null>(null);

  const [selectedRouterId, setSelectedRouterId] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [pppoeUsername, setPppoeUsername] = useState('');
  const [pppoePassword, setPppoePassword] = useState('');
  const [odpPort, setOdpPort] = useState('');
  const [snOnu, setSnOnu] = useState('');
  const [powerLaser, setPowerLaser] = useState('-19.00');
  const [teknisi, setTeknisi] = useState('');
  const [gettingGps, setGettingGps] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const fetchPendingSubmissions = async () => {
    setLoading(true);
    try {
      const res = await getCustomersFromFirestore();
      if (res.success && Array.isArray(res.customers)) {
        const pending = res.customers.filter((c: any) => isPendingOrInProgress(c.status));
        setPendingList(pending);
      }
    } catch (err) {
      console.error('Error fetching pending submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingSubmissions();
    const fetchRouters = async () => {
      try {
        const apiUrl = getApiUrl();
        if (apiUrl) {
          const res = await fetch(`${apiUrl}/api/routers`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.routers)) {
              setRouters(data.routers);
            }
          }
        }
      } catch (e) {}
    };
    fetchRouters();
  }, []);

  const openSurveyModal = (cust: any) => {
    setSurveyCustomer(cust);
    setSelectedRouterId(cust.router_id || (routers.length > 0 ? routers[0].id : ''));
    setLatitude(cust.latitude || '');
    setLongitude(cust.longitude || '');
    setPppoeUsername(cust.pppoe_username || (cust.name ? cust.name.toLowerCase().replace(/\s+/g, '') : 'user123'));
    setPppoePassword(cust.pppoe_password || '123456');
    setOdpPort(cust.odp_port || '');
    setSnOnu(cust.sn_onu || '');
    setPowerLaser(cust.power_laser || '-19.00');
    setTeknisi(cust.teknisi || '');
    setShowSurveyModal(true);
  };

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      alert('Browser Anda tidak mendukung fitur Geolocation GPS.');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGettingGps(false);
      },
      (err) => {
        alert('Gagal mengambil titik GPS: ' + err.message);
        setGettingGps(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!surveyCustomer) return;

    setActionLoadingId(surveyCustomer.id);
    try {
      const selectedRouterObj = routers.find(r => r.id === selectedRouterId);
      const mapsUrl = (latitude && longitude) 
        ? `https://www.google.com/maps?q=${latitude},${longitude}` 
        : surveyCustomer.maps_url;

      const updatedCust = {
        ...surveyCustomer,
        router_id: selectedRouterId || null,
        router_name: selectedRouterObj ? (selectedRouterObj.name || selectedRouterObj.ip_address) : surveyCustomer.router_name,
        latitude: latitude.trim() || null,
        longitude: longitude.trim() || null,
        maps_url: mapsUrl || null,
        pppoe_username: pppoeUsername.trim(),
        pppoe_password: pppoePassword.trim(),
        odp_port: odpPort.trim() || null,
        sn_onu: snOnu.trim() || null,
        power_laser: powerLaser.trim() || null,
        teknisi: teknisi.trim() || null,
        updated_at: new Date().toISOString()
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        await fetch(`${apiUrl}/api/customers/${surveyCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCust)
        }).catch(() => null);
      }

      await saveCustomerToFirestore(updatedCust);

      // Auto-Sync ONU Device to FTTH Map & Master Tabel Perangkat FTTH!
      if (latitude && longitude) {
        try {
          const ftthRes = await getFtthMapFromFirestore();
          let currentNodes: any[] = (ftthRes.success && Array.isArray(ftthRes.nodes)) ? ftthRes.nodes : [];
          let currentLines: any[] = (ftthRes.success && Array.isArray(ftthRes.lines)) ? ftthRes.lines : [];

          const existingNodeIdx = currentNodes.findIndex(n => 
            String(n.customerId) === String(surveyCustomer.id) ||
            (n.name && pppoeUsername && n.name.toLowerCase().trim() === pppoeUsername.toLowerCase().trim())
          );

          const onuNodeData = {
            id: existingNodeIdx >= 0 ? currentNodes[existingNodeIdx].id : `node-onu-${Date.now()}`,
            name: pppoeUsername || surveyCustomer.name,
            type: 'ONU',
            status: 'online',
            lat: Number(latitude),
            lng: Number(longitude),
            customerId: surveyCustomer.id,
            customerName: surveyCustomer.name,
            customerPhone: surveyCustomer.phone_number,
            sn_onu: snOnu.trim() || null,
            power_laser: powerLaser.trim() || null,
            odp_port: odpPort.trim() || null,
            updated_at: new Date().toISOString()
          };

          if (existingNodeIdx >= 0) {
            currentNodes[existingNodeIdx] = { ...currentNodes[existingNodeIdx], ...onuNodeData };
          } else {
            currentNodes.push(onuNodeData);
          }

          await saveFtthMapToFirestore(currentNodes, currentLines);
        } catch (ftthErr) {
          console.warn('[FTTH AUTO-SYNC] Non-critical warning:', ftthErr);
        }
      }

      setPendingList(prev => prev.map(c => c.id === surveyCustomer.id ? updatedCust : c));
      setToastMsg({ type: 'success', text: `Data survei teknis & FTTH untuk "${updatedCust.name}" berhasil disimpan & disinkronkan ke Perangkat FTTH!` });
      setShowSurveyModal(false);
      setSurveyCustomer(null);
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err?.message || 'Gagal menyimpan data survei.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAdvanceStage = async (cust: any, nextStageKey: string) => {
    setActionLoadingId(cust.id);
    try {
      const isNowActive = nextStageKey === 'active';
      const updatedCust = {
        ...cust,
        status: nextStageKey,
        installation_stage: nextStageKey,
        ...(isNowActive ? {
          installation_date: new Date().toISOString().split('T')[0],
          approved_at: new Date().toISOString()
        } : {})
      };

      const apiUrl = getApiUrl();
      if (apiUrl) {
        await fetch(`${apiUrl}/api/customers/${cust.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStageKey })
        }).catch(() => null);
      }

      await saveCustomerToFirestore(updatedCust);

      if (isNowActive) {
        setPendingList(prev => prev.filter(c => c.id !== cust.id));
        setToastMsg({
          type: 'success',
          text: `🎉 Pemasangan Selesai! Layanan "${cust.name}" resmi AKTIF & Billing Dimulai!`
        });
      } else {
        setPendingList(prev => prev.map(c => c.id === cust.id ? updatedCust : c));
        const stageObj = INSTALLATION_STAGES.find(s => s.key === nextStageKey);
        setToastMsg({
          type: 'success',
          text: `Tahap Pemasangan "${cust.name}" diperbarui ke: ${stageObj?.label}`
        });
      }
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal memperbarui tahapan: ' + err?.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (cust: any) => {
    if (!confirm(`Yakin ingin membatalkan / menolak pengajuan dari "${cust.name}"?`)) return;
    setActionLoadingId(cust.id);
    try {
      const updatedCust = {
        ...cust,
        status: 'rejected',
        rejected_at: new Date().toISOString()
      };

      await saveCustomerToFirestore(updatedCust);
      setPendingList(prev => prev.filter(c => c.id !== cust.id));
      setToastMsg({ type: 'success', text: `Pengajuan "${cust.name}" telah dibatalkan.` });
    } catch (err: any) {
      setToastMsg({ type: 'error', text: 'Gagal menolak pengajuan: ' + err?.message });
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredPending = pendingList.filter(c => {
    const term = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) ||
      (c.phone_number || '').includes(term) ||
      (c.package_name || '').toLowerCase().includes(term) ||
      (c.address || '').toLowerCase().includes(term)
    );
  });

  const totalMonthlyPotential = pendingList.reduce((acc, curr) => acc + Number(curr.package_price || curr.price || 150000), 0);

  const getStageIndex = (statusKey: string) => {
    const s = String(statusKey || '').toLowerCase().trim();
    if (s === 'survey') return 1;
    if (s === 'installing') return 2;
    if (s === 'testing') return 3;
    if (s === 'active' || s === 'aktif') return 4;
    return 0; // pending / non-active
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen font-sans">
      <HeaderBar
        title="Pengajuan & Pipeline Pemasangan Customer"
        subtitle="Tahapan Pemasangan Pelanggan Baru: Verifikasi ➔ Survei ➔ Pasang FO ➔ Setting Mikrotik ➔ Aktif"
        profile={profile}
        t={t}
        onLogout={onLogout}
      />

      <main className="p-4 md:p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto">
        {/* Toast Notification */}
        {toastMsg && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs animate-fade-in ${
            toastMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center gap-3">
              {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{toastMsg.text}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-200 shrink-0">
                <Zap size={22} className="animate-bounce" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <span>Tahapan Pemasangan Customer</span>
                  {pendingList.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-xs font-extrabold shadow-sm animate-pulse">
                      {pendingList.length} Dalam Proses
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500">
                  Kelola alur pekerjaan instalasi pelanggan baru dari survei hingga pengaktifan billing.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={fetchPendingSubmissions}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-600' : ''} />
            <span>Refresh Data Pipeline</span>
          </button>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-3xl shadow-lg shadow-amber-100 space-y-1">
            <span className="text-xs font-bold text-amber-100 uppercase tracking-wider block">PROSES PEMASANGAN</span>
            <div className="text-3xl font-black">{pendingList.length} Pelanggan</div>
            <p className="text-[11px] text-amber-100/90 font-medium">Sedang dalam tahapan survei, instalasi & testing.</p>
          </div>

          <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl shadow-lg shadow-emerald-100 space-y-1">
            <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider block">ESTIMASI OMSET BARU</span>
            <div className="text-3xl font-black">Rp {totalMonthlyPotential.toLocaleString('id-ID')} / bln</div>
            <p className="text-[11px] text-emerald-100/90 font-medium">Pemasukan berlangganan jika seluruhnya aktif.</p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">TAHAPAN PEKERJAAN</span>
            <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 pt-1">
              <span>⏳ Verifikasi</span> → <span>🚚 Survei</span> → <span>🛠️ Pasang</span> → <span>⚙️ Test</span>
            </div>
            <p className="text-[11px] text-slate-500">Billing dimulai saat status berubah ke "5. Aktif".</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari pengajuan berdasarkan Nama, WA, Paket, Alamat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Timeline Pipeline Card List */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200">
            <RefreshCw size={24} className="animate-spin text-amber-500" />
            <span className="text-xs font-semibold">Mengambil pipeline pemasangan pelanggan...</span>
          </div>
        ) : filteredPending.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2 bg-white rounded-3xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <p className="text-sm font-bold text-slate-700">Tidak ada pemasangan yang sedang berproses saat ini!</p>
            <p className="text-xs text-slate-400">Seluruh permohonan telah selesai dipasang dan berstatus AKTIF.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPending.map(cust => {
              const currentStageIdx = getStageIndex(cust.status);
              const cleanPhone = (cust.phone_number || '').replace(/[^0-9]/g, '');
              const waPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;

              return (
                <div key={cust.id} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-4">
                  {/* Top Info Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 font-extrabold flex items-center justify-center text-base border border-amber-200 shrink-0">
                        {cust.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-slate-800 text-base">{cust.name}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {cust.customer_code || `CUST-${cust.id.slice(0, 5).toUpperCase()}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                          {cust.phone_number && (
                            <a
                              href={`https://wa.me/${waPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-emerald-600 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <Phone size={12} />
                              <span>{cust.phone_number}</span>
                            </a>
                          )}
                          <span>• Alamat: <strong className="text-slate-700">{[cust.dusun, cust.desa, cust.kecamatan, cust.kabupaten, cust.provinsi, cust.kode_pos ? `Kode Pos ${cust.kode_pos}` : ''].filter(Boolean).join(', ') || cust.address || 'Belum diisi'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-auto">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">PAKET PILIHAN</span>
                        <span className="font-extrabold text-blue-700 text-xs block">{cust.package_name || 'Paket Internet PPPoE'}</span>
                        <span className="font-black text-emerald-600 text-xs block">Rp {Number(cust.package_price || cust.price || 150000).toLocaleString('id-ID')} / bln</span>
                      </div>

                      {cust.phone_number && (
                        <a
                          href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Halo Kak ${cust.name}, progres pemasangan internet ${cust.package_name || ''} Anda saat ini memasuki tahap: ${INSTALLATION_STAGES[currentStageIdx]?.label}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl border border-emerald-200 transition-all flex items-center justify-center cursor-pointer"
                          title="Kirim Update Progres via WhatsApp"
                        >
                          <MessageSquare size={16} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* TECHNICAL & SERVER CONFIG SUMMARY BAR */}
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 flex-wrap text-xs">
                    <div className="flex items-center gap-2.5 flex-wrap font-sans text-slate-600">
                      {/* GPS Location Badge */}
                      {cust.latitude && cust.longitude ? (
                        <a
                          href={cust.maps_url || `https://www.google.com/maps?q=${cust.latitude},${cust.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 font-mono font-bold border border-sky-200 hover:bg-sky-100 transition-all inline-flex items-center gap-1.5"
                          title="Klik untuk melihat titik GPS di Google Maps"
                        >
                          <MapPin size={13} className="text-sky-600 shrink-0" />
                          <span>📍 {Number(cust.latitude).toFixed(5)}, {Number(cust.longitude).toFixed(5)}</span>
                        </a>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 font-bold border border-amber-200 flex items-center gap-1">
                          <MapPin size={13} className="text-amber-500 shrink-0" />
                          <span>GPS Pelanggan: Belum Diset</span>
                        </span>
                      )}

                      {/* MikroTik Server Router Badge */}
                      <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 font-bold border border-blue-200 flex items-center gap-1.5">
                        <Server size={13} className="text-blue-600 shrink-0" />
                        <span>Server Router: <strong>{cust.router_name || (routers.find(r => r.id === cust.router_id)?.name) || 'Belum Dipilih'}</strong></span>
                      </span>

                      {/* Technical Details: ODP, SN, Laser, Teknisi */}
                      {cust.odp_port && (
                        <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 font-mono text-[11px] font-bold border border-purple-200">
                          ODP: {cust.odp_port}
                        </span>
                      )}
                      {cust.sn_onu && (
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-[11px] font-bold border border-slate-200">
                          SN: {cust.sn_onu}
                        </span>
                      )}
                      {cust.teknisi && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                          👷 {cust.teknisi}
                        </span>
                      )}

                      {/* Direct Link to FTTH Map */}
                      <button
                        onClick={() => window.location.hash = '#/map-ftth'}
                        className="px-2 py-0.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold border border-purple-200 transition-all flex items-center gap-1 cursor-pointer"
                        title="Buka Peta Jaringan FTTH & Master Perangkat"
                      >
                        <Compass size={12} className="text-purple-600 shrink-0" />
                        <span>Peta FTTH</span>
                      </button>
                    </div>

                    <button
                      onClick={() => openSurveyModal(cust)}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-extrabold text-xs rounded-xl border border-slate-700 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Wrench size={13} className="text-amber-400" />
                      <span>{cust.latitude || cust.router_id ? 'Edit Data Survei & Server' : '⚡ Input Data Survei & Server'}</span>
                    </button>
                  </div>

                  {/* STEPPER PROGRESS BAR (5 Tahapan) */}
                  <div className="py-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                      TAHAPAN INSTALLASI (STAGING PROGRESS)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {INSTALLATION_STAGES.map((stg, idx) => {
                        const isDone = idx < currentStageIdx;
                        const isCurrent = idx === currentStageIdx;
                        const StgIcon = stg.icon;

                        return (
                          <button
                            key={stg.key}
                            onClick={() => handleAdvanceStage(cust, stg.key)}
                            disabled={actionLoadingId === cust.id}
                            className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${
                              isCurrent
                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-500 shadow-md shadow-amber-200 scale-102'
                                : isDone
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <StgIcon size={14} className={isCurrent ? 'animate-bounce text-white' : (isDone ? 'text-emerald-600' : 'text-slate-400')} />
                              {isDone && <Check size={12} className="text-emerald-600 font-bold" />}
                              {isCurrent && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
                            </div>
                            <span className="text-[11px] font-bold leading-tight block">
                              {stg.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BOTTOM ACTION BUTTONS */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <div className="text-[11px] text-slate-400 font-medium">
                      Status Saat Ini: <strong className="text-amber-800 font-bold">{INSTALLATION_STAGES[currentStageIdx]?.label}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReject(cust)}
                        disabled={actionLoadingId === cust.id}
                        className="px-3 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        <span>Batalkan Pemasangan</span>
                      </button>

                      {currentStageIdx < 4 && (
                        <button
                          onClick={() => handleAdvanceStage(cust, INSTALLATION_STAGES[currentStageIdx + 1].key)}
                          disabled={actionLoadingId === cust.id}
                          className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {actionLoadingId === cust.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <>
                              <span>Lanjut Ke: {INSTALLATION_STAGES[currentStageIdx + 1]?.shortLabel}</span>
                              <ArrowRight size={14} />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ==================== MODAL FORM SURVEI TEKNIS & SERVER MIKROTIK ==================== */}
      {showSurveyModal && surveyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-white border border-slate-200 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl space-y-0 animate-slide-up">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">Survei Teknis & Konfigurasi Server MikroTik</h3>
                  <p className="text-xs text-slate-500">Pelanggan: <strong className="text-slate-800">{surveyCustomer.name}</strong> ({surveyCustomer.customer_code || surveyCustomer.id})</p>
                </div>
              </div>
              <button
                onClick={() => { setShowSurveyModal(false); setSurveyCustomer(null); }}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveSurvey} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              {/* Card 1: Server Router Selection */}
              <div className="p-4 bg-blue-50/40 border border-blue-100 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Server size={14} className="text-blue-600" />
                  <span>1. PILIH SERVER ROUTER MIKROTIK *</span>
                </label>
                <select
                  value={selectedRouterId}
                  onChange={(e) => setSelectedRouterId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-sans font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Server MikroTik --</option>
                  {routers.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.ip_address} ({r.ip_address}) {r.is_online ? '🟢 Online' : '⚪ Offline'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 italic">
                  Akun PPPoE / Hotspot pelanggan ini akan disinkronkan ke server router MikroTik yang dipilih.
                </p>
              </div>

              {/* Card 2: GPS Location Picker */}
              <div className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={14} className="text-emerald-600" />
                    <span>2. TITIK KOORDINAT GPS PELANGGAN</span>
                  </label>
                  
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleGetGPS}
                      disabled={gettingGps}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                      title="Gunakan fitur GPS bawaan HP/Browser"
                    >
                      {gettingGps ? <RefreshCw size={12} className="animate-spin" /> : <Crosshair size={12} />}
                      <span>{gettingGps ? 'Mengambil GPS...' : '📍 GPS HP Realtime'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowMapPicker(!showMapPicker)}
                      className={`px-2.5 py-1 font-extrabold text-[11px] rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
                        showMapPicker 
                          ? 'bg-slate-900 text-white border border-slate-800' 
                          : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50'
                      }`}
                      title="Buka/tutup visual peta interaktif untuk mengklik lokasi rumah pelanggan"
                    >
                      <Globe size={12} className={showMapPicker ? 'text-emerald-400' : 'text-blue-600'} />
                      <span>{showMapPicker ? 'Tutup Peta' : '🗺️ Pilih di Peta Visual'}</span>
                    </button>
                  </div>
                </div>

                {/* VISUAL MAP PICKER CONTAINER */}
                {showMapPicker && (
                  <MapPickerComponent
                    lat={latitude}
                    lng={longitude}
                    onSelect={(newLat, newLng) => {
                      setLatitude(newLat);
                      setLongitude(newLng);
                    }}
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Latitude (Garis Lintang)</label>
                    <input
                      type="text"
                      placeholder="e.g. -7.543210"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Longitude (Garis Bujur)</label>
                    <input
                      type="text"
                      placeholder="e.g. 112.123450"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {latitude && longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:underline bg-white px-3 py-1.5 rounded-lg border border-sky-200 shadow-xs"
                  >
                    <span>🗺️ Uji Buka di Google Maps</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Card 3: Technical FTTH Details */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  3. DETAIL PERANGKAT FTTH & AKUN
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">PPP Username</label>
                    <input
                      type="text"
                      required
                      value={pppoeUsername}
                      onChange={(e) => setPppoeUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">PPP Password</label>
                    <input
                      type="text"
                      required
                      value={pppoePassword}
                      onChange={(e) => setPppoePassword(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">ODP Port / Kotak ODP</label>
                    <input
                      type="text"
                      placeholder="e.g. ODP-KRAJAN-01 (Port 2)"
                      value={odpPort}
                      onChange={(e) => setOdpPort(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">SN ONU / Modem</label>
                    <input
                      type="text"
                      placeholder="e.g. ZTEGC123456"
                      value={snOnu}
                      onChange={(e) => setSnOnu(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Power Laser (dBm)</label>
                    <input
                      type="text"
                      placeholder="-19.00"
                      value={powerLaser}
                      onChange={(e) => setPowerLaser(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Teknisi Lapangan</label>
                    <input
                      type="text"
                      placeholder="Nama teknisi / tim FO"
                      value={teknisi}
                      onChange={(e) => setTeknisi(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-sans text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowSurveyModal(false); setSurveyCustomer(null); }}
                  className="px-4 py-2.5 text-slate-500 hover:bg-slate-100 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoadingId === surveyCustomer.id}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoadingId === surveyCustomer.id ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Simpan Data Survei & Server</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </div>
  );
}
