import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { useBluetoothMouse } from '../../bluetooth/useBluetoothMouse';
import { colors } from '../theme';

type BluetoothMouse = ReturnType<typeof useBluetoothMouse>;

/** Status, pairing steps and paired TVs for the phone's Bluetooth mouse mode. */
export function BluetoothMousePanel({ mouse, rememberedAddress }: { mouse: BluetoothMouse; rememberedAddress?: string }) {
  const { phase, hostName, bonded, error } = mouse;

  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        <View
          style={[
            styles.dot,
            { backgroundColor: phase === 'connected' ? colors.success : phase === 'off' ? colors.textDim : colors.warning },
          ]}
        />
        <Text style={styles.status}>
          {phase === 'connected'
            ? `Đang là chuột của ${hostName ?? 'TV'}`
            : phase === 'ready'
              ? 'Chuột Bluetooth đã bật, đang chờ TV kết nối'
              : phase === 'starting'
                ? 'Đang bật chuột Bluetooth...'
                : 'Chuột Bluetooth đang tắt'}
        </Text>
        {phase === 'starting' ? <ActivityIndicator color={colors.text} /> : null}
      </View>

      {phase === 'off' ? (
        <Pressable style={[styles.button, styles.primary]} onPress={mouse.start}>
          <Text style={styles.buttonText}>Bật chuột Bluetooth</Text>
        </Pressable>
      ) : null}

      {phase === 'ready' ? (
        <>
          <Text style={styles.steps}>
            Ghép đôi lần đầu:{'\n'}
            1. Bấm “Cho TV tìm thấy điện thoại” và chọn Cho phép.{'\n'}
            2. Trên TV: Cài đặt → Điều khiển từ xa & phụ kiện → Thêm phụ kiện, chọn tên điện thoại này.{'\n'}
            3. Xác nhận mã ghép đôi trên cả TV và điện thoại.
          </Text>
          <Pressable style={[styles.button, styles.primary]} onPress={mouse.makeDiscoverable}>
            <Text style={styles.buttonText}>Cho TV tìm thấy điện thoại</Text>
          </Pressable>
          {bonded.length ? <Text style={styles.label}>Đã ghép đôi – chạm để kết nối:</Text> : null}
          {[...bonded]
            .sort((a, b) => Number(b.address === rememberedAddress) - Number(a.address === rememberedAddress))
            .map((d) => (
              <Pressable key={d.address} style={styles.device} onPress={() => mouse.connect(d.address)}>
                <Text style={styles.deviceName}>{d.name || d.address}</Text>
                {d.address === rememberedAddress ? <Text style={styles.badge}>TV này</Text> : null}
              </Pressable>
            ))}
          <Pressable style={styles.link} onPress={mouse.refreshBonded}>
            <Text style={styles.linkText}>Làm mới danh sách</Text>
          </Pressable>
        </>
      ) : null}

      {phase === 'connected' ? (
        <View style={styles.row}>
          <Pressable style={[styles.button, styles.flex]} onPress={() => mouse.click(2)}>
            <Text style={styles.buttonText}>Chuột phải</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.flex]} onPress={mouse.stop}>
            <Text style={styles.buttonText}>Tắt chuột</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  steps: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  button: { backgroundColor: colors.surfaceAlt, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deviceName: { color: colors.text, fontSize: 14 },
  badge: { color: colors.success, fontSize: 12, fontWeight: '700' },
  link: { alignSelf: 'center', padding: 4 },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12 },
});
