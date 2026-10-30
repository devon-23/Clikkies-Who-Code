import { describe, expect, it } from 'vitest';
import { answerForm, checkAnswer, normalize } from '../../src/worker/services/answers.ts';
import { answerSchema } from '../../src/worker/content/schema.ts';

const defaults = { caseSensitive: false, ignorePunctuation: true, ignoreSpaces: false };

describe('normalize', () => {
  it('folds case, punctuation, curly quotes and extra spaces', () => {
    expect(normalize('  East,  is   UP! ', defaults)).toBe('east is up');
    expect(normalize('Clancy’s letter', defaults)).toBe('clancy s letter');
    expect(normalize('Ｃｌａｎｃｙ', defaults)).toBe('clancy'); // full-width letters
  });

  it('can ignore spaces entirely, for codes', () => {
    expect(normalize('026 10 MOON 17', { ...defaults, ignoreSpaces: true })).toBe('02610moon17');
  });

  it('can keep case and punctuation when they matter', () => {
    expect(normalize('|-/', { caseSensitive: true, ignorePunctuation: false, ignoreSpaces: false })).toBe('|-/');
  });
});

describe('checkAnswer', () => {
  const text = answerSchema.parse({ kind: 'text', label: 'x', accepted: ['east is up'] });

  it('never accepts an empty answer, even when punctuation is stripped to nothing', () => {
    expect(checkAnswer(text, '').correct).toBe(false);
    expect(checkAnswer(text, '?!').correct).toBe(false);
  });

  it('rejects the wrong shape of submission plainly', () => {
    expect(checkAnswer(text, ['east']).message).toBe('Enter one answer.');
  });

  it('strips accepted values from the public form', () => {
    const fields = answerSchema.parse({
      kind: 'fields',
      fields: [{ id: 'a', label: 'A', accepted: ['secret-a'] }, { id: 'b', label: 'B', accepted: ['secret-b'] }],
    });
    expect(JSON.stringify(answerForm(fields))).not.toContain('secret');
    const choice = answerSchema.parse({
      kind: 'choice', prompt: 'p', options: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], correct: ['y'],
    });
    expect(answerForm(choice)).toEqual({ kind: 'choice', prompt: 'p', options: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], multiple: false });
  });
});
