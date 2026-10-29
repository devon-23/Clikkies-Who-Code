// The city seen from above: nine walled sections, one per bishop, around an
// open centre. Drawn from geometry rather than traced from anything, ported
// from cityMarkDrawn in the FPE archive. Section one sits at twelve o'clock.

const SEGMENTS = 9;

function block(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const at = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M${at(r1, a0)}A${r1} ${r1} 0 0 1 ${at(r1, a1)}L${at(r0, a1)}A${r0} ${r0} 0 0 0 ${at(r0, a0)}Z`;
}

/** Path data for each of the nine wall sections, on a 100×100 canvas. */
export function sealSegments(): string[] {
  const step = (Math.PI * 2) / SEGMENTS;
  const gap = step * 0.1;
  // -step/2 centres section one on twelve o'clock
  const origin = -Math.PI / 2 - step / 2;
  return Array.from({ length: SEGMENTS }, (_, i) =>
    block(50, 50, 25, 44, i * step + origin + gap / 2, (i + 1) * step + origin - gap / 2));
}
