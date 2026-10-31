// Android KeyEvent codes for characters a TV keyboard field accepts as plain key presses.
const KEYS: Record<string, number> = {
  ' ': 62,
  '*': 17,
  '#': 18,
  ',': 55,
  '.': 56,
  '-': 69,
  '=': 70,
  '[': 71,
  ']': 72,
  '\\': 73,
  ';': 74,
  "'": 75,
  '/': 76,
  '@': 77,
  '+': 81,
};
for (let i = 0; i < 10; i++) KEYS[String(i)] = 7 + i; // KEYCODE_0..9
for (let i = 0; i < 26; i++) KEYS[String.fromCharCode(97 + i)] = 29 + i; // KEYCODE_A..Z

/**
 * Key codes that type `text` one key at a time, or null if it has characters that have no key
 * (Vietnamese letters with diacritics, emoji...). Key events carry no Shift state, so letters
 * are typed in lower case.
 */
export function textToKeyCodes(text: string): number[] | null {
  const codes: number[] = [];
  for (const ch of text.toLowerCase()) {
    const code = KEYS[ch];
    if (code === undefined) return null;
    codes.push(code);
  }
  return codes;
}
