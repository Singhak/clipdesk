import { LicenseInfo } from '../core/types';

const STORAGE_KEY = 'clipdesk_license_v1';

export class LicenseService {
  private static listeners: Array<(info: LicenseInfo) => void> = [];

  public static getLicense(): LicenseInfo {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return {
      tier: 'free',
      planName: 'Free Creator Plan'
    };
  }

  public static activateKey(key: string): { success: boolean; message: string } {
    const cleanKey = key.trim().toUpperCase();

    // Accepted keys or standard prefix
    const validProKeys = ['PRO-CREATOR-2026', 'REEL-SUPERSTAR-99', 'OBS-PRO-2026', 'CREATOR-PASS'];
    const isPro = validProKeys.includes(cleanKey) || cleanKey.startsWith('PRO-');

    if (isPro) {
      const license: LicenseInfo = {
        tier: 'pro',
        licenseKey: cleanKey,
        activatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        planName: 'Pro Creator Annual Pass'
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
      LicenseService.notify(license);
      return { success: true, message: '🎉 Pro Creator license activated successfully! Watermark removed.' };
    }

    return {
      success: false,
      message: 'Invalid license key. Try using demo code: PRO-CREATOR-2026'
    };
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
