import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Search, Filter, RefreshCw, X, ExternalLink, Globe, ShieldCheck, AlertCircle, Plus, Trash2, Radio, Network, Layers, Settings, Link2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Inject CSS animation for flowing/marching dashed lines ("Garis berjalan")
const styleId = 'animated-fiber-cable-style';
if (!document.getElementById(styleId)) {
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.innerHTML = `
    @keyframes fiberFlow {
      from {
        stroke-dashoffset: 20;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    .fiber-cable-animated {
      stroke-dasharray: 10, 10;
      animation: fiberFlow 1s linear infinite;
    }
    .fiber-cable-broken {
      stroke-dasharray: 10, 10;
      animation: fiberFlow 0.5s linear infinite;
    }
  `;
  document.head.appendChild(styleEl);
}

// Custom Marker Icons for Statuses & OLT/ODC/ODP Nodes
const createColoredIcon = (colorHex: string, labelSymbol: string = '') => {
  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34">
      <path fill="${colorHex}" stroke="#ffffff" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      ${labelSymbol ? `<text x="12" y="10.5" fill="#ffffff" font-size="9" font-weight="900" text-anchor="middle">${labelSymbol}</text>` : ''}
    </svg>
  `;
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: svgHtml,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30]
  });
};

// Node Box Icon for ODC, ODP, Splitter
const createBoxIcon = (bgColor: string, titleLabel: string) => {
  const svgHtml = `
    <div style="background-color: ${bgColor}; color: #ffffff; padding: 4px 8px; border-radius: 8px; font-weight: 900; font-size: 11px; border: 2px solid #ffffff; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4); display: flex; items-center; justify-content: center; font-family: monospace; white-space: nowrap; cursor: pointer;">
      ${titleLabel}
    </div>
  `;
  return L.divIcon({
    className: 'custom-leaflet-box-marker',
    html: svgHtml,
    iconSize: [70, 26],
    iconAnchor: [35, 13],
    popupAnchor: [0, -15]
  });
};

const greenIcon = createColoredIcon('#10b981');  // Active Customer
const redIcon = createColoredIcon('#f43f5e');    // Isolated / LOS Customer
const yellowIcon = createColoredIcon('#f59e0b'); // Grace Customer

const odcIcon = createBoxIcon('#0284c7', '🏢 ODC');
const odpIcon = createBoxIcon('#8b5cf6', '🔲 ODP');
const splitterIcon = createBoxIcon('#f97316', '🔀 SPL');
const oltServerIcon = createBoxIcon('#0f172a', '🖥️ OLT SERVER');

interface NodeItem {
  id: string;
  name: string;
  type: 'odc' | 'odp' | 'splitter' | 'olt';
  lat: number;
  lng: number;
  capacity?: string;
}

interface CableLink {
  id: string;
  fromId: string;
  fromLat: number;
  fromLng: number;
  toId: string;
  toLat: number;
  toLng: number;
  status: 'good' | 'warning' | 'broken';
  label?: string;
}

interface CustomerMapViewModalProps {
  customers: any[];
  onClose: () => void;
  onSelectCustomer?: (customer: any) => void;
}

export const CustomerMapViewModal: React.FC<CustomerMapViewModalProps> = ({ customers, onClose, onSelectCustomer }) => {
  const [filterType, setFilterType] = useState<string>('all'); // 'all' | 'pppoe' | 'hotspot'
  const [filterStatus, setFilterStatus] = useState<string>('all'); // 'all' | 'active' | 'isolated'
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showCables, setShowCables] = useState<boolean>(true);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite' | 'dark'>('street');

  // Side Panel Drawer Open State
  const [showTopologyDrawer, setShowTopologyDrawer] = useState<boolean>(false);

  // Interactive Adding Node State
  const [addMode, setAddMode] = useState<'none' | 'odc' | 'odp' | 'splitter'>('none');
  
  // Modal Form for New Node
  const [showAddNodeModal, setShowAddNodeModal] = useState<boolean>(false);
  const [newNodeLat, setNewNodeLat] = useState<number>(0);
  const [newNodeLng, setNewNodeLng] = useState<number>(0);
  const [newNodeName, setNewNodeName] = useState<string>('');
  const [newNodeType, setNewNodeType] = useState<'odp' | 'odc' | 'splitter'>('odp');
  const [newNodeCapacity, setNewNodeCapacity] = useState<string>('8 Port');

  // Modal Form for New Cable Link
  const [showAddCableModal, setShowAddCableModal] = useState<boolean>(false);
  const [cableFromId, setCableFromId] = useState<string>('');
  const [cableToId, setCableToId] = useState<string>('');
  const [cableLabel, setCableLabel] = useState<string>('Kabel Drop Core');
  const [cableStatus, setCableStatus] = useState<'good' | 'warning' | 'broken'>('good');

  // FTTH Network Topology Items (Stored locally)
  const [nodes, setNodes] = useState<NodeItem[]>(() => {
    const saved = localStorage.getItem('arbil_ftth_nodes');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 'olt-core-1', name: 'OLT SERVER PUSAT', type: 'olt', lat: -6.2000, lng: 106.8166 },
      { id: 'odc-01', name: 'ODC-CABINET-01', type: 'odc', lat: -6.2015, lng: 106.8180, capacity: '48 Port' },
      { id: 'odp-01', name: 'ODP-ANGGREK-01', type: 'odp', lat: -6.2030, lng: 106.8195, capacity: '8 Port' },
      { id: 'odp-02', name: 'ODP-MELATI-02', type: 'odp', lat: -6.2010, lng: 106.8210, capacity: '16 Port' }
    ];
  });

  const [cables, setCables] = useState<CableLink[]>(() => {
    const saved = localStorage.getItem('arbil_ftth_cables');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 'c1', fromId: 'olt-core-1', fromLat: -6.2000, fromLng: 106.8166, toId: 'odc-01', toLat: -6.2015, toLng: 106.8180, status: 'good', label: 'Feeder 12 Core' },
      { id: 'c2', fromId: 'odc-01', fromLat: -6.2015, fromLng: 106.8180, toId: 'odp-01', toLat: -6.2030, toLng: 106.8195, status: 'good', label: 'Distribusi 4 Core' },
      { id: 'c3', fromId: 'odc-01', fromLat: -6.2015, fromLng: 106.8180, toId: 'odp-02', toLat: -6.2010, toLng: 106.8210, status: 'good', label: 'Distribusi 8 Core' }
    ];
  });

  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const addModeRef = useRef(addMode);
  addModeRef.current = addMode;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Save topology
  useEffect(() => {
    localStorage.setItem('arbil_ftth_nodes', JSON.stringify(nodes));
  }, [nodes]);

  useEffect(() => {
    localStorage.setItem('arbil_ftth_cables', JSON.stringify(cables));
  }, [cables]);

  // Bind global window helpers for popup buttons
  useEffect(() => {
    (window as any).__deleteFtthNode = (id: string) => {
      if (window.confirm('Apakah Anda yakin ingin menghapus Box ODP / ODC ini?')) {
        setNodes(prev => prev.filter(n => n.id !== id));
        setCables(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
      }
    };

    (window as any).__deleteFtthCable = (id: string) => {
      if (window.confirm('Apakah Anda yakin ingin menghapus rute kabel fiber optik ini?')) {
        setCables(prev => prev.filter(c => c.id !== id));
      }
    };

    (window as any).__openAddOdpModal = (lat: number, lng: number) => {
      setNewNodeLat(lat);
      setNewNodeLng(lng);
      setNewNodeType('odp');
      setNewNodeName(`ODP-${nodes.length + 1}`);
      setNewNodeCapacity('8 Port');
      setShowAddNodeModal(true);
    };

    (window as any).__openAddOdcModal = (lat: number, lng: number) => {
      setNewNodeLat(lat);
      setNewNodeLng(lng);
      setNewNodeType('odc');
      setNewNodeName(`ODC-${nodes.length + 1}`);
      setNewNodeCapacity('48 Port');
      setShowAddNodeModal(true);
    };
  }, [nodes.length]);

  // Filter customers with valid coordinates
  const mappedCustomers = customers.filter((c) => {
    if (!c.latitude || !c.longitude) return false;
    if (filterType !== 'all' && c.connection_type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = c.name?.toLowerCase().includes(q);
      const matchCode = c.customer_code?.toLowerCase().includes(q);
      const matchPpp = c.pppoe_username?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchPpp) return false;
    }
    return true;
  });

  const unmappedCount = customers.length - customers.filter(c => c.latitude && c.longitude).length;

  // Handle Save New Node from Modal
  const handleSaveNewNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeName) return;

    const newNode: NodeItem = {
      id: `${newNodeType}-${Date.now()}`,
      name: newNodeName.trim(),
      type: newNodeType,
      lat: newNodeLat,
      lng: newNodeLng,
      capacity: newNodeCapacity
    };

    setNodes(prev => [...prev, newNode]);
    setShowAddNodeModal(false);
    setAddMode('none');
  };

  // Handle Save New Cable Link from Modal
  const handleSaveNewCable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cableFromId || !cableToId || cableFromId === cableToId) return;

    let fLat = 0, fLng = 0, fName = '';
    let tLat = 0, tLng = 0, tName = '';

    const fromNode = nodes.find(n => n.id === cableFromId);
    if (fromNode) {
      fLat = fromNode.lat; fLng = fromNode.lng; fName = fromNode.name;
    } else {
      const fromCust = customers.find(c => c.id === cableFromId);
      if (fromCust) { fLat = Number(fromCust.latitude); fLng = Number(fromCust.longitude); fName = fromCust.name; }
    }

    const toNode = nodes.find(n => n.id === cableToId);
    if (toNode) {
      tLat = toNode.lat; tLng = toNode.lng; tName = toNode.name;
    } else {
      const toCust = customers.find(c => c.id === cableToId);
      if (toCust) { tLat = Number(toCust.latitude); tLng = Number(toCust.longitude); tName = toCust.name; }
    }

    if (!fLat || !tLat) return;

    const newCable: CableLink = {
      id: `cable-${Date.now()}`,
      fromId: cableFromId,
      fromLat: fLat,
      fromLng: fLng,
      toId: cableToId,
      toLat: tLat,
      toLng: tLng,
      status: cableStatus,
      label: cableLabel || `Kabel ${fName} - ${tName}`
    };

    setCables(prev => [...prev, newCable]);
    setShowAddCableModal(false);
  };

  const handleDeleteNode = (id: string) => {
    if (window.confirm('Hapus Box ODP / ODC ini?')) {
      setNodes(prev => prev.filter(n => n.id !== id));
      setCables(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    }
  };

  const handleDeleteCable = (id: string) => {
    if (window.confirm('Hapus rute kabel fiber optik ini?')) {
      setCables(prev => prev.filter(c => c.id !== id));
    }
  };

  // 1. Initialize Map ONCE on Mount
  useEffect(() => {
    const container = document.getElementById('global-customer-map');
    if (!container || mapRef.current) return;

    let centerLat = -6.200000;
    let centerLng = 106.816666;

    const validCusts = customers.filter(c => c.latitude && c.longitude);
    if (validCusts.length > 0) {
      const sumLat = validCusts.reduce((acc, c) => acc + Number(c.latitude), 0);
      const sumLng = validCusts.reduce((acc, c) => acc + Number(c.longitude), 0);
      centerLat = sumLat / validCusts.length;
      centerLng = sumLng / validCusts.length;
    }

    const leafletMap = L.map('global-customer-map', { zoomControl: false }).setView([centerLat, centerLng], validCusts.length > 0 ? 14 : 12);

    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; GenieACS FTTH'
    }).addTo(leafletMap);
    tileLayerRef.current = tileLayer;

    const layerGroup = L.layerGroup().addTo(leafletMap);
    layerGroupRef.current = layerGroup;

    mapRef.current = leafletMap;

    return () => {
      leafletMap.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Invalidate map size when drawer toggles
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 100);
    }
  }, [showTopologyDrawer]);

  // 2. Map click listener (keeps references up to date)
  useEffect(() => {
    const leafletMap = mapRef.current;
    if (!leafletMap) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      const currentAddMode = addModeRef.current;
      const currentNodes = nodesRef.current;

      if (currentAddMode === 'odc' || currentAddMode === 'odp' || currentAddMode === 'splitter') {
        setNewNodeLat(clickLat);
        setNewNodeLng(clickLng);
        setNewNodeType(currentAddMode);
        setNewNodeName(`${currentAddMode.toUpperCase()}-${currentNodes.length + 1}`);
        setNewNodeCapacity(currentAddMode === 'odp' ? '8 Port' : '48 Port');
        setShowAddNodeModal(true);
      } else {
        const clickPopupContent = `
          <div style="font-family: system-ui, sans-serif; text-align: center; padding: 4px; min-width: 170px;">
            <div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-bottom: 6px;">📍 Titik Peta Diklik</div>
            <button onclick="window.__openAddOdpModal(${clickLat}, ${clickLng})" style="background: #8b5cf6; color: #ffffff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: 800; font-size: 11px; width: 100%; margin-bottom: 4px; cursor: pointer;">
              🔲 Pasang Box ODP di sini
            </button>
            <button onclick="window.__openAddOdcModal(${clickLat}, ${clickLng})" style="background: #0284c7; color: #ffffff; border: none; padding: 6px 10px; border-radius: 8px; font-weight: 800; font-size: 11px; width: 100%; cursor: pointer;">
              🏢 Pasang Box ODC di sini
            </button>
          </div>
        `;

        L.popup()
          .setLatLng([clickLat, clickLng])
          .setContent(clickPopupContent)
          .openOn(leafletMap);
      }
    };

    leafletMap.off('click');
    leafletMap.on('click', handleMapClick);

    return () => {
      leafletMap.off('click', handleMapClick);
    };
  }, []);

  // 3. Update Tile Layer URL without re-creating the map
  useEffect(() => {
    if (!tileLayerRef.current) return;
    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    let attribution = '&copy; OpenStreetMap &copy; GenieACS FTTH';

    if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = 'Esri World Imagery Satelit';
    } else if (mapStyle === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = 'CartoDB Dark Matter';
    }

    tileLayerRef.current.setUrl(tileUrl);
  }, [mapStyle]);

  // 4. Update Markers & Polylines without destroying map instance
  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    // Render Topology Nodes (OLT, ODC, ODP, Splitter)
    nodes.forEach((n) => {
      let icon = odpIcon;
      if (n.type === 'odc') icon = odcIcon;
      if (n.type === 'splitter') icon = splitterIcon;
      if (n.type === 'olt') icon = oltServerIcon;

      const popup = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 170px; padding: 2px;">
          <div style="font-weight: 900; color: #0f172a; font-size: 13px;">${n.name}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Tipe: <strong>${n.type.toUpperCase()}</strong> (${n.capacity || 'FTTH Node'})</div>
          <div style="font-size: 10px; font-family: monospace; color: #0284c7; margin-top: 4px; margin-bottom: 6px;">Lat: ${n.lat.toFixed(5)}, Lng: ${n.lng.toFixed(5)}</div>
          
          ${n.type !== 'olt' ? `
            <button onclick="window.__deleteFtthNode('${n.id}')" style="background:#f43f5e; color:#ffffff; padding:4px 8px; border-radius:6px; border:none; font-weight:800; font-size:11px; cursor:pointer; width:100%; text-align:center;">
              🗑️ Hapus ${n.type.toUpperCase()} Ini
            </button>
          ` : ''}
        </div>
      `;

      const m = L.marker([n.lat, n.lng], { icon }).addTo(layerGroup);
      m.bindPopup(popup);
    });

    // Render Cable Lines (Moving Animated Dashed Polyline Jalur Kabel Fiber Berjalan)
    if (showCables) {
      cables.forEach((cb) => {
        const strokeColor = cb.status === 'good' ? '#10b981' : cb.status === 'warning' ? '#f59e0b' : '#f43f5e';
        const lineClass = cb.status === 'broken' ? 'fiber-cable-broken' : 'fiber-cable-animated';

        const line = L.polyline(
          [[cb.fromLat, cb.fromLng], [cb.toLat, cb.toLng]],
          {
            color: strokeColor,
            weight: 4,
            className: lineClass,
            opacity: 0.95
          }
        ).addTo(layerGroup);

        line.bindPopup(`
          <div style="font-family: system-ui; font-size: 11px; padding: 2px;">
            <strong>🔌 Jalur Kabel Fiber Optik:</strong> ${cb.label || 'Kabel Drop Core'}
            <div style="color: ${strokeColor}; font-weight: bold; margin-top: 2px; margin-bottom: 6px;">Status: ${(cb.status || 'good').toUpperCase()}</div>
            <button onclick="window.__deleteFtthCable('${cb.id}')" style="background:#f43f5e; color:#ffffff; padding:4px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%;">
              🗑️ Hapus Kabel Ini
            </button>
          </div>
        `);
      });

      // Draw Moving Dashed Cable line from Nearest ODP to Customer Markers
      mappedCustomers.forEach((c) => {
        const cLat = Number(c.latitude);
        const cLng = Number(c.longitude);

        const odpNodes = nodes.filter(n => n.type === 'odp' || n.type === 'odc');
        if (odpNodes.length > 0) {
          let closest = odpNodes[0];
          let minDist = Math.hypot(closest.lat - cLat, closest.lng - cLng);
          for (let i = 1; i < odpNodes.length; i++) {
            const dist = Math.hypot(odpNodes[i].lat - cLat, odpNodes[i].lng - cLng);
            if (dist < minDist) {
              minDist = dist;
              closest = odpNodes[i];
            }
          }

          const isBroken = c.status === 'isolated' || c.status === 'nonaktif';
          const cableColor = isBroken ? '#f43f5e' : '#10b981';

          L.polyline(
            [[closest.lat, closest.lng], [cLat, cLng]],
            {
              color: cableColor,
              weight: 2.5,
              className: isBroken ? 'fiber-cable-broken' : 'fiber-cable-animated',
              opacity: 0.85
            }
          ).addTo(layerGroup);
        }
      });
    }

    // Render Customer Markers
    mappedCustomers.forEach((c) => {
      const lat = Number(c.latitude);
      const lng = Number(c.longitude);

      let icon = greenIcon;
      if (c.status === 'isolated' || c.status === 'nonaktif') icon = redIcon;
      else if (c.status === 'grace') icon = yellowIcon;

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 190px; padding: 2px;">
          <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 2px;">${c.name}</div>
          <div style="font-size: 10px; font-weight: 700; color: #0284c7; margin-bottom: 6px;">${c.customer_code || 'CUST'} (${(c.connection_type || 'pppoe').toUpperCase()})</div>
          
          <div style="background-color: #f8fafc; padding: 6px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px; font-size: 11px;">
            <div><strong>Paket:</strong> ${c.package_name || 'Paket Internet'}</div>
            <div><strong>Status:</strong> <span style="color: ${c.status === 'isolated' ? '#e11d48' : '#059669'}; font-weight: 800;">${(c.status || 'aktif').toUpperCase()}</span></div>
            <div><strong>SN ONU:</strong> <span style="font-family: monospace; font-weight: 700;">${c.sn_onu || '-'}</span></div>
            <div><strong>Signal Laser:</strong> <span style="color: #0284c7; font-weight: 800;">${c.power_laser || '-19.5 dBm'}</span></div>
            <div><strong>ODP Port:</strong> ${c.odp_port || 'ODP-01 / P4'}</div>
          </div>

          <a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" style="display: block; text-align: center; background-color: #0284c7; color: #ffffff; padding: 6px 10px; border-radius: 8px; font-weight: 700; text-decoration: none;">
            🧭 Navigasi Google Maps
          </a>
        </div>
      `;

      const m = L.marker([lat, lng], { icon }).addTo(layerGroup);
      m.bindPopup(popupContent);
    });
  }, [nodes, cables, showCables, mappedCustomers]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 md:p-6 z-50 animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col h-[94vh] relative">
        {/* Header Bar */}
        <div className="p-4 md:p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
              <Network size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-extrabold text-base md:text-lg text-white">🗺️ Topologi FTTH & Peta Sebaran Pelanggan PPP</h3>
              <p className="text-xs text-sky-200 flex items-center gap-2">
                <span>{mappedCustomers.length} Pelanggan | {nodes.filter(n => n.type === 'odp').length} ODP | {nodes.filter(n => n.type === 'odc').length} ODC</span>
                {unmappedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold">
                    ⚠️ {unmappedCount} belum ditandai
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTopologyDrawer(!showTopologyDrawer)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
            >
              <Settings size={15} />
              <span>{showTopologyDrawer ? 'Tutup Pengelola' : '⚙️ Kelola ODP & Kabel'}</span>
            </button>

            <button 
              onClick={onClose} 
              className="text-slate-400 hover:text-white font-bold text-xl cursor-pointer p-1.5 rounded-xl hover:bg-slate-800 transition-all"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Filter & Toolbar Controls Bar */}
        <div className="p-3 md:p-4 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama, ODP, kode pelanggan, username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Interactive Topology Add Tools */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Map Style Selector */}
            <select
              value={mapStyle}
              onChange={(e) => setMapStyle(e.target.value as any)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="street">🗺️ Peta Jalan (Street)</option>
              <option value="satellite">🛰️ Satelit Foto Udara</option>
              <option value="dark">🌙 Mode Dark Kontras</option>
            </select>

            <button
              onClick={() => setShowCables(!showCables)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                showCables ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              <Radio size={14} />
              <span>{showCables ? '⚡ Kabel Berjalan (Aktif)' : '⚡ Kabel (Sembunyi)'}</span>
            </button>

            <button
              onClick={() => setAddMode(addMode === 'odp' ? 'none' : 'odp')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                addMode === 'odp' ? 'bg-purple-600 text-white border-purple-600 animate-pulse' : 'bg-white text-purple-700 border-purple-200'
              }`}
            >
              <Plus size={14} />
              <span>{addMode === 'odp' ? '📍 Klik lokasi peta...' : '+ ODP Baru'}</span>
            </button>

            <button
              onClick={() => setAddMode(addMode === 'odc' ? 'none' : 'odc')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                addMode === 'odc' ? 'bg-sky-600 text-white border-sky-600 animate-pulse' : 'bg-white text-sky-700 border-sky-200'
              }`}
            >
              <Plus size={14} />
              <span>{addMode === 'odc' ? '📍 Klik lokasi peta...' : '+ ODC Baru'}</span>
            </button>

            <button
              onClick={() => {
                if (nodes.length > 0) {
                  setCableFromId(nodes[0].id);
                  setCableToId(nodes[1]?.id || nodes[0].id);
                }
                setShowAddCableModal(true);
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Link2 size={14} />
              <span>🔌 Tarik Kabel Fiber</span>
            </button>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="all">Semua Pelanggan</option>
              <option value="pppoe">PPP Bulanan</option>
              <option value="hotspot">Hotspot Member</option>
            </select>
          </div>
        </div>

        {/* Leaflet Map Main Body */}
        <div className="relative flex-1 bg-slate-100 overflow-hidden flex">
          <div id="global-customer-map" className="w-full h-full flex-1 z-0" />

          {/* Interactive Mode Banner */}
          {addMode !== 'none' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-sky-400 text-xs font-bold z-[1001] flex items-center gap-3 animate-bounce">
              <span>📍 Silakan KLIK pada titik peta di mana Anda ingin menaruh Box {addMode.toUpperCase()} baru!</span>
              <button onClick={() => setAddMode('none')} className="bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-lg text-xs cursor-pointer">Batal</button>
            </div>
          )}

          {/* Side Drawer Panel for Topology Management */}
          {showTopologyDrawer && (
            <div className="absolute right-0 top-0 bottom-0 w-80 max-w-full bg-white border-l border-slate-200 shadow-2xl z-[1002] flex flex-col h-full overflow-hidden animate-slide-left">
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <h4 className="font-extrabold text-sm flex items-center gap-2">
                  <Settings size={16} className="text-sky-400" />
                  <span>Pengelola Topologi FTTH</span>
                </h4>
                <button onClick={() => setShowTopologyDrawer(false)} className="text-slate-400 hover:text-white font-bold">&times;</button>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-5 text-xs">
                {/* Section Nodes ODP / ODC */}
                <div>
                  <div className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
                    <span>Daftar Box ODP & ODC ({nodes.length})</span>
                  </div>
                  <div className="space-y-2">
                    {nodes.map(n => (
                      <div key={n.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="font-extrabold text-slate-900">{n.name}</div>
                          <div className="text-[10px] text-slate-500">{n.type.toUpperCase()} • {n.capacity || 'FTTH'}</div>
                        </div>
                        {n.type !== 'olt' && (
                          <button
                            onClick={() => handleDeleteNode(n.id)}
                            className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                            title="Hapus Node ODP ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section Fiber Cables */}
                <div>
                  <div className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
                    <span>Daftar Jalur Kabel Fiber ({cables.length})</span>
                  </div>
                  <div className="space-y-2">
                    {cables.map(c => (
                      <div key={c.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-800">{c.label || 'Kabel Fiber'}</div>
                          <div className="text-[10px] text-emerald-600 font-bold uppercase">Status: {c.status}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteCable(c.id)}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                          title="Hapus Rute Kabel ini"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Map Legend Overlay */}
          <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur-md text-white p-3 rounded-2xl border border-slate-700/60 shadow-2xl z-[1001] text-xs space-y-1.5 max-w-[calc(100%-2rem)]">
            <div className="font-extrabold text-[10px] uppercase text-sky-400 tracking-wider pb-1 border-b border-slate-700">
              KETERANGAN LOKASI & TOPOLOGI FTTH
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-purple-500 border border-white"></span>
                <span className="font-bold text-[11px]">🔲 Box ODP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-sky-500 border border-white"></span>
                <span className="font-bold text-[11px]">🏢 Box ODC</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-[11px]">🟢 Pelanggan Aktif</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <span className="font-medium text-[11px]">🔴 Pelanggan Isolir / LOS</span>
              </div>
            </div>
            <div className="pt-1 border-t border-slate-700/60 text-[10px] text-slate-300">
              ⚡ <strong>Garis Putus-Putus Berjalan (Animasi Flow)</strong> = Jalur Kabel Fiber Optik Aktif (GenieACS TR-069)
            </div>
          </div>
        </div>
      </div>

      {/* Modal Form: Add New Node (ODP / ODC) */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-base text-white">➕ Tambah Box {newNodeType.toUpperCase()} Baru</h3>
              <button onClick={() => setShowAddNodeModal(false)} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleSaveNewNode} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Box ODP / ODC *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: ODP-ANGGREK-03"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Node *</label>
                  <select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="odp">🔲 ODP (Distribution Point)</option>
                    <option value="odc">🏢 ODC (Distribution Cabinet)</option>
                    <option value="splitter">🔀 Splitter Optic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kapasitas Port</label>
                  <select
                    value={newNodeCapacity}
                    onChange={(e) => setNewNodeCapacity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  >
                    <option value="8 Port">8 Port</option>
                    <option value="16 Port">16 Port</option>
                    <option value="24 Port">24 Port</option>
                    <option value="48 Port">48 Port</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1">
                <div>Latitude: <strong>{newNodeLat.toFixed(6)}</strong></div>
                <div>Longitude: <strong>{newNodeLng.toFixed(6)}</strong></div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddNodeModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-md cursor-pointer">
                  💾 Simpan Node ODP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Form: Add Cable Link */}
      {showAddCableModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-base text-white">🔌 Tarik / Sambung Kabel Fiber Optik</h3>
              <button onClick={() => setShowAddCableModal(false)} className="text-slate-400 hover:text-white text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={handleSaveNewCable} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Node Asal (Mulai) *</label>
                <select
                  value={cableFromId}
                  onChange={(e) => setCableFromId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {nodes.map(n => (
                    <option key={n.id} value={n.id}>{n.name} ({n.type.toUpperCase()})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Node Tujuan / Pelanggan *</label>
                <select
                  value={cableToId}
                  onChange={(e) => setCableToId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <optgroup label="Node ODP / ODC">
                    {nodes.map(n => (
                      <option key={n.id} value={n.id}>{n.name} ({n.type.toUpperCase()})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Pelanggan">
                    {mappedCustomers.map(c => (
                      <option key={c.id} value={c.id}>Pelanggan: {c.name} ({c.customer_code})</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama / Label Kabel</label>
                <input
                  type="text"
                  placeholder="Contoh: Kabel Drop Core 2 Core"
                  value={cableLabel}
                  onChange={(e) => setCableLabel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status Sinyal Kabel *</label>
                <select
                  value={cableStatus}
                  onChange={(e) => setCableStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="good">🟢 Normal / Healthy (Hijau Berjalan)</option>
                  <option value="warning">🟡 Warning / High Attenuation (Kuning Berjalan)</option>
                  <option value="broken">🔴 Kabel Terputus / LOS (Merah Berjalan Cepat)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddCableModal(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Batal</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md cursor-pointer">
                  🔌 Tarik Kabel Fiber
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
