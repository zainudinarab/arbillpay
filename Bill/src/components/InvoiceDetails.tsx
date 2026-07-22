import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Share2, 
  Printer, 
  CreditCard, 
  FileDown, 
  Calendar, 
  Building, 
  Mail, 
  Phone,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  MessageCircle,
  Link
} from 'lucide-react';
import { Invoice, BusinessProfile } from '../types';
import { formatCurrency, formatDate } from '../utils';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface InvoiceDetailsProps {
  invoice: Invoice;
  profile: BusinessProfile;
  t: any;
  setCurrentView: (view: string) => void;
  onPayNow: () => void;
  onStatusChange: (id: string, status: 'paid' | 'pending') => void;
}
async function prepareStylesForHtml2Canvas(element: HTMLElement): Promise<() => void> {
  const restores: (() => void)[] = [];

  // Inject a temporary style to use system fonts and adjust line-height for html2canvas to prevent vertical text baseline shifts
  const fontStyleEl = document.createElement('style');
  fontStyleEl.innerHTML = `
    #invoice-print-area, #invoice-print-area * {
      font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    }
    #invoice-print-area p, 
    #invoice-print-area span, 
    #invoice-print-area div, 
    #invoice-print-area td, 
    #invoice-print-area th {
      line-height: 1.25 !important;
    }
  `;
  document.head.appendChild(fontStyleEl);
  restores.push(() => fontStyleEl.remove());

  // 1. Handle <style> elements
  const styleElements = Array.from(document.querySelectorAll('style'));
  const originalStyleHTMLs = styleElements.map(el => ({ el, html: el.innerHTML }));

  // 2. Handle <link rel="stylesheet"> elements
  const linkElements = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  const linksToDisable: HTMLLinkElement[] = [];
  const injectedStyles: HTMLStyleElement[] = [];

  // Temporary element for browser color conversion
  const temp = document.createElement('div');
  temp.style.display = 'none';
  document.body.appendChild(temp);

  // Canvas for color space conversion
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');

  const convertColor = (colorStr: string): string => {
    try {
      // 1. Let the browser resolve CSS variables and colors on the DOM
      temp.style.color = '';
      temp.style.color = colorStr;
      const resolvedColor = window.getComputedStyle(temp).color;
      
      if (!resolvedColor) return 'rgb(0, 0, 0)';

      // 2. If it's already standard rgb/rgba, return it directly
      if (resolvedColor.startsWith('rgb') || resolvedColor.startsWith('rgba')) {
        return resolvedColor;
      }

      // 3. Otherwise (e.g. oklch, oklab), convert via canvas pixels
      if (ctx) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = resolvedColor;
        ctx.fillRect(0, 0, 1, 1);
        const imgData = ctx.getImageData(0, 0, 1, 1).data;
        
        if (imgData[3] === 0) {
          return 'rgba(0, 0, 0, 0)';
        }
        
        const r = imgData[0];
        const g = imgData[1];
        const b = imgData[2];
        const a = imgData[3] / 255;
        
        if (imgData[3] === 255) {
          return `rgb(${r}, ${g}, ${b})`;
        } else {
          const alpha = Math.round(a * 1000) / 1000;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
    } catch (e) {
      console.warn('Failed to convert color:', colorStr, e);
    }
    return 'rgb(0, 0, 0)';
  };

  const colorRegex = /(?:oklch|oklab|color-mix|color)\((?:[^()]+|\([^()]*\))*\)/g;

  // Process <style> tags
  styleElements.forEach(styleEl => {
    let content = styleEl.innerHTML;
    if (content.includes('oklch') || content.includes('oklab') || content.includes('color-mix') || content.includes('color(')) {
      const matches = content.match(colorRegex);
      if (matches) {
        const uniqueMatches = Array.from(new Set(matches));
        uniqueMatches.forEach(match => {
          const rgbColor = convertColor(match);
          content = content.replaceAll(match, rgbColor);
        });
        styleEl.innerHTML = content;
      }
    }
  });

  restores.push(() => {
    originalStyleHTMLs.forEach(({ el, html }) => {
      el.innerHTML = html;
    });
  });

  // Process <link rel="stylesheet"> tags
  for (const link of linkElements) {
    try {
      const response = await fetch(link.href);
      if (response.ok) {
        let text = await response.text();
        if (text.includes('oklch') || text.includes('oklab') || text.includes('color-mix') || text.includes('color(')) {
          const matches = text.match(colorRegex);
          if (matches) {
            const uniqueMatches = Array.from(new Set(matches));
            uniqueMatches.forEach(match => {
              const rgbColor = convertColor(match);
              text = text.replaceAll(match, rgbColor);
            });
          }
          // Inject modified styles
          const styleEl = document.createElement('style');
          styleEl.innerHTML = text;
          document.head.appendChild(styleEl);
          injectedStyles.push(styleEl);

          // Disable original link
          link.disabled = true;
          linksToDisable.push(link);
        }
      }
    } catch (e) {
      console.warn('Could not process external stylesheet:', link.href, e);
    }
  }

  restores.push(() => {
    injectedStyles.forEach(el => el.remove());
    linksToDisable.forEach(link => {
      link.disabled = false;
    });
  });

  // 3. Handle inline styles
  const elementsWithStyle = Array.from(element.querySelectorAll('[style]'));
  if (element.hasAttribute('style')) {
    elementsWithStyle.push(element);
  }

  const originalInlineStyles = elementsWithStyle.map(el => ({
    el,
    style: el.getAttribute('style') || ''
  }));

  elementsWithStyle.forEach(el => {
    let styleText = el.getAttribute('style') || '';
    if (styleText.includes('oklch') || styleText.includes('oklab') || styleText.includes('color-mix') || styleText.includes('color(')) {
      const matches = styleText.match(colorRegex);
      if (matches) {
        matches.forEach(match => {
          const rgbColor = convertColor(match);
          styleText = styleText.replaceAll(match, rgbColor);
        });
        el.setAttribute('style', styleText);
      }
    }
  });

  restores.push(() => {
    originalInlineStyles.forEach(({ el, style }) => {
      if (style) {
        el.setAttribute('style', style);
      } else {
        el.removeAttribute('style');
      }
    });
  });

  // Clean up conversion helper
  document.body.removeChild(temp);

  // Return a combined restore function
  return () => {
    restores.forEach(restore => restore());
  };
}

export default function InvoiceDetails({
  invoice,
  profile,
  t,
  setCurrentView,
  onPayNow,
  onStatusChange
}: InvoiceDetailsProps) {
  const [shareFeedback, setShareFeedback] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);

  const handleCopyLink = () => {
    const simulatedUrl = `${window.location.origin}/?view=checkout&id=${invoice.id}`;
    navigator.clipboard.writeText(simulatedUrl);
    setShareFeedback(t.copiedLink);
    setShowShareDropdown(false);
    setTimeout(() => setShareFeedback(''), 3000);
  };

  const totalFormatted = formatCurrency(invoice.total, profile.currency);
  const isIndo = profile.language === 'id';
  const simulatedUrl = `${window.location.origin}/?view=checkout&id=${invoice.id}`;

  const waText = isIndo
    ? `Halo, berikut adalah tagihan Anda dari *${profile.companyName || 'Billava'}*:\n\n` +
      `• *No. Tagihan*: ${invoice.invoiceNumber}\n` +
      `• *Total Tagihan*: ${totalFormatted}\n` +
      `• *Jatuh Tempo*: ${formatDate(invoice.dueDate, 'id')}\n\n` +
      `Silakan lakukan pembayaran atau lihat rincian lengkapnya secara online melalui tautan berikut:\n${simulatedUrl}\n\n` +
      `Terima kasih!`
    : `Hello, here is your invoice from *${profile.companyName || 'Billava'}*:\n\n` +
      `• *Invoice No*: ${invoice.invoiceNumber}\n` +
      `• *Total Amount*: ${totalFormatted}\n` +
      `• *Due Date*: ${formatDate(invoice.dueDate, 'en')}\n\n` +
      `You can view details and make a payment online here:\n${simulatedUrl}\n\n` +
      `Thank you!`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = ' '; // Clear the document title temporarily for printing
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  const handlePrintThermal = () => {
    const originalTitle = document.title;
    document.title = ' '; // Clear the document title temporarily for printing
    document.body.classList.add('print-mode-thermal');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-mode-thermal');
      document.title = originalTitle;
    }, 100);
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('invoice-print-area');
    if (!element) return;

    setIsExporting(true);
    setShareFeedback(profile.language === 'id' ? 'Sedang menyiapkan dokumen PDF...' : 'Preparing PDF document...');

    let restoreStyles: (() => void) | null = null;
    try {
      // Temporarily convert oklch CSS color declarations to RGB for html2canvas
      restoreStyles = await prepareStylesForHtml2Canvas(element);

      // Create high resolution canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1024
      });

      // Standard A4 dimensions: 210mm x 297mm
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const imgWidth = 190; // 210mm width - 10mm margin on each side
      const pageHeight = 297;
      const marginX = 10;
      const marginY = 12;
      const usableHeight = pageHeight - (marginY * 2); // 273mm usable height

      // Canvas slicing parameters
      const pxPageHeight = (usableHeight * canvas.width) / imgWidth;
      const totalHeight = canvas.height;
      let sourceY = 0;
      let isFirstPage = true;

      while (sourceY < totalHeight) {
        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;

        // Create page slice canvas
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = pxPageHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx) {
          // Fill background with white to keep consistency
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          
          // Draw the slice
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvas.width, pxPageHeight,
            0, 0, pageCanvas.width, pxPageHeight
          );
        }

        const pageImgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(pageImgData, 'PNG', marginX, marginY, imgWidth, usableHeight, undefined, 'FAST');
        
        sourceY += pxPageHeight;
      }

      pdf.save(`Invoice-${invoice.invoiceNumber}.pdf`);
      setShareFeedback(profile.language === 'id' ? 'PDF berhasil diunduh!' : 'PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      setShareFeedback(profile.language === 'id' ? 'Gagal mengekspor PDF.' : 'Failed to export PDF.');
    } finally {
      if (restoreStyles) {
        try {
          restoreStyles();
        } catch (e) {
          console.error('Failed to restore style declarations:', e);
        }
      }
      setIsExporting(false);
      setTimeout(() => setShareFeedback(''), 3000);
    }
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] pb-24 lg:pb-8">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-slate-100 px-4 py-4 md:px-8 z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentView('invoices')}
            className="p-1.5 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-sans font-bold text-lg md:text-xl text-slate-800">{invoice.invoiceNumber}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Detail & simulasi tagihan pelanggan</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Share Checkout Link */}
          <div className="relative">
            <button
              onClick={() => setShowShareDropdown(!showShareDropdown)}
              className="p-2 md:px-3 md:py-2 bg-[#4F46E5]/5 border border-[#4F46E5]/10 hover:bg-[#4F46E5]/10 text-[#4F46E5] rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all"
            >
              <Share2 size={14} className="stroke-[2.5]" />
              <span>{t.customerView}</span>
            </button>

            {showShareDropdown && (
              <>
                {/* Backdrop to dismiss */}
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setShowShareDropdown(false)} 
                />
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 py-1.5 overflow-hidden animate-fade-in origin-top-right">
                  {/* Copy Link Option */}
                  <button
                    onClick={handleCopyLink}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-500 shrink-0">
                      <Link size={14} className="stroke-[2.5]" />
                    </div>
                    <span>{t.copyLink}</span>
                  </button>

                  {/* Send to WhatsApp Option */}
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowShareDropdown(false)}
                    className="flex px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0">
                      <MessageCircle size={14} className="fill-emerald-500 text-[#E0F2FE] stroke-[2.5]" />
                    </div>
                    <span>{t.sendWhatsApp}</span>
                  </a>
                </div>
              </>
            )}
          </div>

          {/* Print Button */}
          <button
            onClick={handlePrint}
            className="p-2 md:px-3 md:py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all"
            title={t.print}
          >
            <Printer size={14} />
            <span className="hidden sm:inline">{t.print}</span>
          </button>

          {/* Thermal Print Button */}
          <button
            onClick={handlePrintThermal}
            className="p-2 md:px-3 md:py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all"
            title={t.printThermal}
          >
            <Printer size={14} className="text-orange-500" />
            <span className="hidden sm:inline">{t.printThermal}</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className={`p-2 md:px-3 md:py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={t.exportPDF}
          >
            {isExporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            <span className="hidden sm:inline">{isExporting ? t.exporting : t.exportPDF}</span>
          </button>

          {/* Pay Button */}
          {invoice.status !== 'paid' ? (
            <button
              onClick={onPayNow}
              className="px-3.5 py-2 bg-[#2563EB] hover:bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-100 transition-all"
            >
              <CreditCard size={14} />
              <span>{t.payNow}</span>
            </button>
          ) : (
            <span className="px-3.5 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold flex items-center gap-1">
              <CheckCircle size={14} />
              <span>{t.paid}</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        
        {/* Share Feedback Toast */}
        {shareFeedback && (
          <div className="bg-slate-900 text-white px-4 py-3 rounded-xl text-xs font-semibold shadow-lg text-center animate-fade-in">
            {shareFeedback}
          </div>
        )}

        {/* Invoice Page Visualizer */}
        <div id="invoice-print-area" className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6 md:p-8 space-y-8">
          
          {/* Invoice Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6 border-b border-slate-100 pb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0066FF] flex items-center justify-center text-white font-bold">B</div>
                <span className="font-sans font-extrabold text-lg text-slate-800">Billava</span>
              </div>
              <div>
                <h2 className="font-sans font-bold text-lg text-slate-800">{profile.companyName}</h2>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed font-sans">{profile.address}</p>
                {profile.taxId && (
                  <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase">NPWP: {profile.taxId}</p>
                )}
              </div>
            </div>

            <div className="space-y-3 text-left sm:text-right">
              <h1 className="text-2xl md:text-3xl font-sans font-black text-slate-800 tracking-tight">TAGIHAN</h1>
              <div className="space-y-1 font-sans">
                <p className="text-xs text-slate-400"><span className="font-semibold text-slate-500">No:</span> {invoice.invoiceNumber}</p>
                <p className="text-xs text-slate-400"><span className="font-semibold text-slate-500">Tanggal Terbit:</span> {formatDate(invoice.issueDate, profile.language)}</p>
                <p className="text-xs text-slate-400"><span className="font-semibold text-slate-500">Jatuh Tempo:</span> {formatDate(invoice.dueDate, profile.language)}</p>
              </div>

              {/* Status Badge */}
              <div className="sm:inline-block">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                  invoice.status === 'paid' 
                    ? 'bg-emerald-50 text-emerald-600' 
                    : invoice.status === 'pending'
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-rose-50 text-rose-600'
                }`}>
                  {invoice.status === 'paid' ? t.paid : invoice.status === 'pending' ? t.pending : t.overdue}
                </span>
              </div>
            </div>
          </div>

          {/* Invoice To/From Parties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider uppercase block">Ditagihkan Kepada:</span>
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-sm text-slate-800">{invoice.client.name}</h4>
                {invoice.client.company && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5"><Building size={12} className="text-slate-400" />{invoice.client.company}</p>
                )}
                {invoice.client.email && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5"><Mail size={12} className="text-slate-400" />{invoice.client.email}</p>
                )}
                {invoice.client.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5"><Phone size={12} className="text-slate-400" />{invoice.client.phone}</p>
                )}
                {invoice.client.address && (
                  <p className="text-xs text-slate-400 mt-2 italic leading-relaxed">{invoice.client.address}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider uppercase block">Narahubung Pengirim:</span>
              <div className="space-y-1">
                <h4 className="font-sans font-bold text-sm text-slate-800">{profile.name}</h4>
                <p className="text-xs text-slate-500">{profile.role}</p>
                <p className="text-xs text-slate-500">{profile.email}</p>
                <p className="text-xs text-slate-500">{profile.phone}</p>
              </div>
            </div>
          </div>

          {/* Table of items */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider pl-6">Deskripsi Layanan / Barang</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Jumlah</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-36">Harga Satuan</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-36 pr-6">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="p-4 text-xs font-semibold text-slate-800 pl-6 leading-relaxed">{item.description}</td>
                    <td className="p-4 text-xs font-semibold text-center">{item.quantity}</td>
                    <td className="p-4 text-xs font-semibold text-right">{formatCurrency(item.price, profile.currency)}</td>
                    <td className="p-4 text-xs font-bold text-slate-800 text-right pr-6">{formatCurrency(item.amount, profile.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Notes & Calculation summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Notes display */}
            <div className="space-y-2">
              <span className="text-[10px] font-sans font-bold text-slate-400 tracking-wider uppercase block">Catatan Pembayaran:</span>
              <p className="text-xs text-slate-500 leading-relaxed font-sans bg-slate-50 p-4 rounded-xl border border-slate-100">
                {invoice.notes || 'Pembayaran dapat diselesaikan menggunakan saldo e-wallet favorit atau transfer Virtual Account Bank di halaman pembayaran.'}
              </p>
              
              {invoice.status === 'paid' && invoice.paymentDate && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle size={14} />
                  <span>
                    Lunas melalui {invoice.paymentMethod || 'E-Wallet'} pada tanggal {formatDate(invoice.paymentDate, profile.language)}
                  </span>
                </div>
              )}
            </div>

            {/* Calculations display */}
            <div className="space-y-3 font-sans text-sm md:pl-8">
              <div className="flex justify-between text-slate-500 font-semibold">
                <span>Subtotal</span>
                <span className="text-slate-800">{formatCurrency(invoice.subtotal, profile.currency)}</span>
              </div>

              <div className="flex justify-between text-slate-500 font-semibold">
                <span>Pajak PPN ({invoice.taxRate}%)</span>
                <span className="text-slate-800">{formatCurrency(invoice.taxAmount, profile.currency)}</span>
              </div>

              <div className="border-t border-slate-100 pt-3 flex justify-between items-end">
                <span className="text-base font-bold text-slate-800">Total Tagihan</span>
                <span className="font-extrabold text-xl text-[#2563EB]">
                  {formatCurrency(invoice.total, profile.currency)}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Thermal Print Area (Hidden on screen, shown only when printing in thermal mode) */}
        <div id="thermal-print-area" className="hidden font-mono text-[10px] text-black w-[58mm] p-1 bg-white">
          <div className="text-center space-y-1">
            <h2 className="text-sm font-bold uppercase">{profile.companyName}</h2>
            <p className="text-[9px] leading-tight">{profile.address}</p>
            {profile.phone && <p className="text-[9px]">Telp: {profile.phone}</p>}
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>No:</span>
              <span>{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Tgl:</span>
              <span>{formatDate(invoice.issueDate, profile.language)}</span>
            </div>
            <div className="flex justify-between">
              <span>Jatuh Tempo:</span>
              <span>{formatDate(invoice.dueDate, profile.language)}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-bold uppercase">{invoice.status === 'paid' ? t.paid : t.pending}</span>
            </div>
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          <div className="space-y-0.5">
            <span className="font-bold block">DITAGIHKAN KEPADA:</span>
            <span className="block font-bold">{invoice.client.name}</span>
            {invoice.client.company && <span className="block">{invoice.client.company}</span>}
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          <div className="space-y-1">
            <div className="flex justify-between font-bold">
              <span className="w-1/2">Item</span>
              <span className="w-1/6 text-center">Qty</span>
              <span className="w-1/3 text-right">Total</span>
            </div>
            <div className="border-t border-dotted border-black my-1"></div>
            {invoice.items.map((item) => (
              <div key={item.id} className="space-y-0.5">
                <div className="font-semibold leading-tight">{item.description}</div>
                <div className="flex justify-between text-[9px] text-slate-700">
                  <span>{item.quantity} x {formatCurrency(item.price, profile.currency)}</span>
                  <span>{formatCurrency(item.amount, profile.currency)}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          <div className="space-y-1 text-right">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal, profile.currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>PPN ({invoice.taxRate}%):</span>
              <span>{formatCurrency(invoice.taxAmount, profile.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs pt-1 border-t border-dotted border-black">
              <span>Total:</span>
              <span>{formatCurrency(invoice.total, profile.currency)}</span>
            </div>
          </div>
          
          {invoice.status === 'paid' && (
            <>
              <div className="border-t border-dashed border-black my-2"></div>
              <div className="text-center font-bold uppercase text-[9px] p-1 bg-slate-100 border border-black rounded">
                LUNAS via {invoice.paymentMethod || 'E-Wallet'}
                {invoice.paymentDate && <span className="block text-[8px] font-normal lowercase">pada {formatDate(invoice.paymentDate, profile.language)}</span>}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-black my-2"></div>
          
          <div className="text-center space-y-1 pt-1">
            <p className="font-bold text-[9px]">TERIMA KASIH</p>
            <p className="text-[8px] italic">Powered by Billava</p>
          </div>
          
          {/* Feed space at the bottom to allow clean tear-off on thermal printers */}
          <div className="h-12"></div>
        </div>

      </main>
    </div>
  );
}
