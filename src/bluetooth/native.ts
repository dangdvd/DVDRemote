import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { Platform } from 'react-native';

export interface HidState {
  registered: boolean;
  connected: boolean;
  deviceName?: string | null;
  deviceAddress?: string | null;
}

export interface BondedDevice {
  name?: string | null;
  address: string;
}

interface BluetoothHidNative {
  isSupported(): boolean;
  isEnabled(): boolean;
  getState(): HidState;
  start(): Promise<HidState>;
  stop(): Promise<void>;
  getBondedDevices(): Promise<BondedDevice[]>;
  connect(address: string): Promise<boolean>;
  disconnect(): Promise<void>;
  requestDiscoverable(seconds: number): Promise<void>;
  sendMouse(buttons: number, dx: number, dy: number, wheel: number): boolean;
  addListener(event: 'onStateChange', listener: (state: HidState) => void): EventSubscription;
}

/** The local `modules/bluetooth-hid` Android module; null on iOS (no API to act as a mouse). */
export const BluetoothHid: BluetoothHidNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<BluetoothHidNative>('DVDBluetoothHid') : null;

export function isBluetoothMouseSupported(): boolean {
  try {
    return !!BluetoothHid?.isSupported();
  } catch {
    return false;
  }
}
