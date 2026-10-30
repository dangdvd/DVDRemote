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
    await driver.sendText!('xin chào');
    await waitFor(() => tv.keys.length === 2 && tv.appLinks.length === 1 && tv.texts.length === 1);
    expect(tv.keys).toEqual([26, 24]);
    expect(tv.appLinks).toEqual(['https://www.youtube.com']);
    expect(tv.texts).toEqual(['xin chào']);
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
    await waitFor(() => tv.messages.length === 3);
    expect(tv.messages[0].params.DataOfCmd).toBe('KEY_VOLUP');
    expect(Buffer.from(tv.messages[1].params.Cmd, 'base64').toString('utf8')).toBe('Tiếng Việt');
    driver.disconnect();
  });
});
