import { sealSegments } from '../../shared/seal.ts';

const SEGMENTS = sealSegments();

interface SealProps {
  /** which bishop's section to light, 0–8. omit for none */
  lit?: number;
  /** light every section */
  all?: boolean;
  className?: string;
  label?: string;
}

export function Seal({ lit, all = false, className = '', label }: SealProps) {
  return (
    <svg
      className={`seal${all ? ' seal--all' : ''} ${className}`.trim()}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle className="seal__ring" cx="50" cy="50" r="19" />
      {SEGMENTS.map((d, i) => (
        <path key={i} className={`seal__wall${i === lit ? ' seal__wall--lit' : ''}`} d={d} />
      ))}
    </svg>
  );
}
