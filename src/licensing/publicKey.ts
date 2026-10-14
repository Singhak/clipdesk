// Licensing server settings baked into each build.
// LICENSE_PUBLIC_KEY is the base64 public key printed by `php server/bin/keygen.php`. It is safe to publish:
// it can only verify tokens, never create them. Forks that run their own server set both through env vars.

const env = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

export const LICENSE_PUBLIC_KEY = env.VITE_LICENSE_PUBLIC_KEY ?? '';

export const LICENSE_API_BASE = (env.VITE_LICENSE_API ?? 'https://clipdesk.infynetic.com/api').replace(/\/+$/, '');

// The default API URL is the real production server, so the public key alone decides whether a build can sell Pro.
export const isLicensingConfigured = (): boolean => LICENSE_PUBLIC_KEY.length > 0;
