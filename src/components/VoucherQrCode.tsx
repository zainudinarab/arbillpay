import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface VoucherQrCodeProps {
  text: string;
  size?: number;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export default function VoucherQrCode({
  text,
  size = 110,
  className = '',
  darkColor = '#0f172a',
  lightColor = '#ffffff'
}: VoucherQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!text) return;
    let isMounted = true;

    QRCode.toDataURL(text, {
      width: size * 2, // 2x for retina crispness
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: darkColor,
        light: lightColor
      }
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        console.warn('Local QRCode generator error, using fallback:', err);
        if (isMounted) {
          setDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [text, size, darkColor, lightColor]);

  if (!dataUrl) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className={`bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg flex items-center justify-center ${className}`}
      >
        <span className="text-[9px] text-slate-400 font-mono">QR...</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Voucher QR Code"
      width={size}
      height={size}
      className={`select-none rounded-lg ${className}`}
      loading="eager"
    />
  );
}
