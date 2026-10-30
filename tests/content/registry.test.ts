import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { story } from '../../content/story/index.ts';
import { ContentError, buildRegistry, type ContentInput } from '../../src/worker/content/registry.ts';
import { fixtureStory } from '../helpers/fixture-story.ts';

const ROOT = join(import.meta.dirname, '../..');

const problems = (input: Partial<ContentInput>): string[] => {
  try {
    buildRegistry({ ...fixtureStory, ...input });
    return [];
  } catch (err) {
    if (err instanceof ContentError) return err.problems;
    throw err;
  }
};

const clone = <T>(v: T): T => structuredClone(v);

describe('story content', () => {
  it('the real story is valid', () => {
    expect(() => buildRegistry(story)).not.toThrow();
  });

  it('the test fixture is valid', () => {
    expect(problems({})).toEqual([]);
  });
});

describe('content validation catches', () => {
  it('a reward naming evidence that does not exist', () => {
    const missions = clone(fixtureStory.missions);
    (missions[0] as { rewards: { evidence: string[] } }).rewards.evidence = ['ev-404'];
    expect(problems({ missions })).toEqual([expect.stringContaining('"ev-404", which does not exist')]);
  });

  it('two records sharing a file number', () => {
    const evidence = clone(fixtureStory.evidence);
    evidence[1]!.fileNo = evidence[0]!.fileNo;
    expect(problems({ evidence })).toEqual([expect.stringContaining('duplicate evidence file number')]);
  });

  it('a prerequisite loop', () => {
    const missions = clone(fixtureStory.missions) as { id: string; prerequisites?: string[] }[];
    missions[0]!.prerequisites = ['bf-finale'];
    expect(problems({ missions: missions as unknown[] }).join('\n')).toContain('prerequisite loop');
  });

  it('hints out of order', () => {
    const missions = clone(fixtureStory.missions) as { hints: { level: string }[] }[];
    missions[0]!.hints = [{ ...missions[0]!.hints[1]! }];
    expect(problems({ missions: missions as unknown[] }).join('\n')).toContain('hint 1 should be "nudge"');
  });

  it('a correct choice that is not one of the options', () => {
    const missions = clone(fixtureStory.missions) as { id: string; answer: { correct?: string[] } }[];
    missions.find((m) => m.id === 'bf-side')!.answer.correct = ['z'];
    expect(problems({ missions: missions as unknown[] }).join('\n')).toContain('"z" is not an option');
  });

  it('a malformed field, with the path to it', () => {
    const missions = clone(fixtureStory.missions) as Record<string, unknown>[];
    missions[0]!.title = '';
    expect(problems({ missions }).join('\n')).toMatch(/mission bf-letters: title/);
  });
});

describe('the content boundary', () => {
  // the browser must never be able to import story content or server code:
  // that is what keeps answers and unreleased story out of the bundle
  it('nothing in src/app imports content/story or src/worker', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) {
          const src = readFileSync(p, 'utf8');
          if (/from ['"][^'"]*(content\/story|\/worker\/)/.test(src)) offenders.push(p.replace(ROOT, ''));
        }
      }
    };
    walk(join(ROOT, 'src/app'));
    expect(offenders).toEqual([]);
  });
});
