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
