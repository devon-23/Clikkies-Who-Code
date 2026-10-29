import { describe, expect, it } from 'vitest';
import { BISHOPS, demaDate, districtFor } from '../../src/shared/dema.ts';
import { sealSegments } from '../../src/shared/seal.ts';
import { usernameSchema } from '../../src/shared/api.ts';

describe('demaDate', () => {
  it('writes dates the way the archive does', () => {
    expect(demaDate('2026-10-17T00:00:00Z')).toBe('026 10MOON 17');
    expect(demaDate(new Date('2031-01-05T23:59:00Z'))).toBe('031 01MOON 05');
  });

  it('uses UTC, so a record reads the same everywhere', () => {
    expect(demaDate('2026-10-17T23:30:00-05:00')).toBe('026 10MOON 18');
  });

  it('marks an unreadable date rather than throwing', () => {
    expect(demaDate('not a date')).toBe('--- --MOON --');
  });
});

describe('districtFor', () => {
  it('is stable for an account', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(districtFor(id)).toBe(districtFor(id));
  });

  it('always lands on one of the nine bishops, and uses all nine', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const d = districtFor(crypto.randomUUID());
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(BISHOPS.length);
      seen.add(d);
    }
    expect(seen.size).toBe(9);
  });
});

describe('seal', () => {
  it('draws nine wall sections', () => {
    expect(sealSegments()).toHaveLength(9);
  });
});

describe('usernameSchema', () => {
  it('trims and accepts ordinary handles', () => {
    expect(usernameSchema.parse('  resident_42 ')).toBe('resident_42');
  });
});
