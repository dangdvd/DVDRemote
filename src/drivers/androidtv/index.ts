import { Platform } from 'react-native';
import type { ProtoMessage } from '../../core/protobuf';
import {
  AppId,
  ConnectContext,
  DriverCapabilities,
  PairingCancelledError,
  RemoteKey,
  TvDevice,
  TvDriver,
} from '../../core/types';
import { getClientIdentity } from './cert';
import { ProtoConnection } from './connection';
import { ANDROID_KEYCODES } from './keycodes';
import {
  CLIENT_FEATURES,
  Direction,
  Feature,
  Remote,
  REMOTE_PORT,
  remoteAppLink,
  remoteConfigure,
  remoteImeText,
  remoteKeyInject,
  remotePingResponse,
  remoteSetActive,
} from './messages';
import { pairAndroidTv } from './pairing';
import { KEYCODE_SHIFT_LEFT, textToKeyPresses } from './textKeys';

const APP_LINKS: Record<AppId, string> = {
  youtube: 'https://www.youtube.com',
  netflix: 'https://www.netflix.com/title',
  spotify: 'market://launch?id=com.spotify.tv.android',
  prime: 'https://app.primevideo.com',
  disney: 'https://www.disneyplus.com',
};

const READY_TIMEOUT_MS = 8000;
const KEY_GAP_MS = 20;

/**
 * Android TV Remote Service v2 – the protocol used by the official Google TV app.
 * Works with every Android TV / Google TV: Sony Bravia, TCL, Xiaomi, Philips, Panasonic,
 * Sharp, Hisense, Toshiba, Nvidia Shield, Chromecast with Google TV...
 */
export class AndroidTvDriver implements TvDriver {
  readonly capabilities: DriverCapabilities = {
    text: true,
    pointer: false,
    apps: Object.keys(APP_LINKS) as AppId[],
  };
  onDisconnect?: (error?: Error) => void;

  private conn: ProtoConnection | null = null;
  private imeCounter = 0;
  private fieldCounter = 0;
  /** The TV accepted the IME feature, so it can take whole strings (any language). */
  private imeSupported = false;
  private manualClose = false;

  constructor(private readonly device: TvDevice) {}

  async connect(ctx: ConnectContext): Promise<void> {
    this.manualClose = false;
    ctx.notify('Đang chuẩn bị chứng chỉ bảo mật (chỉ lần đầu, có thể mất vài giây)...');
    const identity = await getClientIdentity();

    const paired = this.device.credentials?.paired === '1';
    if (paired) {
      try {
        await this.openRemote(identity);
        return;
      } catch {
        // Pairing may have been reset on the TV; fall through and pair again.
      }
    }

    ctx.notify('Đang yêu cầu ghép nối, hãy xem mã trên màn hình TV...');
    const clientName = Platform.OS === 'ios' ? 'DVD Remote (iPhone)' : 'DVD Remote (Android)';
    const ok = await pairAndroidTv(this.device.host, identity, clientName, (retry) =>
      ctx.requestPin(
        retry
          ? 'Mã chưa đúng. Nhập lại mã 6 ký tự đang hiển thị trên TV:'
          : 'Nhập mã 6 ký tự đang hiển thị trên TV:',
      ),
    );
    if (!ok) throw new PairingCancelledError();
    ctx.saveDevice({ credentials: { ...this.device.credentials, paired: '1' } });
    ctx.notify('Ghép nối thành công, đang kết nối...');
    await this.openRemote(identity);
  }

  private async openRemote(identity: Awaited<ReturnType<typeof getClientIdentity>>): Promise<void> {
    const conn = await ProtoConnection.open(this.device.host, REMOTE_PORT, identity);
    let features = CLIENT_FEATURES;
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const timer = setTimeout(() => {
        // Some TVs never send remote_start; once configure/set_active passed we are usable.
        if (activated) finish();
        else fail(new Error('TV không phản hồi, có thể chưa ghép nối'));
      }, READY_TIMEOUT_MS);
      let activated = false;
      const finish = () => {
        if (ready) return;
        ready = true;
        clearTimeout(timer);
        this.conn = conn;
        resolve();
      };
      const fail = (err: Error) => {
        if (ready) return;
        ready = true;
        clearTimeout(timer);
        conn.close();
        reject(err);
      };

      conn.onClose = (err) => {
        if (!ready) return fail(err ?? new Error('TV từ chối kết nối (chưa ghép nối?)'));
        this.conn = null;
        if (!this.manualClose) this.onDisconnect?.(err);
      };
      conn.onMessage = (msg: ProtoMessage) => {
        if (msg.has(Remote.CONFIGURE)) {
          const tvFeatures = msg.message(Remote.CONFIGURE)?.uint(1) ?? CLIENT_FEATURES;
          features = tvFeatures & CLIENT_FEATURES || CLIENT_FEATURES;
          this.imeSupported = (features & Feature.IME) !== 0;
          conn.send(remoteConfigure(features, 'DVD Remote', Platform.OS));
        } else if (msg.has(Remote.SET_ACTIVE)) {
          // Activate only what both sides support, like the configure answer.
          conn.send(remoteSetActive(features));
          activated = true;
        } else if (msg.has(Remote.PING_REQUEST)) {
          conn.send(remotePingResponse(msg.message(Remote.PING_REQUEST)?.uint(1) ?? 0));
        } else if (msg.has(Remote.START)) {
          finish();
        } else if (msg.has(Remote.IME_BATCH_EDIT)) {
          const edit = msg.message(Remote.IME_BATCH_EDIT);
          this.imeCounter = edit?.uint(1) ?? 0;
          this.fieldCounter = edit?.uint(2) ?? 0;
        } else if (msg.has(Remote.ERROR)) {
          if (!ready) fail(new Error('TV báo lỗi kết nối'));
        }
      };
    });
  }

  disconnect(): void {
    this.manualClose = true;
    this.conn?.close();
    this.conn = null;
  }

  private send(payload: Uint8Array) {
    if (!this.conn) throw new Error('Chưa kết nối TV');
    this.conn.send(payload);
  }

  async sendKey(key: RemoteKey): Promise<void> {
    this.send(remoteKeyInject(ANDROID_KEYCODES[key]));
  }

  /**
   * Text is typed as key presses, like a hardware keyboard: that works whether or not the TV
   * shows its own on-screen keyboard. IME edits are ignored by many TVs while that keyboard is
   * open (androidtvremote2: "may not work as expected if virtual keyboard is present"), and when
   * their counters do not match the focused field, so they are only used for text no key can
   * type (Vietnamese diacritics).
   */
  async sendText(text: string): Promise<void> {
    if (!text) return;
    const presses = textToKeyPresses(text);
    if (presses) {
      for (const { code, shift } of presses) {
        if (shift) this.send(remoteKeyInject(KEYCODE_SHIFT_LEFT, Direction.START_LONG));
        this.send(remoteKeyInject(code));
        if (shift) this.send(remoteKeyInject(KEYCODE_SHIFT_LEFT, Direction.END_LONG));
        // A short gap keeps fast typing from being dropped by slower TV keyboards.
        await new Promise((r) => setTimeout(r, KEY_GAP_MS));
      }
      return;
    }
    if (this.imeSupported) {
      this.send(remoteImeText(text, this.imeCounter, this.fieldCounter));
      return;
    }
    throw new Error(
      'TV này chỉ nhận chữ không dấu qua Wi-Fi (a-z, 0-9). Hãy gõ không dấu, hoặc dùng bàn phím trên TV.',
    );
  }

  async launchApp(app: AppId): Promise<void> {
    this.send(remoteAppLink(APP_LINKS[app]));
  }
}
