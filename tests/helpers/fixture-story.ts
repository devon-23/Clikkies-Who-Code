// A small made-up story that exercises every part of the engine: each answer
// kind, near misses, optional missions, a cross-mission prerequisite, an
// external clue with a fallback, a hidden code, and one mission per campaign
// so a whole cycle can be completed. Test-only -- not real content.

const hints = (topic: string) => [
  { level: 'nudge', text: `Look at the ${topic}.` },
  { level: 'direction', text: `Compare the ${topic} with the other record.` },
  { level: 'technique', text: `Read the ${topic} as a date, not a number.` },
];

const ev = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `ev-${n}`,
  fileNo: `D-${String(n).padStart(4, '0')}`,
  title: `Record ${n}`,
  kind: 'document',
  campaign: 'blurryface',
  classification: 'restricted',
  source: 'District registry',
  summary: `Summary of record ${n}.`,
  body: [{ type: 'paragraph', text: `CANARY-BODY-${n}` }],
  ...extra,
});

const simple = (id: string, campaign: string, accepted: string) => ({
  id, campaign, order: 1,
  title: `${id} title`, subtitle: 'sub', difficulty: 'Test',
  intro: [`${id} intro`], objectives: ['Find it'],
  interaction: { component: 'document', props: {} },
  answer: { kind: 'text', label: 'Answer', accepted: [accepted] },
  hints: hints('thing').slice(0, 1),
  success: [`${id} solved`],
});

export const fixtureStory = {
  missions: [
    {
      id: 'bf-letters', campaign: 'blurryface', order: 1,
      title: 'Letters From Nowhere', subtitle: 'A recovered letter', difficulty: 'Beginner',
      intro: ['CANARY-INTRO-1'], objectives: ['Read the letter', 'Name the sender'],
      interaction: { component: 'document', props: { evidence: 'ev-1' } },
      startingEvidence: ['ev-1'],
      answer: {
        kind: 'text', label: 'Who wrote it?', accepted: ['Clancy', 'C. Clancy'],
        nearMisses: [{ accepted: ['Nico'], message: 'That name is on the envelope, not the letter.' }],
      },
      hints: hints('signature'),
      success: ['You have a name.'],
      rewards: { evidence: ['ev-2'] },
    },
    {
      id: 'bf-dates', campaign: 'blurryface', order: 2,
      title: 'The Wrong Date', subtitle: 'Two dates', difficulty: 'Beginner',
      intro: ['CANARY-INTRO-2'], objectives: ['Find both dates'],
      interaction: { component: 'comparison', props: {} },
      answer: {
        kind: 'fields',
        fields: [
          { id: 'first', label: 'First record', accepted: ['026 10MOON 17'], normalize: { ignoreSpaces: true } },
          { id: 'second', label: 'Second record', accepted: ['026 10MOON 19'], normalize: { ignoreSpaces: true } },
        ],
      },
      hints: hints('dates').slice(0, 2),
      success: ['The dates do not agree.'],
      rewards: { evidence: ['ev-3'], achievements: ['date-checker'] },
      external: [{ label: 'A fictional profile', url: 'https://example.com/profile', fallbackEvidence: 'ev-5' }],
    },
    {
      id: 'bf-side', campaign: 'blurryface', order: 3, optional: true,
      title: 'Side File', subtitle: 'Optional', difficulty: 'Beginner',
      intro: ['side'], objectives: ['Pick the two that disagree'],
      interaction: { component: 'comparison', props: {} },
      answer: {
        kind: 'choice', prompt: 'Which two records contradict each other?',
        options: [{ id: 'a', label: 'Census' }, { id: 'b', label: 'Ledger' }, { id: 'c', label: 'Letter' }],
        correct: ['a', 'c'],
      },
      hints: hints('census').slice(0, 1),
      success: ['Spotted.'],
    },
    {
      id: 'bf-finale', campaign: 'blurryface', order: 4, finale: true,
      prerequisites: ['bf-dates'],
      title: 'The First Transmission', subtitle: 'Finale', difficulty: 'Beginner',
      intro: ['CANARY-INTRO-FINALE'], objectives: ['Put it together'],
      interaction: { component: 'workspace', props: {} },
      answer: { kind: 'text', label: 'Who are you?', accepted: ['the next one'] },
      hints: hints('pattern'),
      success: ['There were others before you.'],
      rewards: { evidence: ['ev-4'] },
    },
    simple('tr-one', 'trench', 'east is up'),
    simple('si-one', 'scaled-and-icy', 'smile'),
    simple('cl-one', 'clancy', 'red tape'),
    simple('br-one', 'breach', 'nova'),
  ],
  evidence: [
    ev(1, { related: ['ev-2', 'ev-9'] }),
    ev(2, { related: ['ev-1'] }),
    ev(3),
    ev(4),
    ev(5, { title: 'Profile, archived copy' }),
    ev(9, { hidden: true, title: 'The other letter', campaign: 'trench' }),
  ],
  achievements: [
    { id: 'first-record', title: 'Paper trail', description: 'Recover a record.', trigger: { kind: 'evidence-count', count: 1 } },
    { id: 'letters-done', title: 'Correspondent', description: 'Finish Letters.', trigger: { kind: 'mission', mission: 'bf-letters' } },
    { id: 'date-checker', title: 'Date checker', description: 'Granted by bf-dates.', trigger: { kind: 'granted' } },
    { id: 'bf-closed', title: 'Closed', description: 'Close Blurryface.', trigger: { kind: 'campaign', campaign: 'blurryface' } },
    { id: 'hidden-1', title: 'Off the books', description: 'Find a hidden record.', trigger: { kind: 'hidden-count', count: 1 } },
    { id: 'again', title: 'Again', description: 'Begin a second cycle.', secret: true, trigger: { kind: 'cycle', count: 2 } },
  ],
  hiddenCodes: [
    { id: 'other-letter', code: 'Sahlo Folina', evidence: 'ev-9', note: 'test fixture' },
  ],
};
