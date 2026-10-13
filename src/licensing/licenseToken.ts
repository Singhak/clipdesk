import nacl from 'tweetnacl';

/** Payload signed by server/lib/token.php */
export interface LicensePayload {
  v: 1;
  tier: 'pro';
  plan: 'monthly' | 'lifetime' | 'trial';
  key: string | null;
  deviceId: string;
  iat: number;
  /** Unix seconds; null = never expires */
  exp: number | null;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/**
 * Verifies a license token offline: Ed25519 signature, expiry and device binding.
 * Returns null for anything that is not a currently valid Pro token for this device.
 */
export function verifyToken(
  token: string | null | undefined,
  publicKeyB64: string,
  deviceId: string,
  nowSeconds = Date.now() / 1000
): LicensePayload | null {
  if (!token || !publicKeyB64) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const publicKey = b64ToBytes(publicKeyB64);
    const signature = b64urlToBytes(parts[1]);
    if (publicKey.length !== nacl.sign.publicKeyLength || signature.length !== nacl.sign.signatureLength) return null;
    if (!nacl.sign.detached.verify(new TextEncoder().encode(parts[0]), signature, publicKey)) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as LicensePayload;
    if (payload.v !== 1 || payload.tier !== 'pro') return null;
    if (payload.deviceId !== deviceId) return null;
    if (payload.exp !== null && !(payload.exp > nowSeconds)) return null;
    return payload;
  } catch {
    return null;
  }
}
