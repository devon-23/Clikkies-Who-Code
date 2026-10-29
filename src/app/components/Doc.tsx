import type { ReactNode } from 'react';
import { BENEDICTION, LETTERHEAD } from '../../shared/dema.ts';
import { Seal } from './Seal.tsx';

// A document Dema issued. Letterhead, seal, title and form number at the top;
// the benediction at the foot. Everything between is the caller's.

interface DocProps {
  title: ReactNode;
  form?: string;
  lit?: number;
  stamp?: string;
  benediction?: boolean;
  className?: string;
  /** heading level for the title; documents inside a page are usually h2 */
  as?: 'h1' | 'h2';
  children: ReactNode;
}

export function Doc({ title, form, lit, stamp, benediction = true, className = '', as: H = 'h1', children }: DocProps) {
  return (
    <article className={`doc ${className}`.trim()}>
      {stamp && <span className="doc__stamp" aria-hidden="true">{stamp}</span>}
      <p className="doc__letterhead">{LETTERHEAD}</p>
      <div className="doc__seal"><Seal lit={lit} /></div>
      <H className="doc__title">{title}</H>
      {form && <p className="doc__form">{form}</p>}
      <hr className="doc__rule" />
      {children}
      {benediction && <p className="doc__benediction">{BENEDICTION}</p>}
    </article>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  strong?: boolean;
  blank?: boolean;
}

// a value written on the dotted line, with its label printed underneath
export function Field({ label, children, strong, blank }: FieldProps) {
  const cls = ['field', strong && 'field--strong', blank && 'field--blank'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span className="field__value">{children}</span>
      <span className="field__label">{label}</span>
    </div>
  );
}

// blacked out. `reveal` is what a screen reader hears instead
export function Redacted({ length = 8, reveal = 'redacted' }: { length?: number; reveal?: string }) {
  return (
    <>
      <span className="redacted" aria-hidden="true">{'█'.repeat(length)}</span>
      <span className="visually-hidden">{reveal}</span>
    </>
  );
}

export function Restricted({ code = 'DMA-8325', children }: { code?: string; children?: ReactNode }) {
  return (
    <div className="restricted" role="note">
      <span className="restricted__code">{code}</span>
      <span className="restricted__shout">Restricted record</span>
      {children && <span className="restricted__small">{children}</span>}
    </div>
  );
}
