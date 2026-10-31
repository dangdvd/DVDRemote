import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import type { TvDevice } from '../core/types';
import { MouseAccumulator, MouseButton } from './mouseReport';
import { BluetoothHid, BondedDevice, HidState } from './native';

/** Finger pixels per wheel notch when scrolling with two fingers. */
const SCROLL_PX_PER_NOTCH = 24;
const DISCOVERABLE_SECONDS = 120;

export type BluetoothMousePhase = 'off' | 'starting' | 'ready' | 'connected';

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * Drives the phone's Bluetooth mouse mode for one TV. Nothing happens until start(); leaving the
 * remote screen turns the mode off so other apps can use the phone's Bluetooth HID slot.
 */
export function useBluetoothMouse(device: TvDevice, onSaveDevice: (patch: Partial<TvDevice>) => void) {
  const [phase, setPhase] = useState<BluetoothMousePhase>('off');
  const [hostName, setHostName] = useState<string | null>(null);
  const [bonded, setBonded] = useState<BondedDevice[]>([]);
  const [error, setError] = useState('');
  const started = useRef(false);
  const accumulator = useRef(new MouseAccumulator());
  const scrollRest = useRef(0);
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const saveRef = useRef(onSaveDevice);
  saveRef.current = onSaveDevice;

  const applyState = useCallback((state: HidState) => {
    if (!state.registered) {
      setPhase(started.current ? 'starting' : 'off');
      setHostName(null);
      return;
    }
    setPhase(state.connected ? 'connected' : 'ready');
    setHostName(state.connected ? state.deviceName || state.deviceAddress || null : null);
    const address = state.deviceAddress;
    if (state.connected && address && address !== deviceRef.current.credentials?.btAddress) {
      // Remember which Bluetooth device is this TV, to reconnect automatically next time.
      saveRef.current({ credentials: { ...deviceRef.current.credentials, btAddress: address } });
    }
  }, []);

  useEffect(() => {
    if (!BluetoothHid) return;
    const sub = BluetoothHid.addListener('onStateChange', applyState);
    return () => {
      sub.remove();
      if (started.current) {
        started.current = false;
        BluetoothHid?.stop().catch(() => {});
      }
    };
  }, [applyState]);

  const refreshBonded = useCallback(async () => {
    if (!BluetoothHid) return [];
    const list = await BluetoothHid.getBondedDevices();
    setBonded(list);
    return list;
  }, []);

  const connect = useCallback(async (address: string) => {
    if (!BluetoothHid) return;
    setError('');
    try {
      const ok = await BluetoothHid.connect(address);
      if (!ok) setError('TV không nhận kết nối. Hãy bật TV và thử lại, hoặc ghép đôi lại.');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }, []);

  const start = useCallback(async () => {
    if (!BluetoothHid) return;
    setError('');
    if (!(await requestPermissions())) {
      setError('Cần cấp quyền "Thiết bị ở gần" (Bluetooth) để dùng chế độ chuột.');
      return;
    }
    started.current = true;
    setPhase('starting');
    try {
      const state = await BluetoothHid.start();
      applyState(state);
      const list = await refreshBonded();
      const remembered = deviceRef.current.credentials?.btAddress;
      if (!state.connected && remembered && list.some((d) => d.address === remembered)) {
        await connect(remembered);
      }
    } catch (err: any) {
      started.current = false;
      setPhase('off');
      setError(err?.message ?? String(err));
    }
  }, [applyState, connect, refreshBonded]);

  const stop = useCallback(async () => {
    started.current = false;
    await BluetoothHid?.stop().catch(() => {});
    setPhase('off');
    setHostName(null);
  }, []);

  const makeDiscoverable = useCallback(async () => {
    setError('');
    try {
      await BluetoothHid?.requestDiscoverable(DISCOVERABLE_SECONDS);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }, []);

  const move = useCallback((dx: number, dy: number) => {
    for (const [x, y] of accumulator.current.take(dx, dy)) BluetoothHid?.sendMouse(0, x, y, 0);
  }, []);

  const click = useCallback((button: number = MouseButton.LEFT) => {
    BluetoothHid?.sendMouse(button, 0, 0, 0);
    BluetoothHid?.sendMouse(0, 0, 0, 0);
  }, []);

  const scroll = useCallback((dy: number) => {
    scrollRest.current += dy;
    const notches = Math.trunc(scrollRest.current / SCROLL_PX_PER_NOTCH);
    if (!notches) return;
    scrollRest.current -= notches * SCROLL_PX_PER_NOTCH;
    // Dragging up scrolls the page down, like a phone screen; HID wheel is positive upwards.
    BluetoothHid?.sendMouse(0, 0, 0, Math.max(-127, Math.min(127, notches)));
  }, []);

  return {
    available: !!BluetoothHid,
    phase,
    hostName,
    bonded,
    error,
    start,
    stop,
    connect,
    refreshBonded,
    makeDiscoverable,
    move,
    click,
    scroll,
  };
}
