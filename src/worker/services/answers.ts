// Checking a submission against a mission's answer. Server-only: the accepted
// answers never leave the Worker.
//
// Comparison is on normalised text, so harmless differences (case, extra
// spaces, a trailing full stop, curly quotes) never cost a player anything.

import type { AnswerForm } from '../../shared/api.ts';
import type { AnswerConfig } from '../content/schema.ts';

export interface NormalizeOptions {
  caseSensitive: boolean;
  ignorePunctuation: boolean;
  ignoreSpaces: boolean;
}

export function normalize(input: string, o: NormalizeOptions): string {
  let s = input.normalize('NFKC').replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"');
  if (!o.caseSensitive) s = s.toLowerCase();
  // letters and numbers in any script survive; everything else is a space
  if (o.ignorePunctuation) s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = o.ignoreSpaces ? s.replace(/\s+/g, '') : s.replace(/\s+/g, ' ').trim();
  return s;
}

const matches = (input: string, accepted: string[], o: NormalizeOptions) => {
  const n = normalize(input, o);
  return n.length > 0 && accepted.some((a) => normalize(a, o) === n);
};

export type Submission = string | Record<string, string> | string[];

export interface CheckResult {
  correct: boolean;
  message: string;
  /** what to keep for the admin's "common wrong answers" view. never set when correct */
  guess: string | null;
}

const WRONG = 'That does not match the record. Check your evidence and try again.';

export function checkAnswer(config: AnswerConfig, submission: Submission): CheckResult {
  switch (config.kind) {
    case 'text': {
      if (typeof submission !== 'string') return { correct: false, message: 'Enter one answer.', guess: null };
      if (matches(submission, config.accepted, config.normalize)) return { correct: true, message: '', guess: null };
      const near = config.nearMisses.find((n) => matches(submission, n.accepted, config.normalize));
      return { correct: false, message: near?.message ?? WRONG, guess: clip(normalize(submission, config.normalize)) };
    }

    case 'fields': {
      if (typeof submission !== 'object' || Array.isArray(submission)) {
        return { correct: false, message: 'Fill in every finding.', guess: null };
      }
      const right = config.fields.filter((f) => matches(submission[f.id] ?? '', f.accepted, f.normalize)).length;
      if (right === config.fields.length) return { correct: true, message: '', guess: null };
      const message = config.revealCount
        ? `${right} of ${config.fields.length} findings hold up. Something here does not match the record.`
        : WRONG;
      const guess = config.fields.map((f) => normalize(submission[f.id] ?? '', f.normalize)).join(' | ');
      return { correct: false, message, guess: clip(guess) };
    }

    case 'choice': {
      if (!Array.isArray(submission)) return { correct: false, message: 'Choose from the options.', guess: null };
      const picked = new Set(submission);
      const correct = picked.size === config.correct.length && config.correct.every((c) => picked.has(c));
      return {
        correct,
        message: correct ? '' : WRONG,
        guess: correct ? null : clip([...picked].sort().join(',')),
      };
    }
  }
}

const clip = (s: string) => (s.length > 64 ? `${s.slice(0, 63)}…` : s);

// the public half of an answer config: what the form needs to render, with
// every accepted value stripped out
export function answerForm(config: AnswerConfig): AnswerForm {
  switch (config.kind) {
    case 'text':
      return { kind: 'text', label: config.label, placeholder: config.placeholder };
    case 'fields':
      return { kind: 'fields', fields: config.fields.map((f) => ({ id: f.id, label: f.label, placeholder: f.placeholder })) };
    case 'choice':
      return { kind: 'choice', prompt: config.prompt, options: config.options, multiple: config.correct.length > 1 };
  }
}
