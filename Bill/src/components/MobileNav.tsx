import React from 'react';
import { 
  LayoutGrid, 
  FileText, 
  Users, 
  CreditCard, 
  Settings,
  Plus,
  TrendingUp
} from 'lucide-react';

interface MobileNavProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  t: any;
  onQuickInvoice: () => void;
}

export default function MobileNav({ 
  currentView, 
  setCurrentView, 
  t, 
  onQuickInvoice 
}: MobileNavProps) {
  
  const tabs = [
    { id: 'overview', label: t.overview, icon: LayoutGrid },
    { id: 'invoices', label: t.invoices, icon: FileText },
    { id: 'analytics', label: t.analytics, icon: TrendingUp },
    { id: 'clients', label: t.clients, icon: Users },
    { id: 'gateways', label: t.paymentMethodsShort || t.paymentMethods.split(' ')[0], icon: CreditCard },
    { id: 'settings', label: t.settings, icon: Settings }
  ];

  return (
    <div id="mobile-nav-bar" className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-50 px-2 pb-safe">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto relative">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = currentView === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentView(tab.id)}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all cursor-pointer relative"
            >
              <div className={`p-1.5 rounded-xl transition-all ${
                isActive 
                  ? 'text-[#2563EB] scale-110' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <IconComponent size={20} className="stroke-[2]" />
              </div>
              <span className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
                isActive ? 'text-[#2563EB] font-semibold' : 'text-slate-400'
              }`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute top-0 w-8 h-1 bg-[#2563EB] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
