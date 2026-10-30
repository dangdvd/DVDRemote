import type { AppId, ConnectContext, DriverCapabilities, RemoteKey, TvDevice, TvDriver } from '../core/types';

const KEYS: Partial<Record<RemoteKey, string>> = {
  POWER: 'power',
  HOME: 'home',
  BACK: 'back',
  MENU: 'menu',
  SETTINGS: 'menu',
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  OK: 'enter',
  VOL_UP: 'volumeup',
  VOL_DOWN: 'volumedown',
};

const PACKAGES: Partial<Record<AppId, string>> = {
  youtube: 'com.google.android.youtube.tv',
  netflix: 'com.netflix.ninja',
};

/**
 * Older Xiaomi Mi TV / Mi Box models (PatchWall / MIUI TV without Google TV) expose a simple
 * HTTP API on port 6095. Newer Xiaomi TVs run Google TV and use the Android TV driver instead.
 */
export class XiaomiLegacyDriver implements TvDriver {
  readonly capabilities: DriverCapabilities = {
    text: false,
    pointer: false,
    apps: Object.keys(PACKAGES) as AppId[],
  };
  onDisconnect?: (error?: Error) => void;

  constructor(private readonly device: TvDevice) {}

  private async fetch(path: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      return await fetch(`http://${this.device.host}:6095${path}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async get(query: string): Promise<void> {
    const res = await this.fetch(`/controller?${query}`);
    if (!res.ok) throw new Error(`TV trả lỗi HTTP ${res.status}`);
  }

  async connect(_ctx: ConnectContext): Promise<void> {
    // There is no session; any HTTP answer means the TV is reachable.
    await this.fetch('/');
  }

  disconnect(): void {}

  async sendKey(key: RemoteKey): Promise<void> {
    const code = KEYS[key];
    if (!code) throw new Error('TV này không hỗ trợ phím này');
    await this.get(`action=keyevent&keycode=${code}`);
  }

  async launchApp(app: AppId): Promise<void> {
    const pkg = PACKAGES[app];
    if (pkg) await this.get(`action=startapp&type=packagename&packagename=${pkg}`);
  }
}
