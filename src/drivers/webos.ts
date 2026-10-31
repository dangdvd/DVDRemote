import type { AppId, ConnectContext, DriverCapabilities, RemoteKey, TvDevice, TvDriver } from '../core/types';
import { MiniWebSocket } from '../net/websocket';
import { WEBOS_MANIFEST } from './webos-manifest';

/** Button names understood by the pointer input socket. */
const BUTTONS: Partial<Record<RemoteKey, string>> = {
  HOME: 'HOME',
  BACK: 'BACK',
  MENU: 'MENU',
  SETTINGS: 'QMENU',
  INFO: 'INFO',
  GUIDE: 'GUIDE',
  EXIT: 'EXIT',
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  OK: 'ENTER',
  VOL_UP: 'VOLUMEUP',
  VOL_DOWN: 'VOLUMEDOWN',
  MUTE: 'MUTE',
  CH_UP: 'CHANNELUP',
  CH_DOWN: 'CHANNELDOWN',
  NUM_0: '0',
  NUM_1: '1',
  NUM_2: '2',
  NUM_3: '3',
  NUM_4: '4',
  NUM_5: '5',
  NUM_6: '6',
  NUM_7: '7',
  NUM_8: '8',
  NUM_9: '9',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  STOP: 'STOP',
  REWIND: 'REWIND',
  FAST_FORWARD: 'FASTFORWARD',
  RED: 'RED',
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  BLUE: 'BLUE',
};

const APP_IDS: Record<AppId, string> = {
  youtube: 'youtube.leanback.v4',
  netflix: 'netflix',
  spotify: 'spotify-beehive',
  prime: 'amazon',
  disney: 'com.disney.disneyplus-prod',
};

const REGISTER_TIMEOUT_MS = 60000;
const REQUEST_TIMEOUT_MS = 8000;

interface Pending {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** LG webOS (2014+) via the SSAP WebSocket API, the same one LG ThinQ uses. */
export class WebOsDriver implements TvDriver {
  readonly capabilities: DriverCapabilities = {
    text: true,
    pointer: true,
    apps: Object.keys(APP_IDS) as AppId[],
  };
  onDisconnect?: (error?: Error) => void;

  private ws: MiniWebSocket | null = null;
  private pointer: MiniWebSocket | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private manualClose = false;
  private playing = false;

  constructor(private readonly device: TvDevice) {}

  async connect(ctx: ConnectContext): Promise<void> {
    this.manualClose = false;
    // Newer firmware (2022+) only accepts the TLS port; older ones only the plain one.
    let ws: MiniWebSocket;
    try {
      ws = await MiniWebSocket.connect(`wss://${this.device.host}:3001`);
    } catch {
      ws = await MiniWebSocket.connect(`ws://${this.device.host}:3000`);
    }
    this.ws = ws;
    ws.onMessage = (text) => this.handleMessage(text);
    ws.onClose = (err) => {
      this.ws = null;
      this.rejectAll(err ?? new Error('Mất kết nối TV'));
      this.pointer?.close();
      this.pointer = null;
      if (!this.manualClose) this.onDisconnect?.(err);
    };

    const clientKey = this.device.credentials?.clientKey;
    if (!clientKey) ctx.notify('Hãy chọn "Chấp nhận" (Accept) trên màn hình TV LG...');
    const registered = await this.request(
      'register',
      undefined,
      {
        forcePairing: false,
        pairingType: 'PROMPT',
        ...(clientKey ? { 'client-key': clientKey } : {}),
        manifest: WEBOS_MANIFEST,
      },
      REGISTER_TIMEOUT_MS,
    );
    const newKey = registered?.['client-key'];
    const patch: Partial<TvDevice> = {};
    if (newKey && newKey !== clientKey) {
      patch.credentials = { ...this.device.credentials, clientKey: newKey };
    }

    // Remember the MAC so the TV can be woken up with Wake-on-LAN later.
    if (!this.device.mac) {
      try {
        const info = await this.request('request', 'ssap://com.webos.service.connectionmanager/getinfo');
        const mac = info?.wiredInfo?.macAddress || info?.wifiInfo?.macAddress;
        if (mac) patch.mac = mac;
      } catch {
        // Not critical.
      }
    }
    if (Object.keys(patch).length) ctx.saveDevice(patch);
  }

  disconnect(): void {
    this.manualClose = true;
    this.pointer?.close();
    this.pointer = null;
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(text: string) {
    let msg: any;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    // A register request first gets {pairingType: PROMPT}; wait for the "registered" message.
    if (msg.type === 'response' && msg.payload?.pairingType === 'PROMPT') return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'error' || msg.payload?.returnValue === false) {
      const reason = msg.error || msg.payload?.errorText || 'TV từ chối yêu cầu';
      pending.reject(new Error(/denied|cancel|rejected/i.test(reason) ? 'Kết nối bị từ chối trên TV' : reason));
    } else {
      pending.resolve(msg.payload ?? {});
    }
  }

  private request(type: string, uri?: string, payload?: object, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
    const ws = this.ws;
    if (!ws) return Promise.reject(new Error('Chưa kết nối TV'));
    const id = `${type}_${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(type === 'register' ? 'Hết thời gian chờ chấp nhận trên TV' : 'TV không phản hồi'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, type, ...(uri ? { uri } : {}), ...(payload ? { payload } : {}) }));
    });
  }

  private rejectAll(err: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private call(uri: string, payload?: object) {
    return this.request('request', `ssap://${uri}`, payload);
  }

  private async getPointer(): Promise<MiniWebSocket> {
    if (this.pointer?.isOpen) return this.pointer;
    const res = await this.call('com.webos.service.networkinput/getPointerInputSocket');
    if (!res.socketPath) throw new Error('TV không cung cấp kênh điều khiển');
    const pointer = await MiniWebSocket.connect(res.socketPath);
    pointer.onClose = () => {
      if (this.pointer === pointer) this.pointer = null;
    };
    this.pointer = pointer;
    return pointer;
  }

  private async pointerSend(lines: string) {
    const p = await this.getPointer();
    p.send(lines + '\n\n');
  }

  async sendKey(key: RemoteKey): Promise<void> {
    switch (key) {
      case 'POWER':
        await this.call('system/turnOff');
        return;
      case 'SOURCE':
        await this.call('system.launcher/launch', { id: 'com.webos.app.inputpicker' }).catch(() =>
          this.pointerSend('type:button\nname:INPUT_HUB'),
        );
        return;
      case 'PLAY_PAUSE':
        this.playing = !this.playing;
        await this.call(this.playing ? 'media.controls/play' : 'media.controls/pause');
        return;
      case 'PREV':
        await this.call('media.controls/rewind');
        return;
      case 'NEXT':
        await this.call('media.controls/fastForward');
        return;
    }
    const button = BUTTONS[key];
    if (button) await this.pointerSend(`type:button\nname:${button}`);
  }

  async sendText(text: string): Promise<void> {
    await this.call('com.webos.service.ime/insertText', { text, replace: 0 });
  }

  async launchApp(app: AppId): Promise<void> {
    await this.call('system.launcher/launch', { id: APP_IDS[app] });
  }

  async movePointer(dx: number, dy: number): Promise<void> {
    await this.pointerSend(`type:move\ndx:${Math.round(dx)}\ndy:${Math.round(dy)}\ndown:0`);
  }

  async click(): Promise<void> {
    await this.pointerSend('type:click');
  }

  async scroll(dy: number): Promise<void> {
    await this.pointerSend(`type:scroll\ndx:0\ndy:${Math.round(dy)}`);
  }
}
