// Regenerates public/favicon.svg from the same seal geometry the app draws.
// Run with: node scripts/make-favicon.ts
import { writeFileSync } from 'node:fs';
import { sealSegments } from '../src/shared/seal.ts';

const paths = sealSegments().map((d) => `<path d="${d}"/>`).join('');
writeFileSync(
  new URL('../public/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#0b0b0a"/>`
  + `<circle cx="50" cy="50" r="19" fill="none" stroke="#d24a36" stroke-width="2.5" opacity=".55"/>`
  + `<g fill="#d24a36">${paths}</g></svg>\n`,
);
