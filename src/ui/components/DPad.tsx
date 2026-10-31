import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { RemoteKey } from '../../core/types';
import { colors } from '../theme';
import { RemoteButton } from './RemoteButton';

export function DPad({ onKey }: { onKey: (key: RemoteKey) => void }) {
  return (
    <View style={styles.pad}>
      <RemoteButton label="▲" accessibilityLabel="Lên" repeat style={[styles.arrow, styles.up]} onPress={() => onKey('UP')} />
      <RemoteButton label="◀" accessibilityLabel="Trái" repeat style={[styles.arrow, styles.left]} onPress={() => onKey('LEFT')} />
      <RemoteButton label="OK" style={styles.ok} onPress={() => onKey('OK')} />
      <RemoteButton label="▶" accessibilityLabel="Phải" repeat style={[styles.arrow, styles.right]} onPress={() => onKey('RIGHT')} />
      <RemoteButton label="▼" accessibilityLabel="Xuống" repeat style={[styles.arrow, styles.down]} onPress={() => onKey('DOWN')} />
    </View>
  );
}

const SIZE = 220;
const styles = StyleSheet.create({
  pad: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'center',
  },
  arrow: { position: 'absolute', backgroundColor: 'transparent', width: 64, height: 64, borderRadius: 32 },
  up: { top: 6, left: SIZE / 2 - 32 },
  down: { bottom: 6, left: SIZE / 2 - 32 },
  left: { left: 6, top: SIZE / 2 - 32 },
  right: { right: 6, top: SIZE / 2 - 32 },
  ok: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    left: SIZE / 2 - 44,
    top: SIZE / 2 - 44,
    backgroundColor: colors.accent,
  },
});
