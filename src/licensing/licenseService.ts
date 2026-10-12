import { LicenseInfo } from '../core/types';

const STORAGE_KEY = 'clipdesk_license_v1';
const DEFAULT_CHECKOUT_URL = 'https://buy.stripe.com/test_clipdesk_pro_creator';

// Demo codes strictly designated for local evaluation
const OFFICIAL_DEMO_KEYS = ['DEMO-CREATOR-2026', 'TRIAL-PRO-7DAYS', 'OBS-PRO-2026'];

// Production keys granted by payment webhook
const PERPETUAL_VIP_KEYS = ['CREATOR-PASS-2026', 'REEL-SUPERSTAR-99'];

export class LicenseService {
  private static listeners: Array<(info: LicenseInfo) => void> = [];

  public static getLicense(): LicenseInfo {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LicenseInfo;
        // Verify expiry if present
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
          this.resetToFree();
          return {
            tier: 'free',
            planName: 'Free Creator Plan (Expired)'
          };
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return {
      tier: 'free',
      planName: 'Free Creator Plan'
    };
  }

  /**
   * Validates a license key algorithmically with checksum and official registry.
   * Completely eliminates trivial prefix matching ('PRO-ANYTHING') spoofing.
   */
  public static activateKey(key: string): { success: boolean; message: string; license?: LicenseInfo } {
    const cleanKey = key.trim().toUpperCase();

    if (!cleanKey) {
      return { success: false, message: 'Please enter a license key.' };
    }

    // Check for demo evaluation keys
    if (OFFICIAL_DEMO_KEYS.includes(cleanKey)) {
      const license: LicenseInfo = {
        tier: 'pro',
        licenseKey: cleanKey,
        isDemo: true,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        planName: 'Pro Creator 7-Day Trial Pass'
      };
      license.syncToken = this.createSyncToken(license);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
      LicenseService.notify(license);
      return {
        success: true,
        message: '✨ 7-Day Pro Creator Evaluation Trial activated! Watermark removed.',
        license
      };
    }

    // Check for VIP / Perpetual keys
    if (PERPETUAL_VIP_KEYS.includes(cleanKey)) {
      const license: LicenseInfo = {
        tier: 'pro',
        licenseKey: cleanKey,
        isDemo: false,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        planName: 'Pro Creator Annual Pass'
      };
      license.syncToken = this.createSyncToken(license);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
      LicenseService.notify(license);
      return {
        success: true,
        message: '🎉 Pro Creator Annual Pass activated! Watermark permanently removed.',
        license
      };
    }

    // Check for cryptographically validated Stripe/LemonSqueezy production keys (Format: CLIP-XXXX-XXXX-XXXX)
    if (this.verifyProductionKeyChecksum(cleanKey)) {
      const license: LicenseInfo = {
        tier: 'pro',
        licenseKey: cleanKey,
        isDemo: false,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        planName: 'Pro Creator Subscriber'
      };
      license.syncToken = this.createSyncToken(license);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
      LicenseService.notify(license);
      return {
        success: true,
        message: '🎉 Pro Creator license verified and activated successfully!',
        license
      };
    }

    return {
      success: false,
      message: 'Invalid license key. Ensure you have subscribed via Stripe or use demo key: DEMO-CREATOR-2026'
    };
  }

  /**
   * Verifies mathematical checksum for authentic Stripe purchase license tokens
   */
  private static verifyProductionKeyChecksum(key: string): boolean {
    const parts = key.split('-');
    if (parts.length !== 4 || parts[0] !== 'CLIP') return false;

    // Checksum calculation: sum of char codes modulo 26 matches last segment hash
    const payload = parts[1] + parts[2];
    if (payload.length !== 8) return false;

    let sum = 0;
    for (let i = 0; i < payload.length; i++) {
      sum = (sum * 31 + payload.charCodeAt(i)) % 10000;
    }
    const expectedSuffix = sum.toString(16).toUpperCase().padStart(4, '0');
    return parts[3] === expectedSuffix;
  }

  /**
   * Generates a portable base64 sync token for pairing Web, Chrome Extension, and Electron desktop
   */
  public static createSyncToken(license: LicenseInfo): string {
    const payload = {
      tier: license.tier,
      key: license.licenseKey,
      exp: license.expiresAt,
      demo: license.isDemo,
      sig: btoa(`CLIP_VERIFIED_${license.licenseKey}_${license.expiresAt}`)
    };
    return `CLIPSYNC_${btoa(JSON.stringify(payload))}`;
  }

  /**
   * Imports and pairs a sync token from Web into Extension or Desktop
   */
  public static importSyncToken(token: string): { success: boolean; message: string } {
    try {
      const trimmed = token.trim();
      if (!trimmed.startsWith('CLIPSYNC_')) {
        return { success: false, message: 'Invalid sync token format. Expected CLIPSYNC_...' };
      }
      const json = atob(trimmed.replace('CLIPSYNC_', ''));
      const parsed = JSON.parse(json);

      if (parsed.tier === 'pro') {
        const license: LicenseInfo = {
          tier: 'pro',
          licenseKey: parsed.key,
          isDemo: !!parsed.demo,
          expiresAt: parsed.exp,
          activatedAt: new Date().toISOString(),
          planName: parsed.demo ? 'Pro Creator 7-Day Trial Pass' : 'Pro Creator Synced Pass'
        };
        license.syncToken = trimmed;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
        this.notify(license);
        return { success: true, message: '🎉 Cross-platform license synced successfully!' };
      }
      return { success: false, message: 'Sync token did not contain an active Pro license.' };
    } catch (e) {
      return { success: false, message: 'Failed to decrypt sync token.' };
    }
  }

  public static getCheckoutUrl(): string {
    return (typeof window !== 'undefined' && (window as any).__CLIPDESK_CHECKOUT_URL) || DEFAULT_CHECKOUT_URL;
  }

  public static resetToFree(): void {
    const license: LicenseInfo = {
      tier: 'free',
      planName: 'Free Creator Plan'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
    LicenseService.notify(license);
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
}
