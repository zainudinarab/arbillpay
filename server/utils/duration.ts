/**
 * Helper Perhitungan Waktu Berdasarkan Standar ISO-8601 Duration
 * Digunakan oleh Invoice Controller & Customer Controller untuk perpanjangan masa aktif
 */

export function addIsoDuration(baseDate: Date | string, isoStr?: string | null, fallbackDays = 30): Date {
  const d = new Date(baseDate);
  if (isNaN(d.getTime())) {
    return new Date();
  }

  if (!isoStr || typeof isoStr !== 'string') {
    d.setDate(d.getDate() + fallbackDays);
    return d;
  }

  const clean = isoStr.trim().toUpperCase();

  // 1. Bulan (Contoh: P1M, P3M) -> Akurat mengikuti kalender bulan
  const m = clean.match(/^P(\d+)M$/);
  if (m) {
    d.setMonth(d.getMonth() + parseInt(m[1], 10));
    return d;
  }

  // 2. Hari (Contoh: P1D, P5D, P30D)
  const day = clean.match(/^P(\d+)D$/);
  if (day) {
    d.setDate(d.getDate() + parseInt(day[1], 10));
    return d;
  }

  // 3. Jam (Contoh: PT1H, PT3H)
  const hr = clean.match(/^PT(\d+)H$/);
  if (hr) {
    d.setHours(d.getHours() + parseInt(hr[1], 10));
    return d;
  }

  // 4. Menit (Contoh: PT2M, PT30M)
  const min = clean.match(/^PT(\d+)M$/);
  if (min) {
    d.setMinutes(d.getMinutes() + parseInt(min[1], 10));
    return d;
  }

  // 5. Kombinasi ISO (Contoh: P1DT6H)
  let matched = false;
  const datePart = clean.includes('T') ? clean.split('T')[0] : clean;
  const timePart = clean.includes('T') ? clean.split('T')[1] : '';

  const dayCombo = datePart.match(/(\d+)D/);
  if (dayCombo) {
    d.setDate(d.getDate() + parseInt(dayCombo[1], 10));
    matched = true;
  }

  const hrCombo = timePart.match(/(\d+)H/);
  if (hrCombo) {
    d.setHours(d.getHours() + parseInt(hrCombo[1], 10));
    matched = true;
  }

  const minCombo = timePart.match(/(\d+)M/);
  if (minCombo) {
    d.setMinutes(d.getMinutes() + parseInt(minCombo[1], 10));
    matched = true;
  }

  if (!matched) {
    d.setDate(d.getDate() + fallbackDays);
  }

  return d;
}
