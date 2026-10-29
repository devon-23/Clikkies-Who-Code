// Small pieces of the world both the API and the browser need.

// Section one sits at twelve o'clock and they run clockwise -- the same order
// as the FPE archive's city mark, so the two sites agree about the map.
export const BISHOPS = [
  'LISDEN', 'KEONS', 'REISDRO', 'SACARVER', 'LISTO', 'VETOMO', 'NILLS', 'NICO', 'ANDRE',
] as const;

export type Bishop = (typeof BISHOPS)[number];

// Dates the way the archive writes them: 2026-10-17 -> "026 10MOON 17".
// UTC throughout, so a record reads the same in every timezone.
export function demaDate(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '--- --MOON --';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear()).slice(-3)} ${p(d.getUTCMonth() + 1)}MOON ${p(d.getUTCDate())}`;
}

// Which district a resident was filed under. Stable for an account forever,
// and spread evenly enough across the nine.
export function districtFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % BISHOPS.length;
}

export const LETTERHEAD = 'SACRED MUNICIPALITY OF DEMA · UNITED VIALISTS';
export const BENEDICTION = 'ALL EARTHLY HONOR UNTO THE GLORIOUS GONE';
