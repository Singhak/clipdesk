import { beforeEach, describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import { verifyToken, LicensePayload } from '../licenseToken';
import { LicenseService } from '../licenseService';

const pair = nacl.sign.keyPair();
const publicKey = Buffer.from(pair.publicKey).toString('base64');
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

/** Signs exactly like server/lib/token.php */
function sign(payload: object, secretKey = pair.secretKey): string {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${b64url(nacl.sign.detached(new TextEncoder().encode(body), secretKey))}`;
}

const base: LicensePayload = { v: 1, tier: 'pro', plan: 'lifetime', key: 'CLIP-AB12-CD34-EF56', deviceId: 'device-1234', iat: 0, exp: null };

describe('verifyToken', () => {
  it('accepts a token signed by the server key', () => {
    expect(verifyToken(sign(base), publicKey, 'device-1234')).toEqual(base);
  });

  it('rejects a tampered payload', () => {
    const [, sig] = sign({ ...base, plan: 'monthly' }).split('.');
    const body = b64url(new TextEncoder().encode(JSON.stringify(base)));
    expect(verifyToken(`${body}.${sig}`, publicKey, 'device-1234')).toBeNull();
  });

  it('rejects a token signed by another key', () => {
    expect(verifyToken(sign(base, nacl.sign.keyPair().secretKey), publicKey, 'device-1234')).toBeNull();
  });

  it('rejects an expired token and accepts one still in date', () => {
    const now = 1_800_000_000;
    expect(verifyToken(sign({ ...base, exp: now - 1 }), publicKey, 'device-1234', now)).toBeNull();
    expect(verifyToken(sign({ ...base, exp: now + 60 }), publicKey, 'device-1234', now)).not.toBeNull();
  });

  it('rejects a token issued to another device', () => {
    expect(verifyToken(sign(base), publicKey, 'device-other')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifyToken('not-a-token', publicKey, 'device-1234')).toBeNull();
    expect(verifyToken(sign(base), '', 'device-1234')).toBeNull();
  });
});

describe('LicenseService', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
      clear: () => Object.keys(store).forEach((k) => delete store[k]),
      key: () => null,
      length: 0
    } as Storage;
    LicenseService.configure({
      publicKey,
      serverReady: true,
      transport: async (endpoint, body) =>
        endpoint === 'activate.php' && body.key === base.key
          ? { status: 200, data: { token: sign({ ...base, deviceId: body.deviceId }) } }
          : { status: 404, data: { message: 'not found' } }
    });
  });

  it('is Free when localStorage holds a forged token', () => {
    const body = b64url(new TextEncoder().encode(JSON.stringify({ ...base, deviceId: LicenseService.getDeviceId() })));
    localStorage.setItem('clipdesk_license_v2', JSON.stringify({ token: `${body}.${b64url(new Uint8Array(64))}` }));
    expect(LicenseService.getLicense().tier).toBe('free');
  });

  it('ignores the old v1 license format', () => {
    localStorage.setItem('clipdesk_license_v1', JSON.stringify({ tier: 'pro', planName: 'Pro' }));
    expect(LicenseService.getLicense().tier).toBe('free');
  });

  it('activates a server-issued key and rejects unknown ones', async () => {
    expect((await LicenseService.activateKey('CLIP-ZZZZ-ZZZZ-ZZZZ')).success).toBe(false);
    expect(LicenseService.getLicense().tier).toBe('free');
    expect((await LicenseService.activateKey(base.key!.toLowerCase())).success).toBe(true);
    expect(LicenseService.getLicense()).toMatchObject({ tier: 'pro', plan: 'lifetime', licenseKey: base.key });
  });

  it('drops to Free when a refresh finds the key revoked', async () => {
    await LicenseService.activateKey(base.key!);
    LicenseService.configure({ transport: async () => ({ status: 403, data: { error: 'revoked' } }), serverReady: true });
    await LicenseService.refresh();
    expect(LicenseService.getLicense().tier).toBe('free');
  });

  it('keeps Pro when a refresh cannot reach the server', async () => {
    await LicenseService.activateKey(base.key!);
    LicenseService.configure({
      transport: async () => {
        throw new Error('offline');
      },
      serverReady: true
    });
    await LicenseService.refresh();
    expect(LicenseService.getLicense().tier).toBe('pro');
  });
});
