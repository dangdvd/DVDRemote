import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  onMove: (dx: number, dy: number) => void;
  onClick: () => void;
  onScroll?: (dy: number) => void;
}

const SENSITIVITY = 1.6;
const TAP_SLOP = 6;

/** Drag to move the TV cursor, tap to click, two-finger drag to scroll. */
export function Touchpad({ onMove, onClick, onScroll }: Props) {
  const last = useRef({ x: 0, y: 0, moved: 0 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          last.current = { x: 0, y: 0, moved: 0 };
        },
        onPanResponderMove: (evt, g) => {
          const dx = g.dx - last.current.x;
          const dy = g.dy - last.current.y;
          last.current.x = g.dx;
          last.current.y = g.dy;
          last.current.moved += Math.abs(dx) + Math.abs(dy);
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
          if (evt.nativeEvent.touches.length >= 2 && onScroll) onScroll(dy);
          else onMove(dx * SENSITIVITY, dy * SENSITIVITY);
        },
        onPanResponderRelease: () => {
          if (last.current.moved < TAP_SLOP) onClick();
        },
      }),
    [onMove, onClick, onScroll],
  );

  return (
    <View style={styles.pad} {...responder.panHandlers}>
      <Text style={styles.hint}>Kéo để di chuyển con trỏ · Chạm để chọn{onScroll ? ' · 2 ngón để cuộn' : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: 260,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 12,
  },
  hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
});
