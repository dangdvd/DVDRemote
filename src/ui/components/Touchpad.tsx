import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { SwipeDirection, SwipeTracker } from '../swipe';
import { colors } from '../theme';

/** pointer: drives the TV's mouse cursor. swipe: turns swipes into arrow keys and taps into OK. */
export type TouchpadMode = 'pointer' | 'swipe';

interface Props {
  mode: TouchpadMode;
  onTap: () => void;
  onMove?: (dx: number, dy: number) => void;
  onScroll?: (dy: number) => void;
  onSwipe?: (direction: SwipeDirection) => void;
  /** True while a finger is on the pad, so the parent can stop its ScrollView from scrolling. */
  onActiveChange?: (active: boolean) => void;
}

const SENSITIVITY = 1.6;
const TAP_SLOP = 6;
const ARROWS: Record<SwipeDirection, string> = { UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶' };

export function Touchpad({ mode, onTap, onMove, onScroll, onSwipe, onActiveChange }: Props) {
  const last = useRef({ x: 0, y: 0, moved: 0 });
  const swipe = useRef(new SwipeTracker());
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read through a ref so the responder, created once, always calls the latest handlers.
  const handlers = useRef({ mode, onTap, onMove, onScroll, onSwipe, onActiveChange });
  handlers.current = { mode, onTap, onMove, onScroll, onSwipe, onActiveChange };

  const showFlash = (text: string) => {
    setFlash(text);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 250);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Keep vertical drags: otherwise the surrounding ScrollView takes them over.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          last.current = { x: 0, y: 0, moved: 0 };
          swipe.current.reset();
          handlers.current.onActiveChange?.(true);
        },
        onPanResponderMove: (evt, g) => {
          const h = handlers.current;
          const dx = g.dx - last.current.x;
          const dy = g.dy - last.current.y;
          last.current.x = g.dx;
          last.current.y = g.dy;
          last.current.moved += Math.abs(dx) + Math.abs(dy);
          if (h.mode === 'swipe') {
            for (const direction of swipe.current.move(dx, dy)) {
              Haptics.selectionAsync().catch(() => {});
              showFlash(ARROWS[direction]);
              h.onSwipe?.(direction);
            }
            return;
          }
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
          if (evt.nativeEvent.touches.length >= 2 && h.onScroll) h.onScroll(dy);
          else h.onMove?.(dx * SENSITIVITY, dy * SENSITIVITY);
        },
        onPanResponderTerminate: () => handlers.current.onActiveChange?.(false),
        onPanResponderRelease: () => {
          handlers.current.onActiveChange?.(false);
          if (last.current.moved < TAP_SLOP) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            showFlash('OK');
            handlers.current.onTap();
          }
        },
      }),
    [],
  );

  const hint =
    mode === 'swipe'
      ? 'Vuốt để di chuyển vùng chọn · Chạm để chọn (OK)'
      : `Kéo để di chuyển con trỏ · Chạm để bấm${onScroll ? ' · 2 ngón để cuộn' : ''}`;

  return (
    <View style={styles.pad} {...responder.panHandlers}>
      <View style={styles.center} pointerEvents="none">
        {flash ? <Text style={styles.flash}>{flash}</Text> : null}
      </View>
      <Text style={styles.hint}>{hint}</Text>
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
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  flash: { color: colors.textDim, fontSize: 40, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
});
