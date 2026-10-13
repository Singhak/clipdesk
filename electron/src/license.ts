import { LicenseService } from '../../src/licensing/licenseService';

// Desktop pages can't reach the licensing server directly (CSP), so calls go through the main process
LicenseService.configure({ transport: (endpoint, body) => window.reel.license.request(endpoint, body) });

export const openCheckout = (url: string) => window.reel.license.openCheckout(url);
