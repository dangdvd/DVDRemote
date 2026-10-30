import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DeviceKind, TvDevice } from '../../core/types';
import { isValidIPv4 } from '../../discovery/classify';
import { scanNetwork } from '../../discovery/scan';
import { BRAND_PRESETS, KIND_LABELS } from '../../drivers';
import { wakeOnLan } from '../../net/wol';
import { makeDeviceId } from '../../storage/devices';
import { colors } from '../theme';

interface Props {
  devices: TvDevice[];
  onOpen: (device: TvDevice) => void;
  onAdd: (device: TvDevice) => void;
  onRemove: (id: string) => void;
}

export function DevicesScreen({ devices, onOpen, onAdd, onRemove }: Props) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [found, setFound] = useState<TvDevice[]>([]);
  const [scanError, setScanError] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const stopRef = useRef(false);

  const startScan = async () => {
    if (scanning) {
      stopRef.current = true;
      return;
    }
    stopRef.current = false;
    setScanning(true);
    setScanError('');
    setFound([]);
    try {
      const result = await scanNetwork(
        (p) => {
          setFound(p.found);
          setProgress({ done: p.done, total: p.total });
        },
        () => stopRef.current,
      );
      if (!result.length && !stopRef.current) {
        setScanError('Không tìm thấy TV nào. Hãy chắc chắn TV đang bật và cùng mạng Wi-Fi, hoặc thêm thủ công bằng địa chỉ IP.');
      }
    } catch (err: any) {
      setScanError(err?.message ?? String(err));
    } finally {
      setScanning(false);
    }
  };

  const saved = new Set(devices.map((d) => d.host + d.kind));
  const newFound = found.filter((d) => !saved.has(d.host + d.kind));

  const confirmRemove = (d: TvDevice) =>
    Alert.alert(d.name, 'Bạn muốn làm gì với TV này?', [
      ...(d.mac
        ? [{ text: 'Bật TV (Wake-on-LAN)', onPress: () => wakeOnLan(d.mac!, d.host).catch(() => {}) }]
        : []),
      { text: 'Xoá', style: 'destructive' as const, onPress: () => onRemove(d.id) },
      { text: 'Đóng', style: 'cancel' as const },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.h1}>DVD Remote</Text>
            <Text style={styles.lead}>Điều khiển TV Samsung, LG, Sony, TCL, Xiaomi, Panasonic, Philips... qua Wi-Fi</Text>
            <Text style={styles.section}>TV của bạn</Text>
            {devices.length === 0 ? (
              <Text style={styles.empty}>Chưa có TV nào. Bấm “Tìm TV” để quét mạng Wi-Fi.</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <DeviceRow device={item} onPress={() => onOpen(item)} onLongPress={() => confirmRemove(item)} />
        )}
        ListFooterComponent={
          <View>
            <View style={styles.actions}>
              <Pressable style={[styles.action, styles.primary]} onPress={startScan}>
                {scanning ? <ActivityIndicator color={colors.text} style={{ marginRight: 8 }} /> : null}
                <Text style={styles.actionText}>
                  {scanning ? `Dừng quét (${progress.done}/${progress.total || '…'})` : 'Tìm TV'}
                </Text>
              </Pressable>
              <Pressable style={styles.action} onPress={() => setManualOpen(true)}>
                <Text style={styles.actionText}>Thêm bằng IP</Text>
              </Pressable>
            </View>
            {scanError ? <Text style={styles.error}>{scanError}</Text> : null}
            {newFound.length ? <Text style={styles.section}>Tìm thấy trên mạng</Text> : null}
            {newFound.map((d) => (
              <DeviceRow
                key={d.id}
                device={d}
                badge="Thêm"
                onPress={() => {
                  onAdd(d);
                  onOpen(d);
                }}
              />
            ))}
            <Text style={styles.tip}>
              Mẹo: nhấn giữ một TV để xoá hoặc bật TV từ chế độ chờ. Điện thoại và TV phải dùng chung mạng Wi-Fi.
            </Text>
          </View>
        }
      />
      <ManualAddModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onAdd={(d) => {
          setManualOpen(false);
          onAdd(d);
          onOpen(d);
        }}
      />
    </SafeAreaView>
  );
}

function DeviceRow({
  device,
  badge,
  onPress,
  onLongPress,
}: {
  device: TvDevice;
  badge?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>📺</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {device.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[device.brand, device.model, KIND_LABELS[device.kind], device.host].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {badge ? <Text style={styles.badge}>{badge}</Text> : <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

function ManualAddModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (d: TvDevice) => void;
}) {
  const [ip, setIp] = useState('');
  const [preset, setPreset] = useState(0);
  const [mac, setMac] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const host = ip.trim();
    if (!isValidIPv4(host)) return setError('Địa chỉ IP không hợp lệ (VD: 192.168.1.20)');
    const macClean = mac.trim();
    if (macClean && !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(macClean)) {
      return setError('Địa chỉ MAC không hợp lệ (VD: A1:B2:C3:D4:E5:F6)');
    }
    const p = BRAND_PRESETS[preset];
    const kind: DeviceKind = p.kind;
    setError('');
    setIp('');
    setMac('');
    onAdd({
      id: makeDeviceId(host, kind),
      host,
      kind,
      brand: p.brand,
      name: `TV ${p.brand}`,
      mac: macClean || undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeader}>
            <Text style={styles.h2}>Thêm TV bằng IP</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Đóng</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>Địa chỉ IP của TV</Text>
          <Text style={styles.help}>Xem trong Cài đặt → Mạng → Trạng thái mạng trên TV.</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.20"
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <Text style={styles.label}>Hãng TV</Text>
          <View style={styles.brands}>
            {BRAND_PRESETS.map((p, i) => (
              <Pressable key={p.brand} onPress={() => setPreset(i)} style={[styles.brand, preset === i && styles.brandActive]}>
                <Text style={styles.brandText}>{p.brand}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>
            {BRAND_PRESETS[preset].hint} — giao thức: {KIND_LABELS[BRAND_PRESETS[preset].kind]}
          </Text>
          <Text style={styles.label}>Địa chỉ MAC (tuỳ chọn)</Text>
          <Text style={styles.help}>Dùng để bật TV từ chế độ chờ bằng Wake-on-LAN.</Text>
          <TextInput
            style={styles.input}
            value={mac}
            onChangeText={setMac}
            placeholder="A1:B2:C3:D4:E5:F6"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.action, styles.primary, { marginTop: 20 }]} onPress={submit}>
            <Text style={styles.actionText}>Thêm và kết nối</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 8 },
  h2: { color: colors.text, fontSize: 22, fontWeight: '700' },
  lead: { color: colors.textDim, fontSize: 14, marginTop: 4 },
  section: { color: colors.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  empty: { color: colors.textDim, fontSize: 14, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.textDim, fontSize: 24 },
  badge: { color: colors.text, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  primary: { backgroundColor: colors.accent },
  actionText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginTop: 12, fontSize: 13 },
  tip: { color: colors.textDim, fontSize: 12, marginTop: 24, lineHeight: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  close: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  label: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 16 },
  help: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brands: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  brand: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  brandActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  brandText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
