import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_PRICES } from '../tierFeatures';

// The apps show DISPLAY_PRICES but Cashfree charges server/config.php `plans`; this keeps them from drifting.
describe('display prices match the server plans', () => {
  const config = readFileSync(new URL('../../../server/config.example.php', import.meta.url), 'utf8');
  const planAmount = (plan: string): number => {
    const m = new RegExp(String.raw`'${plan}'\s*=>\s*\[\s*'amount_inr'\s*=>\s*([0-9.]+)`).exec(config);
    if (!m) throw new Error(`plan ${plan} not found in config.example.php`);
    return Number(m[1]);
  };
  const shown = (label: string) => Number(label.replace(/[^0-9]/g, ''));

  it.each(['monthly', 'lifetime'] as const)('%s', (plan) => {
    expect(shown(DISPLAY_PRICES[plan])).toBe(planAmount(plan));
  });
});
