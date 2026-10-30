import { base64EncodeText } from '../core/bytes';
import type { AppId, ConnectContext, DriverCapabilities, RemoteKey, TvDevice, TvDriver } from '../core/types';
import { MiniWebSocket } from '../net/websocket';

const KEYS: Record<Exclude<RemoteKey, 'PLAY_PAUSE'>, string> = {
  POWER: 'KEY_POWER',
  HOME: 'KEY_HOME',
  BACK: 'KEY_RETURN',
  MENU: 'KEY_MENU',
  SETTINGS: 'KEY_TOOLS',
  SOURCE: 'KEY_SOURCE',
  INFO: 'KEY_INFO',
  GUIDE: 'KEY_GUIDE',
  EXIT: 'KEY_EXIT',
  UP: 'KEY_UP',
  DOWN: 'KEY_DOWN',
  LEFT: 'KEY_LEFT',
  RIGHT: 'KEY_RIGHT',
  OK: 'KEY_ENTER',
  VOL_UP: 'KEY_VOLUP',
  VOL_DOWN: 'KEY_VOLDOWN',
  MUTE: 'KEY_MUTE',
  CH_UP: 'KEY_CHUP',
  CH_DOWN: 'KEY_CHDOWN',
  NUM_0: 'KEY_0',
  NUM_1: 'KEY_1',
  NUM_2: 'KEY_2',
  NUM_3: 'KEY_3',
  NUM_4: 'KEY_4',
  NUM_5: 'KEY_5',
  NUM_6: 'KEY_6',
  NUM_7: 'KEY_7',
  NUM_8: 'KEY_8',
  NUM_9: 'KEY_9',
  PLAY: 'KEY_PLAY',
  PAUSE: 'KEY_PAUSE',
  STOP: 'KEY_STOP',
  REWIND: 'KEY_REWIND',
  FAST_FORWARD: 'KEY_FF',
  PREV: 'KEY_REWIND',
  NEXT: 'KEY_FF',
  RED: 'KEY_RED',
  GREEN: 'KEY_GREEN',
  YELLOW: 'KEY_YELLOW',
  BLUE: 'KEY_CYAN',
};

const APP_IDS: Record<AppId, string> = {
  youtube: '111299001912',
  netflix: '3201907018807',
  spotify: '3201606009684',
  prime: '3201910019365',
  disney: '3201901017640',
};

const AUTH_TIMEOUT_MS = 45000;

/** Samsung Smart TV running Tizen (2016 and newer) via the remote-control WebSocket channel. */
export class TizenDriver implements TvDriver {
  readonly capabilities: DriverCapabilities = {
    text: true,
    pointer: true,
    apps: Object.keys(APP_IDS) as AppId[],
  };
  onDisconnect?: (error?: Error) => void;

  private ws: MiniWebSocket | null = null;
  private manualClose = false;
  private playing = false;

  constructor(private readonly device: TvDevice) {}

  private url(secure: boolean): string {
    const name = base64EncodeText('DVD Remote');
    const token = this.device.credentials?.token;
    return secure
      ? `wss://${this.device.host}:8002/api/v2/channels/samsung.remote.control?name=${name}${token ? `&token=${token}` : ''}`
      : `ws://${this.device.host}:8001/api/v2/channels/samsung.remote.control?name=${name}`;
  }

  async connect(ctx: ConnectContext): Promise<void> {
    this.manualClose = false;
    // 2018+ models require the TLS port and a token; 2016-2017 models only have port 8001.
    let ws: MiniWebSocket;
    try {
      ws = await MiniWebSocket.connect(this.url(true));
    } catch {
      ws = await MiniWebSocket.connect(this.url(false));
    }
    if (!this.device.credentials?.token) {
      ctx.notify('Hãy chọn "Cho phép" (Allow) trên màn hình TV Samsung...');
    }

    const token = await new Promise<string | undefined>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Hết thời gian chờ cho phép trên TV'));
      }, AUTH_TIMEOUT_MS);
      ws.onClose = (err) => {
        clearTimeout(timer);
        reject(err ?? new Error('TV đã đóng kết nối'));
      };
      ws.onMessage = (text) => {
        let msg: any;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg.event === 'ms.channel.connect') {
          clearTimeout(timer);
          resolve(msg.data?.token);
        } else if (msg.event === 'ms.channel.unauthorized') {
          clearTimeout(timer);
          ws.close();
          reject(new Error('Kết nối bị từ chối trên TV'));
        }
      };
    });

    if (token && token !== this.device.credentials?.token) {
      ctx.saveDevice({ credentials: { ...this.device.credentials, token } });
    }
    ws.onMessage = () => {};
    ws.onClose = (err) => {
      this.ws = null;
      if (!this.manualClose) this.onDisconnect?.(err);
    };
    this.ws = ws;
  }

  disconnect(): void {
    this.manualClose = true;
    this.ws?.close();
    this.ws = null;
  }

  private send(params: object, method = 'ms.remote.control') {
    if (!this.ws) throw new Error('Chưa kết nối TV');
    this.ws.send(JSON.stringify({ method, params }));
  }

  async sendKey(key: RemoteKey): Promise<void> {
    let code: string;
    if (key === 'PLAY_PAUSE') {
      // Tizen has no toggle key, so alternate between play and pause.
      this.playing = !this.playing;
      code = this.playing ? KEYS.PLAY : KEYS.PAUSE;
    } else {
      code = KEYS[key];
    }
    this.send({ Cmd: 'Click', DataOfCmd: code, Option: 'false', TypeOfRemote: 'SendRemoteKey' });
  }

  async sendText(text: string): Promise<void> {
    this.send({ Cmd: base64EncodeText(text), DataOfCmd: 'base64', TypeOfRemote: 'SendInputString' });
    this.send({ TypeOfRemote: 'SendInputEnd' });
  }

  async launchApp(app: AppId): Promise<void> {
    this.send(
      { event: 'ed.apps.launch', to: 'host', data: { appId: APP_IDS[app], action_type: 'DEEP_LINK' } },
      'ms.channel.emit',
    );
  }

  async movePointer(dx: number, dy: number): Promise<void> {
    this.send({
      Cmd: 'Move',
      Position: { x: Math.round(dx), y: Math.round(dy), Time: String(Date.now()) },
      TypeOfRemote: 'ProcessMouseDevice',
    });
  }

  async click(): Promise<void> {
    this.send({ Cmd: 'LeftClick', TypeOfRemote: 'ProcessMouseDevice' });
  }
}
