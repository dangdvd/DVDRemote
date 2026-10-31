import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  autoCapitalize?: 'none' | 'characters';
  maxLength?: number;
  multiline?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Cross-platform text prompt (Alert.prompt only exists on iOS). */
export function PromptModal(props: Props) {
  const [value, setValue] = useState('');
  useEffect(() => {
    if (props.visible) setValue('');
  }, [props.visible, props.message]);

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{props.title}</Text>
          {props.message ? <Text style={styles.message}>{props.message}</Text> : null}
          <TextInput
            style={[styles.input, props.autoCapitalize === 'characters' && styles.code]}
            value={value}
            onChangeText={setValue}
            placeholder={props.placeholder}
            placeholderTextColor={colors.textDim}
            autoFocus
            autoCorrect={false}
            autoCapitalize={props.autoCapitalize ?? 'none'}
            maxLength={props.maxLength}
            multiline={props.multiline}
            onSubmitEditing={() => !props.multiline && props.onSubmit(value)}
          />
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={props.onCancel}>
              <Text style={styles.btnText}>Huỷ</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.ok]} onPress={() => props.onSubmit(value)}>
              <Text style={styles.btnText}>{props.confirmLabel ?? 'Đồng ý'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  message: { color: colors.textDim, fontSize: 14, marginBottom: 12 },
  input: {
    backgroundColor: colors.bg,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 12 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  cancel: { backgroundColor: colors.surfaceAlt },
  ok: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600', fontSize: 15 },
});
