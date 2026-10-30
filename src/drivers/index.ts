import type { DeviceKind, TvDevice, TvDriver } from '../core/types';
import { AndroidTvDriver } from './androidtv';
import { TizenDriver } from './tizen';
import { WebOsDriver } from './webos';
import { XiaomiLegacyDriver } from './xiaomi-legacy';

export function createDriver(device: TvDevice): TvDriver {
  switch (device.kind) {
    case 'androidtv':
      return new AndroidTvDriver(device);
    case 'webos':
      return new WebOsDriver(device);
    case 'tizen':
      return new TizenDriver(device);
    case 'xiaomi-legacy':
      return new XiaomiLegacyDriver(device);
  }
}

export const KIND_LABELS: Record<DeviceKind, string> = {
  androidtv: 'Android TV / Google TV',
  webos: 'LG webOS',
  tizen: 'Samsung Tizen',
  'xiaomi-legacy': 'Xiaomi PatchWall (đời cũ)',
};

/** Brand presets for manual setup: each brand maps to the protocol its TVs speak. */
export const BRAND_PRESETS: { brand: string; kind: DeviceKind; hint: string }[] = [
  { brand: 'Samsung', kind: 'tizen', hint: 'Smart TV Tizen 2016 trở lên' },
  { brand: 'LG', kind: 'webos', hint: 'webOS 2014 trở lên' },
  { brand: 'Sony', kind: 'androidtv', hint: 'Bravia Android TV / Google TV' },
  { brand: 'TCL', kind: 'androidtv', hint: 'Android TV / Google TV' },
  { brand: 'Xiaomi', kind: 'androidtv', hint: 'Mi TV / Xiaomi TV chạy Android TV, Google TV' },
  { brand: 'Xiaomi (cũ)', kind: 'xiaomi-legacy', hint: 'Mi TV PatchWall không có Google TV' },
  { brand: 'Panasonic', kind: 'androidtv', hint: 'Dòng chạy Android TV / Google TV' },
  { brand: 'Philips', kind: 'androidtv', hint: 'Android TV / Google TV' },
  { brand: 'Sharp', kind: 'androidtv', hint: 'Android TV / Google TV' },
  { brand: 'Toshiba', kind: 'androidtv', hint: 'Android TV / Google TV' },
  { brand: 'Hisense', kind: 'androidtv', hint: 'Dòng Android TV / Google TV' },
  { brand: 'Casper / Asanzo / FFalcon...', kind: 'androidtv', hint: 'TV khác chạy Android TV' },
];
