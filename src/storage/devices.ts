import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TvDevice } from '../core/types';

const KEY = 'dvdremote.devices.v1';

export async function loadDevices(): Promise<TvDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TvDevice[]) : [];
  } catch {
    return [];
  }
}

export async function saveDevices(devices: TvDevice[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(devices));
}

export function makeDeviceId(host: string, kind: string): string {
  return `${kind}:${host}`;
}
