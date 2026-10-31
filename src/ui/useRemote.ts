import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { PairingCancelledError, TvDevice, TvDriver } from '../core/types';
import { createDriver } from '../drivers';

export type RemoteStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface PinRequest {
  message: string;
  resolve: (code: string | null) => void;
}

/** Owns the driver for one TV: connecting, pairing prompts, reconnecting and sending. */
export function useRemote(device: TvDevice, onSaveDevice: (patch: Partial<TvDevice>) => void) {
  const [status, setStatus] = useState<RemoteStatus>('connecting');
  const [message, setMessage] = useState('');
  const [pinRequest, setPinRequest] = useState<PinRequest | null>(null);
  const driverRef = useRef<TvDriver | null>(null);
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const saveRef = useRef(onSaveDevice);
  saveRef.current = onSaveDevice;
  const attempt = useRef(0);
  const pendingPin = useRef<((code: string | null) => void) | null>(null);

  const connect = useCallback(async () => {
    const run = ++attempt.current;
    driverRef.current?.disconnect();
    const driver = createDriver(deviceRef.current);
    driverRef.current = driver;
    setStatus('connecting');
    setMessage('Đang kết nối...');
    driver.onDisconnect = (err) => {
      if (attempt.current !== run) return;
      setStatus('disconnected');
      setMessage(err?.message ? `Mất kết nối: ${err.message}` : 'Mất kết nối với TV');
    };
    try {
      await driver.connect({
        notify: (m) => attempt.current === run && setMessage(m),
        requestPin: (m) =>
          new Promise((resolve) => {
            pendingPin.current = resolve;
            setPinRequest({ message: m, resolve });
          }),
        saveDevice: (patch) => saveRef.current(patch),
      });
      if (attempt.current !== run) return driver.disconnect();
      setStatus('connected');
      setMessage('');
      saveRef.current({ lastConnected: Date.now() });
    } catch (err: any) {
      if (attempt.current !== run) return;
      driver.disconnect();
      setStatus('error');
      setMessage(
        err instanceof PairingCancelledError
          ? 'Đã huỷ ghép nối'
          : `Không kết nối được: ${err?.message ?? err}. Kiểm tra TV đã bật và cùng mạng Wi-Fi.`,
      );
    } finally {
      setPinRequest(null);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      attempt.current++;
      // Leaving mid-pairing: cancel it so the pairing socket is closed.
      pendingPin.current?.(null);
      driverRef.current?.disconnect();
      driverRef.current = null;
    };
  }, [connect, device.id]);

  // Coming back to the app after the phone slept usually means the socket died.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && status === 'disconnected') connect();
    });
    return () => sub.remove();
  }, [status, connect]);

  /** Run a driver action; report errors instead of throwing. */
  const run = useCallback(
    async (action: (driver: TvDriver) => Promise<void> | undefined) => {
      const driver = driverRef.current;
      if (!driver || status !== 'connected') {
        if (status === 'disconnected' || status === 'error') connect();
        return;
      }
      try {
        await action(driver);
      } catch (err: any) {
        setMessage(err?.message ?? String(err));
      }
    },
    [status, connect],
  );

  const answerPin = useCallback(
    (code: string | null) => {
      pinRequest?.resolve(code);
      pendingPin.current = null;
      setPinRequest(null);
    },
    [pinRequest],
  );

  return { status, message, pinRequest, answerPin, connect, run, driver: driverRef.current };
}
