// Checks the production build itself: what the browser downloads must not
// contain the development preview, its fake data, or anything that looks
// like a server secret. Runs against dist/, so `npm run build` first --
// CI does. Skipped locally if there is no build.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIENT = join(import.meta.dirname, '../../dist/client');
const built = existsSync(CLIENT);

function clientText(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|css|html)$/.test(entry.name)) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(CLIENT);
  return out.join('\n');
}

describe.skipIf(!built)('production client bundle', () => {
  const text = built ? clientText() : '';

  it('leaves out the development preview', () => {
    expect(text).not.toContain('PreviewSession');
    expect(text).not.toContain('warden@example.com');
    expect(text).not.toContain('/dev/preview');
  });

  it('contains no server-side secrets', () => {
    expect(text).not.toMatch(/DATABASE_URL/);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/service_role|sb_secret_/);
  });

  it('ships the security headers', () => {
    const headers = readFileSync(join(CLIENT, '_headers'), 'utf8');
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("script-src 'self'");
  });
});
