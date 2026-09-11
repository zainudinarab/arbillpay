/**
 * Utility untuk Format dan Parse Comment MikroTik Hotspot
 * 
 * Format yang dihasilkan kompatibel dengan script scheduler monitoring expired voucher:
 * Contoh: "oct/18/2026 23:59:59 N | exp:oct/11/2026 | Ahmad Hotspot | CUST-1001"
 * 
 * Awalan "oct/18/2026 23:59:59 N" akan terbaca oleh script expired MikroTik
 * untuk memberikan notifikasi / isolir saat masa tenggang (grace period) habis.
 * Bagian setelah tanda pipe "|" menyimpan metadata identitas pelanggan untuk memudahkan parse kembali.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Mengonversi nilai tanggal apa pun (Date, ISO string, English string 'Sun Oct 11 2026...')
 * menjadi format YYYY-MM-DD yang aman untuk PostgreSQL DATE column.
 * Mengembalikan null jika invalid, sehingga tidak pernah menyebabkan error 'invalid input syntax for type date'.
 */
export function cleanToDateOnly(val: any): string | null {
  if (!val) return null;

  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }

  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;

  // 1. Jika sudah YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // 2. Format English string seperti "Sun Oct 11 2026 00:00:00 GM..."
  const mMatch = s.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s+(\d{4})/i);
  if (mMatch) {
    const mIdx = MONTHS.indexOf(mMatch[1].toLowerCase());
    if (mIdx !== -1) {
      const mm = String(mIdx + 1).padStart(2, '0');
      const dd = String(mMatch[2]).padStart(2, '0');
      const yyyy = mMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // 3. Format mmm/dd/yyyy (contoh: oct/11/2026)
  const slashMatch = s.match(/^([a-z]{3})\/(\d{1,2})\/(\d{4})/i);
  if (slashMatch) {
    const mIdx = MONTHS.indexOf(slashMatch[1].toLowerCase());
    if (mIdx !== -1) {
      const mm = String(mIdx + 1).padStart(2, '0');
      const dd = String(slashMatch[2]).padStart(2, '0');
      const yyyy = slashMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  // 4. Standar Date fallback
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return null;
}

/**
 * Format tanggal menjadi format ringkas MikroTik: mmm/dd/yyyy (contoh: oct/11/2026)
 * Tidak pernah menghasilkan string panjang seperti "Sun Oct 11 2026 00:00:00"
 */
export function toMikhmonDateString(val: any): string | null {
  const cleanIso = cleanToDateOnly(val);
  if (!cleanIso) return null;
  const [yyyy, mmStr, dd] = cleanIso.split('-');
  const mIdx = parseInt(mmStr, 10) - 1;
  const mmm = MONTHS[mIdx] || 'jan';
  return `${mmm}/${dd}/${yyyy}`;
}

export interface HotspotCommentPayload {
  grace_until?: string | null;
  expired_at?: string | null;
  name: string;
  customer_code?: string | null;
  id?: string;
}

export function formatMikrotikHotspotComment(cust: HotspotCommentPayload): string {
  // Bersihkan nilai tanggal ke format YYYY-MM-DD
  const cleanGrace = cleanToDateOnly(cust.grace_until);
  const cleanExp = cleanToDateOnly(cust.expired_at);

  // Gunakan tanggal grace_until untuk awalan notifikasi isolir MikroTik (didukung langsung oleh monitor-hotspot-arbill)
  const targetDateStr = cleanGrace || cleanExp || cleanToDateOnly(new Date(Date.now() + 30 * 86400000));
  const timeStr = '23:59:59';
  const voucherPrefix = `${targetDateStr} ${timeStr} N`;

  const code = cust.customer_code || (cust.id ? cust.id.substring(0, 8) : 'CUST');
  const cleanName = (cust.name || 'Member Hotspot').replace(/\|/g, '').trim();

  let expTag = '';
  if (cleanExp) {
    expTag = `exp:${cleanExp} | `;
  }

  return `${voucherPrefix} | ${expTag}${cleanName} | ${code}`;
}

export interface ParsedHotspotComment {
  graceUntil: string | null;
  expiredAt: string | null;
  name: string | null;
  code: string | null;
}

export function parseMikrotikHotspotComment(comment: string | null | undefined): ParsedHotspotComment {
  if (!comment || typeof comment !== 'string') {
    return { graceUntil: null, expiredAt: null, name: null, code: null };
  }

  const trimmed = comment.trim();
  let graceUntil: string | null = null;
  let remaining = trimmed;

  // 1a. Cek awalan format ISO: YYYY-MM-DD hh:mm:ss N (didukung langsung oleh monitor-hotspot-arbill)
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+([0-9]{2}:[0-9]{2}:[0-9]{2})\s+([A-Za-z])/i);
  // 1b. Cek awalan format Mikhmon v6: mmm/dd/yyyy hh:mm:ss N
  const mikhmonMatch = trimmed.match(/^([a-z]{3})\/([0-9]{1,2})\/([0-9]{4})\s+([0-9]{2}:[0-9]{2}:[0-9]{2})\s+([A-Za-z])/i);

  if (isoMatch) {
    graceUntil = isoMatch[1];
    remaining = trimmed.substring(isoMatch[0].length).trim();
  } else if (mikhmonMatch) {
    const monthIdx = MONTHS.indexOf(mikhmonMatch[1].toLowerCase());
    if (monthIdx !== -1) {
      const mm = String(monthIdx + 1).padStart(2, '0');
      const dd = String(mikhmonMatch[2]).padStart(2, '0');
      const yyyy = mikhmonMatch[3];
      graceUntil = `${yyyy}-${mm}-${dd}`;
    }
    remaining = trimmed.substring(mikhmonMatch[0].length).trim();
  }

  if (remaining.startsWith('|')) {
    remaining = remaining.substring(1).trim();
  }

  // 2. Parse bagian yang dipisahkan tanda pipe |
  const parts = remaining.split('|').map(s => s.trim()).filter(Boolean);
  let expiredAt: string | null = null;
  let name: string | null = null;
  let code: string | null = null;

  for (const part of parts) {
    if (part.toLowerCase().startsWith('exp:')) {
      expiredAt = cleanToDateOnly(part.substring(4).trim());
    } else if (part.toLowerCase().startsWith('grace:')) {
      if (!graceUntil) graceUntil = cleanToDateOnly(part.substring(6).trim());
    } else if (part.toLowerCase().startsWith('code:')) {
      code = part.substring(5).trim();
    } else if (part.toLowerCase().startsWith('name:')) {
      name = part.substring(5).trim();
    } else if (!name) {
      name = part;
    } else if (!code) {
      code = part;
    }
  }

  return { 
    graceUntil: cleanToDateOnly(graceUntil), 
    expiredAt: cleanToDateOnly(expiredAt), 
    name, 
    code 
  };
}

export interface PppCommentPayload {
  grace_until?: string | null;
  expired_at?: string | null;
  name: string;
  customer_code?: string | null;
  id?: string;
  profile_name?: string | null;
}

/**
 * Format comment untuk PPPoE Secret:
 * Contoh: "2026-09-25 23:59:59 | exp:2026-09-10 | act:PAKET_5M | Zainudin Arab | CUST-PKUG7"
 * 
 * Bagian depan "2026-09-25 23:59:59" adalah batas toleransi isolir (grace_until).
 * Script "monitor-ppp-arbil" akan membaca tanggal ini dan jika sudah lewat,
 * profil secret user otomatis diubah ke 'ppoe-expired' dan koneksi aktifnya diputus (disconnect).
 */
export function formatMikrotikPppComment(cust: PppCommentPayload): string {
  const cleanGrace = cleanToDateOnly(cust.grace_until);
  const cleanExp = cleanToDateOnly(cust.expired_at);

  const targetDateStr = cleanGrace || cleanExp || cleanToDateOnly(new Date(Date.now() + 30 * 86400000));
  const timeStr = '23:59:59';
  const prefix = `${targetDateStr} ${timeStr}`;

  const code = cust.customer_code || (cust.id ? cust.id.substring(0, 8) : 'CUST');
  const cleanName = (cust.name || 'Pelanggan PPPoE').replace(/\|/g, '').trim();

  let expTag = '';
  if (cleanExp) {
    expTag = `exp:${cleanExp} | `;
  }

  let profTag = '';
  if (cust.profile_name && cust.profile_name !== 'default') {
    profTag = `act:${cust.profile_name.trim()} | `;
  }

  return `${prefix} | ${expTag}${profTag}${cleanName} | ${code}`;
}

export interface ParsedPppComment {
  graceUntil: string | null;
  expiredAt: string | null;
  originalProfile: string | null;
  name: string | null;
  code: string | null;
}

export function parseMikrotikPppComment(comment: string | null | undefined): ParsedPppComment {
  if (!comment || typeof comment !== 'string') {
    return { graceUntil: null, expiredAt: null, originalProfile: null, name: null, code: null };
  }

  const trimmed = comment.trim();
  let graceUntil: string | null = null;
  let remaining = trimmed;

  // 1a. Cek awalan format ISO: YYYY-MM-DD hh:mm:ss
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:\s+([0-9]{2}:[0-9]{2}:[0-9]{2}))?/i);
  // 1b. Cek awalan format Mikhmon slash: mmm/dd/yyyy hh:mm:ss
  const slashMatch = trimmed.match(/^([a-z]{3})\/([0-9]{1,2})\/([0-9]{4})(?:\s+([0-9]{2}:[0-9]{2}:[0-9]{2}))?/i);

  if (isoMatch) {
    graceUntil = isoMatch[1];
    remaining = trimmed.substring(isoMatch[0].length).trim();
  } else if (slashMatch) {
    const monthIdx = MONTHS.indexOf(slashMatch[1].toLowerCase());
    if (monthIdx !== -1) {
      const mm = String(monthIdx + 1).padStart(2, '0');
      const dd = String(slashMatch[2]).padStart(2, '0');
      const yyyy = slashMatch[3];
      graceUntil = `${yyyy}-${mm}-${dd}`;
    }
    remaining = trimmed.substring(slashMatch[0].length).trim();
  }

  if (remaining.startsWith('|')) {
    remaining = remaining.substring(1).trim();
  }

  // 2. Parse bagian yang dipisahkan tanda pipe |
  const parts = remaining.split('|').map(s => s.trim()).filter(Boolean);
  let expiredAt: string | null = null;
  let originalProfile: string | null = null;
  let name: string | null = null;
  let code: string | null = null;

  for (const part of parts) {
    if (part.toLowerCase().startsWith('exp:')) {
      expiredAt = cleanToDateOnly(part.substring(4).trim());
    } else if (part.toLowerCase().startsWith('grace:')) {
      if (!graceUntil) graceUntil = cleanToDateOnly(part.substring(6).trim());
    } else if (part.toLowerCase().startsWith('act:')) {
      originalProfile = part.substring(4).trim();
    } else if (part.toLowerCase().startsWith('code:')) {
      code = part.substring(5).trim();
    } else if (part.toLowerCase().startsWith('name:')) {
      name = part.substring(5).trim();
    } else if (!name) {
      name = part;
    } else if (!code) {
      code = part;
    }
  }

  return {
    graceUntil: cleanToDateOnly(graceUntil),
    expiredAt: cleanToDateOnly(expiredAt),
    originalProfile,
    name,
    code
  };
}
