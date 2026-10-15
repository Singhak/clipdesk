import { LicenseInfo } from '../core/types';
import { LicensePayload, verifyToken } from './licenseToken';
import { LICENSE_API_BASE, LICENSE_PUBLIC_KEY, isLicensingConfigured } from './publicKey';

// Pro is unlocked only by an Ed25519-signed token from the licensing server (server/). The token is
// verified offline on every read, so editing localStorage cannot grant Pro, and it is bound to this
// device's random ID, so copying it to another machine does not either.

const STORAGE_KEY = 'clipdesk_license_v2';
const LEGACY_STORAGE_KEY = 'clipdesk_license_v1';
const DEVICE_KEY = 'clipdesk_device_id';
const KEY_PATTERN = /^CLIP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export type LicenseEndpoint = 'activate.php' | 'deactivate.php' | 'trial.php';
export type LicenseTransport = (endpoint: LicenseEndpoint, body: Record<string, unknown>) => Promise<{ status: number; data: any }>;
export interface LicenseResult {
  success: boolean;
  message: string;
}

interface Stored {
  token?: string;
  key?: string;
}

const FREE: LicenseInfo = { tier: 'free', planName: 'Free Creator Plan' };

const PLAN_NAMES: Record<LicensePayload['plan'], string> = {
  monthly: 'Pro Creator · 30-day pass',
  lifetime: 'Pro Creator · Lifetime',
  trial: 'Pro Creator · 7-day trial'
};

const fetchTransport: LicenseTransport = async (endpoint, body) => {
  const res = await fetch(`${LICENSE_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function writeStored(stored: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage blocked: the license simply won't persist
  }
}

export class LicenseService {
  private static listeners: Array<(info: LicenseInfo) => void> = [];
  private static publicKey = LICENSE_PUBLIC_KEY;
  private static transport: LicenseTransport = fetchTransport;
  private static configured = isLicensingConfigured();

  /**
   * Lets Electron route requests through the main process, and tests inject a key and a fake server
   * (`serverReady` skips the check that this build has a real server URL).
   */
  public static configure(opts: { publicKey?: string; transport?: LicenseTransport; serverReady?: boolean }): void {
    if (opts.publicKey !== undefined) this.publicKey = opts.publicKey;
    if (opts.transport) this.transport = opts.transport;
    this.configured = this.publicKey.length > 0 && (opts.serverReady ?? isLicensingConfigured());
  }

  public static getDeviceId(): string {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return 'no-storage-device';
    }
  }

  public static getLicense(): LicenseInfo {
    const stored = readStored();
    const payload = verifyToken(stored.token, this.publicKey, this.getDeviceId());
    if (!payload) {
      return stored.key ? { ...FREE, licenseKey: stored.key, planName: 'Free Creator Plan (key needs re-activation)' } : FREE;
    }
    return {
      tier: 'pro',
      plan: payload.plan,
      licenseKey: payload.key ?? undefined,
      // A lifetime token expires only so it gets re-checked; the license itself does not
      expiresAt: payload.exp === null || payload.plan === 'lifetime' ? undefined : new Date(payload.exp * 1000).toISOString(),
      planName: PLAN_NAMES[payload.plan] ?? 'Pro Creator'
    };
  }

  public static async activateKey(key: string): Promise<LicenseResult> {
    const cleanKey = key.trim().toUpperCase();
    if (!cleanKey) return { success: false, message: 'Please enter a license key.' };
    if (!KEY_PATTERN.test(cleanKey)) {
      return { success: false, message: 'License keys look like CLIP-XXXX-XXXX-XXXX. Check for typos.' };
    }
    const res = await this.call('activate.php', { key: cleanKey, deviceId: this.getDeviceId() });
    if (!res.success || !res.token) return res;
    if (!verifyToken(res.token, this.publicKey, this.getDeviceId())) {
      return { success: false, message: 'The licensing server sent a token this build cannot verify. Update ClipDesk.' };
    }
    writeStored({ token: res.token, key: cleanKey });
    this.notify(this.getLicense());
    return { success: true, message: '🎉 Pro activated. The watermark and recording limit are gone.' };
  }

  /** Step 1 of the trial: emails a 6-digit code. Disposable addresses and reused emails are refused by the server. */
  public static async requestTrialCode(email: string): Promise<LicenseResult> {
    const res = await this.call('trial.php', { action: 'request', deviceId: this.getDeviceId(), email: email.trim() });
    return res.success ? { success: true, message: `We emailed a 6-digit code to ${email.trim()}. It is valid for 15 minutes.` } : res;
  }

  /** Step 2: checks the emailed code and starts the trial on this device. */
  public static async verifyTrial(email: string, code: string): Promise<LicenseResult> {
    const res = await this.call('trial.php', { action: 'verify', deviceId: this.getDeviceId(), email: email.trim(), code: code.trim() });
    if (!res.success || !res.token) return res;
    if (!verifyToken(res.token, this.publicKey, this.getDeviceId())) {
      return { success: false, message: 'The licensing server sent a token this build cannot verify. Update ClipDesk.' };
    }
    writeStored({ token: res.token });
    this.notify(this.getLicense());
    return { success: true, message: '✨ 7-day Pro trial started on this device.' };
  }

  /** Frees this device's slot on the server, then drops back to Free locally. */
  public static async deactivate(): Promise<LicenseResult> {
    const { key } = readStored();
    if (key) {
      const res = await this.call('deactivate.php', { key, deviceId: this.getDeviceId() });
      if (!res.success) return res;
    }
    this.resetToFree();
    return { success: true, message: 'This device is deactivated. You can use the key on another device now.' };
  }

  /**
   * Re-activates the stored key so renewals, expiry and revocations reach this device.
   * Network failures keep the current token: the app keeps working offline.
   */
  public static async refresh(): Promise<void> {
    const { key } = readStored();
    if (!key || !this.configured) return;
    const res = await this.call('activate.php', { key, deviceId: this.getDeviceId() });
    if (res.success && res.token && verifyToken(res.token, this.publicKey, this.getDeviceId())) {
      writeStored({ token: res.token, key });
      this.notify(this.getLicense());
    } else if (res.status === 403 || res.status === 404) {
      // Expired or revoked: keep the key so a renewal can be picked up later
      writeStored({ key });
      this.notify(this.getLicense());
    }
  }

  public static getCheckoutUrl(plan: 'monthly' | 'lifetime' = 'lifetime'): string {
    const params = new URLSearchParams({ plan });
    const { key } = readStored();
    if (plan === 'monthly' && key) params.set('renew', key);
    return `${LICENSE_API_BASE}/buy.php?${params}`;
  }

  public static resetToFree(): void {
    writeStored({});
    this.notify(FREE);
  }

  public static subscribe(listener: (info: LicenseInfo) => void): () => void {
    LicenseService.listeners.push(listener);
    return () => {
      LicenseService.listeners = LicenseService.listeners.filter((l) => l !== listener);
    };
  }

  private static notify(info: LicenseInfo): void {
    LicenseService.listeners.forEach((l) => l(info));
  }

  private static async call(
    endpoint: LicenseEndpoint,
    body: Record<string, unknown>
  ): Promise<LicenseResult & { token?: string; status?: number }> {
    if (!this.configured) {
      return { success: false, message: 'This build has no licensing server configured (see server/README.md).' };
    }
    try {
      const { status, data } = await this.transport(endpoint, body);
      if (status >= 200 && status < 300) return { success: true, message: '', token: data?.token, status };
      return { success: false, message: data?.message || `The licensing server returned an error (${status}).`, status };
    } catch {
      return { success: false, message: "Couldn't reach the licensing server. Check your internet connection and try again." };
    }
  }
}
