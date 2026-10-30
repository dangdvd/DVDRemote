import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  /** Repeat while held (volume, arrows). */
  repeat?: boolean;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 130;

export function RemoteButton({ label, onPress, repeat, style, textColor, small, disabled, accessibilityLabel }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const fire = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const start = () => {
    fire();
    if (!repeat) return;
    const loop = (delay: number) => {
      timer.current = setTimeout(() => {
        fire();
        loop(REPEAT_INTERVAL_MS);
      }, delay);
    };
    loop(REPEAT_DELAY_MS);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPressIn={start}
      onPressOut={stop}
      style={({ pressed }) => [
        styles.button,
        small && styles.small,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, small && styles.smallLabel, textColor ? { color: textColor } : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 56,
    height: 52,
    paddingHorizontal: 12,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minWidth: 44, height: 40, borderRadius: 20 },
  pressed: { backgroundColor: colors.border, transform: [{ scale: 0.95 }] },
  disabled: { opacity: 0.4 },
  label: { color: colors.text, fontSize: 18, fontWeight: '600' },
  smallLabel: { fontSize: 14 },
});
