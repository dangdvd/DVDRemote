/** Platform families we can talk to. Every brand maps onto one of these protocols. */
export type DeviceKind =
  | 'androidtv' // Android TV / Google TV: Sony, TCL, Xiaomi, Philips, Panasonic, Sharp, Hisense, Toshiba...
  | 'webos' // LG webOS
  | 'tizen' // Samsung Tizen (2016+)
  | 'xiaomi-legacy'; // Old Xiaomi Mi TV / PatchWall without Google TV (HTTP port 6095)

export interface TvDevice {
  id: string;
  name: string;
  host: string;
  kind: DeviceKind;
  brand?: string;
  model?: string;
  /** MAC address, used for Wake-on-LAN. */
  mac?: string;
  /** Protocol specific credentials (LG client-key, Samsung token, Android TV paired flag...). */
  credentials?: Record<string, string>;
  lastConnected?: number;
}

export type RemoteKey =
  | 'POWER'
  | 'HOME'
  | 'BACK'
  | 'MENU'
  | 'SETTINGS'
  | 'SOURCE'
  | 'INFO'
  | 'GUIDE'
  | 'EXIT'
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'OK'
  | 'VOL_UP'
  | 'VOL_DOWN'
  | 'MUTE'
  | 'CH_UP'
  | 'CH_DOWN'
  | 'NUM_0'
  | 'NUM_1'
  | 'NUM_2'
  | 'NUM_3'
  | 'NUM_4'
  | 'NUM_5'
  | 'NUM_6'
  | 'NUM_7'
  | 'NUM_8'
  | 'NUM_9'
  | 'PLAY'
  | 'PAUSE'
  | 'PLAY_PAUSE'
  | 'STOP'
  | 'REWIND'
  | 'FAST_FORWARD'
  | 'PREV'
  | 'NEXT'
  | 'RED'
  | 'GREEN'
  | 'YELLOW'
  | 'BLUE';

/** Shortcut apps shown on the remote. Each driver maps them to its own launch id. */
export type AppId = 'youtube' | 'netflix' | 'spotify' | 'prime' | 'disney';

export interface DriverCapabilities {
  text: boolean;
  pointer: boolean;
  apps: AppId[];
}

/** Lets a driver talk to the user while connecting (pairing PIN, "accept on TV" prompts). */
export interface ConnectContext {
  /** Ask the user for the code shown on the TV. Resolves null if cancelled. */
  requestPin(message: string): Promise<string | null>;
  /** Show a status message (e.g. "Accept the connection on your TV"). */
  notify(message: string): void;
  /** Persist updated device info (credentials, MAC...). */
  saveDevice(patch: Partial<TvDevice>): void;
}

export interface TvDriver {
  readonly capabilities: DriverCapabilities;
  connect(ctx: ConnectContext): Promise<void>;
  disconnect(): void;
  sendKey(key: RemoteKey): Promise<void>;
  sendText?(text: string): Promise<void>;
  launchApp?(app: AppId): Promise<void>;
  movePointer?(dx: number, dy: number): Promise<void>;
  click?(): Promise<void>;
  scroll?(dy: number): Promise<void>;
  /** Called when the connection drops after a successful connect. */
  onDisconnect?: (error?: Error) => void;
}

export class PairingCancelledError extends Error {
  constructor() {
    super('Đã huỷ ghép nối');
  }
}
