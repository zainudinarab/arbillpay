// Helper functions for ISO-8601 Duration conversion and human formatting

export interface IsoDurationParsed {
  val: number;
  unit: 'month' | 'day' | 'hour' | 'minute' | 'year' | 'custom';
  raw: string;
  human: string;
}

/**
 * Encodes value and unit to ISO-8601 duration string.
 * Example:
 * (1, 'month') => 'P1M'
 * (30, 'day') => 'P30D'
 * (12, 'hour') => 'PT12H'
 * (30, 'minute') => 'PT30M'
 */
export function encodeIso8601(val: number, unit: string): string {
  const num = Math.max(val || 1, 1);
  switch (unit) {
    case 'month':
      return `P${num}M`;
    case 'day':
      return `P${num}D`;
    case 'hour':
      return `PT${num}H`;
    case 'minute':
      return `PT${num}M`;
    case 'year':
      return `P${num}Y`;
    default:
      return `P${num}M`;
  }
}

/**
 * Parses an ISO-8601 duration string to human-readable string and numeric/unit breakdown.
 * Example:
 * 'P1M' => { val: 1, unit: 'month', human: '1 Bulan (Kalender)' }
 * 'P30D' => { val: 30, unit: 'day', human: '30 Hari' }
 * 'PT12H' => { val: 12, unit: 'hour', human: '12 Jam' }
 * 'P1DT6H' => { val: 0, unit: 'custom', human: '1 Hari 6 Jam (ISO: P1DT6H)' }
 */
export function parseIso8601(isoStr: string | null | undefined, fallbackVal = 1, fallbackUnit = 'month'): IsoDurationParsed {
  if (!isoStr || typeof isoStr !== 'string') {
    const raw = encodeIso8601(fallbackVal, fallbackUnit);
    return parseIso8601(raw);
  }

  const clean = isoStr.trim().toUpperCase();

  // Simple Month match (P1M, P3M)
  const monthMatch = clean.match(/^P(\d+)M$/);
  if (monthMatch) {
    const v = parseInt(monthMatch[1], 10);
    return { val: v, unit: 'month', raw: clean, human: `${v} Bulan (Kalender)` };
  }

  // Simple Day match (P30D, P15D, P7D)
  const dayMatch = clean.match(/^P(\d+)D$/);
  if (dayMatch) {
    const v = parseInt(dayMatch[1], 10);
    return { val: v, unit: 'day', raw: clean, human: `${v} Hari` };
  }

  // Simple Hour match (PT12H, PT3H)
  const hourMatch = clean.match(/^PT(\d+)H$/);
  if (hourMatch) {
    const v = parseInt(hourMatch[1], 10);
    return { val: v, unit: 'hour', raw: clean, human: `${v} Jam` };
  }

  // Simple Minute match (PT30M, PT60M)
  const minuteMatch = clean.match(/^PT(\d+)M$/);
  if (minuteMatch) {
    const v = parseInt(minuteMatch[1], 10);
    return { val: v, unit: 'minute', raw: clean, human: `${v} Menit` };
  }

  // Simple Year match (P1Y)
  const yearMatch = clean.match(/^P(\d+)Y$/);
  if (yearMatch) {
    const v = parseInt(yearMatch[1], 10);
    return { val: v, unit: 'year', raw: clean, human: `${v} Tahun` };
  }

  // Complex ISO format parse (e.g., P1DT6H, P1Y1M)
  let humanText = clean;
  try {
    const parts: string[] = [];
    const pPart = clean.split('T')[0];
    const tPart = clean.includes('T') ? clean.split('T')[1] : '';

    const y = pPart.match(/(\d+)Y/);
    if (y) parts.push(`${y[1]} Tahun`);

    const m = pPart.match(/(\d+)M/);
    if (m) parts.push(`${m[1]} Bulan`);

    const d = pPart.match(/(\d+)D/);
    if (d) parts.push(`${d[1]} Hari`);

    const h = tPart.match(/(\d+)H/);
    if (h) parts.push(`${h[1]} Jam`);

    const min = tPart.match(/(\d+)M/);
    if (min) parts.push(`${min[1]} Menit`);

    if (parts.length > 0) {
      humanText = `${parts.join(' ')} (ISO: ${clean})`;
    }
  } catch (e) {
    humanText = clean;
  }

  return {
    val: 0,
    unit: 'custom',
    raw: clean,
    human: humanText
  };
}

/**
 * Konversi ISO-8601 Duration ke Format MikroTik (misal: limit-uptime atau validity)
 * Contoh:
 * - PT30M -> 30m
 * - PT3H  -> 3h
 * - P1D   -> 1d
 * - P30D  -> 30d
 */
export function isoToMikrotikTime(isoStr?: string | null): string {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.trim().toUpperCase();
  if (!clean || clean === 'PT0S' || clean === '0') return '';
  if (!clean.startsWith('P')) return isoStr.trim().toLowerCase();

  const min = clean.match(/^PT(\d+)M$/);
  if (min) return `${min[1]}m`;

  const hr = clean.match(/^PT(\d+)H$/);
  if (hr) return `${hr[1]}h`;

  const day = clean.match(/^P(\d+)D$/);
  if (day) return `${day[1]}d`;

  const mo = clean.match(/^P(\d+)M$/);
  if (mo) return `${mo[1]}mo`;

  const yr = clean.match(/^P(\d+)Y$/);
  if (yr) return `${yr[1]}y`;

  let res = '';
  const datePart = clean.includes('T') ? clean.split('T')[0] : clean;
  const timePart = clean.includes('T') ? clean.split('T')[1] : '';

  const y = datePart.match(/(\d+)Y/);
  if (y) res += `${y[1]}y`;
  const m = datePart.match(/(\d+)M/);
  if (m) res += `${m[1]}mo`;
  const d = datePart.match(/(\d+)D/);
  if (d) res += `${d[1]}d`;
  const h = timePart.match(/(\d+)H/);
  if (h) res += `${h[1]}h`;
  const tm = timePart.match(/(\d+)M/);
  if (tm) res += `${tm[1]}m`;

  return res || '';
}

/**
 * Konversi teks MikroTik time (3h, 30m, 1d, 1mo) ke Standar ISO-8601 Duration
 */
export function mikrotikTimeToIso(str?: string | null): string | null {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim();
  if (!clean || clean === '0' || clean.toLowerCase() === 'none' || clean.toLowerCase() === 'unlimited') return null;

  if (clean.toUpperCase().startsWith('P')) return clean.toUpperCase();

  const lower = clean.toLowerCase();
  const min = lower.match(/^(\d+)m$/);
  if (min) return `PT${min[1]}M`;

  const hr = lower.match(/^(\d+)h$/);
  if (hr) return `PT${hr[1]}H`;

  const day = lower.match(/^(\d+)d$/);
  if (day) return `P${day[1]}D`;

  const mo = lower.match(/^(\d+)mo$/);
  if (mo) return `P${mo[1]}M`;

  const yr = lower.match(/^(\d+)y$/);
  if (yr) return `P${yr[1]}Y`;

  const combo = lower.match(/^(\d+)d(\d+)h$/);
  if (combo) return `P${combo[1]}DT${combo[2]}H`;

  return null;
}

/**
 * Format tampilan Limit Uptime untuk kartu informasi UI
 */
export function formatUptimeDisplay(uptime?: string | null): string {
  if (!uptime || uptime === '0' || uptime.toLowerCase() === 'none' || uptime.toLowerCase() === 'unlimited') {
    return 'Sesuai Masa Aktif';
  }

  const parsed = parseIso8601(mikrotikTimeToIso(uptime) || uptime);
  const mikrotikVal = isoToMikrotikTime(uptime);
  return `${parsed.human} (${mikrotikVal})`;
}

/**
 * Validasi apakah sebuah string merupakan format ISO-8601 Duration yang sah
 * Contoh sah: P1M, P30D, PT1H, PT30M, P1DT6H, P1Y2M
 */
export function isValidIso8601Duration(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  const clean = str.trim().toUpperCase();
  if (!clean.startsWith('P') || clean === 'P' || clean === 'PT') return false;

  const regex = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
  const match = clean.match(regex);
  if (!match) return false;

  // Pastikan minimal ada 1 bagian angka yang terisi dan nilainya > 0
  const groups = match.slice(1);
  const hasValidNumber = groups.some(val => val !== undefined && parseInt(val, 10) > 0);
  return hasValidNumber;
}

export interface DurationParts {
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
}

/**
 * Menyusun angka bertingkat (Bulan, Hari, Jam, Menit) menjadi string ISO-8601 standar
 * Contoh:
 * { days: 1, hours: 6 } -> "P1DT6H"
 * { hours: 1 } -> "PT1H"
 * { months: 1 } -> "P1M"
 */
export function composeIsoDuration(parts: DurationParts): string {
  const months = Math.max(0, parts.months || 0);
  const days = Math.max(0, parts.days || 0);
  const hours = Math.max(0, parts.hours || 0);
  const minutes = Math.max(0, parts.minutes || 0);

  if (!months && !days && !hours && !minutes) return '';

  let datePart = '';
  if (months > 0) datePart += `${months}M`;
  if (days > 0) datePart += `${days}D`;

  let timePart = '';
  if (hours > 0) timePart += `${hours}H`;
  if (minutes > 0) timePart += `${minutes}M`;

  if (timePart) {
    return `P${datePart}T${timePart}`;
  }
  return `P${datePart}`;
}

/**
 * Memecah string ISO-8601 Duration menjadi komponen bertingkat (Bulan, Hari, Jam, Menit)
 * Contoh:
 * "P1DT6H" -> { months: 0, days: 1, hours: 6, minutes: 0 }
 * "PT1H"   -> { months: 0, days: 0, hours: 1, minutes: 0 }
 */
export function decomposeIsoDuration(isoStr?: string | null): DurationParts {
  const def: DurationParts = { months: 0, days: 0, hours: 0, minutes: 0 };
  if (!isoStr || typeof isoStr !== 'string') return def;
  const clean = isoStr.trim().toUpperCase();
  if (!clean.startsWith('P')) return def;

  const dateSection = clean.includes('T') ? clean.split('T')[0] : clean;
  const timeSection = clean.includes('T') ? clean.split('T')[1] : '';

  // Ekstrak Bulan & Hari
  const m = dateSection.match(/(\d+)M/);
  if (m) def.months = parseInt(m[1], 10);

  const d = dateSection.match(/(\d+)D/);
  if (d) def.days = parseInt(d[1], 10);

  // Ekstrak Jam & Menit
  const h = timeSection.match(/(\d+)H/);
  if (h) def.hours = parseInt(h[1], 10);

  const min = timeSection.match(/(\d+)M/);
  if (min) def.minutes = parseInt(min[1], 10);

  return def;
}
