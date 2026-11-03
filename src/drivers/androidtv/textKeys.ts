// Android KeyEvent codes for typing text the way a hardware keyboard does (US layout).
export const KEYCODE_SHIFT_LEFT = 59;

export interface KeyPress {
  code: number;
  /** Hold Shift around the key (upper case letters and shifted symbols). */
  shift: boolean;
}

const KEYS: Record<string, number> = {
  ' ': 62,
  '`': 68,
  '-': 69,
  '=': 70,
  '[': 71,
  ']': 72,
  '\\': 73,
  ';': 74,
  "'": 75,
  '/': 76,
  ',': 55,
  '.': 56,
  // Keys of their own on Android, no Shift needed.
  '*': 17,
  '#': 18,
  '@': 77,
  '+': 81,
};
for (let i = 0; i < 10; i++) KEYS[String(i)] = 7 + i; // KEYCODE_0..9
for (let i = 0; i < 26; i++) KEYS[String.fromCharCode(97 + i)] = 29 + i; // KEYCODE_A..Z

/** Characters typed as Shift + another key on a US keyboard. */
const SHIFTED: Record<string, string> = {
  '!': '1',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '(': '9',
  ')': '0',
  _: '-',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
  '{': '[',
  '}': ']',
  '|': '\\',
  '~': '`',
};

/**
 * Key presses that type `text`, or null if it has characters no key produces (Vietnamese
 * letters with diacritics, emoji...).
 */
export function textToKeyPresses(text: string): KeyPress[] | null {
  const presses: KeyPress[] = [];
  for (const ch of text) {
    const lower = ch.toLowerCase();
    if (KEYS[ch] !== undefined) {
      presses.push({ code: KEYS[ch], shift: false });
    } else if (lower !== ch && /[a-z]/.test(lower)) {
      presses.push({ code: KEYS[lower], shift: true });
    } else if (SHIFTED[ch] !== undefined) {
      presses.push({ code: KEYS[SHIFTED[ch]], shift: true });
    } else {
      return null;
    }
  }
  return presses;
}
