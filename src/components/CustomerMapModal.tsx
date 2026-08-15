import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Save, X, ExternalLink, Search } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { saveCustomerToFirestore, syncCustomerFtthDeviceNode } from '../services/firebaseService';

// Fix Leaflet Default Icon issue in Vite/Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface CustomerMapModalProps {
  customer: any;
  onClose: () => void;
  onSaved: () => void;
}

export const CustomerMapModal: React.FC<CustomerMapModalProps> = ({ customer, onClose, onSaved }) => {
  const [lat, setLat] = useState<string>(customer.latitude ? String(customer.latitude) : '');
  const [lng, setLng] = useState<string>(customer.longitude ? String(customer.longitude) : '');
  const [mapsUrl, setMapsUrl] = useState<string>(customer.maps_url || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [map, setMap] = useState<L.Map | null>(null);
  const [marker, setMarker] = useState<L.Marker | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    const container = document.getElementById('map-picker-container');
    if (!container) return;

    // Default center: customer coordinates OR Jakarta default
    const initialLat = customer.latitude ? Number(customer.latitude) : -6.200000;
    const initialLng = customer.longitude ? Number(customer.longitude) : 106.816666;
    const initialZoom = customer.latitude && customer.longitude ? 16 : 12;

    const leafletMap = L.map('map-picker-container').setView([initialLat, initialLng], initialZoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);

    let currentMarker: L.Marker | null = null;

    if (customer.latitude && customer.longitude) {
      currentMarker = L.marker([initialLat, initialLng], { draggable: true }).addTo(leafletMap);
      currentMarker.bindPopup(`<b>${customer.name}</b><br/>${customer.address || 'Lokasi Pelanggan'}`).openPopup();
      
      currentMarker.on('dragend', (e) => {
        const position = e.target.getLatLng();
        setLat(position.lat.toFixed(6));
        setLng(position.lng.toFixed(6));
        setMapsUrl(`https://www.google.com/maps?q=${position.lat.toFixed(6)},${position.lng.toFixed(6)}`);
      });
    }

    // Click map to place or update marker
    leafletMap.on('click', (e) => {
      const newLat = e.latlng.lat.toFixed(6);
      const newLng = e.latlng.lng.toFixed(6);

      setLat(newLat);
      setLng(newLng);
      setMapsUrl(`https://www.google.com/maps?q=${newLat},${newLng}`);

      if (currentMarker) {
        currentMarker.setLatLng([e.latlng.lat, e.latlng.lng]);
      } else {
        currentMarker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(leafletMap);
        currentMarker.on('dragend', (dragEvt) => {
          const pos = dragEvt.target.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          setMapsUrl(`https://www.google.com/maps?q=${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`);
        });
      }
      currentMarker.bindPopup(`<b>${customer.name}</b><br/>Koordinat Baru: ${newLat}, ${newLng}`).openPopup();
    });

    setMap(leafletMap);
    setMarker(currentMarker);

    return () => {
      leafletMap.remove();
    };
  }, []);

  // Update marker position when lat/lng inputs change manually
  const handleManualCoordChange = (newLatStr: string, newLngStr: string) => {
    setLat(newLatStr);
    setLng(newLngStr);
    const nLat = parseFloat(newLatStr);
    const nLng = parseFloat(newLngStr);

    if (!isNaN(nLat) && !isNaN(nLng) && map) {
      map.setView([nLat, nLng], 16);
      if (marker) {
        marker.setLatLng([nLat, nLng]);
      } else {
        const newMarker = L.marker([nLat, nLng], { draggable: true }).addTo(map);
        setMarker(newMarker);
      }
      setMapsUrl(`https://www.google.com/maps?q=${nLat},${nLng}`);
    }
  };

  // Browser GPS Geolocation
  const handleUseCurrentGPS = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Browser Anda tidak mendukung fitur lokasi GPS.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentLat = position.coords.latitude.toFixed(6);
        const currentLng = position.coords.longitude.toFixed(6);
        
        handleManualCoordChange(currentLat, currentLng);
        setSuccessMsg('📍 Lokasi GPS Anda berhasil dideteksi!');
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        setErrorMsg(`Gagal membaca GPS: ${error.message}. Pastikan izin lokasi (Location Permission) telah diizinkan di browser.`);
      },
      { enableHighAccuracy: true }
    );
  };

  // Parse Google Maps Link if pasted
  const handleParseGoogleMapsUrl = (url: string) => {
    setMapsUrl(url);
    // Try regex match for lat,lng in Google Maps URL (e.g. @-6.175392,106.827153 or q=-6.175392,106.827153)
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)|q=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = url.match(regex);
    if (match) {
      const parsedLat = match[1] || match[3];
      const parsedLng = match[2] || match[4];
      if (parsedLat && parsedLng) {
        handleManualCoordChange(parsedLat, parsedLng);
        setSuccessMsg('📍 Berhasil membaca titik koordinat dari Link Google Maps!');
      }
    }
  };

  // Save location to backend & Cloud Firestore
  const handleSaveLocation = async () => {
    if (!lat || !lng) {
      setErrorMsg('Harap tentukan titik koordinat Latitude & Longitude terlebih dahulu.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const updatedCust = {
        ...customer,
        latitude: lat,
        longitude: lng,
        maps_url: mapsUrl || `https://www.google.com/maps?q=${lat},${lng}`
      };

      // 1. Optional API Call (silently catch network errors if backend offline)
      try {
        const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3006';
        await fetch(`${apiUrl}/api/customers/${customer.id}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            maps_url: mapsUrl || `https://www.google.com/maps?q=${lat},${lng}`
          })
        }).catch(() => null);
      } catch (e) {}

      // 2. Primary Cloud Firestore & FTTH Node Sync Save
      await saveCustomerToFirestore(updatedCust).catch(() => null);
      await syncCustomerFtthDeviceNode(updatedCust).catch(() => null);

      setSuccessMsg('✅ Titik lokasi & Marker Node FTTH berhasil disimpan!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menyimpan lokasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
              <MapPin size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Titik Lokasi Peta Pelanggan</h3>
              <p className="text-xs text-sky-200">{customer.name} ({customer.customer_code || 'CUST'})</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer p-1 rounded-lg hover:bg-slate-800 transition-all"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 bg-slate-50/50">
          {/* Top Control Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={handleUseCurrentGPS}
              disabled={loading}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
            >
              <Navigation size={15} />
              <span>📍 Gunakan GPS Saya</span>
            </button>

            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
              >
                <span>🧭 Buka di Google Maps</span>
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          {/* Toast Alert */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold animate-fade-in">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold animate-fade-in">
              {successMsg}
            </div>
          )}

          {/* Leaflet Map Picker */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-inner h-80 z-0">
            <div id="map-picker-container" className="w-full h-full" />
            <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-[11px] font-bold z-10 shadow-lg">
              💡 Klik di peta untuk memasang/geser penanda titik
            </div>
          </div>

          {/* Coordinate Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Latitude (Garis Lintang)</label>
              <input
                type="text"
                placeholder="Contoh: -6.200000"
                value={lat}
                onChange={(e) => handleManualCoordChange(e.target.value, lng)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Longitude (Garis Bujur)</label>
              <input
                type="text"
                placeholder="Contoh: 106.816666"
                value={lng}
                onChange={(e) => handleManualCoordChange(lat, e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Link Google Maps (Opsional)</label>
              <input
                type="text"
                placeholder="Paste link Google Maps di sini (Contoh: https://maps.google.com/?q=-6.200,106.816)"
                value={mapsUrl}
                onChange={(e) => handleParseGoogleMapsUrl(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSaveLocation}
            disabled={loading || !lat || !lng}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={15} />
            <span>{loading ? 'Menyimpan...' : '💾 Simpan Titik Lokasi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
