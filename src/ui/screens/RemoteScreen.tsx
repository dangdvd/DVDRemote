import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isBluetoothMouseSupported } from '../../bluetooth/native';
import { useBluetoothMouse } from '../../bluetooth/useBluetoothMouse';
import type { AppId, RemoteKey, TvDevice } from '../../core/types';
import { KIND_LABELS } from '../../drivers';
import { wakeOnLan } from '../../net/wol';
import { BluetoothMousePanel } from '../components/BluetoothMousePanel';
import { DPad } from '../components/DPad';
import { PromptModal } from '../components/PromptModal';
import { RemoteButton } from '../components/RemoteButton';
import { Touchpad, TouchpadMode } from '../components/Touchpad';
import { colors } from '../theme';
import { useRemote } from '../useRemote';

const APP_LABELS: Record<AppId, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#FF0033' },
  netflix: { label: 'Netflix', color: '#E50914' },
  spotify: { label: 'Spotify', color: '#1DB954' },
  prime: { label: 'Prime', color: '#00A8E1' },
  disney: { label: 'Disney+', color: '#113CCF' },
};

type Tab = 'remote' | 'numbers' | 'touchpad';
/** bluetooth: the phone acts as a Bluetooth mouse (Android phones only). */
type PadMode = TouchpadMode | 'bluetooth';

interface Props {
  device: TvDevice;
  onBack: () => void;
  onSaveDevice: (patch: Partial<TvDevice>) => void;
}

export function RemoteScreen({ device, onBack, onSaveDevice }: Props) {
  const { status, message, pinRequest, answerPin, connect, run, driver } = useRemote(device, onSaveDevice);
  const [tab, setTab] = useState<Tab>('remote');
  const [typing, setTyping] = useState(false);
  const [info, setInfo] = useState('');
  const [padMode, setPadMode] = useState<PadMode | null>(null);
  const bluetoothSupported = useMemo(isBluetoothMouseSupported, []);
  const btMouse = useBluetoothMouse(device, onSaveDevice);
  const [padActive, setPadActive] = useState(false);

  const key = (k: RemoteKey) => run((d) => d.sendKey(k));
  const caps = driver?.capabilities;
  // TVs with a cursor over Wi-Fi (LG, Samsung) offer it; the others get swipe mode, plus a real
  // cursor through Bluetooth when the phone can act as a Bluetooth mouse.
  const padModes: [PadMode, string][] = caps?.pointer
    ? [
        ['pointer', 'Con trỏ chuột'],
        ['swipe', 'Vuốt'],
      ]
    : [['swipe', 'Vuốt'], ...(bluetoothSupported ? ([['bluetooth', 'Chuột Bluetooth']] as [PadMode, string][]) : [])];
  const activeMode: PadMode = padModes.some(([id]) => id === padMode) ? padMode! : padModes[0][0];
  const touchpadMode: TouchpadMode = activeMode === 'swipe' ? 'swipe' : 'pointer';
  const usesBluetooth = activeMode === 'bluetooth';

  const power = async () => {
    if (status === 'connected') return key('POWER');
    if (!device.mac) return connect();
    try {
      await wakeOnLan(device.mac, device.host);
      setInfo('Đã gửi lệnh bật TV (Wake-on-LAN), đang kết nối lại...');
      setTimeout(connect, 5000);
    } catch (err: any) {
      setInfo(`Không gửi được lệnh bật TV: ${err?.message ?? err}`);
    }
  };

  const statusColor =
    status === 'connected' ? colors.success : status === 'connecting' ? colors.warning : colors.danger;
  const statusText =
    status === 'connected' ? 'Đã kết nối' : status === 'connecting' ? 'Đang kết nối' : 'Chưa kết nối';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Quay lại">
          <Text style={styles.back}>‹ TV</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {device.name}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.subtitle}>
              {statusText} · {KIND_LABELS[device.kind]}
            </Text>
          </View>
        </View>
        <RemoteButton label="⏻" accessibilityLabel="Nguồn" small style={styles.power} onPress={power} />
      </View>

      {status !== 'connected' || message || info ? (
        <View style={styles.banner}>
          {status === 'connecting' ? <ActivityIndicator color={colors.text} style={{ marginRight: 8 }} /> : null}
          <Text style={styles.bannerText}>{message || info}</Text>
          {status === 'error' || status === 'disconnected' ? (
            <Pressable onPress={connect} style={styles.retry}>
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.tabs}>
        {(
          [
            ['remote', 'Điều khiển'],
            ['numbers', 'Số & Màu'],
            ['touchpad', 'Touchpad'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabActive]}>
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!padActive}>
        <View style={styles.row}>
          <RemoteButton label="Nguồn vào" small onPress={() => key('SOURCE')} />
          <RemoteButton label="Cài đặt" small onPress={() => key('SETTINGS')} />
          <RemoteButton label="Menu" small onPress={() => key('MENU')} />
          {caps?.text ? <RemoteButton label="⌨" accessibilityLabel="Bàn phím" small onPress={() => setTyping(true)} /> : null}
        </View>

        {tab === 'remote' ? <DPad onKey={key} /> : null}

        {tab === 'numbers' ? (
          <View style={styles.numpad}>
            {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''] as const).map((n, i) =>
              n ? (
                <RemoteButton key={i} label={n} style={styles.num} onPress={() => key(`NUM_${n}` as RemoteKey)} />
              ) : (
                <View key={i} style={styles.num} />
              ),
            )}
            <View style={styles.colorRow}>
              <RemoteButton label=" " accessibilityLabel="Đỏ" small style={[styles.color, { backgroundColor: colors.red }]} onPress={() => key('RED')} />
              <RemoteButton label=" " accessibilityLabel="Xanh lá" small style={[styles.color, { backgroundColor: colors.green }]} onPress={() => key('GREEN')} />
              <RemoteButton label=" " accessibilityLabel="Vàng" small style={[styles.color, { backgroundColor: colors.yellow }]} onPress={() => key('YELLOW')} />
              <RemoteButton label=" " accessibilityLabel="Xanh dương" small style={[styles.color, { backgroundColor: colors.blue }]} onPress={() => key('BLUE')} />
            </View>
            <View style={styles.row}>
              <RemoteButton label="Info" small onPress={() => key('INFO')} />
              <RemoteButton label="Guide" small onPress={() => key('GUIDE')} />
              <RemoteButton label="Exit" small onPress={() => key('EXIT')} />
            </View>
          </View>
        ) : null}

        {tab === 'touchpad' ? (
          <View style={styles.touchpadArea}>
            {padModes.length > 1 ? (
              <View style={styles.modeSwitch}>
                {padModes.map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setPadMode(id)}
                    style={[styles.modeButton, activeMode === id && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, activeMode === id && styles.tabTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {!caps?.pointer && activeMode === 'swipe' ? (
              <Text style={styles.note}>
                TV này không có con trỏ chuột qua Wi-Fi: vuốt trên touchpad để di chuyển vùng chọn như phím mũi tên.
                {bluetoothSupported
                  ? ' Muốn có con trỏ thật, chọn “Chuột Bluetooth”.'
                  : Platform.OS === 'ios'
                    ? ' (Chế độ chuột Bluetooth chỉ có trên điện thoại Android.)'
                    : ''}
              </Text>
            ) : null}
            {usesBluetooth ? (
              <BluetoothMousePanel mouse={btMouse} rememberedAddress={device.credentials?.btAddress} />
            ) : null}
            <Touchpad
              mode={touchpadMode}
              onTap={() =>
                usesBluetooth ? btMouse.click() : touchpadMode === 'pointer' ? run((d) => d.click?.()) : key('OK')
              }
              onMove={(dx, dy) => (usesBluetooth ? btMouse.move(dx, dy) : run((d) => d.movePointer?.(dx, dy)))}
              onScroll={
                usesBluetooth ? btMouse.scroll : driver?.scroll ? (dy) => run((d) => d.scroll?.(dy)) : undefined
              }
              onSwipe={key}
              onActiveChange={setPadActive}
            />
          </View>
        ) : null}

        <View style={styles.row}>
          <RemoteButton label="↩" accessibilityLabel="Quay lại" onPress={() => key('BACK')} />
          <RemoteButton label="⌂" accessibilityLabel="Trang chủ" onPress={() => key('HOME')} />
          <RemoteButton label="🔇" accessibilityLabel="Tắt tiếng" onPress={() => key('MUTE')} />
        </View>

        <View style={styles.rockers}>
          <View style={styles.rocker}>
            <RemoteButton label="+" accessibilityLabel="Tăng âm lượng" repeat style={styles.rockerBtn} onPress={() => key('VOL_UP')} />
            <Text style={styles.rockerLabel}>VOL</Text>
            <RemoteButton label="−" accessibilityLabel="Giảm âm lượng" repeat style={styles.rockerBtn} onPress={() => key('VOL_DOWN')} />
          </View>
          <View style={styles.rocker}>
            <RemoteButton label="▲" accessibilityLabel="Kênh tiếp" style={styles.rockerBtn} onPress={() => key('CH_UP')} />
            <Text style={styles.rockerLabel}>CH</Text>
            <RemoteButton label="▼" accessibilityLabel="Kênh trước" style={styles.rockerBtn} onPress={() => key('CH_DOWN')} />
          </View>
        </View>

        <View style={styles.row}>
          <RemoteButton label="⏮" accessibilityLabel="Trước" small onPress={() => key('PREV')} />
          <RemoteButton label="⏪" accessibilityLabel="Tua lại" small onPress={() => key('REWIND')} />
          <RemoteButton label="⏯" accessibilityLabel="Phát / Tạm dừng" small onPress={() => key('PLAY_PAUSE')} />
          <RemoteButton label="⏩" accessibilityLabel="Tua nhanh" small onPress={() => key('FAST_FORWARD')} />
          <RemoteButton label="⏭" accessibilityLabel="Tiếp" small onPress={() => key('NEXT')} />
        </View>

        {caps?.apps.length ? (
          <View style={styles.apps}>
            {caps.apps.map((app) => (
              <Pressable
                key={app}
                style={[styles.app, { backgroundColor: APP_LABELS[app].color }]}
                onPress={() => run((d) => d.launchApp?.(app))}
              >
                <Text style={styles.appText}>{APP_LABELS[app].label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <PromptModal
        visible={!!pinRequest}
        title="Ghép nối với TV"
        message={pinRequest?.message}
        placeholder="VD: 4A1B2C"
        autoCapitalize="characters"
        maxLength={6}
        confirmLabel="Ghép nối"
        onSubmit={(code) => answerPin(code)}
        onCancel={() => answerPin(null)}
      />
      <PromptModal
        visible={typing}
        title="Gửi văn bản tới TV"
        message="Hãy chọn ô nhập liệu (ô tìm kiếm...) trên TV trước khi gửi."
        placeholder="Nhập nội dung..."
        confirmLabel="Gửi"
        onSubmit={(text) => {
          setTyping(false);
          if (text) run((d) => d.sendText?.(text));
        }}
        onCancel={() => setTyping(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  back: { color: colors.accent, fontSize: 18, fontWeight: '600' },
  headerCenter: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  subtitle: { color: colors.textDim, fontSize: 12 },
  power: { backgroundColor: colors.danger },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: { color: colors.text, flex: 1, fontSize: 13 },
  retry: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.accent, borderRadius: 8 },
  retryText: { color: colors.text, fontWeight: '600' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surfaceAlt },
  tabText: { color: colors.textDim, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: colors.text },
  content: { padding: 16, gap: 18 },
  touchpadArea: { gap: 10 },
  modeSwitch: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4 },
  modeButton: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  note: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', flexWrap: 'wrap', gap: 8 },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  num: { width: 72, height: 56 },
  colorRow: { flexDirection: 'row', gap: 12, width: '100%', justifyContent: 'center' },
  color: { width: 56 },
  rockers: { flexDirection: 'row', justifyContent: 'space-evenly' },
  rocker: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 32, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  rockerBtn: { backgroundColor: 'transparent', width: 64 },
  rockerLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginVertical: 4 },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  app: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: 92, alignItems: 'center' },
  appText: { color: '#fff', fontWeight: '700' },
});
