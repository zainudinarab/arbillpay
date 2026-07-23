import React, { useState, useEffect } from 'react';
import { 
  defaultInvoices, 
  defaultClients, 
  defaultGateways, 
  defaultBusinessProfile 
} from './data/defaultData';
import { Invoice, Client, PaymentGateway, BusinessProfile } from './types';
import { translations } from './utils';

// Import Sub-Components
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import DashboardOverview from './components/DashboardOverview';
import InvoiceList from './components/InvoiceList';
import ClientList from './components/ClientList';
import PaymentMethodsSettings from './components/PaymentMethodsSettings';
import InvoiceForm from './components/InvoiceForm';
import InvoiceDetails from './components/InvoiceDetails';
import PaymentSimulator from './components/PaymentSimulator';
import SettingsPage from './components/SettingsPage';
import AnalyticsView from './components/AnalyticsView';

// Import Icons for customer checkout
import { QrCode, ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react';
import { formatCurrency, formatDate } from './utils';

import LoginModal from './components/LoginModal';
import PublicVoucherStore from './components/PublicVoucherStore';
import { UserAccount } from './types';

export default function App() {
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const pathname = window.location.pathname.replace('/', '');
    const params = new URLSearchParams(window.location.search);
    return hash === 'admin-login' || pathname === 'admin-login' || pathname === 'login' || params.get('login') === 'admin';
  });
  const [selectedPublicPackage, setSelectedPublicPackage] = useState<any>(null);

  // Check URL query string or pathname for admin login route (e.g. /admin-login or #/admin-login)
  useEffect(() => {
    const handleHashAndRoute = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      const pathname = window.location.pathname.replace('/', '');
      const params = new URLSearchParams(window.location.search);
      
      if (hash === 'admin-login' || pathname === 'admin-login' || pathname === 'login' || params.get('login') === 'admin') {
        setShowAdminLoginModal(true);
      } else if (hash) {
        setCurrentView(hash);
      }
    };

    handleHashAndRoute();
    window.addEventListener('hashchange', handleHashAndRoute);
    window.addEventListener('popstate', handleHashAndRoute);
    return () => {
      window.removeEventListener('hashchange', handleHashAndRoute);
      window.removeEventListener('popstate', handleHashAndRoute);
    };
  }, []);

  // --- AUTHENTICATION STATE ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const savedUser = localStorage.getItem('arbil_current_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // --- STATE PERSISTENCE ---
  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const local = localStorage.getItem('billava_invoices');
    return local ? JSON.parse(local) : defaultInvoices;
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const local = localStorage.getItem('billava_clients');
    return local ? JSON.parse(local) : defaultClients;
  });

  const [gateways, setGateways] = useState<PaymentGateway[]>(() => {
    const local = localStorage.getItem('billava_gateways');
    return local ? JSON.parse(local) : defaultGateways;
  });

  const [profile, setProfile] = useState<BusinessProfile>(() => {
    const local = localStorage.getItem('billava_profile');
    return local ? JSON.parse(local) : defaultBusinessProfile;
  });

  // --- NAVIGATION & FLOW STATE (Synced with URL Hash / Routes) ---
  const [currentView, setCurrentView] = useState<string>(() => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    if (hash && hash !== 'admin-login') return hash;
    return 'overview';
  });

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);



  // Sync currentView changes to URL Hash so refresh persists current page
  const navigateToView = (view: string) => {
    setCurrentView(view);
    window.location.hash = `#/${view}`;
  };

  // Sync Current User to Local Storage & Update Profile Role dynamically
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('arbil_current_user', JSON.stringify(currentUser));
      setProfile(prev => ({
        ...prev,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role === 'owner' ? 'Super Admin / Owner' : currentUser.role === 'kasir' ? 'POS Operator / Kasir' : 'Pelanggan WiFi / Customer'
      }));

      // Redirect automatic view based on role if logged in (only if at default)
      if (!window.location.hash || window.location.hash === '#/overview' || window.location.hash === '#/admin-login') {
        if (currentUser.role === 'kasir') {
          navigateToView('invoices'); // Kasir langsung ke POS Voucher List
        } else if (currentUser.role === 'pelanggan') {
          navigateToView('overview'); // Pelanggan ke Portal Ringkasan Voucher
        } else {
          navigateToView('overview');
        }
      }
    } else {
      localStorage.removeItem('arbil_current_user');
    }
  }, [currentUser]);

  // Handle Login & Logout Handlers
  const handleLoginSuccess = (account: UserAccount) => {
    setCurrentUser(account);
    setShowAdminLoginModal(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('arbil_current_user');
    setShowAdminLoginModal(false);
  };

  // Sync to Local Storage
  useEffect(() => {
    localStorage.setItem('billava_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('billava_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('billava_gateways', JSON.stringify(gateways));
  }, [gateways]);

  useEffect(() => {
    localStorage.setItem('billava_profile', JSON.stringify(profile));
  }, [profile]);

  // --- DEEP-LINK / CHECKOUT VIEW DETECTION ---
  const [checkoutInvoice, setCheckoutInvoice] = useState<Invoice | null>(null);
  const [isCustomerView, setIsCustomerView] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const idParam = params.get('id');

    if (viewParam === 'checkout' && idParam) {
      const found = invoices.find(inv => inv.id === idParam);
      if (found) {
        setCheckoutInvoice(found);
        setIsCustomerView(true);
      }
    }
  }, [invoices]);

  // Translate dictionary helper
  const t = translations[profile.language] || translations.id;

  // --- MUTATION HANDLERS ---
  const handleAddInvoice = (newInv: Invoice) => {
    setInvoices([newInv, ...invoices]);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setCurrentView('edit-invoice');
  };

  const handleUpdateInvoice = (updatedInv: Invoice) => {
    setInvoices(invoices.map(inv => inv.id === updatedInv.id ? updatedInv : inv));
    setEditingInvoice(null);
  };

  const handleArchiveInvoice = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, isArchived: true } : inv));
    if (selectedInvoice?.id === id) {
      setSelectedInvoice({ ...selectedInvoice, isArchived: true });
    }
  };

  const handleRestoreInvoice = (id: string) => {
    setInvoices(invoices.map(inv => inv.id === id ? { ...inv, isArchived: false } : inv));
    if (selectedInvoice?.id === id) {
      setSelectedInvoice({ ...selectedInvoice, isArchived: false });
    }
  };

  const handleDeleteInvoicePermanently = (id: string) => {
    const isId = profile.language === 'id';
    if (confirm(isId ? 'Apakah Anda yakin ingin menghapus tagihan ini secara permanen?' : 'Are you sure you want to permanently delete this invoice?')) {
      setInvoices(invoices.filter(inv => inv.id !== id));
      if (selectedInvoice?.id === id) {
        setSelectedInvoice(null);
      }
    }
  };

  const handleAddClient = (newClient: Client) => {
    setClients([newClient, ...clients]);
  };

  const handleEditClient = (updatedClient: Client) => {
    setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
  };

  const handleDeleteClient = (id: string) => {
    setClients(clients.filter(c => c.id !== id));
  };

  const handleToggleGateway = (id: string) => {
    setGateways(gateways.map(gw => {
      if (gw.id === id) {
        return { ...gw, isActive: !gw.isActive };
      }
      return gw;
    }));
  };

  const handleUpdateGatewayDetails = (id: string, details: Partial<PaymentGateway>) => {
    setGateways(gateways.map(gw => {
      if (gw.id === id) {
        return { ...gw, ...details };
      }
      return gw;
    }));
  };

  const handleUpdateProfile = (newProfile: BusinessProfile) => {
    setProfile(newProfile);
  };

  // Simulate payment processing callback
  const handlePaymentSuccess = (methodName: string) => {
    const targetInvoice = isCustomerView ? checkoutInvoice : selectedInvoice;
    if (!targetInvoice) return;

    const updatedInvoices = invoices.map(inv => {
      if (inv.id === targetInvoice.id) {
        return {
          ...inv,
          status: 'paid' as const,
          paymentMethod: methodName,
          paymentDate: new Date().toISOString().split('T')[0]
        };
      }
      return inv;
    });

    setInvoices(updatedInvoices);

    // Update selected states to reflect instantly
    if (isCustomerView && checkoutInvoice) {
      setCheckoutInvoice({
        ...checkoutInvoice,
        status: 'paid',
        paymentMethod: methodName,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    } else if (selectedInvoice) {
      setSelectedInvoice({
        ...selectedInvoice,
        status: 'paid',
        paymentMethod: methodName,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    }

    setShowSimulator(false);
  };

  const handleLanguageSwitch = (lang: 'id' | 'en') => {
    setProfile({ ...profile, language: lang });
  };

  // --- RENDERING ROUTER ---
  const renderMainContent = () => {
    switch (currentView) {
      case 'overview':
        return (
          <DashboardOverview
            invoices={invoices}
            gateways={gateways}
            profile={profile}
            t={t}
            setLanguage={handleLanguageSwitch}
            setCurrentView={setCurrentView}
            setSelectedInvoice={setSelectedInvoice}
            onQuickInvoice={() => setCurrentView('new-invoice')}
            onLogout={handleLogout}
          />
        );
      case 'invoices':
        return (
          <InvoiceList
            invoices={invoices}
            onArchiveInvoice={handleArchiveInvoice}
            onRestoreInvoice={handleRestoreInvoice}
            onDeleteInvoicePermanently={handleDeleteInvoicePermanently}
            onEditInvoice={handleEditInvoice}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            setSelectedInvoice={setSelectedInvoice}
            onQuickInvoice={() => setCurrentView('new-invoice')}
            onLogout={handleLogout}
          />
        );
      case 'clients':
        return (
          <ClientList
            clients={clients}
            onAddClient={handleAddClient}
            onEditClient={handleEditClient}
            onDeleteClient={handleDeleteClient}
            profile={profile}
            t={t}
          />
        );
      case 'analytics':
        return (
          <AnalyticsView
            invoices={invoices}
            clients={clients}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            onLogout={handleLogout}
          />
        );
      case 'gateways':
        return (
          <PaymentMethodsSettings
            gateways={gateways}
            onToggleGateway={handleToggleGateway}
            onUpdateGatewayDetails={handleUpdateGatewayDetails}
            profile={profile}
            t={t}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            t={t}
          />
        );
      case 'new-invoice':
      case 'edit-invoice':
        return (
          <InvoiceForm
            clients={clients}
            profile={profile}
            t={t}
            invoiceToEdit={editingInvoice}
            onSaveInvoice={editingInvoice ? handleUpdateInvoice : handleAddInvoice}
            setCurrentView={(view) => {
              setCurrentView(view);
              if (view !== 'new-invoice' && view !== 'edit-invoice') {
                setEditingInvoice(null);
              }
            }}
            onQuickAddClient={handleAddClient}
          />
        );
      case 'invoice-detail':
        return selectedInvoice ? (
          <InvoiceDetails
            invoice={selectedInvoice}
            profile={profile}
            t={t}
            setCurrentView={setCurrentView}
            onPayNow={() => setShowSimulator(true)}
            onStatusChange={(id, status) => {
              setInvoices(invoices.map(inv => inv.id === id ? { ...inv, status } : inv));
            }}
          />
        ) : (
          <div className="flex-1 p-8 text-center text-slate-400">Tagihan tidak ditemukan</div>
        );
      default:
        return <div className="flex-1 p-8 text-center text-slate-400">Halaman tidak ditemukan</div>;
    }
  };

  // --- CUSTOMER PORTAL / CHECKOUT VIEW ---
  if (isCustomerView && checkoutInvoice) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
        {/* Checkout Navbar */}
        <header className="bg-white border-b border-slate-100 py-4 px-6 md:px-12 sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0066FF] flex items-center justify-center text-white font-bold text-base">
              B
            </div>
            <span className="font-sans font-extrabold text-base text-slate-800">Billava Gateway</span>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <ShieldCheck className="text-emerald-500" size={16} />
            <span>Pembayaran Aman</span>
          </div>
        </header>

        {/* Checkout Main */}
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Client Invoice Copy */}
          <div className="md:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-5">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">TAGIHAN DARI</span>
                <h2 className="font-sans font-bold text-base text-slate-800">{profile.companyName}</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{profile.address}</p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono text-slate-500 font-semibold">{checkoutInvoice.invoiceNumber}</span>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    checkoutInvoice.status === 'paid' 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {checkoutInvoice.status === 'paid' ? 'Lunas / Paid' : 'Menunggu / Unpaid'}
                  </span>
                </div>
              </div>
            </div>

            {/* To details */}
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">DITAGIHKAN KEPADA</span>
              <h4 className="font-sans font-bold text-sm text-slate-700">{checkoutInvoice.client.name}</h4>
              {checkoutInvoice.client.company && (
                <p className="text-xs text-slate-500">{checkoutInvoice.client.company}</p>
              )}
            </div>

            {/* Line items list */}
            <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 font-bold text-slate-500 border-b border-slate-100">
                    <th className="p-3 pl-4">Item</th>
                    <th className="p-3 text-center w-12">Qty</th>
                    <th className="p-3 text-right w-24">Harga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {checkoutInvoice.items.map(it => (
                    <tr key={it.id}>
                      <td className="p-3 pl-4 font-semibold text-slate-800">{it.description}</td>
                      <td className="p-3 text-center">{it.quantity}</td>
                      <td className="p-3 text-right">{formatCurrency(it.amount, profile.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total values */}
            <div className="space-y-2 text-xs font-semibold text-slate-500 text-right max-w-xs ml-auto">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-slate-800">{formatCurrency(checkoutInvoice.subtotal, profile.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Pajak PPN ({checkoutInvoice.taxRate}%)</span>
                <span className="text-slate-800">{formatCurrency(checkoutInvoice.taxAmount, profile.currency)}</span>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between items-end text-sm font-bold">
                <span className="text-slate-800">Total Tagihan</span>
                <span className="text-[#2563EB] text-base font-extrabold">{formatCurrency(checkoutInvoice.total, profile.currency)}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Payment Panel */}
          <div className="md:col-span-1 space-y-6">
            {checkoutInvoice.status === 'paid' ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 text-center space-y-4 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-pulse">
                  <CheckCircle size={32} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-slate-800 text-base">Pembayaran Sukses!</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Terima kasih, tagihan ini telah dilunasi sepenuhnya melalui <span className="font-semibold text-slate-700">{checkoutInvoice.paymentMethod}</span>.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCustomerView(false);
                    // Clear query params to return to merchant dashboard gracefully
                    window.history.pushState({}, document.title, window.location.pathname);
                  }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  Kembali ke Aplikasi Utama
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
                <h3 className="font-sans font-bold text-sm text-slate-800">Selesaikan Pembayaran</h3>
                <p className="text-xs text-slate-400">Pilih salah satu metode pembayaran e-wallet / bank aktif di bawah ini:</p>
                
                {/* Embedded quick check out */}
                <div className="space-y-3 pt-1">
                  <button
                    onClick={() => {
                      // Trigger payment simulator
                      setShowSimulator(true);
                    }}
                    className="w-full py-3 bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <QrCode size={16} />
                    <span>Bayar Sekarang (Buka Simulator)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-100 py-4 px-6 text-center text-xs text-slate-400 font-sans">
          Powered by <span className="font-semibold text-slate-600">Billava E-Invoice Indonesia</span> &copy; 2026. All rights reserved.
        </footer>

        {/* Mounted Payment Simulator Overlay */}
        {showSimulator && checkoutInvoice && (
          <PaymentSimulator
            invoice={checkoutInvoice}
            gateways={gateways}
            profile={profile}
            t={t}
            onClose={() => setShowSimulator(false)}
            onPaymentSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    );
  }



  // 1. PUBLIC LANDING STORE (Jika belum terautentikasi)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PublicVoucherStore
          onBuyVoucher={(pkg) => {
            setSelectedPublicPackage(pkg);
            setShowAdminLoginModal(true);
          }}
          onOpenAdminLogin={() => setShowAdminLoginModal(true)}
        />

        {showAdminLoginModal && (
          <LoginModal 
            onLoginSuccess={handleLoginSuccess}
            onClose={() => {
              setShowAdminLoginModal(false);
              // Clean URL
              if (window.location.hash === '#/admin-login') {
                window.location.hash = '#/';
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans antialiased text-slate-800">
      {/* 1. Desktop Sidebar */}
      <Sidebar 
        currentView={currentView} 
        setCurrentView={(view) => {
          navigateToView(view);
          setSelectedInvoice(null);
        }} 
        profile={profile}
        t={t}
        onQuickInvoice={() => {
          navigateToView('new-invoice');
          setSelectedInvoice(null);
        }}
        onLogout={handleLogout}
      />

      {/* 2. Main Viewing Pane */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative">
        {renderMainContent()}
      </div>

      {/* 3. Mobile Navigation Bottom Tab Bar */}
      <MobileNav 
        currentView={currentView} 
        setCurrentView={(view) => {
          navigateToView(view);
          setSelectedInvoice(null);
        }} 
        t={t}
        onQuickInvoice={() => {
          navigateToView('new-invoice');
          setSelectedInvoice(null);
        }}
      />

      {/* 4. Payment Simulator Popup Overlay */}
      {showSimulator && selectedInvoice && (
        <PaymentSimulator
          invoice={selectedInvoice}
          gateways={gateways}
          profile={profile}
          t={t}
          onClose={() => setShowSimulator(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

    </div>
  );
}
