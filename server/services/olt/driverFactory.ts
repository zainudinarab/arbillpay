import { IOltDriver } from './IOltDriver.js';
import { VsolDriver } from './drivers/vsolDriver.js';
import { ZteDriver } from './drivers/zteDriver.js';
import { HuaweiDriver } from './drivers/huaweiDriver.js';
import { CdataDriver } from './drivers/cdataDriver.js';
import { GenericDriver } from './drivers/genericDriver.js';

// Singleton instances untuk efisiensi memori
const vsolDriverInstance = new VsolDriver();
const zteDriverInstance = new ZteDriver();
const huaweiDriverInstance = new HuaweiDriver();
const cdataDriverInstance = new CdataDriver();
const genericDriverInstance = new GenericDriver();

/**
 * Driver Factory: Mengembalikan instance IOltDriver berdasarkan merek atau keluarga OLT
 */
export function getOltDriver(brand?: string): IOltDriver {
  const b = (brand || '').toLowerCase().trim();

  switch (b) {
    // Keluarga V-Solution OEM & HSAirPo
    case 'vsol':
    case 'hsairpo':
    case 'hsgq':
    case 'richerlink':
    case 'fdpon':
      return vsolDriverInstance;

    // Keluarga C-Data
    case 'cdata':
    case 'c-data':
    case 'c_data':
      return cdataDriverInstance;

    // Keluarga ZTE
    case 'zte':
    case 'zte-c320':
    case 'zte-c300':
    case 'c320':
    case 'c300':
      return zteDriverInstance;

    // Keluarga Huawei
    case 'huawei':
    case 'ma5608t':
    case 'ma5680t':
    case 'ma5800':
      return huaweiDriverInstance;

    default:
      return genericDriverInstance;
  }
}

/**
 * Daftar seluruh profil kapabilitas OLT yang didukung sistem (Daftar JSON murni di service, bukan di database)
 */
export function getAllOltDriverCapabilities() {
  return [
    vsolDriverInstance.getCapabilities(),
    cdataDriverInstance.getCapabilities(),
    zteDriverInstance.getCapabilities(),
    huaweiDriverInstance.getCapabilities(),
    genericDriverInstance.getCapabilities()
  ];
}

