import type { ConnectContext, TvDevice } from '../src/core/types';
import { createDriver } from '../src/drivers';
import { FakeAndroidTv, FakeLgTv, FakeSamsungTv } from './fakeTvs';

jest.setTimeout(180000);

const waitFor = async (check: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
};

function context(device: TvDevice, pin?: () => string) {
  const notes: string[] = [];
  let pinRequests = 0;
  const ctx: ConnectContext = {
    notify: (m) => notes.push(m),
    requestPin: async () => {
      pinRequests++;
      return pin ? pin() : null;
    },
    saveDevice: (patch) => Object.assign(device, patch, { credentials: { ...device.credentials, ...patch.credentials } }),
  };
  return { ctx, notes, pinRequests: () => pinRequests };
}

describe('Android TV driver against a fake Sony Bravia', () => {
  const tv = new FakeAndroidTv();
  beforeAll(() => tv.start());
  afterAll(() => tv.stop());

  it('pairs with the on-screen code, then sends keys, text and app links', async () => {
    const device: TvDevice = { id: 'a', name: 'Sony', host: '127.0.0.1', kind: 'androidtv' };
    const { ctx, pinRequests } = context(device, () => tv.displayedCode);
    const driver = createDriver(device);
    await driver.connect(ctx);
    expect(pinRequests()).toBe(1);
    expect(device.credentials?.paired).toBe('1');

    await driver.sendKey('POWER');
    await driver.sendKey('VOL_UP');
    await driver.launchApp!('youtube');
    // A search field gains focus on the TV, which reports its IME counters.
    tv.openTextField(3, 7);
    await new Promise((r) => setTimeout(r, 100));
    await driver.sendText!('xin chào');
    await waitFor(() => tv.keys.length === 2 && tv.appLinks.length === 1 && tv.texts.length === 1);
    expect(tv.keys).toEqual([26, 24]);
    expect(tv.appLinks).toEqual(['https://www.youtube.com']);
    expect(tv.texts).toEqual(['xin chào']);
    expect(tv.textCounters).toEqual([[3, 7]]);
    driver.disconnect();

    // Second connection reuses the pairing: no code needed.
    const again = createDriver(device);
    const second = context(device);
    await again.connect(second.ctx);
    expect(second.pinRequests()).toBe(0);
    await again.sendKey('HOME');
    await waitFor(() => tv.keys.length === 3);
    expect(tv.keys[2]).toBe(3);
    again.disconnect();
  });

  it('types text as key presses when the TV has not reported a text field', async () => {
    // E.g. the TV keyboard was already open before the phone connected.
    const device: TvDevice = { id: 'a', name: 'Sony', host: '127.0.0.1', kind: 'androidtv', credentials: { paired: '1' } };
    const driver = createDriver(device);
    await driver.connect(context(device).ctx);
    const before = tv.keys.length;
    await driver.sendText!('Ab 1');
    await waitFor(() => tv.keys.length === before + 4);
    expect(tv.keys.slice(before)).toEqual([29, 30, 62, 8]); // a b space 1
    // Diacritics have no keys: fall back to the IME edit as the best effort.
    await driver.sendText!('Việt');
    await waitFor(() => tv.texts.includes('Việt'));
    driver.disconnect();
  });

  it('explains when a TV without the IME feature gets text with diacritics', async () => {
    tv.features = 622 & ~4;
    try {
      const device: TvDevice = { id: 'a', name: 'TCL', host: '127.0.0.1', kind: 'androidtv', credentials: { paired: '1' } };
      const driver = createDriver(device);
      await driver.connect(context(device).ctx);
      await expect(driver.sendText!('Việt')).rejects.toThrow('không dấu');
      const before = tv.keys.length;
      await driver.sendText!('ok');
      await waitFor(() => tv.keys.length === before + 2);
      expect(tv.keys.slice(before)).toEqual([43, 39]);
      driver.disconnect();
    } finally {
      tv.features = 622;
    }
  });

  it('rejects a cancelled pairing', async () => {
    const device: TvDevice = { id: 'b', name: 'TCL', host: '127.0.0.1', kind: 'androidtv' };
    // Same phone identity is already paired, so force the pairing path by using a fresh TV state.
    tv.paired.clear();
    const { ctx } = context(device); // requestPin resolves null
    await expect(createDriver(device).connect(ctx)).rejects.toThrow('Đã huỷ ghép nối');
  });
});

describe('LG webOS driver against a fake TV on wss:3001', () => {
  const tv = new FakeLgTv();
  beforeAll(() => tv.start());
  afterAll(() => tv.stop());

  it('registers, stores the client key and MAC, and sends buttons over the pointer socket', async () => {
    const device: TvDevice = { id: 'lg', name: 'LG', host: '127.0.0.1', kind: 'webos' };
    const { ctx, notes } = context(device);
    const driver = createDriver(device);
    await driver.connect(ctx);
    expect(notes.join(' ')).toContain('Chấp nhận');
    expect(device.credentials?.clientKey).toBe('KEY123');
    expect(device.mac).toBe('aa:bb:cc:dd:ee:ff');
    // Text input and mouse must be asked for in the unsigned list too, not only the signed one.
    expect(tv.lastRegistration.manifest.permissions).toEqual(
      expect.arrayContaining(['CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD']),
    );
    await driver.sendText!('Tiếng Việt');
    await waitFor(() => tv.calls.includes('ssap://com.webos.service.ime/insertText'));

    await driver.sendKey('UP');
    await driver.sendKey('OK');
    await driver.sendKey('POWER');
    await driver.launchApp!('netflix');
    await waitFor(() => tv.buttons.length === 2 && tv.calls.includes('ssap://system.launcher/launch'));
    expect(tv.buttons).toEqual(['UP', 'ENTER']);
    expect(tv.calls).toContain('ssap://system/turnOff');
    driver.disconnect();
  });
});

describe('Samsung Tizen driver against a fake 2017 TV on ws:8001', () => {
  const tv = new FakeSamsungTv();
  beforeAll(() => tv.start());
  afterAll(() => tv.stop());

  it('falls back to port 8001, saves the token and sends keys/text', async () => {
    const device: TvDevice = { id: 'ss', name: 'Samsung', host: '127.0.0.1', kind: 'tizen' };
    const { ctx } = context(device);
    const driver = createDriver(device);
    await driver.connect(ctx);
    expect(device.credentials?.token).toBe('55667788');

    await driver.sendKey('VOL_UP');
    await driver.sendText!('Tiếng Việt');
    await driver.movePointer!(12.4, -7.6);
    await waitFor(() => tv.messages.length === 5);
    expect(tv.messages[0].params.DataOfCmd).toBe('KEY_VOLUP');
    // Some models ignore text until this broadcast was sent in the keyboard session.
    expect(tv.messages[1]).toEqual({ method: 'ms.channel.emit', params: { event: 'custom.remote.textReceived', to: 'broadcast' } });
    expect(Buffer.from(tv.messages[2].params.Cmd, 'base64').toString('utf8')).toBe('Tiếng Việt');
    expect(tv.messages[3].params).toEqual({ TypeOfRemote: 'SendInputEnd' });
    // Relative move; Time is the move duration in ms, not a timestamp.
    expect(tv.messages[4].params).toEqual({
      Cmd: 'Move',
      Position: { x: 12, y: -8, Time: '0' },
      TypeOfRemote: 'ProcessMouseDevice',
    });

    // Same keyboard session: no second announcement. A new session (imeStart) announces again.
    await driver.sendText!('abc');
    await waitFor(() => tv.messages.length === 7);
    expect(tv.messages[5].params.TypeOfRemote).toBe('SendInputString');
    tv.emit('ms.remote.imeStart');
    await new Promise((r) => setTimeout(r, 100));
    await driver.sendText!('xyz');
    await waitFor(() => tv.messages.length === 10);
    expect(tv.messages[7].params.event).toBe('custom.remote.textReceived');
    driver.disconnect();
  });
});
