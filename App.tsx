import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { TvDevice } from './src/core/types';
import { loadDevices, saveDevices } from './src/storage/devices';
import { DevicesScreen } from './src/ui/screens/DevicesScreen';
import { RemoteScreen } from './src/ui/screens/RemoteScreen';

export default function App() {
  const [devices, setDevices] = useState<TvDevice[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    loadDevices().then(setDevices);
  }, []);

  const update = useCallback((fn: (list: TvDevice[]) => TvDevice[]) => {
    setDevices((prev) => {
      const next = fn(prev ?? []);
      saveDevices(next).catch(() => {});
      return next;
    });
  }, []);

  const addDevice = useCallback(
    (device: TvDevice) => update((list) => [device, ...list.filter((d) => d.id !== device.id)]),
    [update],
  );

  const patchActive = useCallback(
    (patch: Partial<TvDevice>) =>
      update((list) =>
        list.map((d) =>
          d.id === activeId
            ? { ...d, ...patch, credentials: patch.credentials ? { ...d.credentials, ...patch.credentials } : d.credentials }
            : d,
        ),
      ),
    [update, activeId],
  );

  const active = devices?.find((d) => d.id === activeId);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {devices === null ? null : active ? (
        <RemoteScreen key={active.id} device={active} onBack={() => setActiveId(null)} onSaveDevice={patchActive} />
      ) : (
        <DevicesScreen
          devices={devices}
          onOpen={(d) => setActiveId(d.id)}
          onAdd={addDevice}
          onRemove={(id) => update((list) => list.filter((d) => d.id !== id))}
        />
      )}
    </SafeAreaProvider>
  );
}
