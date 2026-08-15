import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import HeaderBar from './HeaderBar';
import { saveFtthMapToFirestore, getFtthMapFromFirestore } from '../services/firebaseService';

// Inject exact CSS animation from Laravel arbill map-ftth/index.blade.php
const styleId = 'laravel-arbill-map-ftth-style';
if (!document.getElementById(styleId)) {
  const styleEl = document.createElement('style');
  styleEl.id = styleId;
  styleEl.innerHTML = `
    /* Animasi Garis 100% Persis Laravel Arbill map-ftth */
    .animated-line-laravel {
      stroke-dasharray: 10, 10;
      animation: dashLaravel 1s linear infinite;
      shape-rendering: geometricPrecision;
    }

    .leaflet-overlay-pane path {
      transform: translateZ(0);
      backface-visibility: hidden;
      cursor: pointer !important;
    }

    @keyframes dashLaravel {
      from {
        stroke-dashoffset: 20;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    /* Custom Circular Icon Nodes */
    .laravel-node-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      border: 2px solid white;
      border-radius: 50%;
      color: white;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
      font-weight: bold;
    }

    /* Animasi Kedap-Kedip Merah Perangkat / ONU / Router OFFLINE */
    .node-offline-blinking {
      animation: blinkOfflineNode 0.8s ease-in-out infinite alternate !important;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.95), 0 0 25px rgba(239, 68, 68, 0.7) !important;
      border: 3px solid #ef4444 !important;
    }

    @keyframes blinkOfflineNode {
      0% {
        opacity: 1;
        transform: scale(1);
        box-shadow: 0 0 10px #ef4444;
      }
      100% {
        opacity: 0.35;
        transform: scale(1.25);
        box-shadow: 0 0 28px #dc2626;
      }
    }

    /* Animasi Garis Kabel OFFLINE / PUTUS Warna Merah Kedap-Kedip */
    .offline-cable-animated {
      stroke: #ef4444 !important;
      stroke-dasharray: 8, 8;
      animation: dashOfflineCable 0.5s linear infinite !important;
      filter: drop-shadow(0px 0px 6px rgba(239, 68, 68, 0.8));
    }

    @keyframes dashOfflineCable {
      from {
        stroke-dashoffset: 16;
      }
      to {
        stroke-dashoffset: 0;
      }
    }

    /* Animasi Kabel Utama / Distribusi PUTUS (RFO Upstream Cut) */
    .upstream-cut-animated {
      stroke: #dc2626 !important;
      stroke-dasharray: 12, 12;
      animation: dashUpstreamCut 0.35s linear infinite !important;
      filter: drop-shadow(0px 0px 12px rgba(220, 38, 38, 0.95));
    }

    @keyframes dashUpstreamCut {
      from {
        stroke-dashoffset: 24;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

type DeviceType = 'OLT' | 'ODC' | 'ODP' | 'SPLITTER' | 'ONU' | 'HTB' | 'SWITCH' | 'ROUTER' | 'ROUTER_WIFI' | 'ACCESS_POINT' | 'CLIENT_RJ45';

interface NodeRecord {
  id: string;
  lat: number;
  lng: number;
  type: DeviceType;
  name?: string;
  code?: string;
  description?: string;
  splitterCapacity?: number; // 4, 8, 16, 32
  splitterRatio?: string; // Ratio/PLC
  outputPower?: number; // Tx Power
  sfpPowerList?: number[]; // SFP PON powers
  portsA?: number; // Fiber Port Side A (1310nm for HTB)
  portsB?: number; // Fiber Port Side B (1550nm for HTB)
  portsSfp?: number; // SFP Transceiver Ports (for Switch / Router)
  portsLan?: number; // Ethernet LAN RJ45 Ports
  customerId?: string | null; // Linked Customer ID
  totalCableCores?: number; // Total cores in incoming cable (2, 4, 6, 8, 12, 24)
  coreSplicingMap?: Record<number, { action: 'INPUT_SPLITTER' | 'BYPASS_PASS' | 'SPARE'; targetNodeName?: string; note?: string }>;
}

interface LineRecord {
  id: string;
  fromId: string;
  fromPort?: number;
  toId: string;
  toPort?: number;
  waypoints?: Array<[number, number]>;
  cableLengthM?: number;
  attenuationDb?: number;
  cableColor?: string;
  coreNumber?: string;
  cableType?: string;
  totalCores?: number;
  coreSplicingMap?: Record<number, { action: 'INPUT_SPLITTER' | 'BYPASS_PASS' | 'SPARE'; targetNodeName?: string; note?: string }>;
}

interface LaravelFtthMapPageProps {
  profile: any;
  t: any;
  onLogout?: () => void;
  initialOpenModal?: 'splitter' | 'devices';
}

export default function LaravelFtthMapPage({ profile, t, onLogout, initialOpenModal }: LaravelFtthMapPageProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Default mode is 'view' (Mode Jelajah Peta - Bebas klik/geser tanpa menambah node tak sengaja)
  const [currentMode, setCurrentMode] = useState<'view' | 'add_marker' | 'line' | 'waypoint'>('view');
  const [currentType, setCurrentType] = useState<DeviceType>('ODP');
  const [selectedLineForWaypoint, setSelectedLineForWaypoint] = useState<string | null>(null);

  // Scalable Zoom Level of Detail (LOD) & Company Location Center States
  const [zoomLevel, setZoomLevel] = useState<number>(profile?.mapZoom || 16);
  const [enableLodFilter, setEnableLodFilter] = useState<boolean>(true);

const DEFAULT_SPLITTER_CATALOG = [
  { id: 'sp_1_2', name: 'Splitter 1:2', category: 'symmetric', ratioCode: '1:2', capacity: 2, passLossDb: 3.5, dropLossDb: 3.5, description: 'PLC Splitter Simetris 2 Port Output' },
  { id: 'sp_1_4', name: 'Splitter 1:4', category: 'symmetric', ratioCode: '1:4', capacity: 4, passLossDb: 7.2, dropLossDb: 7.2, description: 'PLC Splitter Simetris 4 Port Output' },
  { id: 'sp_1_8', name: 'Splitter 1:8', category: 'symmetric', ratioCode: '1:8', capacity: 8, passLossDb: 10.5, dropLossDb: 10.5, description: 'PLC Splitter Simetris 8 Port Output' },
  { id: 'sp_1_16', name: 'Splitter 1:16', category: 'symmetric', ratioCode: '1:16', capacity: 16, passLossDb: 13.8, dropLossDb: 13.8, description: 'PLC Splitter Simetris 16 Port Output' },
  { id: 'sp_1_32', name: 'Splitter 1:32', category: 'symmetric', ratioCode: '1:32', capacity: 32, passLossDb: 17.0, dropLossDb: 17.0, description: 'PLC Splitter Simetris 32 Port Output' },
  { id: 'sp_95_5', name: 'Rasio 95:5', category: 'asymmetric', ratioCode: '95:5', capacity: 2, passLossDb: 0.4, dropLossDb: 13.5, description: 'Splitter Asimetris Ratio 95% Pass / 5% Drop' },
  { id: 'sp_90_10', name: 'Rasio 90:10', category: 'asymmetric', ratioCode: '90:10', capacity: 2, passLossDb: 0.8, dropLossDb: 10.8, description: 'Splitter Asimetris Ratio 90% Pass / 10% Drop' },
  { id: 'sp_85_15', name: 'Rasio 85:15', category: 'asymmetric', ratioCode: '85:15', capacity: 2, passLossDb: 1.1, dropLossDb: 9.0, description: 'Splitter Asimetris Ratio 85% Pass / 15% Drop' },
  { id: 'sp_80_20', name: 'Rasio 80:20', category: 'asymmetric', ratioCode: '80:20', capacity: 2, passLossDb: 1.4, dropLossDb: 7.6, description: 'Splitter Asimetris Ratio 80% Pass / 20% Drop' },
  { id: 'sp_75_25', name: 'Rasio 75:25', category: 'asymmetric', ratioCode: '75:25', capacity: 2, passLossDb: 1.7, dropLossDb: 6.6, description: 'Splitter Asimetris Ratio 75% Pass / 25% Drop' },
  { id: 'sp_70_30', name: 'Rasio 70:30', category: 'asymmetric', ratioCode: '70:30', capacity: 2, passLossDb: 2.0, dropLossDb: 5.8, description: 'Splitter Asimetris Ratio 70% Pass / 30% Drop' },
  { id: 'sp_65_35', name: 'Rasio 65:35', category: 'asymmetric', ratioCode: '65:35', capacity: 2, passLossDb: 2.4, dropLossDb: 5.1, description: 'Splitter Asimetris Ratio 65% Pass / 35% Drop' },
  { id: 'sp_60_40', name: 'Rasio 60:40', category: 'asymmetric', ratioCode: '60:40', capacity: 2, passLossDb: 2.8, dropLossDb: 4.5, description: 'Splitter Asimetris Ratio 60% Pass / 40% Drop' },
  { id: 'sp_55_45', name: 'Rasio 55:45', category: 'asymmetric', ratioCode: '55:45', capacity: 2, passLossDb: 3.2, dropLossDb: 4.0, description: 'Splitter Asimetris Ratio 55% Pass / 45% Drop' },
  { id: 'sp_50_50', name: 'Rasio 50:50', category: 'asymmetric', ratioCode: '50:50', capacity: 2, passLossDb: 3.5, dropLossDb: 3.5, description: 'Splitter Asimetris Ratio 50% Pass / 50% Drop' },
  { id: 'sp_hy_9010_14', name: 'Hybrid 90:10 + 1:4', category: 'hybrid', ratioCode: '90:10 + 1:4', capacity: 5, passLossDb: 0.8, dropLossDb: 18.0, description: 'Hybrid Tembak Tengah (Pass 90% Feeder / Drop 10% + 1:4 Lokal)' },
  { id: 'sp_hy_9010_18', name: 'Hybrid 90:10 + 1:8', category: 'hybrid', ratioCode: '90:10 + 1:8', capacity: 9, passLossDb: 0.8, dropLossDb: 21.3, description: 'Hybrid Tembak Tengah (Pass 90% Feeder / Drop 10% + 1:8 Lokal)' },
  { id: 'sp_hy_8020_14', name: 'Hybrid 80:20 + 1:4', category: 'hybrid', ratioCode: '80:20 + 1:4', capacity: 5, passLossDb: 1.4, dropLossDb: 14.8, description: 'Hybrid Tembak Tengah (Pass 80% Feeder / Drop 20% + 1:4 Lokal)' },
  { id: 'sp_hy_8020_18', name: 'Hybrid 80:20 + 1:8', category: 'hybrid', ratioCode: '80:20 + 1:8', capacity: 9, passLossDb: 1.4, dropLossDb: 18.1, description: 'Hybrid Tembak Tengah (Pass 80% Feeder / Drop 20% + 1:8 Lokal)' },
  { id: 'sp_hy_7030_14', name: 'Hybrid 70:30 + 1:4', category: 'hybrid', ratioCode: '70:30 + 1:4', capacity: 5, passLossDb: 2.0, dropLossDb: 13.0, description: 'Hybrid Tembak Tengah (Pass 70% Feeder / Drop 30% + 1:4 Lokal)' },
  { id: 'sp_hy_7030_18', name: 'Hybrid 70:30 + 1:8', category: 'hybrid', ratioCode: '70:30 + 1:8', capacity: 9, passLossDb: 2.0, dropLossDb: 16.3, description: 'Hybrid Tembak Tengah (Pass 70% Feeder / Drop 30% + 1:8 Lokal)' }
];

// Interactive Cable Connection Port Picker Modal State
  const [connectingPair, setConnectingPair] = useState<{ fromNode: NodeRecord; toNode: NodeRecord } | null>(null);
  const [selectedFromPort, setSelectedFromPort] = useState<number>(1);
  const [selectedToPort, setSelectedToPort] = useState<number>(1);
  const [selectedCableCores, setSelectedCableCores] = useState<number>(4);

  // Master Splitter Catalog States (Database-backed dynamic splitters & ratios)
  const [splitterCatalog, setSplitterCatalog] = useState<any[]>(DEFAULT_SPLITTER_CATALOG);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState<boolean>(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState<string>('');
  const [catCategory, setCatCategory] = useState<'symmetric' | 'asymmetric' | 'hybrid'>('asymmetric');
  const [catRatioCode, setCatRatioCode] = useState<string>('');
  const [catCapacity, setCatCapacity] = useState<number>(2);
  const [catPassLoss, setCatPassLoss] = useState<number>(0.8);
  const [catDropLoss, setCatDropLoss] = useState<number>(10.8);
  const [catDescription, setCatDescription] = useState<string>('');

  // Edit Cable Color & Core States
  const [editingCableId, setEditingCableId] = useState<string | null>(null);
  const [editCableColor, setEditCableColor] = useState<string>('#2563eb');
  const [editCoreNumber, setEditCoreNumber] = useState<string>('Core #1 (Biru)');
  const [editCableTypeLabel, setEditCableTypeLabel] = useState<string>('Kabel Fiber Optik');
  const [editTotalCores, setEditTotalCores] = useState<number>(4);
  const [editCoreSplicingMap, setEditCoreSplicingMap] = useState<Record<number, { action: string; note?: string }>>({});

  const [mapStyle, setMapStyle] = useState<'google_hybrid' | 'google_streets' | 'street' | 'satellite' | 'dark'>('google_hybrid');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(true);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(true);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Toast, Modal & Persistence States
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [warningModalMsg, setWarningModalMsg] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);

  // Inspector & Edit Modal States
  const [inspectingNode, setInspectingNode] = useState<NodeRecord | null>(null);
  const [editingNode, setEditingNode] = useState<NodeRecord | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCode, setEditCode] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editType, setEditType] = useState<DeviceType>('ODP');
  const [editCapacity, setEditCapacity] = useState<number>(8);
  const [editOutputPower, setEditOutputPower] = useState<number>(9.0);
  const [editCustomerId, setEditCustomerId] = useState<string>('');

  // Master Device Management Table States
  const [isDeviceTableModalOpen, setIsDeviceTableModalOpen] = useState<boolean>(false);
  const [deviceTableSearch, setDeviceTableSearch] = useState<string>('');
  const [deviceTableTypeFilter, setDeviceTableTypeFilter] = useState<string>('ALL');
  const [deviceTableStatusFilter, setDeviceTableStatusFilter] = useState<string>('ALL');

  // Interactive Route Path Tracer States (Trace OLT ➔ ODC ➔ ODP ➔ ONU)
  const [tracedNodeId, setTracedNodeId] = useState<string | null>(null);
  const [highlightedPathLineIds, setHighlightedPathLineIds] = useState<string[]>([]);

  // Custom Ports Configuration States for HTB, Switch, Router & Custom Devices
  const [editPortsA, setEditPortsA] = useState<number>(1);
  const [editPortsB, setEditPortsB] = useState<number>(1);
  const [editPortsSfp, setEditPortsSfp] = useState<number>(1);
  const [editPortsLan, setEditPortsLan] = useState<number>(8);

  // OTDR Fiber Fault Locator Simulation States
  const [showOtdrModal, setShowOtdrModal] = useState<boolean>(false);
  const [otdrNodeId, setOtdrNodeId] = useState<string | null>(null);
  const [selectedOtdrLineId, setSelectedOtdrLineId] = useState<string>('');
  const [otdrOriginDirection, setOtdrOriginDirection] = useState<'from' | 'to'>('from');
  const [selectedOtdrCore, setSelectedOtdrCore] = useState<number>(1);
  const [otdrInputDistance, setOtdrInputDistance] = useState<number>(100);
  const [otdrUnit, setOtdrUnit] = useState<'m' | 'km'>('m');
  const [otdrBreakPoint, setOtdrBreakPoint] = useState<{
    lineId: string;
    lat: number;
    lng: number;
    meters: number;
    fromNodeName: string;
    toNodeName: string;
    coreNumber?: number;
    coreName?: string;
  } | null>(null);

  // Pure Database FTTH Topology & Customer Sync States
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [lines, setLines] = useState<LineRecord[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [onlineUsernames, setOnlineUsernames] = useState<string[]>([]);
  const [loadingMap, setLoadingMap] = useState<boolean>(true);

  // Automatically open initial modal requested by sidebar navigation (e.g. Master Splitter or Tabel Perangkat)
  useEffect(() => {
    if (initialOpenModal === 'splitter') {
      setIsCatalogModalOpen(true);
    } else if (initialOpenModal === 'devices') {
      setIsDeviceTableModalOpen(true);
    }
  }, [initialOpenModal]);

  // Load Topology, Customers & Live Mikrotik Active Sessions on Mount (Firebase Cloud Firestore first!)
  useEffect(() => {
    setLoadingMap(true);

    // 1. Fetch topology from Firebase Cloud Firestore
    getFtthMapFromFirestore()
      .then(fsData => {
        if (fsData.success && (fsData.nodes.length > 0 || fsData.lines.length > 0)) {
          setNodes(fsData.nodes);
          setLines(fsData.lines);
        } else {
          // Fallback to local server if Firestore is initially empty
          fetch('http://localhost:3006/api/ftth/map')
            .then(res => res.json())
            .then(data => {
              if (data.success && data.data) {
                setNodes(data.data.nodes || []);
                setLines(data.data.lines || []);
              }
            })
            .catch(err => console.error('Failed to fetch FTTH topology from local API:', err));
        }
      })
      .finally(() => setLoadingMap(false));

    fetch('http://localhost:3006/api/customers')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.customers)) {
          // Strictly filter for PPPoE customers only
          setCustomersList(data.customers.filter((c: any) => c.connection_type === 'pppoe' || !c.connection_type || c.connection_type === 'ftth'));
        }
      })
      .catch(err => console.error('Failed to fetch PPPoE customers list:', err));

    const fetchActiveUsers = () => {
      fetch('http://localhost:3006/api/routers/ppp-active-users')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.onlineUsernames)) {
            setOnlineUsernames(data.onlineUsernames);
          }
        })
        .catch(() => {});
    };

    fetchActiveUsers();
    const intervalId = setInterval(fetchActiveUsers, 15000);
    return () => clearInterval(intervalId);
  }, []);

  // Fetch Master Splitter Catalog from Database
  const reloadSplitterCatalog = async () => {
    try {
      const res = await fetch('/api/ftth/splitter-types');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSplitterCatalog(data.data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    reloadSplitterCatalog();
  }, []);

  // Helper: Check if Customer is Live ONLINE on Mikrotik
  const isCustomerOnline = (cust: any): boolean => {
    if (!cust) return false;
    const st = (cust.status || '').toLowerCase();
    if (st !== 'active') return false;
    if (!cust.pppoe_username) return false;
    return onlineUsernames.includes(cust.pppoe_username.trim().toLowerCase());
  };

  // Helper: Find Customer associated with a Node (by customerId or name/pppoe_username match)
  const getCustomerForNode = (node: NodeRecord) => {
    if (!node || customersList.length === 0) return null;
    if (node.customerId) {
      const found = customersList.find(c => String(c.id) === String(node.customerId));
      if (found) return found;
    }
    if (node.name) {
      const cleanName = node.name.toLowerCase().trim();
      const found = customersList.find(c => 
        (c.pppoe_username && c.pppoe_username.toLowerCase().trim() === cleanName) ||
        (c.name && c.name.toLowerCase().trim() === cleanName) ||
        (c.customer_code && c.customer_code.toLowerCase().trim() === cleanName)
      );
      if (found) return found;
    }
    return null;
  };

  // Helper: Trace parent ODP / Splitter for any node
  const getConnectedOdpInfo = (nodeId: string, visited = new Set<string>()): { odpName: string; odpId: string; port: number } | null => {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    const connectedCable = lines.find(l => l.toId === nodeId || l.fromId === nodeId);
    if (!connectedCable) return null;

    const otherNodeId = connectedCable.fromId === nodeId ? connectedCable.toId : connectedCable.fromId;
    const otherNode = nodes.find(n => n.id === otherNodeId);
    if (!otherNode) return null;

    if (otherNode.type === 'ODP' || otherNode.type === 'ODC' || otherNode.type === 'OLT' || otherNode.type === 'SPLITTER') {
      const portNum = connectedCable.fromId === otherNode.id ? (connectedCable.fromPort || 1) : (connectedCable.toPort || 1);
      return { odpName: otherNode.name || `${otherNode.type} #${otherNode.id.slice(-4)}`, odpId: otherNode.id, port: portNum };
    }

    return getConnectedOdpInfo(otherNode.id, visited);
  };

  // Helper: Trace full upstream tree from target node back to Root OLT
  const getUpstreamHierarchyTree = (nodeId: string, visited = new Set<string>()): NodeRecord[] => {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const currentNode = nodes.find(n => n.id === nodeId);
    if (!currentNode) return [];

    const connectedCable = lines.find(l => l.toId === nodeId || l.fromId === nodeId);
    if (!connectedCable) return [currentNode];

    const parentId = connectedCable.fromId === nodeId ? connectedCable.toId : connectedCable.fromId;
    const parentNode = nodes.find(n => n.id === parentId);
    if (!parentNode) return [currentNode];

    const parentTree = getUpstreamHierarchyTree(parentId, visited);
    return [...parentTree, currentNode];
  };

  // Helper: Build Full Hierarchical Path String (e.g. OLT1012-ODC01-ODP01)
  const buildFullHierarchyCode = (nodeId: string, formatStyle: 'dash' | 'slash' = 'dash'): string => {
    const tree = getUpstreamHierarchyTree(nodeId);
    if (tree.length === 0) return '';

    const parts = tree.map((node) => {
      let tag = node.code || node.name || '';
      tag = tag.replace(/^(node_)?(olt|odc|odp|splitter|sp|onu|ont|htb|switch|router)(\s|_|-|#)*/gi, '').replace(/^#\s*/, '').trim();
      if (!tag) tag = node.type;

      if (node.type === 'OLT') return tag.toUpperCase().startsWith('OLT') ? tag : `OLT${tag}`;
      if (node.type === 'ODC') return tag.toUpperCase().startsWith('ODC') ? tag : `ODC${tag}`;
      if (node.type === 'ODP') return tag.toUpperCase().startsWith('ODP') ? tag : `ODP${tag}`;
      if (node.type === 'SPLITTER') return tag.toUpperCase().startsWith('SP') ? tag : `SP${tag}`;
      if (node.type === 'ONU') return tag.toUpperCase().startsWith('ONU') ? tag : `ONU${tag}`;
      return `${node.type}${tag}`;
    });

    if (formatStyle === 'slash') {
      return tree.map(n => n.code || n.name || n.type).join(' ➔ ');
    }

    return parts.join('-');
  };

  // Helper: Build Alphanumeric Short Code for FTTH Nodes (Hemat Digit: e.g. A1-C01-P01)
  const buildAlphanumericShortCode = (nodeId: string): string => {
    const tree = getUpstreamHierarchyTree(nodeId);
    if (tree.length === 0) return '';

    const alphaParts = tree.map((node) => {
      const type = node.type;
      let tag = node.code || node.name || '';
      
      const cleanNumMatch = tag.match(/\d+/g);
      const num = cleanNumMatch && cleanNumMatch.length > 0
        ? cleanNumMatch[cleanNumMatch.length - 1].padStart(2, '0')
        : '01';

      if (type === 'OLT') {
        const oltIdx = nodes.filter(n => n.type === 'OLT').findIndex(n => n.id === node.id);
        const letter = String.fromCharCode(65 + Math.max(0, oltIdx >= 0 ? oltIdx : 0));
        return `${letter}${parseInt(num) || 1}`;
      }
      if (type === 'ODC') return `C${num}`;
      if (type === 'ODP') return `P${num}`;
      if (type === 'SPLITTER') return `S${num}`;
      if (type === 'ONU' || type === 'ROUTER_WIFI') return `U${num}`;
      return `${type.slice(0, 2)}${num}`;
    });

    return alphaParts.join('-');
  };

  // Helper: Build 2-Block Level Prefix Code (Format: [ParentBlock]-[ChildBlock], e.g. A01-B02, B02-C01, B02-BB01, C01-CC01)
  const build2BlockLevelCode = (nodeId: string): string => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return '';
    const type = targetNode.type;

    // 1. Root OLT (Level A)
    if (type === 'OLT') {
      const olts = nodes.filter(n => n.type === 'OLT');
      const idx = olts.findIndex(n => n.id === targetNode.id);
      const seq = String(idx >= 0 ? idx + 1 : olts.length + 1).padStart(2, '0');
      return `A${seq}`;
    }

    // Find upstream connected parent line
    const connLine = lines.find(l => l.toId === targetNode.id || l.fromId === targetNode.id);
    if (!connLine) {
      const sames = nodes.filter(n => n.type === type);
      const idx = sames.findIndex(n => n.id === targetNode.id);
      const seq = String(idx >= 0 ? idx + 1 : sames.length + 1).padStart(2, '0');
      const pfx = type === 'ODC' ? 'B' : type === 'ODP' ? 'C' : type === 'SPLITTER' ? 'S' : 'D';
      return `${pfx}${seq}`;
    }

    const pId = connLine.fromId === targetNode.id ? connLine.toId : connLine.fromId;
    const pNode = nodes.find(n => n.id === pId);
    
    // Extract Parent Block (e.g. "A01", "B02", "C01") from parent's code
    let parentBlock = 'A01';
    if (pNode) {
      if (pNode.code) {
        const codeParts = pNode.code.split('-');
        parentBlock = codeParts[codeParts.length - 1].trim();
      } else {
        const fullParentCode = build2BlockLevelCode(pNode.id);
        const parts = fullParentCode.split('-');
        parentBlock = parts[parts.length - 1].trim();
      }
    }

    // Count siblings of same type connected to same parent
    const sibLines = lines.filter(l => l.fromId === pId || l.toId === pId);
    const sibIds = sibLines.map(l => l.fromId === pId ? l.toId : l.fromId).filter(id => id !== targetNode.id);
    const sameSibs = nodes.filter(n => sibIds.includes(n.id) && n.type === type);
    const seqNum = sameSibs.length + 1;
    const seqStr = String(seqNum).padStart(2, '0');

    // Level Prefix: A=OLT, B=ODC, BB=Sub-ODC, C=ODP, CC=Sub-ODP, D=ONU/User
    let levelPrefix = 'C';
    const pType = pNode?.type || '';

    if (type === 'ODC') {
      levelPrefix = pType === 'ODC' ? 'BB' : 'B';
    } else if (type === 'ODP') {
      levelPrefix = pType === 'ODP' ? 'CC' : 'C';
    } else if (type === 'SPLITTER') {
      levelPrefix = pType === 'SPLITTER' ? 'SS' : 'S';
    } else if (type === 'ONU' || type === 'ROUTER_WIFI') {
      levelPrefix = 'D';
    } else {
      levelPrefix = type.slice(0, 1).toUpperCase();
    }

    const childBlock = `${levelPrefix}${seqStr}`;
    return `${parentBlock}-${childBlock}`;
  };

  // Helper: Check if Node / Customer is OFFLINE (Signal Loss / Disconnected on Mikrotik)
  const isNodeOffline = (node: NodeRecord): boolean => {
    if (!node) return false;
    const cust = getCustomerForNode(node);
    if (!cust) return false;
    return !isCustomerOnline(cust);
  };

  // SMART DIAGNOSTIC HELPER: Find all downstream ONU / Customer nodes connected to an ODP / ODC / Splitter
  const getDownstreamOnuNodesForOdp = (odpId: string): NodeRecord[] => {
    const connectedOnus: NodeRecord[] = [];
    const visited = new Set<string>([odpId]);
    const queue: string[] = [odpId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const connectedCables = lines.filter(l => l.fromId === currentId || l.toId === currentId);

      for (const c of connectedCables) {
        const nextId = c.fromId === currentId ? c.toId : c.fromId;
        if (!visited.has(nextId)) {
          visited.add(nextId);
          const nextNode = nodes.find(n => n.id === nextId);
          if (nextNode) {
            if (nextNode.type === 'ONU' || nextNode.type === 'ROUTER_WIFI' || nextNode.type === 'CLIENT_RJ45') {
              connectedOnus.push(nextNode);
            } else if (nextNode.type === 'SPLITTER' || nextNode.type === 'HTB' || nextNode.type === 'SWITCH') {
              queue.push(nextId);
            }
          }
        }
      }
    }
    return connectedOnus;
  };

  // SMART DIAGNOSTIC HELPER: Detect if Upstream Cable into ODP is CUT (100% downstream clients offline at once!)
  const checkOdpUpstreamCableCut = (odpNode: NodeRecord): { isUpstreamCut: boolean; totalClients: number; offlineClients: number } => {
    if (!odpNode || (odpNode.type !== 'ODP' && odpNode.type !== 'ODC' && odpNode.type !== 'SPLITTER')) {
      return { isUpstreamCut: false, totalClients: 0, offlineClients: 0 };
    }

    const downstreamOnus = getDownstreamOnuNodesForOdp(odpNode.id);
    if (downstreamOnus.length === 0) return { isUpstreamCut: false, totalClients: 0, offlineClients: 0 };

    const offlineCount = downstreamOnus.filter(n => isNodeOffline(n)).length;

    // Upstream Cable Cut Alert: At least 1 connected client AND 100% of connected clients are OFFLINE simultaneously!
    const isUpstreamCut = downstreamOnus.length > 0 && offlineCount === downstreamOnus.length;

    return { isUpstreamCut, totalClients: downstreamOnus.length, offlineClients: offlineCount };
  };

  // Handler to Save FTTH Topology to Backend Database (100% Serverless Cloud Firestore Native!)
  const handleSaveTopologyToDB = async (overrideNodes?: any, overrideLines?: any) => {
    setSaveLoading(true);
    try {
      // Safely ensure payloadNodes and payloadLines are Arrays
      const payloadNodes = Array.isArray(overrideNodes) ? overrideNodes : nodes;
      const payloadLines = Array.isArray(overrideLines) ? overrideLines : lines;

      // 1. Save directly to 100% Cloud Firebase Firestore Database
      await saveFtthMapToFirestore(payloadNodes, payloadLines);

      // 2. Synchronize customer GPS location in local database if available
      payloadNodes.forEach((n: any) => {
        if ((n.type === 'ONU' || n.type === 'ROUTER_WIFI') && n.customerId && n.lat && n.lng) {
          fetch(`http://localhost:3006/api/customers/${n.customerId}/location`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: n.lat,
              longitude: n.lng,
              maps_url: `https://www.google.com/maps?q=${n.lat},${n.lng}`
            })
          }).catch(() => {});
        }
      });

      // 3. Fallback save to local server if running locally
      fetch('http://localhost:3006/api/ftth/map/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: payloadNodes, lines: payloadLines })
      }).catch(() => {});

      setHasUnsavedChanges(false);
      setToastMsg({ text: `☁️ Topologi & Perangkat FTTH Berhasil Disimpan ke Firebase Cloud Firestore!`, type: 'success' });
    } catch (err: any) {
      setToastMsg({ text: `❌ Gagal menyimpan ke Firebase Cloud: ${err.message}`, type: 'info' });
    } finally {
      setSaveLoading(false);
    }
  };

  const [tempLineSelection, setTempLineSelection] = useState<string[]>([]);
  const tempLineSelectionRef = useRef<string[]>(tempLineSelection);
  tempLineSelectionRef.current = tempLineSelection;

  const currentModeRef = useRef<'view' | 'add_marker' | 'line' | 'waypoint'>(currentMode);
  currentModeRef.current = currentMode;

  const currentTypeRef = useRef<DeviceType>(currentType);
  currentTypeRef.current = currentType;

  const selectedLineForWaypointRef = useRef<string | null>(selectedLineForWaypoint);
  selectedLineForWaypointRef.current = selectedLineForWaypoint;

  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const config: Record<string, { color: string; iconSymbol: string; defaultCap: number; label: string }> = {
    'OLT': { color: '#e74c3c', iconSymbol: '🖥️', defaultCap: 32, label: 'OLT Server PON' },
    'ODC': { color: '#8e44ad', iconSymbol: '🏢', defaultCap: 16, label: 'ODC Cabinet FTTH' },
    'ODP': { color: '#2ecc71', iconSymbol: '🔲', defaultCap: 8, label: 'ODP Box FTTH' },
    'SPLITTER': { color: '#f39c12', iconSymbol: '🔀', defaultCap: 4, label: 'Splitter Fiber' },
    'ONU': { color: '#3498db', iconSymbol: '🏠', defaultCap: 1, label: 'ONU / ONT Pelanggan' },
    'HTB': { color: '#10b981', iconSymbol: '⚡', defaultCap: 6, label: 'HTB Media Converter (A/B)' },
    'SWITCH': { color: '#06b6d4', iconSymbol: '🔌', defaultCap: 8, label: 'Switch Hub LAN' },
    'ROUTER': { color: '#6366f1', iconSymbol: '📡', defaultCap: 5, label: 'Router Mikrotik' },
    'ROUTER_WIFI': { color: '#f59e0b', iconSymbol: '📶', defaultCap: 4, label: 'Router Wireless' },
    'ACCESS_POINT': { color: '#14b8a6', iconSymbol: '📡', defaultCap: 2, label: 'Access Point (AP)' }
  };

  // Connection Validation Helper (FTTH, HTB WDM A ↔ B, & UTP LAN RJ45)
  const isValidFtthConnection = (fromNode: NodeRecord, toNode: NodeRecord, fromPort?: number, toPort?: number): { valid: boolean; reason?: string } => {
    if (fromNode.id === toNode.id) return { valid: false, reason: 'Tidak dapat menghubungkan node ke dirinya sendiri!' };
    
    if (fromNode.type === 'CLIENT_RJ45') {
      return { valid: false, reason: `⚠️ Perangkat Pelanggan RJ45 (PC/Laptop) adalah perangkat penerima akhir, tidak dapat memancarkan kabel ke node lain.` };
    }

    // ONU Rules (Port 1 = Fiber PON Input, Port 2+ = Output LAN RJ45)
    if (fromNode.type === 'ONU') {
      if ((fromPort || 1) === 1) {
        return {
          valid: false,
          reason: `⚠️ Port #1 pada ONU Pelanggan adalah Port Fiber Optic PON (Input Optik) dari ODP/Splitter. Untuk mencolokkan LAN ke Router/HTB/Switch, gunakan Port LAN RJ45 (#2, #3, dst)!`
        };
      }

      if (toNode.type === 'HTB') {
        const toPA = toNode.portsA !== undefined ? toNode.portsA : 1;
        const toPB = toNode.portsB !== undefined ? toNode.portsB : 1;
        const isToFoPort = (toPort || 1) <= (toPA + toPB);

        if (isToFoPort) {
          return {
            valid: false,
            reason: `⚠️ Aturan Koneksi LAN ONU: Port LAN RJ45 pada ONU Pelanggan hanya dapat dicolokkan ke Port LAN RJ45 pada HTB, bukan ke Port Fiber Optic HTB!`
          };
        }
      }
    }

    // HTB Specific Real-World Networking Rules
    if (fromNode.type === 'HTB') {
      const pA = fromNode.portsA !== undefined ? fromNode.portsA : 1;
      const pB = fromNode.portsB !== undefined ? fromNode.portsB : 1;
      const isFromFoPort = (fromPort || 1) <= (pA + pB);

      if (isFromFoPort) {
        // FO Port of HTB can ONLY connect to another HTB
        if (toNode.type !== 'HTB') {
          return {
            valid: false,
            reason: `⚠️ Aturan Kabel FO HTB: Port Fiber Optic HTB hanya dapat terhubung ke sesama perangkat HTB! Tidak dapat dicolokkan ke jalur FTTH PON (${toNode.type}). Untuk menghubungkan HTB ke ONU atau Switch, gunakan Port LAN RJ45!`
          };
        }

        // Side A <-> Side B Transceiver Pairing Validation
        const isFromSideA = (fromPort || 1) <= pA;
        const toPA = toNode.portsA !== undefined ? toNode.portsA : 1;
        const isToSideA = (toPort || 1) <= toPA;

        if (isFromSideA && isToSideA) {
          return {
            valid: false,
            reason: `⚠️ Pemasangan Transceiver HTB Salah: Port Fiber WDM Side A (1310nm) harus dihubungkan ke Side B (1550nm) pada HTB pasangan. Tidak boleh A ➔ A!`
          };
        }

        if (!isFromSideA && !isToSideA) {
          return {
            valid: false,
            reason: `⚠️ Pemasangan Transceiver HTB Salah: Port Fiber WDM Side B (1550nm) harus dihubungkan ke Side A (1310nm) pada HTB pasangan. Tidak boleh B ➔ B!`
          };
        }
      }
    }

    // Standard PON & Ethernet Allowed Target Rules
    const allowedTargets: Record<string, string[]> = {
      'OLT': ['ODC', 'ODP', 'SPLITTER', 'ONU', 'HTB', 'SWITCH', 'ROUTER'],
      'ODC': ['ODP', 'SPLITTER', 'ONU', 'HTB', 'SWITCH'],
      'ODP': ['ONU', 'ODP', 'SPLITTER', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'SPLITTER': ['ONU', 'ODP', 'SPLITTER', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'ONU': ['HTB', 'ROUTER', 'SWITCH', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'HTB': ['HTB', 'SWITCH', 'ROUTER', 'ONU', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'SWITCH': ['SWITCH', 'ROUTER', 'HTB', 'ONU', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'ROUTER': ['ROUTER', 'SWITCH', 'HTB', 'OLT', 'ONU', 'ROUTER_WIFI', 'ACCESS_POINT'],
      'ROUTER_WIFI': ['ROUTER_WIFI', 'ACCESS_POINT', 'SWITCH', 'HTB'],
      'ACCESS_POINT': ['ACCESS_POINT', 'ROUTER_WIFI', 'SWITCH']
    };

    const allowed = allowedTargets[fromNode.type] || [];
    if (!allowed.includes(toNode.type)) {
      return { 
        valid: false, 
        reason: `⚠️ Perangkat ${fromNode.type} tidak dapat dicolokkan ke ${toNode.type}. Perangkat yang didukung: ${allowed.join(' / ')}.` 
      };
    }

    return { valid: true };
  };

  // Geodesic Haversine Distance Calculation Helper (Exact Meter & Kilometer Cable Measurement)
  const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Radius of Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getCableLengthMeters = (fromNode: NodeRecord, toNode: NodeRecord, waypoints?: Array<[number, number]>): number => {
    const points: Array<[number, number]> = [
      [fromNode.lat, fromNode.lng],
      ...(waypoints || []),
      [toNode.lat, toNode.lng]
    ];

    let totalMeters = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalMeters += calculateDistanceMeters(points[i][0], points[i][1], points[i+1][0], points[i+1][1]);
    }
    return totalMeters;
  };

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km (${Math.round(meters)} m)`;
    }
    return `${Math.round(meters)} m`;
  };

  // Helper: Calculate Splitter Loss in dB (supporting database dynamic catalog, PLC symmetric, ratio asymmetric, and hybrid tap splitters)
  const getSplitterLossDb = (ratio: string | undefined, cap: number, portNum: number = 1): number => {
    if (!ratio) return 10.5;

    // Check dynamic master catalog from DB
    const catMatch = splitterCatalog.find(s => s.ratioCode === ratio || s.name === ratio);
    if (catMatch) {
      return portNum === 1 ? Number(catMatch.passLossDb) : Number(catMatch.dropLossDb);
    }

    if (ratio === '1:2') return 3.5;
    if (ratio === '1:4') return 7.2;
    if (ratio === '1:8') return 10.5;
    if (ratio === '1:16') return 13.8;
    if (ratio === '1:32') return 17.0;

    // Asymmetric Splitters Loss by Port:
    // Port #1: Pass-Through Branch (Major Power continuation to next ODP/cascading)
    // Port #2: Local Drop Branch (Minor Power to local ODP/customers)
    if (ratio === '90:10') return portNum === 1 ? 0.8 : 10.8;
    if (ratio === '80:20') return portNum === 1 ? 1.4 : 7.6;
    if (ratio === '70:30') return portNum === 1 ? 2.0 : 5.8;
    if (ratio === '60:40') return portNum === 1 ? 2.8 : 4.5;
    if (ratio === '50:50') return 3.5;

    // Hybrid Ratio + Distribution Splitter (Tembak Jalur Tengah Jalan):
    // Port #1: Pass Feeder Continuation (Pass % Loss)
    // Port #2 s/d #N: Local Distribution Drop Ports (Drop % Loss + Sub PLC Splitter Loss)
    if (ratio?.startsWith('90:10 + 1:')) {
      const subCap = parseInt(ratio.split('1:')[1]) || 8;
      const plcLoss = subCap === 4 ? 7.2 : (subCap === 8 ? 10.5 : (subCap === 16 ? 13.8 : 7.2));
      return portNum === 1 ? 0.8 : (10.8 + plcLoss);
    }
    if (ratio?.startsWith('80:20 + 1:')) {
      const subCap = parseInt(ratio.split('1:')[1]) || 8;
      const plcLoss = subCap === 4 ? 7.2 : (subCap === 8 ? 10.5 : (subCap === 16 ? 13.8 : 7.2));
      return portNum === 1 ? 1.4 : (7.6 + plcLoss);
    }
    if (ratio?.startsWith('70:30 + 1:')) {
      const subCap = parseInt(ratio.split('1:')[1]) || 8;
      const plcLoss = subCap === 4 ? 7.2 : (subCap === 8 ? 10.5 : (subCap === 16 ? 13.8 : 7.2));
      return portNum === 1 ? 2.0 : (5.8 + plcLoss);
    }
    if (ratio?.startsWith('60:40 + 1:')) {
      const subCap = parseInt(ratio.split('1:')[1]) || 8;
      const plcLoss = subCap === 4 ? 7.2 : (subCap === 8 ? 10.5 : (subCap === 16 ? 13.8 : 7.2));
      return portNum === 1 ? 2.8 : (4.5 + plcLoss);
    }
    if (ratio?.startsWith('50:50 + 1:')) {
      const subCap = parseInt(ratio.split('1:')[1]) || 8;
      const plcLoss = subCap === 4 ? 7.2 : (subCap === 8 ? 10.5 : (subCap === 16 ? 13.8 : 7.2));
      return portNum === 1 ? 3.5 : (3.5 + plcLoss);
    }

    if (cap === 2) return 3.5;
    if (cap === 4) return 7.2;
    if (cap === 8) return 10.5;
    if (cap === 16) return 13.8;
    if (cap === 32) return 17.0;
    return 10.5;
  };

  // Helper: Recursive Optical Power Budget Calculation (dBm)
  const calculateNodeOpticalPower = (nodeId: string, visited = new Set<string>()): { inputPower: number; outputPower: number; lossDb: number; cableLengthM: number; upstreamName: string } => {
    if (visited.has(nodeId)) return { inputPower: 0, outputPower: 0, lossDb: 0, cableLengthM: 0, upstreamName: '-' };
    visited.add(nodeId);

    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return { inputPower: 0, outputPower: 0, lossDb: 0, cableLengthM: 0, upstreamName: '-' };

    if (targetNode.type === 'OLT') {
      const defaultPower = targetNode.outputPower !== undefined ? targetNode.outputPower : 9.0;
      return { inputPower: defaultPower, outputPower: defaultPower, lossDb: 0, cableLengthM: 0, upstreamName: targetNode.name || 'OLT' };
    }

    // Find line coming into this node
    const incomingLine = lines.find(l => l.toId === nodeId || l.fromId === nodeId);
    if (!incomingLine) {
      return { inputPower: 0, outputPower: 0, lossDb: 0, cableLengthM: 0, upstreamName: '-' };
    }

    const parentId = incomingLine.toId === nodeId ? incomingLine.fromId : incomingLine.toId;
    const parentNode = nodes.find(n => n.id === parentId);
    if (!parentNode) return { inputPower: 0, outputPower: 0, lossDb: 0, cableLengthM: 0, upstreamName: '-' };

    const parentRes = calculateNodeOpticalPower(parentNode.id, visited);
    const parentPort = incomingLine.toId === nodeId ? (incomingLine.fromPort || 1) : (incomingLine.toPort || 1);

    // Check if incoming line is mapped as a Pass-Through / Bypass core from parent node
    const parentCableSplicing = incomingLine.coreSplicingMap || {};
    const isBypassCable = Object.values(parentCableSplicing).some((c: any) => c?.action === 'BYPASS_PASS' || c?.action === 'BYPASS' || c?.action === 'BYPASS_PASS_THROUGH');

    let parentTxPower = isBypassCable ? (parentRes.inputPower - 0.1) : parentRes.outputPower;
    if (parentNode.type === 'OLT') {
      const sfpPowers = parentNode.sfpPowerList || [];
      if (sfpPowers[parentPort - 1] !== undefined) {
        parentTxPower = sfpPowers[parentPort - 1];
      } else {
        parentTxPower = parentNode.outputPower !== undefined ? parentNode.outputPower : 9.0;
      }
    } else if (!isBypassCable && parentNode.splitterRatio && parentNode.splitterRatio.includes(':') && !parentNode.splitterRatio.startsWith('1:')) {
      // Asymmetric Splitter Parent (e.g. 90:10, 80:20, 70:30, 60:40, 50:50)
      const portLoss = getSplitterLossDb(parentNode.splitterRatio, parentNode.splitterCapacity || 2, parentPort);
      parentTxPower = parentRes.inputPower - portLoss;
    }

    const cableMeters = getCableLengthMeters(parentNode, targetNode, incomingLine.waypoints);
    const cableLossDb = (cableMeters / 1000) * 0.35 + 0.2; // 0.35 dB/km + 0.2 dB splice
    const inputPowerAtNode = parentTxPower - cableLossDb;

    const splitterLoss = getSplitterLossDb(targetNode.splitterRatio, targetNode.splitterCapacity || 8, 1);
    const outputPowerAtNode = targetNode.type === 'ONU' || targetNode.type === 'ROUTER_WIFI' || targetNode.type === 'CLIENT_RJ45' 
      ? inputPowerAtNode 
      : (inputPowerAtNode - splitterLoss);

    return {
      inputPower: Number(inputPowerAtNode.toFixed(2)),
      outputPower: Number(outputPowerAtNode.toFixed(2)),
      lossDb: Number((cableLossDb + splitterLoss).toFixed(2)),
      cableLengthM: cableMeters,
      upstreamName: parentNode.name || parentNode.type
    };
  };

  // Real-Time Network Cable Distance Statistics (Feeder, Distribution, Drop Core, HTB FO, LAN)
  const networkDistanceStats = useMemo(() => {
    let totalMeters = 0;
    let feederMeters = 0;
    let distMeters = 0;
    let dropMeters = 0;
    let htbMeters = 0;
    let lanMeters = 0;
    let otherMeters = 0;

    lines.forEach((l) => {
      const fromNode = nodes.find(n => n.id === l.fromId);
      const toNode = nodes.find(n => n.id === l.toId);
      if (fromNode && toNode) {
        const len = getCableLengthMeters(fromNode, toNode, l.waypoints);
        totalMeters += len;

        if (fromNode.type === 'HTB' || toNode.type === 'HTB') {
          htbMeters += len;
        } else if (fromNode.type === 'SWITCH' || fromNode.type === 'ROUTER' || toNode.type === 'CLIENT_RJ45') {
          lanMeters += len;
        } else if (fromNode.type === 'OLT') {
          feederMeters += len;
        } else if (fromNode.type === 'ODC') {
          distMeters += len;
        } else if (toNode.type === 'ONU') {
          dropMeters += len;
        } else {
          otherMeters += len;
        }
      }
    });

    return { totalMeters, feederMeters, distMeters, dropMeters, htbMeters, lanMeters, otherMeters };
  }, [nodes, lines]);

  // Real-Time Smart Diagnostic: Active ODPs with 100% downstream clients offline simultaneously (Upstream Cable Cut)
  const upstreamCutOdps = useMemo(() => {
    return nodes.filter(n => (n.type === 'ODP' || n.type === 'ODC' || n.type === 'SPLITTER') && checkOdpUpstreamCableCut(n).isUpstreamCut);
  }, [nodes, lines, onlineUsernames, customersList]);

  // Helper to calculate used & remaining ports for a node (separating IN vs OUT ports for ODP/ODC/SPLITTER)
  const getNodePortStats = (nodeId: string, capacity: number = 8) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    const isSplitterNode = targetNode && (targetNode.type === 'ODP' || targetNode.type === 'ODC' || targetNode.type === 'SPLITTER');

    const connectedLines = lines.filter(l => l.fromId === nodeId || l.toId === nodeId);
    const portMap = new Map<number, { lineId: string; targetNode?: NodeRecord }>();
    let incomingInputNode: NodeRecord | undefined = undefined;

    connectedLines.forEach(l => {
      if (l.toId === nodeId) {
        const sourceNode = nodes.find(n => n.id === l.fromId);
        if (isSplitterNode) {
          // For ODP/ODC/SPLITTER, incoming cable connects to PORT IN (Input Optik), not OUT port #1
          incomingInputNode = sourceNode;
        } else if (l.toPort) {
          portMap.set(l.toPort, { lineId: l.id, targetNode: sourceNode });
        }
      } else if (l.fromId === nodeId && l.fromPort) {
        const targetN = nodes.find(n => n.id === l.toId);
        portMap.set(l.fromPort, { lineId: l.id, targetNode: targetN });
      }
    });

    const usedPortsCount = portMap.size;
    const remainingPortsCount = Math.max(capacity - usedPortsCount, 0);

    return { usedPortsCount, remainingPortsCount, portMap, incomingInputNode };
  };

  // Safety Helper: Verify if downgrading node/splitter capacity would orphan active connected cables
  const validateCapacityDowngrade = (nodeId: string, newCapacity: number) => {
    const activeLines = lines.filter(l => 
      (l.fromId === nodeId && (l.fromPort || 1) > newCapacity) ||
      (l.toId === nodeId && (l.toPort || 1) > newCapacity)
    );

    if (activeLines.length === 0) {
      return { allowed: true, blockingPorts: [], blockingNodeNames: [] };
    }

    const blockingPorts = activeLines.map(l => l.fromId === nodeId ? (l.fromPort || 1) : (l.toPort || 1));
    const blockingNodeNames = activeLines.map(l => {
      const otherId = l.fromId === nodeId ? l.toId : l.fromId;
      const otherNode = nodes.find(n => n.id === otherId);
      return otherNode ? (otherNode.name || otherNode.type) : 'Perangkat Terhubung';
    });

    return { allowed: false, blockingPorts, blockingNodeNames };
  };

  // Smart Port Pairing Helper (Auto Pairs Side A ➔ Side B for HTB to HTB Connections)
  const getSmartPortPairing = (fromNodeObj: NodeRecord, toNodeObj: NodeRecord) => {
    const fromCap = fromNodeObj.splitterCapacity || config[fromNodeObj.type]?.defaultCap || 8;
    const { portMap: fromPortMap } = getNodePortStats(fromNodeObj.id, fromCap);

    let nextPort = 1;
    while (fromPortMap.has(nextPort) && nextPort < fromCap) {
      nextPort++;
    }

    const toCap = toNodeObj.splitterCapacity || config[toNodeObj.type]?.defaultCap || 8;
    const { portMap: toPortMap } = getNodePortStats(toNodeObj.id, toCap);

    let nextToPort = 1;

    // Smart pairing for HTB -> HTB connections
    if (fromNodeObj.type === 'HTB' && toNodeObj.type === 'HTB') {
      const fromPA = fromNodeObj.portsA !== undefined ? fromNodeObj.portsA : 1;
      const fromPB = fromNodeObj.portsB !== undefined ? fromNodeObj.portsB : 1;

      const toPA = toNodeObj.portsA !== undefined ? toNodeObj.portsA : 1;
      const toPB = toNodeObj.portsB !== undefined ? toNodeObj.portsB : 1;

      if (nextPort <= fromPA) {
        // Source is Side A (1310nm). Target MUST be Side B (1550nm)!
        let foundSideB = toPA + 1;
        while (toPortMap.has(foundSideB) && foundSideB <= toPA + toPB) {
          foundSideB++;
        }
        if (foundSideB <= toPA + toPB) {
          nextToPort = foundSideB;
        } else {
          nextToPort = 1;
          while (toPortMap.has(nextToPort) && nextToPort < toCap) {
            nextToPort++;
          }
        }
      } else if (nextPort <= fromPA + fromPB) {
        // Source is Side B (1550nm). Target MUST be Side A (1310nm)!
        let foundSideA = 1;
        while (toPortMap.has(foundSideA) && foundSideA <= toPA) {
          foundSideA++;
        }
        if (foundSideA <= toPA) {
          nextToPort = foundSideA;
        } else {
          nextToPort = 1;
          while (toPortMap.has(nextToPort) && nextToPort < toCap) {
            nextToPort++;
          }
        }
      } else {
        // Source is LAN RJ45. Target should be LAN RJ45 on target HTB!
        let foundLan = toPA + toPB + 1;
        while (toPortMap.has(foundLan) && foundLan <= toCap) {
          foundLan++;
        }
        if (foundLan <= toCap) {
          nextToPort = foundLan;
        }
      }
    } else if (fromNodeObj.type === 'ONU') {
      // ONU Output cables MUST use LAN ports (Port 2 onwards, skipping Port 1 PON FO Input)
      let foundLan = 2;
      while (fromPortMap.has(foundLan) && foundLan <= fromCap) {
        foundLan++;
      }
      nextPort = foundLan;

      if (toNodeObj.type === 'HTB') {
        const toPA = toNodeObj.portsA !== undefined ? toNodeObj.portsA : 1;
        const toPB = toNodeObj.portsB !== undefined ? toNodeObj.portsB : 1;
        let targetLan = toPA + toPB + 1;
        while (toPortMap.has(targetLan) && targetLan <= toCap) {
          targetLan++;
        }
        if (targetLan <= toCap) nextToPort = targetLan;
      } else if (toNodeObj.type === 'SWITCH' || toNodeObj.type === 'ROUTER') {
        const toSfp = toNodeObj.portsSfp !== undefined ? toNodeObj.portsSfp : (toNodeObj.type === 'ROUTER' ? 1 : 2);
        let targetLan = toSfp + 1;
        while (toPortMap.has(targetLan) && targetLan <= toCap) {
          targetLan++;
        }
        if (targetLan <= toCap) nextToPort = targetLan;
      }
    } else if (toNodeObj.type === 'ONU') {
      // ODP or Splitter connecting to ONU MUST target Port 1 (Fiber PON Input Optik)
      nextToPort = 1;
    } else {
      // Non-HTB / Standard PON connections
      while (toPortMap.has(nextToPort) && nextToPort < toCap) {
        nextToPort++;
      }
    }

    return { nextPort, nextToPort };
  };

  // OTDR Fiber Break Geodesic Interpolation Helper
  const getOtdrBreakCoordinate = (
    fromNode: NodeRecord,
    toNode: NodeRecord,
    waypoints: Array<[number, number]> | undefined,
    otdrDistanceMeters: number,
    fromDirection: 'from' | 'to' = 'from'
  ) => {
    let rawPoints: Array<[number, number]> = [
      [fromNode.lat, fromNode.lng],
      ...(waypoints || []),
      [toNode.lat, toNode.lng]
    ];

    if (fromDirection === 'to') {
      rawPoints = [...rawPoints].reverse();
    }

    let accumulatedMeters = 0;
    const targetMeters = Math.max(0, otdrDistanceMeters);

    for (let i = 0; i < rawPoints.length - 1; i++) {
      const p1 = rawPoints[i];
      const p2 = rawPoints[i + 1];
      const segLen = calculateDistanceMeters(p1[0], p1[1], p2[0], p2[1]);

      if (accumulatedMeters + segLen >= targetMeters) {
        const remainingInSeg = targetMeters - accumulatedMeters;
        const fraction = segLen > 0 ? remainingInSeg / segLen : 0;

        const lat = p1[0] + fraction * (p2[0] - p1[0]);
        const lng = p1[1] + fraction * (p2[1] - p1[1]);

        return {
          lat,
          lng,
          actualMeters: targetMeters
        };
      }
      accumulatedMeters += segLen;
    }

    // Distance exceeds total cable length, cap at endpoint
    const lastP = rawPoints[rawPoints.length - 1];
    return {
      lat: lastP[0],
      lng: lastP[1],
      actualMeters: accumulatedMeters
    };
  };

  // Helper: Trace complete continuous physical fiber core path across spliced / bypassed cables
  const getSplicedFiberCorePath = (
    initialLineId: string,
    selectedCoreNum: number,
    originNodeId: string
  ): { segments: Array<{ line: LineRecord; fromNode: NodeRecord; toNode: NodeRecord; lengthM: number; coreNum: number }>; totalLengthM: number } => {
    const segments: Array<{ line: LineRecord; fromNode: NodeRecord; toNode: NodeRecord; lengthM: number; coreNum: number }> = [];
    let totalLengthM = 0;
    const visitedLineIds = new Set<string>();

    let currentLineId = initialLineId;
    let currentCoreNum = selectedCoreNum;
    let currentOriginId = originNodeId;

    while (currentLineId && !visitedLineIds.has(currentLineId)) {
      visitedLineIds.add(currentLineId);

      const line = lines.find(l => l.id === currentLineId);
      if (!line) break;

      const fromN = nodes.find(n => n.id === line.fromId);
      const toN = nodes.find(n => n.id === line.toId);
      if (!fromN || !toN) break;

      const segLen = getCableLengthMeters(fromN, toN, line.waypoints);
      totalLengthM += segLen;

      segments.push({
        line,
        fromNode: fromN,
        toNode: toN,
        lengthM: segLen,
        coreNum: currentCoreNum
      });

      const destinationNodeId = line.fromId === currentOriginId ? line.toId : line.fromId;

      // Check if current core has explicit SPLICING / BYPASS configuration in coreSplicingMap
      const splicingMap = line.coreSplicingMap || {};
      const coreMap = splicingMap[currentCoreNum] || splicingMap[String(currentCoreNum)] || {};
      const action = coreMap.action || (currentCoreNum === 1 ? 'INPUT_SPLITTER' : 'BYPASS_PASS');

      // PHYSICAL SPLICING RULE: If core status is IN Splitter ODP / SPARE / TERMINATED, IT STOPS AT THIS BOX!
      if (action === 'INPUT_SPLITTER' || action === 'IN_SPLITTER' || action === 'SPARE' || action === 'NONE' || action === 'TERMINATED') {
        // Core terminates at local splitter input. STOP HERE!
        break;
      }

      let nextLine: LineRecord | undefined = undefined;
      let nextCoreNum = currentCoreNum;

      if (action === 'BYPASS_PASS' || action === 'BYPASS' || coreMap.targetLineId || coreMap.targetCableId) {
        const targetId = coreMap.targetLineId || coreMap.targetCableId;
        if (targetId) {
          nextLine = lines.find(l => l.id === targetId && !visitedLineIds.has(l.id));
        }
        if (coreMap.targetCoreNumber || coreMap.targetCore) {
          nextCoreNum = Number(coreMap.targetCoreNumber || coreMap.targetCore);
        }
      }

      if (nextLine) {
        currentLineId = nextLine.id;
        currentCoreNum = nextCoreNum;
        currentOriginId = destinationNodeId;
      } else {
        break;
      }
    }

    return { segments, totalLengthM };
  };

  // Multi-Segment Cascaded OTDR Fiber Fault Locator Helper (Traces OTDR distance continuously across downstream ODP/ODC/Splitter nodes!)
  const getCascadedOtdrBreakCoordinate = (
    originNodeId: string,
    initialLineId: string,
    targetMeters: number,
    selectedCoreNum: number = 1
  ) => {
    const splicedInfo = getSplicedFiberCorePath(initialLineId, selectedCoreNum, originNodeId);
    if (splicedInfo.segments.length === 0) return null;

    let remainingMeters = Math.max(0, targetMeters);
    let accumulatedTotalMeters = 0;
    const nodesPassed: string[] = [];

    for (let i = 0; i < splicedInfo.segments.length; i++) {
      const seg = splicedInfo.segments[i];
      const fromN = seg.fromNode;
      const toN = seg.toNode;
      const lineLenM = seg.lengthM;

      if (i === 0) nodesPassed.push(fromN.code || fromN.name || fromN.type);
      nodesPassed.push(toN.code || toN.name || toN.type);

      if (remainingMeters <= lineLenM || i === splicedInfo.segments.length - 1) {
        const actualTargetInSeg = Math.min(remainingMeters, lineLenM);
        const breakRes = getOtdrBreakCoordinate(fromN, toN, seg.line.waypoints, actualTargetInSeg, 'from');

        const fromName = fromN.name || fromN.type;
        const toName = toN.name || toN.type;

        return {
          lat: breakRes.lat,
          lng: breakRes.lng,
          targetMeters,
          actualMeters: accumulatedTotalMeters + breakRes.actualMeters,
          totalSplicedMeters: splicedInfo.totalLengthM,
          breakLineId: seg.line.id,
          breakLineName: `Ruas Kabel ${fromName} ➔ ${toName} (Core #${seg.coreNum})`,
          fromNodeName: fromName,
          toNodeName: toName,
          distanceInBreakLineM: breakRes.actualMeters,
          nodesPassed
        };
      }

      accumulatedTotalMeters += lineLenM;
      remainingMeters -= lineLenM;
    }

    return null;
  };

  // Initialize Leaflet Map ONCE
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = profile?.mapLat !== undefined ? Number(profile.mapLat) : -7.2585;
    const initialLng = profile?.mapLng !== undefined ? Number(profile.mapLng) : 112.7550;
    const initialZoom = profile?.mapZoom !== undefined ? Number(profile.mapZoom) : 16;

    const leafletMap = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom
    });

    leafletMap.on('zoomend', () => {
      setZoomLevel(leafletMap.getZoom());
    });

    const tileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: 'Google Hybrid Satelit & FTTH Builder (Laravel)'
    }).addTo(leafletMap);
    tileLayerRef.current = tileLayer;

    const layerGroup = L.layerGroup().addTo(leafletMap);
    layerGroupRef.current = layerGroup;
    mapRef.current = leafletMap;

    leafletMap.on('click', (e: L.LeafletMouseEvent) => {
      // ONLY add marker when explicitly in 'add_marker' mode
      if (currentModeRef.current === 'add_marker') {
        const newId = `node_${currentTypeRef.current.toLowerCase()}_${Date.now()}`;
        const defaultCap = config[currentTypeRef.current].defaultCap;
        const newNode: NodeRecord = {
          id: newId,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          type: currentTypeRef.current,
          name: `${currentTypeRef.current} #${newId.slice(-4)}`,
          splitterCapacity: defaultCap
        };
        setNodes(prev => [...prev, newNode]);
        setHasUnsavedChanges(true);
        setToastMsg({ text: `📍 Node ${newNode.type} (${newNode.name}) Berhasil Ditambahkan!`, type: 'success' });
        // Automatically switch back to view mode after adding node
        setCurrentMode('view');
      } else if (currentModeRef.current === 'waypoint' && selectedLineForWaypointRef.current) {
        const targetLineId = selectedLineForWaypointRef.current;
        const newWp: [number, number] = [e.latlng.lat, e.latlng.lng];
        setLines(prev => prev.map(item => {
          if (item.id === targetLineId) {
            const currentWps = item.waypoints || [];
            return { ...item, waypoints: [...currentWps, newWp] };
          }
          return item;
        }));
        setHasUnsavedChanges(true);
      }
    });

    return () => {
      leafletMap.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Tile Layer URL on mapStyle change
  useEffect(() => {
    if (!tileLayerRef.current) return;
    let tileUrl = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    if (mapStyle === 'google_streets') {
      tileUrl = 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    } else if (mapStyle === 'street') {
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    } else if (mapStyle === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (mapStyle === 'dark') {
      tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    }
    tileLayerRef.current.setUrl(tileUrl);
  }, [mapStyle]);

  // Update Markers, Lines & Draggable Waypoints on map when state changes
  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    // Render Markers
    nodes.forEach((n) => {
      // Progressive Level of Detail (LOD) Filtering for Scale (Ratusan Ribu Node)
      if (enableLodFilter) {
        if (zoomLevel < 14 && (n.type !== 'OLT' && n.type !== 'ODC')) {
          return; // Far Zoom Out (City Level): Render ONLY OLT & ODC Core Hubs
        }
        if (zoomLevel < 16 && (n.type === 'ONU' || n.type === 'ROUTER_WIFI' || n.type === 'CLIENT_RJ45')) {
          return; // District Level Zoom: Hide individual customer ONUs
        }
      }

      const cfg = config[n.type];
      const isSelectedFirst = tempLineSelection.includes(n.id);
      const cap = n.type === 'ONU' 
        ? (n.portsLan || n.splitterCapacity || cfg.defaultCap)
        : n.type === 'HTB'
        ? ((n.portsA || 1) + (n.portsB || 1) + (n.portsLan || 4))
        : (n.type === 'SWITCH' || n.type === 'ROUTER')
        ? ((n.portsSfp || 0) + (n.portsLan || 4))
        : (n.splitterCapacity || cfg.defaultCap);
      const { usedPortsCount, remainingPortsCount } = getNodePortStats(n.id, cap);
      
      const cust = getCustomerForNode(n);
      const connectedOdp = getConnectedOdpInfo(n.id);
      const offline = isNodeOffline(n);
      const odpDiagnostic = checkOdpUpstreamCableCut(n);

      let statusBadgeHtml = cust ? (
        offline
          ? '<div style="position:absolute; top:-10px; right:-12px; background:#ef4444; color:white; font-size:7px; font-weight:900; padding:1px 4px; border-radius:4px; box-shadow:0 0 10px #ef4444; border:1px solid white; line-height:1; z-index:20;">OFFLINE</div>'
          : '<div style="position:absolute; top:-10px; right:-12px; background:#10b981; color:white; font-size:7px; font-weight:900; padding:1px 4px; border-radius:4px; border:1px solid white; line-height:1; z-index:20;">ONLINE</div>'
      ) : '';

      if (odpDiagnostic.isUpstreamCut) {
        statusBadgeHtml = '<div style="position:absolute; top:-12px; right:-14px; background:#dc2626; color:white; font-size:7.5px; font-weight:900; padding:2px 5px; border-radius:6px; box-shadow:0 0 14px #dc2626; border:1.5px solid white; line-height:1; z-index:20; animate:pulse 1s infinite;">🚨 ATAS PUTUS</div>';
      }

      const isBlinkingNode = offline || odpDiagnostic.isUpstreamCut;

      // ONU/HTB/SWITCH/ROUTER: show used/total ports; ODP/SPLITTER: show used/1:cap
      const markerLabel = (n.type === 'ODP' || n.type === 'SPLITTER' || n.type === 'ODC') 
        ? `${usedPortsCount}/1:${cap}` 
        : `${usedPortsCount}/${cap}`;

      const nodeIcon = L.divIcon({
        className: '',
        html: `<div class="laravel-node-icon ${isBlinkingNode ? 'node-offline-blinking' : ''}" style="background:${isBlinkingNode ? '#dc2626' : cfg.color}; width:34px; height:34px; font-size:14px; border: ${isSelectedFirst ? '3px solid black' : '2px solid white'}; cursor:pointer; flex-direction:column; position:relative;">
                ${statusBadgeHtml}
                <div>${cfg.iconSymbol}</div>
                <div style="font-size:7.5px; line-height:1; font-family:monospace; margin-top:-2px;">${markerLabel}</div>
               </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const m = L.marker([n.lat, n.lng], { icon: nodeIcon, draggable: true }).addTo(layerGroup);
      
      const nodeOptPower = calculateNodeOpticalPower(n.id);
      let powerHtml = '';
      if (nodeOptPower.inputPower !== 0 || nodeOptPower.outputPower !== 0) {
        const ratio = n.splitterRatio;
        const isAsymmetric = ratio && ratio.includes(':') && !ratio.startsWith('1:');

        if (isAsymmetric) {
          // Asymmetric Ratio Splitter (e.g. 90:10, 80:20, 70:30, 60:40, 50:50) -> Show 2 Output Powers!
          const p1Loss = getSplitterLossDb(ratio, cap, 1);
          const p2Loss = getSplitterLossDb(ratio, cap, 2);
          const p1Tx = Number((nodeOptPower.inputPower - p1Loss).toFixed(2));
          const p2Tx = Number((nodeOptPower.inputPower - p2Loss).toFixed(2));

          let p1Desc = 'Pass 90%';
          let p2Desc = 'Drop 10%';
          if (ratio === '80:20') { p1Desc = 'Pass 80%'; p2Desc = 'Drop 20%'; }
          else if (ratio === '70:30') { p1Desc = 'Pass 70%'; p2Desc = 'Drop 30%'; }
          else if (ratio === '60:40') { p1Desc = 'Pass 60%'; p2Desc = 'Drop 40%'; }
          else if (ratio === '50:50') { p1Desc = 'Equal 50%'; p2Desc = 'Equal 50%'; }

          powerHtml = `
            <div style="background:#eff6ff; padding:6px 8px; border-radius:10px; border:1px solid #bfdbfe; margin:5px 0; font-size:10.5px; line-height:1.4;">
              <div style="font-weight:800; color:#1e3a8a; margin-bottom:2px;">⚡ Daya Masuk (Rx In): <span style="font-family:monospace; color:#0284c7;">${nodeOptPower.inputPower > 0 ? `+${nodeOptPower.inputPower}` : nodeOptPower.inputPower} dBm</span></div>
              <div style="font-weight:800; color:#065f46;">⚡ Out Tx Port #1 (${p1Desc}): <span style="font-family:monospace; color:#059669;">${p1Tx > 0 ? `+${p1Tx}` : p1Tx} dBm</span></div>
              <div style="font-weight:800; color:#92400e;">⚡ Out Tx Port #2 (${p2Desc}): <span style="font-family:monospace; color:#d97706;">${p2Tx > 0 ? `+${p2Tx}` : p2Tx} dBm</span></div>
            </div>
          `;
        } else {
          // Symmetric PLC Splitter (1:2, 1:4, 1:8, 1:16, 1:32) -> Show 1 Output Power!
          powerHtml = `
            <div style="background:#eff6ff; padding:6px 8px; border-radius:10px; border:1px solid #bfdbfe; margin:5px 0; font-size:10.5px; line-height:1.4;">
              <div style="font-weight:800; color:#1e3a8a; margin-bottom:2px;">⚡ Daya Masuk (Rx In): <span style="font-family:monospace; color:#0284c7;">${nodeOptPower.inputPower > 0 ? `+${nodeOptPower.inputPower}` : nodeOptPower.inputPower} dBm</span></div>
              <div style="font-weight:800; color:#1e40af;">⚡ Power Keluar per Port (Out Tx): <span style="font-family:monospace; color:#2563eb;">${nodeOptPower.outputPower > 0 ? `+${nodeOptPower.outputPower}` : nodeOptPower.outputPower} dBm</span> <span style="font-size:9px; color:#64748b;">(Tiap Port 1:${cap})</span></div>
            </div>
          `;
        }
      }

      let coreSplicingHtml = '';
      if ((n.type === 'ODP' || n.type === 'ODC' || n.type === 'SPLITTER') && (n.totalCableCores || n.coreSplicingMap)) {
        const totalC = n.totalCableCores || 4;
        const mapC = n.coreSplicingMap || { 1: { action: 'INPUT_SPLITTER' } };
        const standard12Names = ['Biru', 'Oranye', 'Hijau', 'Cokelat', 'Abu-abu', 'Putih', 'Merah', 'Hitam', 'Kuning', 'Ungu', 'Pink', 'Toska'];
        
        const inList: string[] = [];
        const bypassList: string[] = [];
        const spareList: string[] = [];

        for (let c = 1; c <= totalC; c++) {
          const name = standard12Names[(c - 1) % 12];
          const act = mapC[c]?.action || (c === 1 ? 'INPUT_SPLITTER' : 'BYPASS_PASS');
          if (act === 'INPUT_SPLITTER') inList.push(`C#${c} (${name})`);
          else if (act === 'BYPASS_PASS') bypassList.push(`C#${c} (${name})`);
          else spareList.push(`C#${c} (${name})`);
        }

        coreSplicingHtml = `
          <div style="background:#f8fafc; padding:6px; border-radius:8px; border:1px solid #e2e8f0; margin:5px 0; font-size:10.5px; line-height:1.4;">
            <div style="font-weight:900; color:#0f172a; margin-bottom:2px;">🧵 Pemetaan Core FO (${totalC} Core Masuk):</div>
            ${inList.length ? `<div style="color:#059669; font-weight:800;">📥 IN Splitter ODP: <span style="font-family:monospace; font-weight:700;">${inList.join(', ')}</span></div>` : ''}
            ${bypassList.length ? `<div style="color:#d97706; font-weight:800;">⏩ Bypass Ke ODP Depan: <span style="font-family:monospace; font-weight:700;">${bypassList.join(', ')}</span></div>` : ''}
            ${spareList.length ? `<div style="color:#64748b; font-weight:700;">⚪ Spare Cadangan: <span style="font-family:monospace; font-weight:700;">${spareList.join(', ')}</span></div>` : ''}
          </div>
        `;
      }

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; min-width: 240px; padding: 2px;">
          <div style="display:flex; align-items:center; justify-between; margin-bottom: 2px;">
            <div style="font-weight: 900; color: #0f172a; font-size: 13px;">
              ${n.code ? `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:5px; font-family:monospace; margin-right:4px; font-weight:900;">[${n.code}]</span>` : ''}
              ${cust ? `ONU - ${cust.name}` : `${n.type} ${n.name || ''}`}
            </div>
            ${odpDiagnostic.isUpstreamCut ? (
              '<span style="background:#fee2e2; color:#991b1b; font-size:9px; font-weight:900; padding:2px 6px; border-radius:6px; border:1px solid #f87171;">🚨 KABEL ATAS PUTUS</span>'
            ) : cust ? (offline
              ? '<span style="background:#fee2e2; color:#991b1b; font-size:9.5px; font-weight:900; padding:2px 6px; border-radius:6px; border:1px solid #f87171;">🔴 OFFLINE</span>'
              : '<span style="background:#dcfce7; color:#166534; font-size:9.5px; font-weight:900; padding:2px 6px; border-radius:6px; border:1px solid #4ade80;">🟢 ONLINE</span>'
            ) : ''}
          </div>

          ${n.description ? `
            <div style="font-size: 10.5px; color: #475569; font-style: italic; background:#f8fafc; padding:3px 6px; border-radius:5px; border:1px solid #e2e8f0; margin:3px 0;">
              📍 <strong>Keterangan:</strong> ${n.description}
            </div>
          ` : ''}

          ${(() => {
            const treePath = getUpstreamHierarchyTree(n.id);
            if (treePath.length <= 1) return '';
            const breadcrumb = treePath.map(item => `<span style="font-weight:900;">${item.code || item.name || item.type}</span>`).join(' ➔ ');
            return `
              <div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:5px 7px; border-radius:6px; font-size:10px; margin:4px 0; font-family:sans-serif; line-height:1.4;">
                🌳 <strong>Pohon Hirarki Induk:</strong><br/>${breadcrumb}
              </div>
            `;
          })()}

          ${odpDiagnostic.isUpstreamCut ? `
            <div style="background:#fee2e2; border:1.5px solid #ef4444; color:#9f1239; padding:7px 9px; border-radius:10px; font-weight:900; margin:6px 0; line-height:1.35;">
              🚨 ANALISA PINTAR SISTEM (RFO CABLE CUT):
              <div style="font-size:10px; font-weight:700; color:#881337; margin-top:3px;">
                Terdeteksi 100% Pelanggan di ODP ini (${odpDiagnostic.offlineClients}/${odpDiagnostic.totalClients} Pelanggan) OFFLINE bersamaan!
                <br/>💡 <strong>Kemungkinan Besar:</strong> Kabel distribusi penyuplai ke ODP ini TERPUTUS / Terkendala di jalan!
              </div>
            </div>
          ` : ''}
          
          ${cust ? `
            <div style="background:#f1f5f9; padding:6px; border-radius:8px; border:1px solid #cbd5e1; margin:5px 0; font-size:11px; line-height:1.4;">
              <div>👤 <strong>Pelanggan:</strong> <span style="font-weight:800; color:#0f172a;">${cust.name}</span></div>
              <div>🔑 <strong>PPPoE User:</strong> <span style="font-weight:800; color:#0284c7; font-family:monospace;">${cust.pppoe_username || '-'}</span></div>
              <div>🏢 <strong>Ikut ODP Induk:</strong> <span style="font-weight:900; color:#8e44ad;">${connectedOdp ? `${connectedOdp.odpName} (Port #${connectedOdp.port})` : (cust.odp_port || 'Belum Dicolok ke ODP')}</span></div>
              <div>⚡ <strong>Power Laser ONU:</strong> <span style="font-weight:800; color:#10b981;">${cust.power_laser || '-19.5 dBm'}</span></div>
            </div>
          ` : (connectedOdp ? `
            <div style="background:#f8fafc; padding:5px; border-radius:6px; border:1px solid #e2e8f0; margin:4px 0; font-size:10.5px;">
              🏢 <strong>Penyuplai ODP Induk:</strong> <span style="font-weight:800; color:#8e44ad;">${connectedOdp.odpName} (Port #${connectedOdp.port})</span>
            </div>
          ` : '')}

          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">ID: <span style="font-family: monospace;">${n.id}</span></div>
          <div style="font-size: 10px; font-family: monospace; color: #0284c7; margin-top: 2px;">Lat: ${n.lat.toFixed(5)}, Lng: ${n.lng.toFixed(5)}</div>

          ${n.type !== 'CLIENT_RJ45' ? `
            ${powerHtml}
            ${coreSplicingHtml}
            <div style="background:#f8fafc; padding:6px; border-radius:8px; border:1px solid #e2e8f0; margin:6px 0; font-size:11px;">
              <div><strong>${n.type === 'ONU' ? 'Kapasitas Port LAN ONU:' : n.type === 'HTB' || n.type === 'SWITCH' || n.type === 'ROUTER' ? 'Total Port Perangkat:' : 'Kapasitas Splitter:'}</strong> <span style="font-weight:800; color:#8e44ad;">${n.type === 'ONU' ? `${cap} Port LAN` : n.type === 'HTB' || n.type === 'SWITCH' || n.type === 'ROUTER' ? `${cap} Port` : `1:${cap}`}</span></div>
              <div><strong>Port Dicolokkan:</strong> <span style="font-weight:800; color:#0284c7;">${usedPortsCount} Port</span></div>
              <div><strong>Sisa Port Kosong:</strong> <span style="font-weight:800; color:${remainingPortsCount > 0 ? '#10b981' : '#f43f5e'};">${remainingPortsCount} Port</span></div>
            </div>
            <button onclick="window.__inspectNodePorts('${n.id}')" style="background:#8e44ad; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%; margin-bottom:4px;">
              🔌 Detail & Inspector Port ${n.type === 'ONU' ? 'LAN ONU' : n.type === 'HTB' ? 'HTB' : n.type === 'SWITCH' || n.type === 'ROUTER' ? 'Perangkat' : 'Splitter'}
            </button>
            <button onclick="window.__traceNodeRoutePath('${n.id}')" style="background:#0284c7; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%; margin-bottom:4px;">
              🔍 Trace Alur Jalur (OLT ➔ ODC ➔ ODP ➔ ONU)
            </button>
            <button onclick="window.__openOtdrForNode('${n.id}')" style="background:#e11d48; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%; margin-bottom:4px;">
              💥 Test OTDR Kabel Putus Dari Node Ini
            </button>
          ` : `
            <button onclick="window.__traceNodeRoutePath('${n.id}')" style="background:#0284c7; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%; margin-bottom:4px;">
              🔍 Trace Alur Jalur (OLT ➔ ODC ➔ ODP ➔ ONU)
            </button>
          `}

          <div style="display:flex; gap:4px; margin-bottom:4px;">
            <button onclick="window.__editNodeDetails('${n.id}')" style="background:#0284c7; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; flex:1;">
              ✏️ Edit Node
            </button>
            <button onclick="window.__deleteLaravelNode('${n.id}')" style="background:#f43f5e; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; flex:1;">
              🗑️ Hapus
            </button>
          </div>
          <div style="font-size:9px; color:#94a3b8; text-align:center; font-style:italic;">💡 Petunjuk: Tarik marker di peta untuk memindahkan lokasi</div>
        </div>
      `;

      m.bindPopup(popupHtml);

      // Dragging node marker moves location with immediate coordinate update & toast
      m.on('dragend', (evt: any) => {
        const newPos = evt.target.getLatLng();
        setNodes(prev => prev.map(item => item.id === n.id ? { ...item, lat: newPos.lat, lng: newPos.lng } : item));
        setToastMsg({ text: `📍 Lokasi ${n.name || n.type} dipindahkan ke Lat: ${newPos.lat.toFixed(5)}, Lng: ${newPos.lng.toFixed(5)}!`, type: 'info' });
      });

      m.on('click', () => {
        if (currentModeRef.current === 'line') {
          const currentSelection = tempLineSelectionRef.current;
          if (currentSelection.length === 0) {
            setTempLineSelection([n.id]);
          } else if (currentSelection.length === 1 && currentSelection[0] !== n.id) {
            const fromId = currentSelection[0];
            const toId = n.id;

            const fromNodeObj = nodes.find(item => item.id === fromId);
            const toNodeObj = nodes.find(item => item.id === toId);

            if (fromNodeObj && toNodeObj) {
              const { nextPort, nextToPort } = getSmartPortPairing(fromNodeObj, toNodeObj);
              setSelectedFromPort(nextPort);
              setSelectedToPort(nextToPort);
              setConnectingPair({ fromNode: fromNodeObj, toNode: toNodeObj });
              setTempLineSelection([]);
            }
          } else {
            setTempLineSelection([]);
          }
        }
      });
    });

    // Render Polyline Cables with Hierarchy-Based Colors, Bend Points & Port Information
    lines.forEach((l) => {
      const fromNode = nodes.find(n => n.id === l.fromId);
      const toNode = nodes.find(n => n.id === l.toId);

      if (fromNode && toNode) {
        // Progressive Level of Detail (LOD) Cable Filtering
        if (enableLodFilter) {
          if (zoomLevel < 14 && (fromNode.type !== 'OLT' && fromNode.type !== 'ODC' && toNode.type !== 'OLT' && toNode.type !== 'ODC')) {
            return; // Hide sub-lines when zoomed out to city level
          }
          if (zoomLevel < 16 && (fromNode.type === 'ONU' || toNode.type === 'ONU' || fromNode.type === 'CLIENT_RJ45' || toNode.type === 'CLIENT_RJ45')) {
            return; // Hide customer drop core cables when zoomed out to district level
          }
        }

        const linePoints: L.LatLngExpression[] = [
          [fromNode.lat, fromNode.lng],
          ...(l.waypoints || []),
          [toNode.lat, toNode.lng]
        ];

        const isSelectedForWp = selectedLineForWaypoint === l.id;
        const isFromOffline = isNodeOffline(fromNode);
        const isToOffline = isNodeOffline(toNode);
        const isCableOffline = isFromOffline || isToOffline;

        const fromDiag = checkOdpUpstreamCableCut(fromNode);
        const toDiag = checkOdpUpstreamCableCut(toNode);
        const isUpstreamCutCable = (fromDiag.isUpstreamCut || toDiag.isUpstreamCut) && (fromNode.type !== 'ONU' && toNode.type !== 'ONU');

        const isLineHighlighted = highlightedPathLineIds.includes(l.id);

        // Determine Connection Cable Color & Category (FTTH / HTB FO / LAN UTP RJ45 / OFFLINE / UPSTREAM CUT)
        let cableColor = isLineHighlighted ? '#d946ef' : (isUpstreamCutCable ? '#dc2626' : (isCableOffline ? '#ef4444' : '#f59e0b'));
        let cableCategory = isLineHighlighted
          ? '🔍 JALUR AKTIF DITRACE (OLT ➔ ONU)'
          : (isUpstreamCutCable 
          ? '🚨 KABEL INDUK PENYUPLAI PUTUS (RFO UPSTREAM CUT)' 
          : (isCableOffline ? '💥 KABEL DROP CORE OFFLINE / PUTUS' : '🟡 Kabel Percabangan'));
        let cableWeight = isLineHighlighted ? 7.5 : (isUpstreamCutCable ? 6 : (isCableOffline ? 5 : 3.5));
        let cableClassName = isLineHighlighted ? 'animated-line-laravel' : (isUpstreamCutCable ? 'upstream-cut-animated' : (isCableOffline ? 'offline-cable-animated' : 'animated-line-laravel'));
        let isFiberOptic = true;
        let cableMediaType = isUpstreamCutCable 
          ? '🚨 Kabel Utama Penyuplai ODP Terputus (Sistem Deteksi 100% Client OFFLINE Bersamaan)' 
          : (isCableOffline ? '⚠️ Perangkat Pelanggan Di Ujung Kabel Ini Statusnya Offline / Sinyal Putus!' : '✨ Serat Kaca / Optik (Signal Light 1310/1490/1550nm)');

        if (!isCableOffline && !isUpstreamCutCable) {
          if (isSelectedForWp) {
            cableColor = '#d946ef'; // Magenta glow when editing waypoints
            cableCategory = '🔀 Mode Edit Belokan Kabel';
            cableWeight = 6;
          } else if (fromNode.type === 'HTB' && toNode.type === 'HTB' && (l.fromPort || 1) <= ((fromNode.portsA || 1) + (fromNode.portsB || 1))) {
            cableColor = '#10b981'; // Emerald Green FO HTB Transceiver
            cableCategory = '⚡ Kabel FO HTB (WDM Transceiver A ↔ B)';
            cableWeight = 4;
          } else if (fromNode.type === 'OLT') {
            cableColor = '#dc2626'; // Red Feeder Cable (OLT ➔ ODC/ODP)
            cableCategory = '🔴 Kabel Fiber Optic Feeder (OLT ➔ ODC)';
            cableWeight = 5;
          } else if (fromNode.type === 'ODC') {
            cableColor = '#9333ea'; // Purple Distribution Cable (ODC ➔ ODP)
            cableCategory = '💜 Kabel Fiber Optic Distribusi (ODC ➔ ODP)';
            cableWeight = 4;
          } else if (toNode.type === 'ONU' && (l.toPort || 1) === 1) {
            cableColor = '#0284c7'; // Sky Blue Drop Core Cable (ODP/Splitter ➔ ONU PON)
            cableCategory = '🔵 Kabel Fiber Optic Drop Core (ODP ➔ ONU PON)';
            cableWeight = 3.5;
          } else if (
            (fromNode.type === 'ODP' || fromNode.type === 'SPLITTER') && 
            (toNode.type === 'ODP' || toNode.type === 'SPLITTER')
          ) {
            cableColor = '#9333ea'; // Purple Distribution FO Cable (ODP/Splitter ↔ ODP/Splitter)
            cableCategory = '💜 Kabel Fiber Optic Distribusi (ODP/Splitter ↔ ODP/Splitter)';
            cableWeight = 4;
          } else if (
            (fromNode.type === 'ODP' || fromNode.type === 'SPLITTER') && 
            toNode.type !== 'ONU'
          ) {
            cableColor = '#0284c7'; // Sky Blue FO from ODP/Splitter to other infra
            cableCategory = '🔵 Kabel Fiber Optic Distribusi (ODP/Splitter ➔ Perangkat)';
            cableWeight = 3.5;
          } else {
            // All other interconnects (ONU LAN, Router Wireless, Access Point, Switch) are Copper UTP LAN Cables
            isFiberOptic = false;
            cableColor = '#eab308'; // Yellow UTP LAN RJ45
            cableCategory = '🌐 Kabel LAN UTP (RJ45 Tembaga)';
            cableMediaType = '🔌 Tembaga UTP Cat5e/Cat6 (Ethernet 10/100/1000 Mbps)';
            cableWeight = 3.5;
          }

          // User Custom Cable Color Override
          if (l.cableColor && !isSelectedForWp) {
            cableColor = l.cableColor;
          }
        }

        // 1. Visual Cable Polyline (Minimum thickness 5.5px for crisp visibility)
        const visibleWeight = Math.max(cableWeight + 1.5, 5.5);

        const polyline = L.polyline(
          linePoints,
          {
            color: cableColor,
            weight: visibleWeight,
            className: cableClassName,
            opacity: 0.95
          }
        ).addTo(layerGroup);

        // 2. Transparent Wide Hit Buffer Zone (22px radius buffer area for super easy click/tap!)
        const hitBufferPolyline = L.polyline(
          linePoints,
          {
            color: 'transparent',
            weight: 22,
            opacity: 0,
            interactive: true
          }
        ).addTo(layerGroup);

        const cableLengthMeters = getCableLengthMeters(fromNode, toNode, l.waypoints);
        const cableLengthFormatted = formatDistance(cableLengthMeters);
        const waypointCount = (l.waypoints || []).length;
        const portInfo = `Port #${l.fromPort || 1} (${fromNode.name || fromNode.type}) ➔ Port #${l.toPort || 1} (${toNode.name || toNode.type})`;

        const tooltipContent = `📏 ${cableCategory}: ${cableLengthFormatted} ${l.coreNumber ? `[${l.coreNumber}]` : ''}`;
        const popupContent = `
          <div style="font-family: system-ui; font-size: 11px; padding: 2px; min-width:210px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 3px;">
              <strong>${isFiberOptic ? '✨ Jalur Kabel Fiber Optic (FO)' : '🌐 Jalur Kabel LAN UTP (RJ45)'}</strong>
              <span style="font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: ${isFiberOptic ? '#f0fdf4' : '#fefce8'}; color: ${isFiberOptic ? '#166534' : '#854d0e'};">
                ${isFiberOptic ? 'Serat Kaca' : 'Tembaga UTP'}
              </span>
            </div>
            
            <div style="display:flex; align-items:center; gap:6px; margin:4px 0;">
              <span style="display:inline-block; width:12px; height:12px; border-radius:3px; background:${cableColor}; border:1px solid rgba(0,0,0,0.2);"></span>
              <span style="font-size: 10.5px; color: ${cableColor}; font-weight: 900;">${cableCategory}</span>
            </div>

            ${l.coreNumber ? `
              <div style="background:#f1f5f9; padding:4px 7px; border-radius:6px; border:1px solid #cbd5e1; margin-bottom:4px; font-size:10px; font-weight:800; color:#0f172a;">
                🧵 Label Core: <span style="color:#0284c7; font-family:monospace;">${l.coreNumber}</span>
              </div>
            ` : ''}

            <div style="font-size: 9px; color: #64748b; font-style: italic; margin-bottom: 4px;">Media: ${cableMediaType}</div>
            <div style="font-size: 10px; color: #475569; font-weight: 700; margin-bottom: 3px;">${portInfo}</div>
            <div style="font-size: 11px; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: center; justify-content:space-between;">
              <span>📏 Panjang Kabel:</span>
              <span style="font-family: monospace; font-size: 12px; font-weight: 900; color: #0369a1;">${cableLengthFormatted}</span>
            </div>
            <div style="font-size: 10px; font-weight: 700; color: #8e44ad; margin-bottom: 6px;">📍 Jumlah Titik Belokan: ${waypointCount} Titik</div>
            
            <div style="display:flex; gap:4px; margin-bottom:4px;">
              <button onclick="window.__editCableColorModal('${l.id}')" style="background:#0284c7; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; flex:1;">
                🧵 Core & Splicing
              </button>
              <button onclick="window.__editLaravelCableWaypoints('${l.id}')" style="background:#8e44ad; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; flex:1;">
                ✏️ Belokan
              </button>
              <button onclick="window.__deleteLaravelLine('${l.id}')" style="background:#f43f5e; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; flex:1;">
                🗑️ Hapus
              </button>
            </div>
            ${isFiberOptic ? `
              <button onclick="window.__openOtdrForLine('${l.id}')" style="background:#e11d48; color:#ffffff; padding:5px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%;">
                💥 OTDR Test Kabel Putus
              </button>
            ` : ''}
          </div>
        `;

        polyline.bindTooltip(tooltipContent, { sticky: true });
        polyline.bindPopup(popupContent);

        hitBufferPolyline.bindTooltip(tooltipContent, { sticky: true });
        hitBufferPolyline.bindPopup(popupContent);

        // Render Draggable Waypoint Handles (Titik Belokan) ONLY when editing this specific cable
        if (isSelectedForWp) {
          (l.waypoints || []).forEach((wp, wpIdx) => {
            const wpIcon = L.divIcon({
              className: '',
              html: `<div style="background:#8e44ad; width:20px; height:20px; border-radius:50%; border:2px solid white; box-shadow:0 2px 8px rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:900; cursor:grab;" title="Titik Belokan #${wpIdx+1} (Geser untuk memindahkan belokan)">🔀</div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            const wpMarker = L.marker([wp[0], wp[1]], { icon: wpIcon, draggable: true }).addTo(layerGroup);

            wpMarker.bindPopup(`
              <div style="font-family: system-ui; font-size: 11px; padding: 2px;">
                <strong>🔀 Titik Belokan Kabel #${wpIdx + 1}</strong>
                <div style="font-size: 10px; color: #64748b; margin: 4px 0;">Lat: ${wp[0].toFixed(5)}, Lng: ${wp[1].toFixed(5)}</div>
                <button onclick="window.__removeLaravelWaypoint('${l.id}', ${wpIdx})" style="background:#f43f5e; color:#ffffff; padding:4px 8px; border-radius:6px; border:none; font-weight:800; font-size:10px; cursor:pointer; width:100%;">
                  🗑️ Hapus Belokan Ini
                </button>
              </div>
            `);

            wpMarker.on('dragend', (evt: any) => {
              const newPos = evt.target.getLatLng();
              setLines(prev => prev.map(item => {
                if (item.id === l.id && item.waypoints) {
                  const updatedWps = [...item.waypoints];
                  updatedWps[wpIdx] = [newPos.lat, newPos.lng];
                  return { ...item, waypoints: updatedWps };
                }
                return item;
              }));
              setToastMsg({ text: `📍 Titik belokan #${wpIdx + 1} dipindahkan ke posisi baru!`, type: 'info' });
            });
          });
        }
      }
    });

    // Render Active OTDR Fiber Break Marker on Map
    if (otdrBreakPoint) {
      const breakIcon = L.divIcon({
        className: '',
        html: `<div style="background:#e11d48; width:38px; height:38px; border-radius:50%; border:3px solid white; box-shadow:0 0 22px #e11d48; display:flex; align-items:center; justify-content:center; color:white; font-size:16px; font-weight:900; cursor:pointer;" title="Titik Perkiraan Kabel Optik Putus (OTDR)">💥</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      const breakMarker = L.marker([otdrBreakPoint.lat, otdrBreakPoint.lng], { icon: breakIcon }).addTo(layerGroup);
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${otdrBreakPoint.lat},${otdrBreakPoint.lng}`;
      const coreLabelText = otdrBreakPoint.coreName || `Core #${otdrBreakPoint.coreNumber || 1}`;
      const waMessage = encodeURIComponent(
        `💥 *PERKIRAAN LOKASI KABEL FO PUTUS (HASIL OTDR)*\n\n` +
        `📍 Jalur Uji: ${otdrBreakPoint.fromNodeName} ➔ ${otdrBreakPoint.toNodeName}\n` +
        `🧵 Core Optik Diuji: ${coreLabelText}\n` +
        `📏 Jarak OTDR: ${formatDistance(otdrBreakPoint.meters)}\n` +
        `📍 GPS Lat, Lng: ${otdrBreakPoint.lat.toFixed(6)}, ${otdrBreakPoint.lng.toFixed(6)}\n\n` +
        `🗺️ Navigasi Google Maps:\n${googleMapsUrl}`
      );
      const waUrl = `https://wa.me/?text=${waMessage}`;

      breakMarker.bindPopup(`
        <div style="font-family: system-ui; font-size: 11px; padding: 4px; text-align: center; min-width: 235px;">
          <div style="background: #ffe4e6; color: #9f1239; padding: 6px; border-radius: 10px; font-weight: 900; font-size: 11px; margin-bottom: 6px;">
            💥 LOKASI KABEL FO PUTUS (HASIL TEST OTDR)!
          </div>
          <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">
            Jalur Uji: ${otdrBreakPoint.fromNodeName} ➔ ${otdrBreakPoint.toNodeName}
          </div>
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; margin-bottom: 2px;">
            🧵 Core Optik Diuji: <span style="font-family: monospace; font-weight: 900; color: #0369a1;">${coreLabelText}</span>
          </div>
          <div style="font-size: 12px; font-weight: 900; color: #e11d48; font-family: monospace; margin: 4px 0;">
            📏 Jarak Ukur OTDR: ${formatDistance(otdrBreakPoint.meters)}
          </div>
          <div style="font-size: 10px; font-family: monospace; color: #64748b; background: #f8fafc; padding: 4px; border-radius: 6px; margin-bottom: 8px;">
            📍 GPS Lat: ${otdrBreakPoint.lat.toFixed(6)}, Lng: ${otdrBreakPoint.lng.toFixed(6)}
          </div>
          <a href="${googleMapsUrl}" target="_blank" style="display: block; background: #0284c7; color: white; padding: 7px 10px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 11px; margin-bottom: 4px;">
            🗺️ Buka Navigasi Google Maps Teknisi
          </a>
          <a href="${waUrl}" target="_blank" style="display: block; background: #25d366; color: white; padding: 7px 10px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 11px; margin-bottom: 4px;">
            📲 Share WA Lokasi Putus Ke Teknisi
          </a>
          <button onclick="window.__clearOtdrBreakPoint()" style="background: #f43f5e; color: white; padding: 6px 10px; border-radius: 8px; border: none; font-weight: 800; font-size: 10px; cursor: pointer; width: 100%;">
            🗑️ Hapus Marker Putus OTDR
          </button>
        </div>
      `).openPopup();
    }
  }, [nodes, lines, customersList, onlineUsernames, tempLineSelection, selectedLineForWaypoint, otdrBreakPoint, zoomLevel, enableLodFilter]);

  // Bind Window Helpers for Popup Action Buttons & Inspector
  useEffect(() => {
    (window as any).__deleteLaravelNode = (id: string) => {
      setNodes(prev => prev.filter(n => n.id !== id));
      setLines(prev => prev.filter(l => l.fromId !== id && l.toId !== id));
    };

    (window as any).__deleteLaravelLine = (id: string) => {
      setLines(prev => prev.filter(l => l.id !== id));
      if (selectedLineForWaypoint === id) setSelectedLineForWaypoint(null);
    };

    (window as any).__inspectNodePorts = (id: string) => {
      const nodeObj = nodes.find(n => n.id === id);
      if (nodeObj) setInspectingNode(nodeObj);
    };

    (window as any).__editCableColorModal = (lineId: string) => {
      const lineObj = lines.find(l => l.id === lineId);
      if (lineObj) {
        setEditingCableId(lineId);
        setEditCableColor(lineObj.cableColor || '#2563eb');
        setEditCoreNumber(lineObj.coreNumber || 'Core #1 (Biru)');
        setEditCableTypeLabel(lineObj.cableType || 'Kabel Fiber Optik');
        const numCores = lineObj.totalCores !== undefined && lineObj.totalCores !== null ? Number(lineObj.totalCores) : ((lineObj as any).total_cores !== undefined && (lineObj as any).total_cores !== null ? Number((lineObj as any).total_cores) : 4);
        setEditTotalCores(numCores);
        setEditCoreSplicingMap(lineObj.coreSplicingMap || (lineObj as any).core_splicing_map || { 1: { action: 'INPUT_SPLITTER' } });
      }
    };

    (window as any).__editNodeDetails = (id: string) => {
      const nodeObj = nodes.find(n => n.id === id);
      if (nodeObj) {
        setEditingNode(nodeObj);
        setEditName(nodeObj.name || '');
        setEditCode(nodeObj.code || '');
        setEditDescription(nodeObj.description || '');
        setEditType(nodeObj.type);
        setEditCapacity(nodeObj.splitterCapacity || config[nodeObj.type]?.defaultCap || 8);
        setEditPortsA(nodeObj.portsA !== undefined ? nodeObj.portsA : 1);
        setEditPortsB(nodeObj.portsB !== undefined ? nodeObj.portsB : 1);
        setEditPortsSfp(nodeObj.portsSfp !== undefined ? nodeObj.portsSfp : (nodeObj.type === 'ROUTER' ? 1 : 2));
        setEditPortsLan(nodeObj.portsLan !== undefined ? nodeObj.portsLan : (nodeObj.type === 'ROUTER' ? 5 : 8));
        setEditCustomerId(nodeObj.customerId || '');
      }
    };

    (window as any).__editLaravelCableWaypoints = (lineId: string) => {
      setCurrentMode('waypoint');
      setSelectedLineForWaypoint(lineId);

      setLines(prev => prev.map(item => {
        if (item.id === lineId) {
          const from = nodes.find(n => n.id === item.fromId);
          const to = nodes.find(n => n.id === item.toId);
          if (!from || !to) return item;

          const currentWps = item.waypoints || [];
          if (currentWps.length === 0) {
            const midLat = (from.lat + to.lat) / 2;
            const midLng = (from.lng + to.lng) / 2;
            return { ...item, waypoints: [[midLat, midLng]] };
          }
          return item;
        }
        return item;
      }));

      setToastMsg({ text: `✏️ Edit Belokan Kabel Aktif: Geser titik 🔀 untuk memindahkan belokan, atau klik di peta untuk menambah belokan baru!`, type: 'info' });
    };

    (window as any).__removeLaravelWaypoint = (lineId: string, wpIdx: number) => {
      setLines(prev => prev.map(item => {
        if (item.id === lineId && item.waypoints) {
          const updatedWps = item.waypoints.filter((_, idx) => idx !== wpIdx);
          return { ...item, waypoints: updatedWps };
        }
        return item;
      }));
      setToastMsg({ text: `🗑️ Titik belokan kabel berhasil dihapus!`, type: 'info' });
    };

    (window as any).__openOtdrForLine = (lineId: string) => {
      setSelectedOtdrLineId(lineId);
      setOtdrNodeId(null);
      setShowOtdrModal(true);
    };

    (window as any).__openOtdrForNode = (nodeId: string) => {
      const connLines = lines.filter(l => l.fromId === nodeId || l.toId === nodeId);
      if (connLines.length === 0) {
        setWarningModalMsg('⚠️ Perangkat ini belum dicolokkan ke jalur kabel apapun! Tarik kabel terlebih dahulu untuk melakukan test OTDR.');
        return;
      }
      setOtdrNodeId(nodeId);
      setSelectedOtdrLineId(connLines[0].id);
      setShowOtdrModal(true);
    };

    (window as any).__traceNodeRoutePath = (nodeId: string) => {
      setTracedNodeId(nodeId);
      const tree = getUpstreamHierarchyTree(nodeId);
      const pathLineIds: string[] = [];

      for (let i = 0; i < tree.length - 1; i++) {
        const fromId = tree[i].id;
        const toId = tree[i + 1].id;
        const matched = lines.find(l => (l.fromId === fromId && l.toId === toId) || (l.fromId === toId && l.toId === fromId));
        if (matched) pathLineIds.push(matched.id);
      }

      setHighlightedPathLineIds(pathLineIds);
      const targetN = nodes.find(n => n.id === nodeId);
      setToastMsg({ text: `🔍 Alur Jalur ${targetN?.name || targetN?.type || 'Perangkat'} Berhasil Ditrace (${tree.length} Node dalam Pohon Jaringan)!`, type: 'success' });
    };

    (window as any).__clearOtdrBreakPoint = () => {
      setOtdrBreakPoint(null);
      setToastMsg({ text: '🗑️ Marker Putus OTDR Berhasil Dihapus Dari Peta!', type: 'info' });
    };
  }, [nodes, lines]);

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8 min-h-screen flex flex-col">
      <HeaderBar 
        profile={profile} 
        t={t} 
        onLogout={onLogout} 
        title="Peta Topologi FTTH Nyata (OLT ➔ ODC ➔ ODP ➔ ONU & Splitter Ports)"
      />

      <main className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col space-y-4">
        {/* Toast Notifikasi */}
        {toastMsg && (
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-xs shadow-xl border border-slate-700 flex items-center justify-between animate-fade-in">
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="text-xs font-bold underline cursor-pointer">Tutup</button>
          </div>
        )}

        {/* Banner Informasi Komparasi & Regulasi Topologi */}
        <div className="bg-amber-500 text-slate-900 px-5 py-3 rounded-2xl font-bold text-xs shadow-md border border-amber-400 flex items-center gap-2">
          <span className="text-base">🔍</span>
          <span>Mode Default Jelajah Peta: Bebas geser & lihat peta tanpa menambah node tak sengaja! Pilih menu kiri hanya saat ingin menambah node baru.</span>
        </div>

        {/* Map Frame with Left Vertical Toolbar & Collapsible Floating Panels */}
        <div className="relative flex-1 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden h-[calc(100vh-210px)] min-h-[640px] flex">
          <div ref={mapContainerRef} className="w-full h-full flex-1 z-0" />

          {/* Left Vertical Floating Toolbar (Sleek 1-Click Collapsible) */}
          {!isMenuOpen ? (
            <button
              onClick={() => setIsMenuOpen(true)}
              className="absolute top-4 left-4 z-[1001] bg-slate-900/90 hover:bg-slate-900 text-white px-3.5 py-2.5 rounded-2xl shadow-xl border border-slate-700 font-extrabold text-xs flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer hover:scale-105"
            >
              <span>🛠️</span>
              <span>Menu Perangkat FTTH</span>
              {hasUnsavedChanges && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          ) : (
            <div className="absolute top-4 left-4 z-[1001] bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-slate-200 flex flex-col gap-1.5 min-w-[165px] max-w-[200px] max-h-[calc(100%-2rem)] overflow-y-auto transition-all">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 mb-0.5">
                <h3 className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider">
                  🛠️ FTTH BUILDER
                </h3>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="w-5 h-5 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 font-black text-[10px] flex items-center justify-center transition-colors cursor-pointer"
                  title="Sembunyikan Menu"
                >
                  ✕
                </button>
              </div>

              {/* Save to Database Button */}
              <button
                onClick={handleSaveTopologyToDB}
                disabled={saveLoading}
                className={`w-full px-2.5 py-2 rounded-xl text-[11px] font-black text-white flex items-center justify-between transition-all cursor-pointer shadow-sm ${
                  hasUnsavedChanges
                    ? 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-400'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span>{saveLoading ? '⏳' : '💾'}</span>
                  <span>{saveLoading ? 'Menyimpan...' : 'Simpan Database'}</span>
                </div>
                {hasUnsavedChanges && (
                  <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
                )}
              </button>

              {/* Mode Jelajah / View Mode Button */}
              <button
                onClick={() => { setCurrentMode('view'); setSelectedLineForWaypoint(null); setTempLineSelection([]); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'view' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>🔍</span>
                <span>Mode Jelajah Peta</span>
              </button>

              <div className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5 text-center">FTTH PON</div>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('OLT'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'OLT' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#e74c3c' }}
              >
                <span>🖥️</span>
                <span>+ OLT PON</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ODC'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ODC' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#8e44ad' }}
              >
                <span>🏢</span>
                <span>+ ODC Cabinet</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ODP'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ODP' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#2ecc71' }}
              >
                <span>🔲</span>
                <span>+ ODP Box</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('SPLITTER'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'SPLITTER' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#f39c12' }}
              >
                <span>🔀</span>
                <span>+ Splitter</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ONU'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ONU' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#3498db' }}
              >
                <span>🏠</span>
                <span>+ ONU Pelanggan</span>
              </button>

              <div className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5 text-center">HTB & LAN RJ45</div>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('HTB'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'HTB' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#10b981' }}
              >
                <span>⚡</span>
                <span>+ HTB Converter</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('SWITCH'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'SWITCH' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#06b6d4' }}
              >
                <span>🔌</span>
                <span>+ Switch Hub</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ROUTER_WIFI'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ROUTER_WIFI' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#f59e0b' }}
              >
                <span>📶</span>
                <span>+ Router Wireless</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ROUTER'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ROUTER' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#6366f1' }}
              >
                <span>📡</span>
                <span>+ Router Mikrotik</span>
              </button>

              <button
                onClick={() => { setCurrentMode('add_marker'); setCurrentType('ACCESS_POINT'); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'add_marker' && currentType === 'ACCESS_POINT' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#14b8a6' }}
              >
                <span>📡</span>
                <span>+ Access Point (AP)</span>
              </button>

              <div className="text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider mt-0.5 text-center">Koneksi & Rute</div>

              <button
                onClick={() => { setCurrentMode('line'); setTempLineSelection([]); setSelectedLineForWaypoint(null); }}
                className={`w-full px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer ${
                  currentMode === 'line' ? 'ring-2 ring-slate-900 shadow-sm' : 'opacity-90 hover:opacity-100'
                }`}
                style={{ backgroundColor: '#27ae60' }}
              >
                <span>🔌</span>
                <span>Tarik Kabel (FO/LAN)</span>
              </button>

              {/* Layer Peta Selector */}
              <div className="pt-2 border-t border-slate-200 mt-1 space-y-1">
                <label className="block text-[9.5px] font-extrabold text-slate-500 uppercase text-center">Layer Peta</label>
                <select
                  value={mapStyle}
                  onChange={(e) => setMapStyle(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="google_hybrid">🛰️ Google Hybrid</option>
                  <option value="google_streets">🗺️ Google Vector</option>
                  <option value="street">🌐 OpenStreetMap</option>
                  <option value="satellite">🛰️ Esri Satellite</option>
                  <option value="dark">🌙 Dark Mode</option>
                </select>
              </div>

              {/* Scalable Zoom LOD Management Toggle */}
              <div className="pt-2 border-t border-slate-200 mt-1 space-y-1">
                <label className="block text-[9.5px] font-extrabold text-slate-500 uppercase text-center">Optimasi Skala Ribuan Node</label>
                <button
                  onClick={() => setEnableLodFilter(!enableLodFilter)}
                  className={`w-full px-2 py-1.5 rounded-lg text-[10.5px] font-extrabold transition-all cursor-pointer flex items-center justify-between shadow-xs ${
                    enableLodFilter 
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                  title="Level of Detail (LOD) Otomatis menyembunyikan titik kecil saat zoom jauh agar peta 100% cepat tanpa lag!"
                >
                  <span>{enableLodFilter ? '⚡ LOD Otomatis' : '👁️ Tampilkan Semua'}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white text-[9px] font-mono font-black border border-current/20">
                    Z:{zoomLevel}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Smart RFO Cable Cut Diagnostic Alert Banner */}
          {upstreamCutOdps.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-rose-950 text-white px-5 py-2.5 rounded-2xl shadow-2xl border-2 border-rose-500 text-xs font-bold z-[1001] flex items-center gap-3 animate-bounce">
              <span className="text-xl">🚨</span>
              <div>
                <span className="text-rose-400 uppercase font-black text-[10px] block leading-none mb-0.5">Analisa Pintar Sistem FTTH</span>
                <span>Terdeteksi {upstreamCutOdps.length} ODP dengan Kabel Utama Penyuplai Putus ({upstreamCutOdps.map(n => n.name || `${n.type} #${n.id.slice(-4)}`).join(', ')})!</span>
              </div>
            </div>
          )}

          {/* Mode Banner Prompt */}
          {currentMode === 'add_marker' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-950 text-white px-4 py-2 rounded-2xl shadow-2xl border border-blue-400 text-xs font-bold z-[1001] flex items-center gap-3 animate-pulse">
              <span>📍 MODE TAMBAH NODE: Klik posisi mana saja di peta untuk menaruh {currentType} baru!</span>
              <button onClick={() => setCurrentMode('view')} className="bg-rose-600 px-2.5 py-1 rounded-xl text-[10px] font-extrabold cursor-pointer">Batal</button>
            </div>
          )}

          {currentMode === 'line' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-950 text-white px-4 py-2 rounded-2xl shadow-2xl border border-emerald-400 text-xs font-bold z-[1001] flex items-center gap-3 animate-pulse">
              <span>🔌 {tempLineSelection.length === 1 ? 'Klik Node Tujuan untuk menancapkan kabel ke Port Splitter!' : 'Klik Node Asal (OLT/ODC/ODP) untuk memulai kabel!'}</span>
              <button onClick={() => { setCurrentMode('view'); setTempLineSelection([]); }} className="bg-rose-600 px-2.5 py-1 rounded-xl text-[10px] font-extrabold cursor-pointer">Batal</button>
            </div>
          )}

          {currentMode === 'waypoint' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-950 text-white px-4 py-2 rounded-2xl shadow-2xl border border-purple-400 text-xs font-bold z-[1001] flex items-center gap-3 animate-pulse">
              <span>🔀 MODE EDIT BELOKAN KABEL: Drag titik 🔀 untuk memindahkan belokan, atau klik di peta untuk menambah belokan baru!</span>
              <button onClick={() => { setCurrentMode('view'); setSelectedLineForWaypoint(null); }} className="bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-xl text-[10px] font-extrabold cursor-pointer">✓ Selesai Edit Belokan</button>
            </div>
          )}

          {/* Legenda Warna & Meteran Panjang Kabel Topologi FTTH (Sleek 1-Click Collapsible Panel) */}
          {!isLegendOpen ? (
            <button
              onClick={() => setIsLegendOpen(true)}
              className="absolute bottom-4 right-4 z-[1001] bg-slate-900/90 hover:bg-slate-900 text-white px-3.5 py-2 rounded-2xl shadow-xl border border-slate-700 font-extrabold text-xs flex items-center gap-2 backdrop-blur-md transition-all cursor-pointer hover:scale-105"
            >
              <span>📊</span>
              <span>Total Kabel: <strong className="text-emerald-400 font-mono">{formatDistance(networkDistanceStats.totalMeters)}</strong></span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">Legenda ▴</span>
            </button>
          ) : (
            <div className="absolute bottom-4 right-4 z-[1001] bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-slate-200 text-xs font-bold text-slate-800 space-y-2 max-w-[240px]">
              <div className="text-[10.5px] font-black text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>📊 Meteran & Legenda</span>
                <button
                  onClick={() => setIsLegendOpen(false)}
                  className="w-5 h-5 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 font-black text-[10px] flex items-center justify-center transition-colors cursor-pointer"
                  title="Sembunyikan Legenda"
                >
                  ✕
                </button>
              </div>

              {/* Total Network Cable Distance Badge */}
              <div className="bg-slate-900 text-white p-2 rounded-xl flex items-center justify-between font-mono">
                <span className="text-[9.5px] font-bold uppercase text-slate-300">Total Kabel:</span>
                <span className="text-xs font-black text-emerald-400">{formatDistance(networkDistanceStats.totalMeters)}</span>
              </div>
              
              <div className="space-y-1 text-[10.5px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-1.5 rounded-full bg-red-600 shrink-0" />
                    <span>Feeder (OLT ➔ ODC)</span>
                  </div>
                  <span className="text-[9.5px] text-slate-700 font-mono font-bold">{formatDistance(networkDistanceStats.feederMeters)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-1.5 rounded-full bg-purple-600 shrink-0" />
                    <span>Distribusi (ODC ➔ ODP)</span>
                  </div>
                  <span className="text-[9.5px] text-slate-700 font-mono font-bold">{formatDistance(networkDistanceStats.distMeters)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-1.5 rounded-full bg-sky-600 shrink-0" />
                    <span>Drop Core (ODP ➔ ONU)</span>
                  </div>
                  <span className="text-[9.5px] text-slate-700 font-mono font-bold">{formatDistance(networkDistanceStats.dropMeters)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>FO HTB Converter</span>
                  </div>
                  <span className="text-[9.5px] text-slate-700 font-mono font-bold">{formatDistance(networkDistanceStats.htbMeters)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>LAN UTP (RJ45)</span>
                  </div>
                  <span className="text-[9.5px] text-slate-700 font-mono font-bold">{formatDistance(networkDistanceStats.lanMeters)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Node Details Modal */}
      {editingNode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[2000] animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">✏️ Edit Node & Perangkat FTTH</h3>
              <button onClick={() => setEditingNode(null)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Kode Hirarki Sistem (FTTH Code):</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingNode) {
                          const code2Block = build2BlockLevelCode(editingNode.id);
                          if (code2Block) {
                            setEditCode(code2Block);
                            if (!editName || editName.startsWith('ODP #') || editName.startsWith('ODC #') || editName.startsWith('OLT #') || editName.startsWith('node_')) {
                              setEditName(code2Block);
                            }
                            setToastMsg({ text: `⚡ Kode 2-Blok Level Hirarki: ${code2Block}`, type: 'success' });
                          }
                        }
                      }}
                      className="text-[9.5px] font-black text-amber-950 bg-amber-300 hover:bg-amber-400 px-2 py-0.5 rounded-md border border-amber-400 cursor-pointer transition-all shadow-xs"
                      title="Rekomendasi! Format 2-Blok: [Induk]-[Level + Urutan] Contoh: B02-C01, B02-BB01, C01-CC01"
                    >
                      ⚡ 2-Blok Level (B02-C01)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (editingNode) {
                          const alphaCode = buildAlphanumericShortCode(editingNode.id);
                          if (alphaCode) {
                            setEditCode(alphaCode);
                            if (!editName || editName.startsWith('ODP #') || editName.startsWith('ODC #') || editName.startsWith('OLT #') || editName.startsWith('node_')) {
                              setEditName(alphaCode);
                            }
                            setToastMsg({ text: `⚡ Kode Alfanumerik Hemat Digit: ${alphaCode}`, type: 'success' });
                          }
                        }
                      }}
                      className="text-[9.5px] font-black text-emerald-800 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-md border border-emerald-300 cursor-pointer transition-all shadow-2xs"
                      title="Sangat hemat digit! Contoh: A1-C01-P01"
                    >
                      ⚡ Tree Alfanumerik
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (editingNode) {
                          const fullCode = buildFullHierarchyCode(editingNode.id, 'dash');
                          if (fullCode) {
                            setEditCode(fullCode);
                            if (!editName || editName.startsWith('ODP #') || editName.startsWith('ODC #') || editName.startsWith('OLT #') || editName.startsWith('node_')) {
                              setEditName(fullCode);
                            }
                            setToastMsg({ text: `⚡ Kode Hirarki Lengkap Terstruktur: ${fullCode}`, type: 'success' });
                          }
                        }
                      }}
                      className="text-[9.5px] font-black text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200 cursor-pointer transition-all"
                      title="Contoh: OLT1012-ODC01-ODP01"
                    >
                      ⚡ Tree Penuh
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (editingNode) {
                          const type = editType;
                          let generated = '';
                          const sameTypeNodes = nodes.filter(n => n.type === type);
                          const idx = sameTypeNodes.findIndex(n => n.id === editingNode.id);
                          const seqNum = idx >= 0 ? idx + 1 : sameTypeNodes.length + 1;
                          const seqStr = String(seqNum).padStart(2, '0');

                          if (type === 'OLT') {
                            generated = `OLT-${seqStr}`;
                          } else {
                            const connLine = lines.find(l => l.toId === editingNode.id || l.fromId === editingNode.id);
                            if (!connLine) {
                              generated = `${type}-${seqStr}`;
                            } else {
                              const pId = connLine.fromId === editingNode.id ? connLine.toId : connLine.fromId;
                              const pNode = nodes.find(n => n.id === pId);
                              const pRaw = pNode?.code || pNode?.name || '';
                              const parentNums = pRaw.match(/\d+/g);
                              const parentTag = parentNums && parentNums.length > 0
                                ? parentNums[parentNums.length - 1].padStart(2, '0')
                                : (pNode?.id.slice(-2) || '01');

                              const sibLines = lines.filter(l => l.fromId === pId || l.toId === pId);
                              const sibIds = sibLines.map(l => l.fromId === pId ? l.toId : l.fromId).filter(id => id !== editingNode.id);
                              const sameSibs = nodes.filter(n => sibIds.includes(n.id) && n.type === type);
                              const childSeq = sameSibs.length + 1;
                              const childSeqStr = String(childSeq).padStart(2, '0');

                              if (type === 'ODC') generated = `ODC-${parentTag}-${childSeqStr}`;
                              else if (type === 'ODP') generated = `ODP-${parentTag}-${childSeqStr}`;
                              else if (type === 'SPLITTER') generated = `SP-${parentTag}-${childSeqStr}`;
                              else if (type === 'ONU' || type === 'ROUTER_WIFI') {
                                const pPort = connLine.fromId === pId ? (connLine.fromPort || 1) : (connLine.toPort || 1);
                                generated = `ONU-ODP${parentTag}-P${String(pPort).padStart(2, '0')}`;
                              } else generated = `${type}-${parentTag}-${childSeqStr}`;
                            }
                          }

                          setEditCode(generated);
                          if (!editName || editName.startsWith('ODP #') || editName.startsWith('ODC #') || editName.startsWith('OLT #') || editName.startsWith('node_')) {
                            setEditName(generated);
                          }
                          setToastMsg({ text: `⚡ Kode Hirarki Ringkas: ${generated}`, type: 'success' });
                        }
                      }}
                      className="text-[9.5px] font-extrabold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 cursor-pointer transition-all"
                    >
                      ⚡ Auto-Ringkas
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. OLT1012-ODC01-ODP01 atau ODP-01-01"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                {/* Visual Tree Breadcrumb Preview */}
                {editingNode && (() => {
                  const treePath = getUpstreamHierarchyTree(editingNode.id);
                  if (treePath.length <= 1) return null;
                  return (
                    <div className="mt-1.5 p-2 bg-purple-50 rounded-xl border border-purple-200 text-[10.5px] font-mono text-purple-950">
                      <span className="font-extrabold font-sans text-purple-800 block mb-0.5">🌳 Pohon Hirarki Jalur Penyuplai:</span>
                      <div className="truncate">
                        {treePath.map(n => n.code || n.name || n.type).join(' ➔ ')}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Perangkat / Label Human:</label>
                <input
                  type="text"
                  placeholder="e.g. ODP Telkom Depan Masjid"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keterangan & Patokan Lokasi Lapangan:</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Di tiang listrik RT 02/RW 04 dekat pertigaan toko kelontong Bu Yuni"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Node Perangkat:</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OLT">🖥️ OLT Server PON</option>
                  <option value="ODC">🏢 ODC Cabinet FTTH</option>
                  <option value="ODP">🔲 ODP Box FTTH</option>
                  <option value="SPLITTER">🔀 Splitter Fiber Standalone</option>
                  <option value="ONU">🏠 ONU / ONT Pelanggan FTTH</option>
                  <option value="HTB">⚡ HTB Media Converter (A/B)</option>
                  <option value="SWITCH">🔌 Switch Hub LAN</option>
                  <option value="ROUTER">📡 Router Mikrotik Gateway</option>
                  <option value="ROUTER_WIFI">📶 Router Wireless Pelanggan</option>
                  <option value="ACCESS_POINT">📡 Access Point (AP)</option>
                </select>
              </div>

              {editType === 'HTB' ? (
                <div className="space-y-2 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200">
                  <div className="text-xs font-extrabold text-emerald-950 flex items-center justify-between">
                    <span>⚡ Port HTB Media Converter</span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Fleksibel (Misal: 2A1B 2LAN)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port Fiber A (1310nm)</label>
                      <input
                        type="number"
                        min={0}
                        max={16}
                        value={editPortsA}
                        onChange={(e) => setEditPortsA(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port Fiber B (1550nm)</label>
                      <input
                        type="number"
                        min={0}
                        max={16}
                        value={editPortsB}
                        onChange={(e) => setEditPortsB(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port LAN (RJ45)</label>
                      <input
                        type="number"
                        min={0}
                        max={32}
                        value={editPortsLan}
                        onChange={(e) => setEditPortsLan(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium italic">
                    Total: {editPortsA} Fiber A + {editPortsB} Fiber B + {editPortsLan} LAN RJ45 = {editPortsA + editPortsB + editPortsLan} Port.
                  </p>
                </div>
              ) : editType === 'SWITCH' || editType === 'ROUTER' ? (
                <div className="space-y-2 bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200">
                  <div className="text-xs font-extrabold text-blue-950 flex items-center justify-between">
                    <span>{editType === 'ROUTER' ? '📡 Port Router Mikrotik' : '🔌 Port Switch Hub LAN'}</span>
                    <span className="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-bold">Port SFP & LAN RJ45</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port SFP / SFP+ FO</label>
                      <input
                        type="number"
                        min={0}
                        max={16}
                        value={editPortsSfp}
                        onChange={(e) => setEditPortsSfp(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port LAN RJ45 (Ethernet)</label>
                      <input
                        type="number"
                        min={1}
                        max={48}
                        value={editPortsLan}
                        onChange={(e) => setEditPortsLan(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium italic">
                    Total: {editPortsSfp} SFP FO + {editPortsLan} LAN RJ45 = {editPortsSfp + editPortsLan} Port.
                  </p>
                </div>
              ) : editType === 'ONU' ? (
                <div className="space-y-2 bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200">
                  <div className="text-xs font-extrabold text-indigo-950 flex items-center justify-between">
                    <span>🏠 Port Modem ONU Pelanggan</span>
                    <span className="text-[10px] bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full font-bold">1 Fiber Optik + RJ45 LAN</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port Fiber Optik (PON)</label>
                      <input
                        type="text"
                        disabled
                        value="1 Port SC/UPC (Ke ODP)"
                        className="w-full px-2.5 py-1.5 bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Port LAN (RJ45 Ethernet)</label>
                      <select
                        value={editPortsLan}
                        onChange={(e) => setEditPortsLan(parseInt(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                      >
                        <option value={1}>1 Port LAN RJ45</option>
                        <option value={2}>2 Port LAN RJ45</option>
                        <option value={4}>4 Port LAN RJ45</option>
                        <option value={8}>8 Port LAN RJ45</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium italic">
                    Total: 1 Port Fiber Optik SC/UPC (Dropcore ODP) + {editPortsLan} LAN RJ45 = {1 + editPortsLan} Port Fisik.
                  </p>
                </div>
              ) : editType === 'OLT' ? (
                <div className="space-y-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl">
                  <div>
                    <label className="block text-xs font-bold text-blue-900 mb-1">Jumlah Port SFP PON OLT:</label>
                    <select
                      value={editCapacity}
                      onChange={(e) => setEditCapacity(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={2}>2 Port SFP PON</option>
                      <option value={4}>4 Port SFP PON</option>
                      <option value={8}>8 Port SFP PON</option>
                      <option value={16}>16 Port SFP PON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-blue-900 mb-1">Power Output Awal SFP PON (Tx Power Output):</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={editOutputPower}
                        onChange={(e) => setEditOutputPower(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-mono font-black text-blue-950 focus:outline-none"
                      />
                      <span className="text-xs font-extrabold text-blue-900">dBm</span>
                    </div>
                    <p className="text-[10px] text-blue-700 font-medium mt-1">
                      💡 Standard SFP PON Transceiver: Class C+ (+7.0 dBm) / Class C++ (+8.5 s/d +9.0 dBm)
                    </p>
                  </div>
                </div>
              ) : editType !== 'CLIENT_RJ45' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Kapasitas Port Splitter:</label>
                  <select
                    value={editCapacity}
                    onChange={(e) => setEditCapacity(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={4}>Splitter 1:4 (4 Port)</option>
                    <option value={8}>Splitter 1:8 (8 Port)</option>
                    <option value={16}>Splitter 1:16 (16 Port)</option>
                    <option value={32}>Splitter 1:32 (32 Port)</option>
                  </select>
                </div>
              ) : null}

              {/* Tautkan Perangkat dengan Data Pelanggan (ONU, Router Wireless, HTB, Switch, Access Point) */}
              {(editType === 'ONU' || editType === 'ROUTER_WIFI' || editType === 'HTB' || editType === 'SWITCH' || editType === 'ACCESS_POINT') && (
                <div className="pt-2.5 border-t border-slate-200">
                  <label className="block text-xs font-extrabold text-slate-800 mb-1 flex items-center justify-between">
                    <span>👤 Tautkan ke Pelanggan:</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">Flexibel Perangkat Pelanggan</span>
                  </label>
                  <select
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Bebas (Perangkat Infrastruktur / Belum Ditautkan) --</option>
                    {(() => {
                      // Filter out customer IDs already assigned to ANY OTHER node on the map
                      const assignedCustomerIds = nodes
                        .filter(n => n.id !== editingNode.id && n.customerId)
                        .map(n => String(n.customerId));

                      return customersList
                        .filter((c: any) => {
                          const isPppoe = c.connection_type === 'pppoe' || !c.connection_type || c.connection_type === 'ftth';
                          const isAssignedElsewhere = assignedCustomerIds.includes(String(c.id));
                          return isPppoe && !isAssignedElsewhere;
                        })
                        .map((c: any) => {
                          const online = isCustomerOnline(c);
                          return (
                            <option key={c.id} value={String(c.id)}>
                              {c.name} {c.pppoe_username ? `(${c.pppoe_username})` : ''} - Status: {online ? '🟢 ONLINE' : '🔴 OFFLINE'}
                            </option>
                          );
                        });
                    })()}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    💡 Menautkan pelanggan PPPoE akan menampilkan nama & username PPPoE di popup, serta memicu **animasi kedap-kedip merah pada marker & kabel** apabila koneksi PPPoE offline/putus!
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  const targetCap = editType === 'HTB' 
                    ? (editPortsA + editPortsB + editPortsLan) 
                    : (editType === 'SWITCH' || editType === 'ROUTER') 
                    ? (editPortsSfp + editPortsLan) 
                    : editType === 'ONU'
                    ? editPortsLan
                    : editCapacity;

                  const downgradeCheck = validateCapacityDowngrade(editingNode.id, targetCap);
                  if (!downgradeCheck.allowed) {
                    const portStr = downgradeCheck.blockingPorts.map((p, idx) => `Port #${p} (Terhubung ke: ${downgradeCheck.blockingNodeNames[idx]})`).join('\n• ');
                    setWarningModalMsg(`⚠️ TIDAK DAPAT MENGUBAH KAPASITAS PERANGKAT KE ${targetCap} PORT!\n\nPerangkat ini memiliki kabel aktif di port yang melebihi kapasitas baru:\n• ${portStr}\n\nSilakan cabut atau pindahkan kabel pada port tersebut terlebih dahulu sebelum mengecilkan kapasitas splitter!`);
                    return;
                  }

                  // Auto-rename SPLITTER/ODP if name contains "1:X" pattern and capacity changed
                  let finalName = editName;
                  if (editType === 'SPLITTER' || editType === 'ODP') {
                    const newCap = editCapacity;
                    // Replace "1:N" pattern in name with new capacity
                    if (/1:\d+/.test(finalName)) {
                      finalName = finalName.replace(/1:\d+/, `1:${newCap}`);
                    }
                  }

                  const updatedNodes = nodes.map(n => n.id === editingNode.id ? {
                    ...n,
                    name: finalName,
                    code: editCode || finalName,
                    description: editDescription,
                    type: editType,
                    outputPower: editType === 'OLT' ? editOutputPower : undefined,
                    splitterCapacity: editType === 'HTB' 
                      ? (editPortsA + editPortsB + editPortsLan) 
                      : (editType === 'SWITCH' || editType === 'ROUTER') 
                      ? (editPortsSfp + editPortsLan) 
                      : editType === 'ONU'
                      ? editPortsLan
                      : editCapacity,
                    portsA: editType === 'HTB' ? editPortsA : undefined,
                    portsB: editType === 'HTB' ? editPortsB : undefined,
                    portsSfp: (editType === 'SWITCH' || editType === 'ROUTER') ? editPortsSfp : undefined,
                    portsLan: (editType === 'HTB' || editType === 'SWITCH' || editType === 'ROUTER' || editType === 'ONU') ? editPortsLan : undefined,
                    customerId: editCustomerId || null
                  } : n);

                  setNodes(updatedNodes);
                  setEditingNode(null);
                  handleSaveTopologyToDB(updatedNodes);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer"
              >
                Simpan Perubahan & Database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Cable Port Selection Modal */}
      {connectingPair && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[2050] animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>🔌 Hubungkan Kabel Optik / LAN</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">Pilih port spesifik asal dan tujuan untuk mencolokkan kabel</p>
              </div>
              <button onClick={() => setConnectingPair(null)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer font-bold">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* FROM NODE PORT PICKER */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center">
                    A
                  </span>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-blue-700 block leading-none">Perangkat Asal</span>
                    <span className="text-xs font-black text-slate-900 truncate block">{connectingPair.fromNode.name || connectingPair.fromNode.type}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">Colokkan di Port Asal:</label>
                  <select
                    value={selectedFromPort}
                    onChange={(e) => setSelectedFromPort(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {(() => {
                      const cfg = config[connectingPair.fromNode.type];
                      const cap = connectingPair.fromNode.type === 'ONU' 
                        ? (connectingPair.fromNode.portsLan || connectingPair.fromNode.splitterCapacity || cfg.defaultCap)
                        : (connectingPair.fromNode.splitterCapacity || cfg.defaultCap);

                      const ratio = connectingPair.fromNode.splitterRatio;
                      const isAsymmetric = ratio && ratio.includes(':') && !ratio.startsWith('1:');

                      return Array.from({ length: cap }, (_, idx) => {
                        const pNum = idx + 1;
                        const occupied = lines.some(l => 
                          (l.fromId === connectingPair.fromNode.id && (l.fromPort || 1) === pNum) ||
                          (l.toId === connectingPair.fromNode.id && (l.toPort || 1) === pNum)
                        );

                        let portDesc = `Port #${pNum}`;
                        if (isAsymmetric) {
                          if (ratio === '90:10') portDesc = pNum === 1 ? `Port #1 (Pass 90% -0.8dB)` : `Port #2 (Drop 10% -10.8dB)`;
                          else if (ratio === '80:20') portDesc = pNum === 1 ? `Port #1 (Pass 80% -1.4dB)` : `Port #2 (Drop 20% -7.6dB)`;
                          else if (ratio === '70:30') portDesc = pNum === 1 ? `Port #1 (Pass 70% -2.0dB)` : `Port #2 (Drop 30% -5.8dB)`;
                          else if (ratio === '60:40') portDesc = pNum === 1 ? `Port #1 (Pass 60% -2.8dB)` : `Port #2 (Drop 40% -4.5dB)`;
                          else if (ratio === '50:50') portDesc = `Port #${pNum} (Equal 50% -3.5dB)`;
                        } else if (connectingPair.fromNode.type === 'OLT') {
                          const sfpPowers = connectingPair.fromNode.sfpPowerList || [];
                          const pwr = sfpPowers[pNum - 1] !== undefined ? sfpPowers[pNum - 1] : (connectingPair.fromNode.outputPower || 9.0);
                          portDesc = `Port #${pNum} SFP PON (+${pwr} dBm)`;
                        }

                        return (
                          <option key={pNum} value={pNum} disabled={occupied}>
                            {portDesc} {occupied ? '🔴 (Terpakai)' : '🟢 (Kosong)'}
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>
              </div>

              {/* TO NODE PORT PICKER */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center">
                    B
                  </span>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-purple-700 block leading-none">Perangkat Tujuan</span>
                    <span className="text-xs font-black text-slate-900 truncate block">{connectingPair.toNode.name || connectingPair.toNode.type}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">Port Tujuan:</label>
                  {(connectingPair.toNode.type === 'ODP' || connectingPair.toNode.type === 'ODC' || connectingPair.toNode.type === 'SPLITTER' || connectingPair.toNode.type === 'ONU') ? (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-mono font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                        IN
                      </span>
                      <div>
                        <span className="text-xs font-black text-blue-950 block">📥 PORT IN (Input Optik Penyuplai)</span>
                        <span className="text-[9.5px] text-blue-700 font-semibold block">Otomatis Terhubung ke Port Input Optik Utama</span>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={selectedToPort}
                      onChange={(e) => setSelectedToPort(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      {(() => {
                        const cfg = config[connectingPair.toNode.type];
                        const cap = connectingPair.toNode.splitterCapacity || cfg.defaultCap;

                        return Array.from({ length: cap }, (_, idx) => {
                          const pNum = idx + 1;
                          const occupied = lines.some(l => 
                            (l.fromId === connectingPair.toNode.id && (l.fromPort || 1) === pNum) ||
                            (l.toId === connectingPair.toNode.id && (l.toPort || 1) === pNum)
                          );

                          return (
                            <option key={pNum} value={pNum} disabled={occupied}>
                              Port #{pNum} {occupied ? '🔴 (Terpakai)' : '🟢 (Kosong)'}
                            </option>
                          );
                        });
                      })()}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* CABLE CORE COUNT PICKER */}
            <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-200/80 space-y-2">
              <label className="text-xs font-extrabold text-indigo-950 flex items-center justify-between">
                <span>🧵 Kapasitas Multi-Core Kabel Optik:</span>
                <span className="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
                  {selectedCableCores} Core
                </span>
              </label>
              <select
                value={selectedCableCores}
                onChange={(e) => setSelectedCableCores(parseInt(e.target.value) || 4)}
                className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
              >
                <option value={1}>1 Core (Dropcore Precon Pelanggan)</option>
                <option value={2}>2 Core (Dropcore Dual-Core)</option>
                <option value={4}>4 Core (1 Tube Feeder/Distribusi Standar)</option>
                <option value={6}>6 Core (Feeder Multi-Tube)</option>
                <option value={8}>8 Core (Distribusi Main Core)</option>
                <option value={12}>12 Core (Feeder Main Trunk)</option>
                <option value={24}>24 Core (Feeder Backbone)</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const smart = getSmartPortPairing(connectingPair.fromNode, connectingPair.toNode);
                  setSelectedFromPort(smart.nextPort);
                  setSelectedToPort(smart.nextToPort);
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                ⚡ Auto-Pilih Port Kosong
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConnectingPair(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const validation = isValidFtthConnection(connectingPair.fromNode, connectingPair.toNode, selectedFromPort, selectedToPort);
                    if (!validation.valid) {
                      setWarningModalMsg(validation.reason || 'Koneksi kabel tidak sesuai!');
                      return;
                    }

                    const newLine: LineRecord = {
                      id: `line_${Date.now()}`,
                      fromId: connectingPair.fromNode.id,
                      fromPort: selectedFromPort,
                      toId: connectingPair.toNode.id,
                      toPort: selectedToPort,
                      cableColor: selectedCableCores === 1 ? '#0284c7' : (selectedCableCores === 12 || selectedCableCores === 24 ? '#dc2626' : '#2563eb'),
                      coreNumber: `Core #1 (Biru)`,
                      totalCores: selectedCableCores,
                      coreSplicingMap: { 1: { action: 'INPUT_SPLITTER' } }
                    };

                    setLines(prev => [...prev, newLine]);

                    // Auto-sync incoming cable core count to target ODP/ODC/SPLITTER Splicing Tray!
                    setNodes(prev => prev.map(n => (n.id === connectingPair.toNode.id || n.id === connectingPair.fromNode.id) && (n.type === 'ODP' || n.type === 'ODC' || n.type === 'SPLITTER') ? {
                      ...n,
                      totalCableCores: selectedCableCores
                    } : n));

                    setHasUnsavedChanges(true);
                    setConnectingPair(null);
                    setToastMsg({ text: `🔌 Kabel (${selectedCableCores} Core) Berhasil Dicolokkan dari Port #${selectedFromPort} ➔ Port #${selectedToPort}!`, type: 'success' });
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md"
                >
                  🔌 Tancapkan Kabel Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Master Catalog Splitter & Rasio Optik Management Modal */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[2050] animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>⚙️ Master Catalog Splitter & Rasio Optik</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-100 text-purple-800">
                    {splitterCatalog.length} Tipe Terdaftar
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">Kelola catalog tipe splitter & rasio optik secara dinamis dari database</p>
              </div>
              <button onClick={() => setIsCatalogModalOpen(false)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer font-bold">✕</button>
            </div>

            {/* Form Tambah / Edit Splitter */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!catName || !catRatioCode) {
                  setWarningModalMsg('⚠️ Mohon isi Nama dan Kode Rasio Splitter!');
                  return;
                }

                try {
                  const res = await fetch('/api/ftth/splitter-types', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: editingCatId || undefined,
                      name: catName,
                      category: catCategory,
                      ratioCode: catRatioCode,
                      capacity: Number(catCapacity),
                      passLossDb: Number(catPassLoss),
                      dropLossDb: Number(catDropLoss),
                      description: catDescription
                    })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setToastMsg({ text: `✅ ${data.message}`, type: 'success' });
                    setEditingCatId(null);
                    setCatName('');
                    setCatRatioCode('');
                    setCatDescription('');
                    reloadSplitterCatalog();
                  } else {
                    setWarningModalMsg(`❌ Gagal: ${data.message}`);
                  }
                } catch (err: any) {
                  setWarningModalMsg(`❌ Error: ${err.message}`);
                }
              }}
              className={`p-4 rounded-2xl border transition-all space-y-3 ${
                editingCatId
                  ? 'bg-gradient-to-r from-purple-100 via-indigo-50 to-purple-50 border-purple-400 ring-2 ring-purple-400'
                  : 'bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-purple-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
                  <span>{editingCatId ? `✏️ Edit Spesifikasi Tipe Splitter (${catName})` : '➕ Tambah Tipe Splitter / Rasio Baru ke Database'}</span>
                </h4>
                {editingCatId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCatId(null);
                      setCatName('');
                      setCatRatioCode('');
                      setCatDescription('');
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-[10.5px] font-bold rounded-lg border border-slate-300 cursor-pointer"
                  >
                    ✕ Batal Edit
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Tipe Splitter:</label>
                  <input
                    type="text"
                    placeholder="e.g. Rasio 95:5 Custom"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Kategori Splitter:</label>
                  <select
                    value={catCategory}
                    onChange={(e) => setCatCategory(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    <option value="asymmetric">Asimetris (Ratio Cascading)</option>
                    <option value="symmetric">Simetris (PLC Splitter)</option>
                    <option value="hybrid">Hybrid (Tembak Tengah)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Kode Rasio / Tipe:</label>
                  <input
                    type="text"
                    placeholder="e.g. 95:5 atau 95:5 + 1:8"
                    value={catRatioCode}
                    onChange={(e) => setCatRatioCode(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Jml Port Output:</label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    value={catCapacity}
                    onChange={(e) => setCatCapacity(parseInt(e.target.value) || 2)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Redaman Port #1 Pass (dB):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={catPassLoss}
                    onChange={(e) => setCatPassLoss(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Redaman Port #2+ Drop (dB):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={catDropLoss}
                    onChange={(e) => setCatDropLoss(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <input
                  type="text"
                  placeholder="Keterangan opsional (e.g. Splitter khusus kabel feeder jarak jauh 10 km)"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none"
                />
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-xs shrink-0 ${
                    editingCatId ? 'bg-purple-700 hover:bg-purple-800' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {editingCatId ? '💾 Simpan Perubahan Splitter' : '➕ Simpan Splitter Baru'}
                </button>
              </div>
            </form>

            {/* Catalog List Table */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold text-slate-800 block">Daftar Master Catalog Splitter Terdaftar:</span>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {splitterCatalog.map((item) => (
                  <div key={item.id} className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs transition-all ${
                    editingCatId === item.id ? 'bg-purple-100/70 border-purple-400 ring-2 ring-purple-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl font-mono font-bold text-xs flex items-center justify-center text-white shrink-0 ${
                        item.category === 'hybrid' ? 'bg-amber-600' : item.category === 'asymmetric' ? 'bg-indigo-600' : 'bg-blue-600'
                      }`}>
                        {item.capacity}P
                      </span>
                      <div>
                        <div className="font-extrabold text-slate-900 flex items-center gap-2">
                          <span>{item.name}</span>
                          <span className="text-[9.5px] font-mono px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-700 font-bold">
                            {item.ratioCode}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 font-medium">
                          Port #1 Pass Loss: <strong className="text-slate-800">-{item.passLossDb} dB</strong> | Port #2+ Drop Loss: <strong className="text-slate-800">-{item.dropLossDb} dB</strong>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(item.id);
                          setCatName(item.name || '');
                          setCatCategory(item.category || 'asymmetric');
                          setCatRatioCode(item.ratioCode || '');
                          setCatCapacity(item.capacity || 2);
                          setCatPassLoss(item.passLossDb !== undefined ? item.passLossDb : 0.8);
                          setCatDropLoss(item.dropLossDb !== undefined ? item.dropLossDb : 10.8);
                          setCatDescription(item.description || '');
                        }}
                        className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-all cursor-pointer font-bold text-xs border border-purple-200"
                        title="Edit Splitter"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Hapus tipe splitter ${item.name} dari catalog master?`)) return;
                          try {
                            const res = await fetch(`/api/ftth/splitter-types/${item.id}`, { method: 'DELETE' });
                            const data = await res.json();
                            if (data.success) {
                              setToastMsg({ text: `✅ ${data.message}`, type: 'info' });
                              if (editingCatId === item.id) {
                                setEditingCatId(null);
                                setCatName('');
                                setCatRatioCode('');
                              }
                              reloadSplitterCatalog();
                            }
                          } catch (err: any) {
                            setWarningModalMsg(`❌ Gagal menghapus: ${err.message}`);
                          }
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer font-bold text-xs border border-rose-200"
                        title="Hapus Splitter"
                      >
                        🗑️ Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Cable Color & Core Modal */}
      {editingCableId && (() => {
        const targetLine = lines.find(l => l.id === editingCableId);
        if (!targetLine) return null;

        const fromNode = nodes.find(n => n.id === targetLine.fromId);
        const toNode = nodes.find(n => n.id === targetLine.toId);

        const destinationNodeId = targetLine.toId;
        const outgoingCables = lines.filter(l => l.id !== targetLine.id && (l.fromId === destinationNodeId || l.toId === destinationNodeId));

        const standard12Cores = [
          { name: 'Core #1 - Biru', color: '#2563eb' },
          { name: 'Core #2 - Oranye', color: '#ea580c' },
          { name: 'Core #3 - Hijau', color: '#16a34a' },
          { name: 'Core #4 - Cokelat', color: '#78350f' },
          { name: 'Core #5 - Abu-abu', color: '#64748b' },
          { name: 'Core #6 - Putih', color: '#94a3b8' },
          { name: 'Core #7 - Merah', color: '#dc2626' },
          { name: 'Core #8 - Hitam', color: '#0f172a' },
          { name: 'Core #9 - Kuning', color: '#eab308' },
          { name: 'Core #10 - Ungu', color: '#9333ea' },
          { name: 'Core #11 - Pink', color: '#ec4899' },
          { name: 'Core #12 - Toska', color: '#06b6d4' }
        ];

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[2060] animate-fade-in">
            <div className="bg-white w-full max-w-full lg:max-w-4xl h-[90vh] flex flex-col justify-between rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 font-sans space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>🧵 Spesifikasi & Splicing Matrix Core Kabel</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Jalur: {fromNode?.name || fromNode?.type} ➔ {toNode?.name || toNode?.type}
                  </p>
                </div>
                <button onClick={() => setEditingCableId(null)} className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full cursor-pointer font-bold">✕</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 shrink-0">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Kapasitas Core Kabel Ini:</label>
                  <select
                    value={editTotalCores}
                    onChange={(e) => setEditTotalCores(parseInt(e.target.value) || 4)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value={1}>1 Core (Dropcore Pelanggan)</option>
                    <option value={2}>2 Core (Dropcore Dual-Core)</option>
                    <option value={4}>4 Core (1 Tube Feeder/Distribusi)</option>
                    <option value={6}>6 Core (Feeder Multi-Tube)</option>
                    <option value={8}>8 Core (Distribusi Main Core)</option>
                    <option value={12}>12 Core (Feeder Main Trunk)</option>
                    <option value={24}>24 Core (Feeder Backbone)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Label Core Utama / Identitas Kabel:</label>
                  <input
                    type="text"
                    placeholder="e.g. Core #1 (Biru) / Feeder ODC-01"
                    value={editCoreNumber}
                    onChange={(e) => setEditCoreNumber(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">🎨 Warna Kabel Di Peta:</label>
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300">
                    <input
                      type="color"
                      value={editCableColor}
                      onChange={(e) => setEditCableColor(e.target.value)}
                      className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0 shrink-0 bg-transparent"
                      title="Pilih Warna Custom Hex"
                    />
                    <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                      {[
                        { name: 'Biru Sky', hex: '#0284c7' },
                        { name: 'Ungu', hex: '#9333ea' },
                        { name: 'Merah', hex: '#dc2626' },
                        { name: 'Hijau', hex: '#16a34a' },
                        { name: 'Kuning', hex: '#eab308' },
                        { name: 'Oranye', hex: '#ea580c' },
                        { name: 'Hitam', hex: '#0f172a' }
                      ].map(preset => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => setEditCableColor(preset.hex)}
                          className={`w-5 h-5 rounded-full shrink-0 border transition-transform cursor-pointer ${
                            editCableColor === preset.hex ? 'scale-125 ring-2 ring-blue-500 border-white' : 'border-black/20 hover:scale-110'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 🧵 Simulator Splicing Matrix Per Core Kabel Ini */}
              <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl border border-indigo-700 space-y-3 shadow-sm flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between border-b border-indigo-800/80 pb-2 shrink-0">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-200">
                    🧵 Splicing Matrix Tiap Core Kabel Ini ({editTotalCores} Core):
                  </h4>
                  <span className="text-[10px] text-indigo-300 font-bold bg-indigo-900 px-2 py-0.5 rounded-full border border-indigo-600">
                    Status Splicing Physical
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto pr-1.5 flex-1 min-h-0 max-h-[60vh]">
                  {(() => {
                    const standard12 = [
                      { num: 1, name: 'Biru', hex: '#2563eb' },
                      { num: 2, name: 'Oranye', hex: '#ea580c' },
                      { num: 3, name: 'Hijau', hex: '#16a34a' },
                      { num: 4, name: 'Cokelat', hex: '#78350f' },
                      { num: 5, name: 'Abu-abu', hex: '#64748b' },
                      { num: 6, name: 'Putih', hex: '#cbd5e1' },
                      { num: 7, name: 'Merah', hex: '#dc2626' },
                      { num: 8, name: 'Hitam', hex: '#0f172a' },
                      { num: 9, name: 'Kuning', hex: '#eab308' },
                      { num: 10, name: 'Ungu', hex: '#9333ea' },
                      { num: 11, name: 'Pink', hex: '#ec4899' },
                      { num: 12, name: 'Toska', hex: '#06b6d4' }
                    ];

                    // Track used target cores across all cores in this cable to prevent duplicate splicing collisions
                    const usedTargetCoreMap = new Map<string, number>();
                    Object.entries(editCoreSplicingMap).forEach(([cStr, cfg]: [string, any]) => {
                      const cNum = parseInt(cStr);
                      const isBypassCfg = cfg?.action === 'BYPASS_PASS' || cfg?.action === 'BYPASS' || cfg?.action === 'BYPASS_PASS_THROUGH';
                      if (isBypassCfg && cfg?.targetCableId && cfg?.targetCoreNum) {
                        usedTargetCoreMap.set(`${cfg.targetCableId}:${cfg.targetCoreNum}`, cNum);
                      }
                    });

                    // Helper to auto-find first un-occupied target core on a target cable
                    const getFirstFreeTargetCoreNum = (targetCableId: string, currentCoreNum: number) => {
                      const targetC = outgoingCables.find(c => c.id === targetCableId);
                      const totalC = targetC?.totalCores || 4;
                      for (let c = 1; c <= totalC; c++) {
                        const key = `${targetCableId}:${c}`;
                        const usedBy = usedTargetCoreMap.get(key);
                        if (usedBy === undefined || usedBy === currentCoreNum) {
                          return c;
                        }
                      }
                      return 1;
                    };

                    return Array.from({ length: editTotalCores }, (_, idx) => {
                      const coreNum = idx + 1;
                      const spec = standard12[(coreNum - 1) % 12];
                      const activeConfig = editCoreSplicingMap[coreNum] || (coreNum === 1 ? { action: 'INPUT_SPLITTER' } : { action: 'BYPASS_PASS' });
                      const isBypassAction = activeConfig.action === 'BYPASS_PASS' || activeConfig.action === 'BYPASS' || activeConfig.action === 'BYPASS_PASS_THROUGH';

                      return (
                        <div key={coreNum} className="p-2.5 bg-indigo-900/60 rounded-xl border border-indigo-700/80 flex flex-col gap-1.5 text-xs">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full shrink-0 shadow-xs border border-white/20" style={{ backgroundColor: spec.hex }} />
                              <span className="font-bold text-white text-[11px]">Core #{coreNum} ({spec.name})</span>
                            </div>
                            <select
                              value={isBypassAction ? 'BYPASS_PASS' : (activeConfig.action || 'SPARE')}
                              onChange={(e) => {
                                const act = e.target.value;
                                setEditCoreSplicingMap(prev => ({
                                  ...prev,
                                  [coreNum]: {
                                    ...prev[coreNum],
                                    action: act,
                                    targetCableId: act === 'BYPASS_PASS' ? (prev[coreNum] as any)?.targetCableId : undefined,
                                    targetCoreNum: act === 'BYPASS_PASS' ? (prev[coreNum] as any)?.targetCoreNum : undefined
                                  } as any
                                }));
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer border focus:outline-none ${
                                activeConfig.action === 'INPUT_SPLITTER'
                                  ? 'bg-emerald-600 text-white border-emerald-400'
                                  : isBypassAction
                                  ? 'bg-amber-600 text-white border-amber-400'
                                  : 'bg-slate-700 text-slate-300 border-slate-500'
                              }`}
                            >
                              <option value="INPUT_SPLITTER">📥 IN Splitter ODP (Loss Splitter)</option>
                              <option value="BYPASS_PASS">⏩ BYPASS (Terus Tanpa Loss Splitter)</option>
                              <option value="SPARE">⚪ SPARE (Cadangan Kosong)</option>
                            </select>
                          </div>

                          {isBypassAction && (
                            <div className="mt-1 p-2 bg-amber-950/80 rounded-xl border border-amber-700/80 space-y-1.5 text-xs">
                              <div className="text-[10px] font-bold text-amber-200 flex items-center justify-between">
                                <span>🔀 Diteruskan / Di-las Ke Kabel Keluar Mana?</span>
                              </div>
                              {outgoingCables.length > 0 ? (() => {
                                const selectedTargetCableId = (activeConfig as any).targetCableId || "";
                                const selectedTargetCoreNum = (activeConfig as any).targetCoreNum;
                                const targetC = outgoingCables.find(c => c.id === selectedTargetCableId);
                                const targetTotalC = targetC?.totalCores || 4;

                                return (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {/* 1. SELECT OUTGOING CABLE (LEFT DROPDOWN) */}
                                    <select
                                      value={selectedTargetCableId}
                                      onChange={(e) => {
                                        const targetId = e.target.value;
                                        setEditCoreSplicingMap(prev => ({
                                          ...prev,
                                          [coreNum]: { ...prev[coreNum], targetCableId: targetId || undefined, targetCoreNum: undefined } as any
                                        }));
                                      }}
                                      className="w-full px-2 py-1 bg-amber-900 border border-amber-600 rounded-lg text-[10px] font-bold text-white cursor-pointer focus:outline-none"
                                    >
                                      <option value="">-- Pilih Kabel Keluar --</option>
                                      {outgoingCables.map((outC) => {
                                        const destId = outC.fromId === destinationNodeId ? outC.toId : outC.fromId;
                                        const destNode = nodes.find(n => n.id === destId);
                                        return (
                                          <option key={outC.id} value={outC.id}>
                                            📤 Keluar Ke: {destNode?.name || destNode?.type || 'Perangkat'} ({outC.totalCores || 4} Core)
                                          </option>
                                        );
                                      })}
                                    </select>

                                    {/* 2. SELECT TARGET CORE & COLOR (RIGHT DROPDOWN) */}
                                    {selectedTargetCableId ? (
                                      <select
                                        value={selectedTargetCoreNum || ""}
                                        onChange={(e) => {
                                          const tCore = parseInt(e.target.value) || undefined;
                                          setEditCoreSplicingMap(prev => ({
                                            ...prev,
                                            [coreNum]: { ...prev[coreNum], targetCableId: selectedTargetCableId, targetCoreNum: tCore } as any
                                          }));
                                        }}
                                        className="w-full px-2 py-1 bg-amber-900 border border-amber-600 rounded-lg text-[10px] font-bold text-white cursor-pointer focus:outline-none"
                                      >
                                        <option value="">-- Pilih Core Tujuan --</option>
                                        {Array.from({ length: targetTotalC }, (_, cIdx) => {
                                          const cNum = cIdx + 1;
                                          const cSpec = standard12[(cNum - 1) % 12];
                                          const key = `${selectedTargetCableId}:${cNum}`;
                                          const usedByCoreNum = usedTargetCoreMap.get(key);
                                          const isOccupiedByOther = usedByCoreNum !== undefined && usedByCoreNum !== coreNum;

                                          return (
                                            <option key={cNum} value={cNum} disabled={isOccupiedByOther}>
                                              {isOccupiedByOther ? `🔴 Core #${cNum} (${cSpec.name}) - Sdh Di-las Core #${usedByCoreNum}` : `🔹 Di-las ke Core #${cNum} (${cSpec.name})`}
                                            </option>
                                          );
                                        })}
                                      </select>
                                    ) : (
                                      <select
                                        disabled
                                        className="w-full px-2 py-1 bg-amber-950/60 border border-amber-800/80 rounded-lg text-[10px] font-bold text-amber-400/60 cursor-not-allowed focus:outline-none"
                                      >
                                        <option value="">-- Pilih Core Tujuan --</option>
                                      </select>
                                    )}
                                  </div>
                                );
                              })() : (
                                <div className="text-[9.5px] text-amber-300 font-semibold italic">
                                  ⚡ (Kabel ini akan meneruskan sinyal optik murni tanpa dipotong redaman splitter -10.5dB!)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCableId(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updatedLines = lines.map(l => l.id === editingCableId ? {
                      ...l,
                      cableColor: editCableColor,
                      coreNumber: editCoreNumber,
                      totalCores: editTotalCores,
                      coreSplicingMap: editCoreSplicingMap as any
                    } : l);
                    setLines(updatedLines);
                    setHasUnsavedChanges(true);
                    setEditingCableId(null);
                    handleSaveTopologyToDB(nodes, updatedLines);
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-md"
                >
                  💾 Simpan Spesifikasi Kabel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Splitter, HTB, Switch, Router & ONU Device Port Inspector Modal */}
      {inspectingNode && (() => {
        const isHTB = inspectingNode.type === 'HTB';
        const isNetDevice = inspectingNode.type === 'SWITCH' || inspectingNode.type === 'ROUTER' || inspectingNode.type === 'ROUTER_WIFI' || inspectingNode.type === 'ACCESS_POINT';
        const isONU = inspectingNode.type === 'ONU';
        const isRouterWifi = inspectingNode.type === 'ROUTER_WIFI';
        const isAccessPoint = inspectingNode.type === 'ACCESS_POINT';

        const pA = inspectingNode.portsA !== undefined ? inspectingNode.portsA : 1;
        const pB = inspectingNode.portsB !== undefined ? inspectingNode.portsB : 1;
        const pSfp = inspectingNode.portsSfp !== undefined ? inspectingNode.portsSfp : (inspectingNode.type === 'ROUTER' ? 1 : 0);
        const pLan = inspectingNode.portsLan !== undefined ? inspectingNode.portsLan : (inspectingNode.type === 'ONU' ? (inspectingNode.splitterCapacity || 1) : (inspectingNode.type === 'ROUTER_WIFI' ? 4 : (inspectingNode.type === 'ACCESS_POINT' ? 2 : (inspectingNode.type === 'ROUTER' ? 5 : 8))));

        const cap = isHTB 
          ? (pA + pB + pLan) 
          : isNetDevice
          ? (pSfp + pLan)
          : isONU
          ? (1 + pLan)
          : (inspectingNode.splitterCapacity || config[inspectingNode.type]?.defaultCap || 8);

        const { usedPortsCount, remainingPortsCount, portMap, incomingInputNode } = getNodePortStats(inspectingNode.id, cap);

        const getPortLabel = (portNum: number) => {
          if (isHTB) {
            if (portNum <= pA) return `⚡ Fiber A #${portNum}`;
            if (portNum <= pA + pB) return `⚡ Fiber B #${portNum - pA}`;
            return `🔌 LAN RJ45 #${portNum - (pA + pB)}`;
          }
          if (isRouterWifi) {
            if (portNum === 1) return `🌐 Port WAN (Input)`;
            return `🔌 Port LAN #${portNum - 1}`;
          }
          if (isAccessPoint) {
            if (portNum === 1) return `🌐 Port LAN/PoE IN`;
            return `🔌 Port LAN OUT #${portNum - 1}`;
          }
          if (isNetDevice) {
            if (pSfp > 0 && portNum <= pSfp) return `⚡ Port SFP #${portNum}`;
            return `🔌 LAN RJ45 #${portNum - pSfp}`;
          }
          if (isONU) {
            if (portNum === 1) return `🔵 Fiber PON (Input Optik)`;
            return `🔌 LAN RJ45 #${portNum - 1}`;
          }
          return `Port OUT #${portNum}`;
        };

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[2000] animate-fade-in">
            <div className="bg-white w-full max-w-full lg:max-w-4xl rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                    <span>{isHTB ? '⚡ Inspector Port HTB' : isNetDevice ? `🔌 Inspector Port ${inspectingNode.type}` : isONU ? '🏠 Inspector Port ONU Pelanggan' : `🔌 Inspector Port ${inspectingNode.type}`}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-100 text-purple-800">
                      {isHTB ? `${pA}A${pB}B ${pLan}LAN` : isNetDevice ? `${pSfp}SFP ${pLan}LAN` : isONU ? `1 PON FO + ${pLan} LAN` : `1:${cap}`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{inspectingNode.name} (ID: {inspectingNode.id})</p>
                </div>
                <button
                  onClick={() => setInspectingNode(null)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Stats Summary Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-center">
                  <div className="text-[10px] font-bold uppercase text-purple-700">{isHTB || isNetDevice || isONU ? 'Kapasitas Port' : 'Kapasitas Splitter'}</div>
                  <div className="text-lg font-black text-purple-950 font-mono">{isHTB || isNetDevice || isONU ? `${cap} Port` : `1:${cap}`}</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                  <div className="text-[10px] font-bold uppercase text-blue-700">Port Dicolokkan</div>
                  <div className="text-lg font-black text-blue-950 font-mono">{usedPortsCount} Port</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                  <div className="text-[10px] font-bold uppercase text-emerald-700">Sisa Port Kosong</div>
                  <div className="text-lg font-black text-emerald-950 font-mono">{remainingPortsCount} Port</div>
                </div>
              </div>

              {/* Optical Power Budget & dBm Status Banner */}
              {inspectingNode.type !== 'OLT' && (() => {
                const opt = calculateNodeOpticalPower(inspectingNode.id);
                if (opt.inputPower === 0 && opt.outputPower === 0) return null;

                const isGood = opt.outputPower >= -23;
                const isWarning = opt.outputPower < -23 && opt.outputPower >= -27;

                return (
                  <div className={`p-4 rounded-2xl border backdrop-blur-xs space-y-2 font-mono text-xs ${
                    isGood 
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs' 
                      : isWarning 
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs' 
                      : 'bg-rose-50/90 border-rose-300 text-rose-950 shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between font-extrabold pb-2 border-b border-current/20 font-sans">
                      <span className="flex items-center gap-1.5">
                        <span>⚡ ESTIMASI POWER OPTIK MASUK & KELUAR</span>
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black ${
                        isGood ? 'bg-emerald-200 text-emerald-900' : isWarning ? 'bg-amber-200 text-amber-900' : 'bg-rose-200 text-rose-900 animate-pulse'
                      }`}>
                        {isGood ? '🟢 Sinyal Ideal' : isWarning ? '🟡 Warning / Redaman Sedang' : '🔴 Critical Loss (Drop)'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 font-sans">
                      <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-200/60">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Daya Masuk (Rx In)</span>
                        <span className="text-sm font-black font-mono text-emerald-900">{opt.inputPower > 0 ? `+${opt.inputPower}` : opt.inputPower} dBm</span>
                        <span className="text-[9px] text-slate-500 font-semibold block truncate">Dari: {opt.upstreamName} ({formatDistance(opt.cableLengthM)})</span>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-xl border border-blue-200/60">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Power Keluar per Port</span>
                        <span className="text-sm font-black font-mono text-blue-900">{opt.outputPower > 0 ? `+${opt.outputPower}` : opt.outputPower} dBm</span>
                        <span className="text-[9px] text-blue-700 font-semibold block">Tiap Port Splitter ({inspectingNode.splitterRatio || `1:${cap}`})</span>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-xl border border-rose-200/60">
                        <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Loss Redaman</span>
                        <span className="text-sm font-black font-mono text-rose-800">-{opt.lossDb} dB</span>
                        <span className="text-[9px] text-rose-600 font-semibold block">Kabel + Splitter Loss</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Power Output Awal SFP PON OLT Field (dBm) - Per Port Config */}
              {inspectingNode.type === 'OLT' && (
                <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-2xl border border-blue-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
                    <div>
                      <h4 className="text-xs font-extrabold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                        <span>⚡ Daya Pancar (Tx Power Output) Per-Port SFP PON</span>
                      </h4>
                      <p className="text-[11px] text-blue-700 font-medium">Setiap modul SFP PON dapat menggunakan modul berlainan (Class C+, C++, N2, dll).</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-600">Jml Port PON:</span>
                      <select
                        value={inspectingNode.splitterCapacity || 4}
                        onChange={(e) => {
                          const newCap = parseInt(e.target.value);
                          const downgradeCheck = validateCapacityDowngrade(inspectingNode.id, newCap);
                          if (!downgradeCheck.allowed) {
                            const portStr = downgradeCheck.blockingPorts.map((p, idx) => `Port SFP #${p} (Terhubung ke: ${downgradeCheck.blockingNodeNames[idx]})`).join('\n• ');
                            setWarningModalMsg(`⚠️ TIDAK DAPAT MENGUBAH KAPASITAS OLT KE ${newCap} PORT PON!\n\nOLT ini memiliki kabel aktif pada port yang melebihi kapasitas baru:\n• ${portStr}\n\nSilakan cabut atau pindahkan kabel pada port tersebut terlebih dahulu sebelum mengurangi port PON!`);
                            return;
                          }

                          setNodes(prev => prev.map(n => n.id === inspectingNode.id ? { ...n, splitterCapacity: newCap } : n));
                          setInspectingNode(prev => prev ? { ...prev, splitterCapacity: newCap } : null);
                          setHasUnsavedChanges(true);
                        }}
                        className="px-2.5 py-1 bg-white border border-blue-300 rounded-xl text-xs font-bold text-blue-900 shadow-xs cursor-pointer focus:outline-none"
                      >
                        <option value={2}>2 Port PON</option>
                        <option value={4}>4 Port PON</option>
                        <option value={8}>8 Port PON</option>
                        <option value={16}>16 Port PON</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {Array.from({ length: inspectingNode.splitterCapacity || 4 }, (_, idx) => {
                      const portNum = idx + 1;
                      const currentSfpPowers = inspectingNode.sfpPowerList || [];
                      const portPower = currentSfpPowers[idx] !== undefined 
                        ? currentSfpPowers[idx] 
                        : (inspectingNode.outputPower !== undefined ? inspectingNode.outputPower : 9.0);

                      return (
                        <div key={portNum} className="p-2.5 bg-white/90 rounded-xl border border-blue-100 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-mono font-bold text-[10px] flex items-center justify-center">
                              #{portNum}
                            </span>
                            <div>
                              <span className="font-bold text-slate-800">Port SFP PON {portNum}</span>
                              <span className="text-[10px] text-slate-400 block">Tx Power Output Laser</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              step="0.1"
                              value={portPower}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const newPowers = [...(inspectingNode.sfpPowerList || Array.from({ length: inspectingNode.splitterCapacity || 4 }, () => inspectingNode.outputPower || 9.0))];
                                newPowers[idx] = val;

                                setNodes(prev => prev.map(n => n.id === inspectingNode.id ? { ...n, sfpPowerList: newPowers } : n));
                                setInspectingNode(prev => prev ? { ...prev, sfpPowerList: newPowers } : null);
                                setHasUnsavedChanges(true);
                              }}
                              className="w-20 px-2 py-1 bg-white border border-blue-300 rounded-lg text-xs font-mono font-black text-blue-950 text-center shadow-xs"
                            />
                            <span className="text-xs font-extrabold text-blue-900">dBm</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 🧵 Daftar Kabel Fiber Terhubung Ke Perangkat / ODP Ini */}
              {(inspectingNode.type === 'ODP' || inspectingNode.type === 'ODC' || inspectingNode.type === 'SPLITTER') && (() => {
                const attachedCables = lines.filter(l => l.fromId === inspectingNode.id || l.toId === inspectingNode.id);
                if (attachedCables.length === 0) return null;

                return (
                  <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl border border-indigo-700 shadow-md space-y-3">
                    <div className="flex items-center justify-between border-b border-indigo-800/70 pb-2">
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-200 flex items-center gap-2">
                          <span>🧵 Daftar Kabel Fiber Terhubung Ke ODP Ini ({attachedCables.length} Kabel)</span>
                        </h4>
                        <p className="text-[10.5px] text-indigo-300 font-medium">Klik pada kabel di bawah untuk membuka simulator splicing matrix per-kabel secara fisik.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                      {attachedCables.map((c) => {
                        const otherNodeId = c.fromId === inspectingNode.id ? c.toId : c.fromId;
                        const otherNode = nodes.find(n => n.id === otherNodeId);
                        const isIncoming = c.toId === inspectingNode.id;
                        const totalC = c.totalCores || 4;
                        const colorHex = c.cableColor || '#2563eb';

                        return (
                          <div key={c.id} className="p-3 bg-indigo-900/60 hover:bg-indigo-900/90 rounded-xl border border-indigo-700/80 flex items-center justify-between gap-2.5 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-white/20" style={{ backgroundColor: colorHex }} />
                              <div className="min-w-0">
                                <div className="text-xs font-extrabold text-white truncate flex items-center gap-1">
                                  <span>{isIncoming ? '📥 Masuk:' : '📤 Keluar:'}</span>
                                  <span className="text-indigo-200 truncate">{otherNode?.name || otherNode?.type || 'Perangkat'}</span>
                                </div>
                                <div className="text-[10px] text-indigo-300 font-mono mt-0.5 flex items-center gap-2">
                                  <span className="font-bold text-emerald-300">{totalC} Core</span>
                                  {c.coreNumber && <span className="truncate">| {c.coreNumber}</span>}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectingNode(null);
                                (window as any).__editCableColorModal(c.id);
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold cursor-pointer border border-blue-400 shrink-0 shadow-xs transition-all"
                            >
                              🧵 Edit Core
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Change Ratio or Edit Port Config Button */}
              {!isHTB && !isNetDevice && !isONU && inspectingNode.type !== 'OLT' && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-xs font-bold text-slate-700">⚙️ Rasio Splitter & Redaman:</span>
                  <select
                    value={inspectingNode.splitterRatio || `1:${cap}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      let newCap = cap;
                      if (val === '1:2') newCap = 2;
                      else if (val === '1:4') newCap = 4;
                      else if (val === '1:8') newCap = 8;
                      else if (val === '1:16') newCap = 16;
                      else if (val === '1:32') newCap = 32;
                      else if (val.includes('+')) {
                        const subCap = parseInt(val.split('1:')[1]) || 8;
                        newCap = 1 + subCap; // 1 Feeder Port + N Local Customer Ports!
                      } else if (val.includes(':')) newCap = 2; // Asymmetric 90:10 has 2 branch outputs

                      const downgradeCheck = validateCapacityDowngrade(inspectingNode.id, newCap);
                      if (!downgradeCheck.allowed) {
                        const portStr = downgradeCheck.blockingPorts.map((p, idx) => `Port #${p} (Terhubung ke: ${downgradeCheck.blockingNodeNames[idx]})`).join('\n• ');
                        setWarningModalMsg(`⚠️ TIDAK DAPAT MENGUBAH KAPASITAS SPLITTER KE ${val} (${newCap} PORT)!\n\nSplitter ini memiliki kabel aktif di port yang melebihi kapasitas baru:\n• ${portStr}\n\nSilakan cabut atau pindahkan kabel pada port tersebut terlebih dahulu sebelum mengecilkan kapasitas splitter!`);
                        return;
                      }

                      setNodes(prev => prev.map(n => n.id === inspectingNode.id ? { ...n, splitterRatio: val, splitterCapacity: newCap } : n));
                      setInspectingNode(prev => prev ? { ...prev, splitterRatio: val, splitterCapacity: newCap } : null);
                      setHasUnsavedChanges(true);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer focus:outline-none"
                  >
                    <optgroup label="Splitter Simetris (PLC Splitter)">
                      {splitterCatalog.filter(s => s.category === 'symmetric').map(s => (
                        <option key={s.id} value={s.ratioCode}>{s.name} ({s.capacity} Port - Loss ~{s.passLossDb} dB)</option>
                      ))}
                    </optgroup>
                    <optgroup label="Splitter Asimetris (Ratio Cascading)">
                      {splitterCatalog.filter(s => s.category === 'asymmetric').map(s => (
                        <option key={s.id} value={s.ratioCode}>{s.name} (Pass {s.passLossDb}dB / Drop {s.dropLossDb}dB)</option>
                      ))}
                    </optgroup>
                    <optgroup label="🔥 Hybrid Tembak Tengah Jalan (Ratio + PLC Lokal)">
                      {splitterCatalog.filter(s => s.category === 'hybrid').map(s => (
                        <option key={s.id} value={s.ratioCode}>{s.name} ({s.capacity} Port)</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              )}

              {/* Dedicated Port IN (Input Optik) Section for ODP, ODC & Splitters */}
              {(inspectingNode.type === 'ODP' || inspectingNode.type === 'ODC' || inspectingNode.type === 'SPLITTER') && (
                <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-blue-600 text-white font-mono font-black text-xs flex items-center justify-center shadow-xs">
                      IN
                    </span>
                    <div>
                      <span className="text-xs font-black text-blue-950 block">📥 Port IN (Input Sinyal Optik Penyuplai)</span>
                      <span className="text-[11px] text-blue-700 font-semibold">
                        {incomingInputNode ? `Terhubung dari: ${incomingInputNode.name || incomingInputNode.type}` : '⚪ Belum Dicolokkan Kabel Induk Penyuplai'}
                      </span>
                    </div>
                  </div>
                  {incomingInputNode && (() => {
                    const opt = calculateNodeOpticalPower(inspectingNode.id);
                    if (opt.inputPower === 0) return null;
                    return (
                      <div className="text-right">
                        <span className="text-[10px] text-blue-600 font-bold block uppercase">Daya Masuk</span>
                        <span className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-xs font-mono font-black shadow-xs inline-block">
                          {opt.inputPower > 0 ? `+${opt.inputPower}` : opt.inputPower} dBm
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Visual Splitter Port Grid */}
              <div className="space-y-2">
                <span className="text-xs font-extrabold text-slate-800 block">Daftar Port OUT Splitter Real-Time ({cap} Port Output):</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {Array.from({ length: cap }, (_, idx) => {
                    const portNum = idx + 1;
                    const assignment = portMap.get(portNum);
                    const isOccupied = Boolean(assignment);

                    const currentRatio = inspectingNode.splitterRatio;
                    const isHybrid = currentRatio && currentRatio.includes('+');
                    const isAsymmetric = currentRatio && currentRatio.includes(':') && !currentRatio.startsWith('1:') && !isHybrid;
                    let branchLabel = '';
                    if (isHybrid) {
                      const ratioPart = currentRatio.split(' +')[0];
                      const subPart = currentRatio.split('+ ')[1] || '1:8';
                      if (portNum === 1) branchLabel = `Pass ${ratioPart.split(':')[0]}% (Feeder Out)`;
                      else branchLabel = `Drop ${ratioPart.split(':')[1]}% + ${subPart} (Lokal)`;
                    } else if (isAsymmetric) {
                      if (currentRatio === '90:10') branchLabel = portNum === 1 ? 'Pass 90% (-0.8dB)' : 'Drop 10% (-10.8dB)';
                      else if (currentRatio === '80:20') branchLabel = portNum === 1 ? 'Pass 80% (-1.4dB)' : 'Drop 20% (-7.6dB)';
                      else if (currentRatio === '70:30') branchLabel = portNum === 1 ? 'Pass 70% (-2.0dB)' : 'Drop 30% (-5.8dB)';
                      else if (currentRatio === '60:40') branchLabel = portNum === 1 ? 'Pass 60% (-2.8dB)' : 'Drop 40% (-4.5dB)';
                      else if (currentRatio === '50:50') branchLabel = 'Equal 50% (-3.5dB)';
                    }

                    return (
                      <div
                        key={portNum}
                        className={`p-3 rounded-2xl border text-xs flex flex-col justify-between space-y-1.5 transition-all ${
                          isOccupied
                            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-xs'
                            : 'bg-slate-50 border-dashed border-slate-300 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold font-mono text-[11px]">{getPortLabel(portNum)}</span>
                          <span className={`w-2.5 h-2.5 rounded-full ${isOccupied ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                        </div>

                        {branchLabel && (
                          <div className="text-[9px] font-mono font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            {branchLabel}
                          </div>
                        )}

                        {isOccupied ? (
                          <div className="space-y-1">
                            <div className="font-extrabold text-[11px] truncate text-emerald-900">
                              {assignment?.targetNode?.name || assignment?.targetNode?.type || 'Terhubung'}
                            </div>
                            <div className="text-[9px] text-emerald-700 font-semibold">Tipe: {assignment?.targetNode?.type || 'Node'}</div>
                            
                            {/* Instant Port Transfer Selector (Preserves Cable Geometry & Waypoints) */}
                            {assignment?.lineId && (
                              <div className="mt-1 pt-1 border-t border-emerald-200/80 flex items-center justify-between">
                                <span className="text-[9px] font-bold text-emerald-800">🔀 Pindah:</span>
                                <select
                                  value={portNum}
                                  onChange={(e) => {
                                    const newTargetPort = parseInt(e.target.value);
                                    if (newTargetPort === portNum) return;

                                    setLines(prev => prev.map(l => {
                                      if (l.id === assignment.lineId) {
                                        if (l.fromId === inspectingNode.id) return { ...l, fromPort: newTargetPort };
                                        if (l.toId === inspectingNode.id) return { ...l, toPort: newTargetPort };
                                      }
                                      return l;
                                    }));
                                    setHasUnsavedChanges(true);
                                    setToastMsg({ text: `🔀 Kabel ke ${assignment.targetNode?.name || 'Perangkat'} berhasil dipindahkan dari Port #${portNum} ➔ Port #${newTargetPort}! (Jalur kabel & waypoint utuh)`, type: 'success' });
                                  }}
                                  className="px-1 py-0.5 bg-white border border-emerald-300 rounded text-[9px] font-bold font-mono text-emerald-950 shadow-xs cursor-pointer focus:outline-none"
                                >
                                  <option value={portNum}>Port #${portNum}</option>
                                  {Array.from({ length: cap }, (_, i) => i + 1)
                                    .filter(p => p !== portNum && !portMap.has(p))
                                    .map(p => (
                                      <option key={p} value={p}>Ke Port #{p}</option>
                                    ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 font-semibold italic">Kosong</div>
                        )}

                        {(() => {
                          const opt = calculateNodeOpticalPower(inspectingNode.id);
                          if (opt.inputPower === 0) return null;
                          const pLoss = getSplitterLossDb(inspectingNode.splitterRatio, cap, portNum);
                          const pTx = Number((opt.inputPower - pLoss).toFixed(2));

                          return (
                            <div className="mt-1 inline-flex items-center justify-between w-full text-[9.5px] font-mono font-black text-blue-900 bg-blue-100/90 px-1.5 py-0.5 rounded border border-blue-200">
                              <span>Out Tx:</span>
                              <span>{pTx > 0 ? `+${pTx}` : pTx} dBm</span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    const nodeId = inspectingNode.id;
                    setInspectingNode(null);
                    const connLines = lines.filter(l => l.fromId === nodeId || l.toId === nodeId);
                    if (connLines.length === 0) {
                      setWarningModalMsg('⚠️ Perangkat ini belum dicolokkan ke jalur kabel apapun! Tarik kabel terlebih dahulu untuk melakukan test OTDR.');
                      return;
                    }
                    setOtdrNodeId(nodeId);
                    setSelectedOtdrLineId(connLines[0].id);
                    setShowOtdrModal(true);
                  }}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <span>💥</span>
                  <span>Test OTDR Kabel Putus</span>
                </button>

                <button
                  onClick={() => setInspectingNode(null)}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Tutup Inspector
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom Validation & Warning Modal (100% Anti-Browser Native Alert) */}
      {warningModalMsg && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[3000] animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-rose-100 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mx-auto shadow-inner">
              ⚠️
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Peringatan Regulasi Topologi</h3>
              <p className="text-xs text-slate-600 font-medium mt-2.5 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-left font-mono">
                {warningModalMsg}
              </p>
            </div>
            <button
              onClick={() => setWarningModalMsg(null)}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer shadow-md"
            >
              Saya Mengerti & Perbaiki
            </button>
          </div>
        </div>
      )}

      {/* OTDR Fiber Fault Locator Simulation Modal */}
      {showOtdrModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[2500] animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-rose-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xl">
                  🔍
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">OTDR Fiber Fault Locator</h3>
                  <p className="text-xs text-slate-500 font-medium">Simulasi Deteksi Titik Perkiraan Kabel Optik Putus</p>
                </div>
              </div>
              <button
                onClick={() => setShowOtdrModal(false)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Device Origin Badge */}
              {otdrNodeId && (() => {
                const otdrNode = nodes.find(n => n.id === otdrNodeId);
                return otdrNode ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase text-rose-700">Perangkat Colok Alat OTDR:</div>
                      <div className="text-sm font-black text-rose-950 flex items-center gap-1.5 mt-0.5">
                        <span>{config[otdrNode.type]?.iconSymbol || '📍'}</span>
                        <span>{otdrNode.name || otdrNode.type} (ID: {otdrNode.id})</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setOtdrNodeId(null)}
                      className="text-[10px] font-bold text-rose-700 hover:underline cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-rose-200"
                    >
                      Pilih Semua Kabel
                    </button>
                  </div>
                ) : null;
              })()}

              {/* Select Cable Line */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Jalur Kabel Optik Yang Diuji:</label>
                <select
                  value={selectedOtdrLineId}
                  onChange={(e) => {
                    const lineId = e.target.value;
                    setSelectedOtdrLineId(lineId);
                    const l = lines.find(item => item.id === lineId);
                    if (otdrNodeId && l) {
                      setOtdrOriginDirection(l.fromId === otdrNodeId ? 'from' : 'to');
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {(otdrNodeId ? lines.filter(l => l.fromId === otdrNodeId || l.toId === otdrNodeId) : lines).map((l) => {
                    const fromN = nodes.find(n => n.id === l.fromId);
                    const toN = nodes.find(n => n.id === l.toId);
                    if (!fromN || !toN) return null;
                    const len = getCableLengthMeters(fromN, toN, l.waypoints);
                    return (
                      <option key={l.id} value={l.id}>
                        Port #{l.fromPort || 1} {fromN.name || fromN.type} ➔ Port #{l.toPort || 1} {toN.name || toN.type} ({formatDistance(len)})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Select Specific Core in Cable */}
              {(() => {
                const targetLine = lines.find(l => l.id === selectedOtdrLineId);
                const totalC = targetLine?.totalCores || 4;
                const standard12Names = ['Biru', 'Oranye', 'Hijau', 'Cokelat', 'Abu-abu', 'Putih', 'Merah', 'Hitam', 'Kuning', 'Ungu', 'Pink', 'Toska'];
                
                return (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">🧵 Pilih Core Spesifik Yang Diuji Alat OTDR:</label>
                    <select
                      value={selectedOtdrCore}
                      onChange={(e) => setSelectedOtdrCore(parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 bg-blue-50/80 border border-blue-200 rounded-xl text-xs font-black font-mono text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from({ length: totalC }, (_, i) => i + 1).map(c => {
                        const name = standard12Names[(c - 1) % 12];
                        return (
                          <option key={c} value={c}>
                            Core #{c} ({name})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })()}

              {/* OTDR Origin Direction */}
              {(() => {
                const targetLine = lines.find(l => l.id === selectedOtdrLineId);
                const fromN = nodes.find(n => n?.id === targetLine?.fromId);
                const toN = nodes.find(n => n?.id === targetLine?.toId);

                if (!targetLine || !fromN || !toN) {
                  return (
                    <div className="p-4 bg-amber-50 rounded-2xl text-xs font-bold text-amber-800 text-center">
                      Silakan buat jalur kabel terlebih dahulu untuk melakukan test OTDR!
                    </div>
                  );
                }

                const originNodeObj = otdrOriginDirection === 'from' ? fromN : toN;
                const splicedInfo = getSplicedFiberCorePath(targetLine.id, selectedOtdrCore, originNodeObj.id);
                const totalLen = splicedInfo.totalLengthM || getCableLengthMeters(fromN, toN, targetLine.waypoints);
                const targetMeters = otdrUnit === 'km' ? otdrInputDistance * 1000 : otdrInputDistance;
                const percentage = Math.min(100, Math.round((targetMeters / totalLen) * 100));

                return (
                  <div className="space-y-4">
                    {splicedInfo.segments.length > 1 && (
                      <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold flex items-center justify-between shadow-2xs">
                        <span className="flex items-center gap-1.5 font-sans">
                          <span>🧵</span>
                          <span>Jalur Spliced/Bypass Terhubung ({splicedInfo.segments.length} Ruas Kabel Optik):</span>
                        </span>
                        <span className="font-mono font-black text-purple-900 bg-white px-2 py-0.5 rounded border border-purple-200">{formatDistance(totalLen)}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Titik Uji Awal OTDR (Lokasi Alat Dicolokkan):</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setOtdrOriginDirection('from')}
                          className={`p-3 rounded-2xl border text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            otdrOriginDirection === 'from'
                              ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-300'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-base">{config[fromN.type]?.iconSymbol || '📍'}</span>
                          <span>{fromN.name || fromN.type}</span>
                          <span className="text-[10px] text-slate-500 font-semibold">(Node Asal)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOtdrOriginDirection('to')}
                          className={`p-3 rounded-2xl border text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            otdrOriginDirection === 'to'
                              ? 'bg-rose-50 border-rose-500 text-rose-950 ring-2 ring-rose-300'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="text-base">{config[toN.type]?.iconSymbol || '📍'}</span>
                          <span>{toN.name || toN.type}</span>
                          <span className="text-[10px] text-slate-500 font-semibold">(Node Ujung)</span>
                        </button>
                      </div>
                    </div>

                    {/* OTDR Reading Distance Input */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">Hasil Pembacaan Alat OTDR (Jarak Putus):</label>
                        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setOtdrUnit('m')}
                            className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md cursor-pointer ${otdrUnit === 'm' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-500'}`}
                          >
                            Meter (m)
                          </button>
                          <button
                            type="button"
                            onClick={() => setOtdrUnit('km')}
                            className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md cursor-pointer ${otdrUnit === 'km' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-500'}`}
                          >
                            Kilometer (km)
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={100000}
                          value={otdrInputDistance}
                          onChange={(e) => setOtdrInputDistance(Math.max(1, parseFloat(e.target.value) || 0))}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black font-mono text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">{otdrUnit}</span>
                      </div>
                    </div>

                    {/* Distance Status & Gauge */}
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <span>📊 Estimasi Posisi Putus:</span>
                        <span className="font-mono text-rose-600 font-extrabold">{percentage}% dari jalur kabel</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-600 h-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                        <span>Total Panjang Jalur: {formatDistance(totalLen)}</span>
                        <span>{otdrOriginDirection === 'from' ? `Dari ${fromN.name || fromN.type}` : `Dari ${toN.name || toN.type}`}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowOtdrModal(false)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Batal
              </button>

              <button
                onClick={() => {
                  const targetLine = lines.find(l => l.id === selectedOtdrLineId);
                  const fromN = nodes.find(n => n.id === targetLine?.fromId);
                  const toN = nodes.find(n => n.id === targetLine?.toId);

                  if (!targetLine || !fromN || !toN) return;

                  const originNodeObj = otdrOriginDirection === 'from' ? fromN : toN;

                  const standard12Names = ['Biru', 'Oranye', 'Hijau', 'Cokelat', 'Abu-abu', 'Putih', 'Merah', 'Hitam', 'Kuning', 'Ungu', 'Pink', 'Toska'];
                  const coreName = `Core #${selectedOtdrCore} (${standard12Names[(selectedOtdrCore - 1) % 12] || 'Biru'})`;

                  const targetMeters = otdrUnit === 'km' ? otdrInputDistance * 1000 : otdrInputDistance;
                  
                  // Multi-Segment Cascaded OTDR Break Finder (Continuation across downstream ODP/ODC)
                  const cascadedRes = getCascadedOtdrBreakCoordinate(originNodeObj.id, targetLine.id, targetMeters, selectedOtdrCore)
                    || getOtdrBreakCoordinate(fromN, toN, targetLine.waypoints, targetMeters, otdrOriginDirection);

                  const actualBreakLat = 'lat' in cascadedRes ? cascadedRes.lat : (cascadedRes as any).lat;
                  const actualBreakLng = 'lng' in cascadedRes ? cascadedRes.lng : (cascadedRes as any).lng;
                  const totalMetersRes = 'actualMeters' in cascadedRes ? cascadedRes.actualMeters : targetMeters;
                  const breakLineIdRes = 'breakLineId' in cascadedRes ? (cascadedRes as any).breakLineId : targetLine.id;
                  const breakLineNameRes = 'breakLineName' in cascadedRes ? (cascadedRes as any).breakLineName : `Ruas Kabel ${fromN.name || fromN.type} ➔ ${toN.name || toN.type}`;

                  setOtdrBreakPoint({
                    lineId: breakLineIdRes,
                    lat: actualBreakLat,
                    lng: actualBreakLng,
                    meters: totalMetersRes,
                    fromNodeName: otdrOriginDirection === 'from' ? (fromN.name || fromN.type) : (toN.name || toN.type),
                    toNodeName: otdrOriginDirection === 'from' ? (toN.name || toN.type) : (fromN.name || fromN.type),
                    coreNumber: selectedOtdrCore,
                    coreName: coreName,
                    breakLineName: breakLineNameRes
                  });

                  setShowOtdrModal(false);
                  setToastMsg({
                    text: `💥 Titik Perkiraan ${coreName} Putus Ditemukan pada Jarak ${formatDistance(totalMetersRes)} (${breakLineNameRes})!`,
                    type: 'success'
                  });
                }}
                className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-extrabold hover:bg-rose-700 transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <span>📍</span>
                <span>Tampilkan Titik Putus di Peta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Device Management Table Modal */}
      {isDeviceTableModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-[2500] animate-fade-in">
          <div className="bg-white w-full max-w-6xl rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 space-y-5 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 font-bold text-xl flex items-center justify-center">
                  📋
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Master Tabel Manajemen Perangkat FTTH</h3>
                  <p className="text-xs text-slate-500 font-medium">Daftar lengkap inventaris OLT, ODC, ODP, ONU, Splitter & Perangkat Jaringan</p>
                </div>
              </div>
              <button
                onClick={() => setIsDeviceTableModalOpen(false)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
              <input
                type="text"
                placeholder="🔍 Cari kode hirarki, nama, atau lokasi patokan..."
                value={deviceTableSearch}
                onChange={(e) => setDeviceTableSearch(e.target.value)}
                className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={deviceTableTypeFilter}
                onChange={(e) => setDeviceTableTypeFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">🌐 Semua Tipe Perangkat ({nodes.length})</option>
                <option value="OLT">🖥️ OLT ({nodes.filter(n => n.type === 'OLT').length})</option>
                <option value="ODC">🏢 ODC ({nodes.filter(n => n.type === 'ODC').length})</option>
                <option value="ODP">🔲 ODP ({nodes.filter(n => n.type === 'ODP').length})</option>
                <option value="SPLITTER">🔀 Splitter ({nodes.filter(n => n.type === 'SPLITTER').length})</option>
                <option value="ONU">🏠 ONU ({nodes.filter(n => n.type === 'ONU').length})</option>
                <option value="HTB">⚡ HTB ({nodes.filter(n => n.type === 'HTB').length})</option>
                <option value="SWITCH">🔌 Switch ({nodes.filter(n => n.type === 'SWITCH').length})</option>
                <option value="ROUTER">📡 Router ({nodes.filter(n => n.type === 'ROUTER').length})</option>
              </select>
              <select
                value={deviceTableStatusFilter}
                onChange={(e) => setDeviceTableStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Status Koneksi (Semua)</option>
                <option value="ONLINE">🟢 ONLINE (PPPoE Active)</option>
                <option value="OFFLINE">🔴 OFFLINE / Sinyal Putus</option>
                <option value="CRITICAL">🚨 Upstream Cut / RFO</option>
              </select>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-extrabold sticky top-0 border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Perangkat / Icon</th>
                    <th className="p-3">Kode Hirarki Sistem</th>
                    <th className="p-3">Nama & Lokasi Patokan</th>
                    <th className="p-3">Status Port (Dicolok/Total)</th>
                    <th className="p-3">Sinyal / Power Tx</th>
                    <th className="p-3">Status Connection</th>
                    <th className="p-3 text-right">Aksi Manajemen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(() => {
                    const filteredNodes = nodes.filter((n) => {
                      if (deviceTableTypeFilter !== 'ALL' && n.type !== deviceTableTypeFilter) return false;
                      const offline = isNodeOffline(n);
                      const odpDiag = checkOdpUpstreamCableCut(n);
                      if (deviceTableStatusFilter === 'ONLINE' && offline) return false;
                      if (deviceTableStatusFilter === 'OFFLINE' && !offline) return false;
                      if (deviceTableStatusFilter === 'CRITICAL' && !odpDiag.isUpstreamCut) return false;

                      if (deviceTableSearch.trim()) {
                        const q = deviceTableSearch.toLowerCase().trim();
                        const matchCode = (n.code || '').toLowerCase().includes(q);
                        const matchName = (n.name || '').toLowerCase().includes(q);
                        const matchDesc = (n.description || '').toLowerCase().includes(q);
                        const matchType = n.type.toLowerCase().includes(q);
                        return matchCode || matchName || matchDesc || matchType;
                      }
                      return true;
                    });

                    if (filteredNodes.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                            Tidak ada perangkat FTTH yang sesuai dengan kriteria pencarian/filter.
                          </td>
                        </tr>
                      );
                    }

                    return filteredNodes.map((n) => {
                      const cfg = config[n.type];
                      const cap = n.type === 'ONU'
                        ? (n.portsLan || n.splitterCapacity || cfg.defaultCap)
                        : n.type === 'HTB'
                        ? ((n.portsA || 1) + (n.portsB || 1) + (n.portsLan || 4))
                        : (n.type === 'SWITCH' || n.type === 'ROUTER')
                        ? ((n.portsSfp || 0) + (n.portsLan || 4))
                        : (n.splitterCapacity || cfg.defaultCap);

                      const { usedPortsCount, remainingPortsCount } = getNodePortStats(n.id, cap);
                      const optPower = calculateNodeOpticalPower(n.id);
                      const cust = getCustomerForNode(n);
                      const offline = isNodeOffline(n);
                      const odpDiag = checkOdpUpstreamCableCut(n);

                      return (
                        <tr key={n.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-8 h-8 rounded-xl text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs"
                                style={{ backgroundColor: cfg.color }}
                              >
                                {cfg.iconSymbol}
                              </span>
                              <div>
                                <span className="font-extrabold text-slate-900 block">{n.type}</span>
                                <span className="text-[10px] text-slate-400 font-mono">ID: {n.id.slice(-6)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-1 bg-blue-50 text-blue-900 font-mono font-black border border-blue-200 rounded-lg text-xs">
                              {n.code || n.name || n.type}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{n.name || `${n.type} #${n.id.slice(-4)}`}</div>
                            {n.description ? (
                              <div className="text-[10.5px] text-slate-500 italic">📍 {n.description}</div>
                            ) : cust ? (
                              <div className="text-[10.5px] text-blue-600 font-semibold">👤 {cust.name} ({cust.pppoe_username})</div>
                            ) : null}
                          </td>
                          <td className="p-3 font-mono font-bold">
                            <span className="text-slate-900">{usedPortsCount}/{cap} Port</span>
                            <span className={`text-[10px] ml-1.5 font-sans font-semibold px-1.5 py-0.5 rounded ${remainingPortsCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              ({remainingPortsCount} Kosong)
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            {optPower.outputPower !== 0 ? (
                              <span className="font-black text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {optPower.outputPower > 0 ? `+${optPower.outputPower}` : optPower.outputPower} dBm
                              </span>
                            ) : (
                              <span className="text-slate-400 font-semibold">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {odpDiag.isUpstreamCut ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                                🚨 ATAS PUTUS
                              </span>
                            ) : cust ? (
                              offline ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  🔴 OFFLINE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  🟢 ONLINE
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                ⚙️ Infra
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDeviceTableModalOpen(false);
                                  if (mapRef.current) {
                                    mapRef.current.setView([n.lat, n.lng], 18, { animate: true });
                                  }
                                  setToastMsg({ text: `🎯 Menuju ke lokasi ${n.name || n.type} di peta!`, type: 'info' });
                                }}
                                className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-[10.5px] cursor-pointer shadow-xs transition-all flex items-center gap-1"
                                title="Fokuskan peta ke lokasi perangkat ini"
                              >
                                <span>🎯 Fokus Peta</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDeviceTableModalOpen(false);
                                  (window as any).__inspectNodePorts(n.id);
                                }}
                                className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-[10.5px] cursor-pointer shadow-xs transition-all"
                              >
                                🔌 Port
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDeviceTableModalOpen(false);
                                  (window as any).__editNodeDetails(n.id);
                                }}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[10.5px] cursor-pointer shadow-xs transition-all"
                              >
                                ✏️ Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer Summary */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 text-xs font-bold text-slate-600">
              <span>Total Inventaris Perangkat: <strong className="text-slate-900 font-mono">{nodes.length} Unit</strong></span>
              <button
                onClick={() => setIsDeviceTableModalOpen(false)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Tutup Tabel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Path Tracer Inspector Modal (OLT ➔ ODC ➔ ODP ➔ ONU) */}
      {tracedNodeId && (() => {
        const targetNode = nodes.find(n => n.id === tracedNodeId);
        if (!targetNode) return null;

        const treeNodes = getUpstreamHierarchyTree(tracedNodeId);
        const rootOlt = treeNodes.find(n => n.type === 'OLT');
        const cust = getCustomerForNode(targetNode);
        const optPower = calculateNodeOpticalPower(targetNode.id);

        let totalLengthM = 0;
        for (let i = 0; i < treeNodes.length - 1; i++) {
          const fromN = treeNodes[i];
          const toN = treeNodes[i + 1];
          const matchedLine = lines.find(l => (l.fromId === fromN.id && l.toId === toN.id) || (l.fromId === toN.id && l.toId === fromN.id));
          totalLengthM += getCableLengthMeters(fromN, toN, matchedLine?.waypoints);
        }

        return (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[2600] animate-fade-in">
            <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-2xl border border-sky-100 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-extrabold text-xl">
                    🔍
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Trace Alur Jalur Jaringan (Upstream Route Tracer)</h3>
                    <p className="text-xs text-slate-500 font-medium">Melacak urutan rute penyuplai sinyal dari OLT Server hingga Perangkat Tujuan</p>
                  </div>
                </div>
                <button
                  onClick={() => setTracedNodeId(null)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-all cursor-pointer font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Target Device Summary Header */}
              <div className="p-4 bg-gradient-to-r from-sky-900 via-blue-900 to-indigo-950 text-white rounded-2xl border border-sky-700 shadow-md space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-black bg-sky-400/20 text-sky-200 border border-sky-300/40">
                      {targetNode.code || targetNode.name || targetNode.type}
                    </span>
                    <h4 className="font-black text-sm text-white">
                      {cust ? `ONU - ${cust.name}` : (targetNode.name || targetNode.type)}
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-bold bg-white/10 px-2.5 py-1 rounded-xl text-sky-200">
                    📍 {targetNode.type}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-sky-800/80 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-sky-300 font-sans block uppercase">Server OLT Induk</span>
                    <strong className="text-emerald-300">{rootOlt ? (rootOlt.code || rootOlt.name || 'OLT Pusat') : 'Belum Terhubung'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-sky-300 font-sans block uppercase">Total Panjang Jalur</span>
                    <strong className="text-amber-300">{formatDistance(totalLengthM)}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-sky-300 font-sans block uppercase">Estimasi Power Tx Laser</span>
                    <strong className="text-sky-200">{optPower.outputPower > 0 ? `+${optPower.outputPower}` : optPower.outputPower} dBm</strong>
                  </div>
                </div>
              </div>

              {/* Visual Flow Route Diagram Tree Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                  <span>🗺️ URUTAN ALUR PERANGKAT & KABEL TERLEWATI ({treeNodes.length} NODE):</span>
                  <span className="text-[10px] text-purple-600 font-mono font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">✨ Jalur Di-Highlight di Peta</span>
                </div>

                <div className="space-y-2 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-sky-200">
                  {treeNodes.map((node, idx) => {
                    const cfg = config[node.type];
                    const isLast = idx === treeNodes.length - 1;
                    const isFirst = idx === 0;

                    const nextNode = treeNodes[idx + 1];
                    const connCable = nextNode ? lines.find(l => (l.fromId === node.id && l.toId === nextNode.id) || (l.fromId === nextNode.id && l.toId === node.id)) : null;
                    const cableLenM = connCable && nextNode ? getCableLengthMeters(node, nextNode, connCable.waypoints) : 0;
                    const fromPortNum = connCable ? (connCable.fromId === node.id ? (connCable.fromPort || 1) : (connCable.toPort || 1)) : 1;

                    return (
                      <div key={node.id} className="relative z-10 space-y-2">
                        {/* Node Step Card */}
                        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          isLast 
                            ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-300 shadow-xs' 
                            : isFirst 
                            ? 'bg-emerald-50 border-emerald-300 shadow-xs' 
                            : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs"
                              style={{ backgroundColor: cfg.color }}
                            >
                              {cfg.iconSymbol}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 font-extrabold text-slate-900 text-xs">
                                <span>{node.code ? `[${node.code}]` : ''} {node.name || `${node.type} #${node.id.slice(-4)}`}</span>
                                <span className="text-[9.5px] font-mono px-2 py-0.5 bg-white border border-slate-200 rounded-full text-slate-700 font-bold">
                                  Langkah #{idx + 1}
                                </span>
                              </div>
                              <div className="text-[10.5px] text-slate-500 font-medium mt-0.5">
                                {node.description ? `📍 ${node.description}` : `Perangkat Infrastruktur ${node.type}`}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Port Dicolok</span>
                            <span className="text-xs font-mono font-extrabold text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-200">
                              Port #{fromPortNum}
                            </span>
                          </div>
                        </div>

                        {/* Connecting Cable Step Indicator */}
                        {connCable && (
                          <div className="ml-10 pl-3 py-1 border-l-2 border-dashed border-sky-400 flex items-center justify-between text-[11px] font-mono text-sky-900 bg-sky-50/60 rounded-r-xl border border-sky-200/80 px-3">
                            <span className="flex items-center gap-1.5 font-bold">
                              <span>🧵 {connCable.cableType || 'Kabel Fiber Optik'}</span>
                              <span className="text-[9.5px] font-sans bg-white px-1.5 py-0.2 rounded border border-sky-300 font-bold text-sky-800">
                                {connCable.totalCores || 4} Core
                              </span>
                            </span>
                            <span className="font-black text-emerald-700">📏 {formatDistance(cableLenM)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setTracedNodeId(null);
                    setHighlightedPathLineIds([]);
                    setToastMsg({ text: '🧹 Highlight Jalur di Peta Dibersihkan!', type: 'info' });
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  🧹 Hapus Highlight Peta
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (mapRef.current && targetNode) {
                        mapRef.current.setView([targetNode.lat, targetNode.lng], 18, { animate: true });
                      }
                      setTracedNodeId(null);
                      setToastMsg({ text: `🎯 Menuju ke lokasi ${targetNode.name || targetNode.type} di peta!`, type: 'info' });
                    }}
                    className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🎯</span>
                    <span>Fokus Peta Ke Target</span>
                  </button>

                  <button
                    onClick={() => setTracedNodeId(null)}
                    className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    Tutup Tracer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

