/**
 * Service for Indonesian Administrative Boundaries (Provinsi, Kabupaten/Kota, Kecamatan, Desa/Kelurahan, Kode Pos)
 * API Provider: Open API Wilayah Indonesia (BPS / Kemendagri)
 */

export interface RegionItem {
  id: string;
  name: string;
}

export interface VillageItem extends RegionItem {
  district_id?: string;
  postal_code?: string;
}

// In-memory cache to avoid duplicate network requests
const cache: Record<string, any[]> = {};

/**
 * Fetch all Provinces in Indonesia
 */
export async function fetchProvinces(): Promise<RegionItem[]> {
  const cacheKey = 'provinces';
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch('https://emsifa.github.io/api-wilayah-indonesia/api/provinces.json');
    if (!res.ok) throw new Error('Network response failed');
    const data: RegionItem[] = await res.json();
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name.toUpperCase()
    }));
    cache[cacheKey] = formatted;
    return formatted;
  } catch (err) {
    console.warn('[REGION SERVICE WARN] Failed to fetch provinces API, returning fallback list:', err);
    return [
      { id: '35', name: 'JAWA TIMUR' },
      { id: '33', name: 'JAWA TENGAH' },
      { id: '32', name: 'JAWA BARAT' },
      { id: '31', name: 'DKI JAKARTA' },
      { id: '34', name: 'DI YOGYAKARTA' },
      { id: '36', name: 'BANTEN' },
      { id: '51', name: 'BALI' }
    ];
  }
}

/**
 * Fetch Regencies (Kabupaten / Kota) for a given Province ID
 */
export async function fetchRegencies(provinceId: string): Promise<RegionItem[]> {
  if (!provinceId) return [];
  const cacheKey = `regencies_${provinceId}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://emsifa.github.io/api-wilayah-indonesia/api/regencies/${provinceId}.json`);
    if (!res.ok) throw new Error('Network response failed');
    const data: RegionItem[] = await res.json();
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name.toUpperCase()
    }));
    cache[cacheKey] = formatted;
    return formatted;
  } catch (err) {
    console.warn(`[REGION SERVICE WARN] Failed to fetch regencies for province ${provinceId}:`, err);
    return [
      { id: '3517', name: 'KABUPATEN JOMBANG' },
      { id: '3578', name: 'KOTA SURABAYA' },
      { id: '3515', name: 'KABUPATEN SIDOARJO' },
      { id: '3507', name: 'KABUPATEN MALANG' },
      { id: '3516', name: 'KABUPATEN MOJOKERTO' }
    ];
  }
}

/**
 * Fetch Districts (Kecamatan) for a given Regency ID
 */
export async function fetchDistricts(regencyId: string): Promise<RegionItem[]> {
  if (!regencyId) return [];
  const cacheKey = `districts_${regencyId}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://emsifa.github.io/api-wilayah-indonesia/api/districts/${regencyId}.json`);
    if (!res.ok) throw new Error('Network response failed');
    const data: RegionItem[] = await res.json();
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name.toUpperCase()
    }));
    cache[cacheKey] = formatted;
    return formatted;
  } catch (err) {
    console.warn(`[REGION SERVICE WARN] Failed to fetch districts for regency ${regencyId}:`, err);
    return [
      { id: '3517010', name: 'KECAMATAN DIWEK' },
      { id: '3517020', name: 'KECAMATAN JOMBANG' },
      { id: '3517030', name: 'KECAMATAN PETERONGAN' },
      { id: '3517040', name: 'KECAMATAN SUMOBITO' },
      { id: '3517050', name: 'KECAMATAN MOJOWARNO' }
    ];
  }
}

/**
 * Fetch Villages (Desa / Kelurahan) for a given District ID
 */
export async function fetchVillages(districtId: string): Promise<VillageItem[]> {
  if (!districtId) return [];
  const cacheKey = `villages_${districtId}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const res = await fetch(`https://emsifa.github.io/api-wilayah-indonesia/api/villages/${districtId}.json`);
    if (!res.ok) throw new Error('Network response failed');
    const data: VillageItem[] = await res.json();
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name.toUpperCase()
    }));
    cache[cacheKey] = formatted;
    return formatted;
  } catch (err) {
    console.warn(`[REGION SERVICE WARN] Failed to fetch villages for district ${districtId}:`, err);
    return [
      { id: '3517010001', name: 'CUKIR' },
      { id: '3517010002', name: 'KWARON' },
      { id: '3517010003', name: 'JATIREJO' },
      { id: '3517010004', name: 'DIWEK' }
    ];
  }
}

/**
 * Fetch Postal Code (Kode Pos) automatically by searching District / Village
 */
export async function fetchPostalCode(query: string): Promise<string> {
  if (!query) return '';
  const cleanQ = query.trim().toLowerCase();
  const cacheKey = `postal_${cleanQ}`;
  if (cache[cacheKey]) return cache[cacheKey][0] || '';

  try {
    const res = await fetch(`https://kodedopos.github.io/api/search.json?q=${encodeURIComponent(cleanQ)}`);
    if (!res.ok) throw new Error('Network response failed');
    const data = await res.json();
    if (data && data.data && data.data.length > 0) {
      const zip = String(data.data[0].postalcode || data.data[0].postal_code || '');
      cache[cacheKey] = [zip];
      return zip;
    }
  } catch (err) {
    console.warn(`[REGION SERVICE WARN] Postal code lookup failed for query ${query}:`, err);
  }
  return '';
}
