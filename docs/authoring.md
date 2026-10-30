# Writing story content

Missions, evidence, achievements and hidden codes live in `content/story/`.
They are TypeScript files you edit in VS Code and commit like any other code.

**Story content is server-only.** It is compiled into the Worker and reaches
the browser one unlocked piece at a time, through the API. Answers, hints,
locked missions and undiscovered records are never in the JavaScript a player
downloads. Two tests guard this: one fails if anything in `src/app` imports
`content/story`, and one scans the production bundle.

`content/campaigns.ts` is the exception: the five campaign cards are public.

## Checking your work

```bash
npm run content:check     # every problem at once, with the path to it
npm test                  # includes the same validation
```

The Worker runs the same validation when it starts. Broken content fails the
deploy instead of failing a player halfway through a mission.

## A mission

```ts
{
  id: 'bf-name-in-source',          // lowercase-kebab-case, unique, never renamed once players have it
  campaign: 'blurryface',
  order: 4,                          // position within the campaign
  title: 'A Name in the Source',
  subtitle: 'The page says one thing. Its source says another.',
  difficulty: 'Beginner',
  intro: ['Paragraph one.', 'Paragraph two.'],
  objectives: ['Open the notice page', 'Read its source', 'Name the hidden resident'],

  // optional: missions that must be closed first, in this cycle.
  // Leave it out to mean "the previous mission in this campaign".
  prerequisites: ['bf-wrong-date'],

  // which interface it opens in, and that interface's settings.
  // PUBLIC: never put an answer in props.
  interaction: { component: 'website', props: { page: 'district-notices' } },

  startingEvidence: ['d-notice-page'],          // handed over when the mission is opened

  answer: { /* see below */ },

  hints: [                                       // 1–3, in this order
    { level: 'nudge', text: 'Point at where to look.' },
    { level: 'direction', text: 'Name the method or the clue.' },
    { level: 'technique', text: 'Teach the technique. Never the answer.' },
  ],

  success: ['What the player learns.', 'What it means.'],
  rewards: { evidence: ['d-twelfth-line'], achievements: ['view-source'] },

  optional: false,       // optional missions do not block closing the campaign
  finale: false,
  mobile: 'limited',     // 'full' | 'limited' | 'desktop-only'
  mobileNote: 'Reading source is easier with a keyboard.',

  // clues on real platforms, with an in-site copy for when the platform fails
  external: [{ label: 'A resident’s profile (fictional)', url: 'https://…', fallbackEvidence: 'd-profile-copy' }],
}
```

### Answers

Comparison is always on normalised text. By default case, surrounding and
repeated spaces, and punctuation never matter.

**One answer:**

```ts
answer: {
  kind: 'text',
  label: 'The hidden resident’s name',
  accepted: ['Clancy', 'C. Clancy'],             // every fair variant
  normalize: { ignoreSpaces: false },            // optional; see below
  nearMisses: [                                  // optional
    { accepted: ['Keons'], message: 'That name is on the page. The one you want is not.' },
  ],
}
```

**Several findings at once** (good for finales):

```ts
answer: {
  kind: 'fields',
  fields: [
    { id: 'first', label: 'Date on the census', accepted: ['026 03MOON 17'], normalize: { ignoreSpaces: true } },
    { id: 'second', label: 'Date on the ledger', accepted: ['026 03MOON 19'], normalize: { ignoreSpaces: true } },
  ],
  revealCount: true,     // "1 of 2 findings hold up" -- never says which
}
```

**Pick the right options:**

```ts
answer: {
  kind: 'choice',
  prompt: 'Which two records contradict each other?',
  options: [{ id: 'census', label: 'The census' }, { id: 'ledger', label: 'The ledger' }, { id: 'letter', label: 'The letter' }],
  correct: ['census', 'letter'],
}
```

`normalize` options, when the defaults are wrong for an answer:
`caseSensitive` (default false), `ignorePunctuation` (default true; set false
when symbols *are* the answer, like `|-/`), and `ignoreSpaces` (default false;
set true for codes and dates).

**Wrong answers players actually type** show up in **/admin → Diagnostics**
for 30 days. If a reasonable answer keeps appearing, add it to `accepted`.

## An evidence record

```ts
{
  id: 'd-twelfth-line',
  fileNo: 'D-0012',              // unique; shown on the empty slot before it is found
  title: 'District four census, page 12',
  kind: 'document',              // letter, transmission, image, file, profile, map, transcript, document, message, note
  campaign: 'blurryface',
  classification: 'restricted',  // public, restricted, classified
  source: 'Office of the Census, District 4',
  dated: '2026-03-17',           // optional, shown as a Dema date
  summary: 'One or two lines, shown in lists and the archivist panel.',
  body: [
    { type: 'heading', text: 'Household return' },
    { type: 'fields', rows: [['Residents listed', '11'], ['Residents counted', '12']] },
    { type: 'paragraph', text: '…' },
    { type: 'redacted', length: 24 },
    { type: 'preformatted', text: 'monospace, line breaks kept' },
    { type: 'quote', text: '…', attribution: 'unsigned' },
  ],
  related: ['d-letter-1'],       // cross-references; players see only the ones they have found
  hidden: false,                 // true: part of the optional ARG. Leaves no empty slot until found
}
```

Evidence belongs to the account forever: through replays and new cycles. A
record found early (from a hidden code, say) is recognised by its mission
later rather than handed out twice.

## A hidden code

Typed at the archive's query terminal. Every one must also be written up in
`docs/content-map.md`.

```ts
{ id: 'other-letter', code: 'Sahlo Folina', evidence: 't-other-letter', note: 'see content-map.md#other-letter' }
```

## An achievement

```ts
{ id: 'view-source', title: 'View source', description: 'Read what the browser reads.', trigger: { kind: 'granted' } }
```

Triggers: `mission` (closed in any cycle), `campaign` (closed),
`evidence-count`, `hidden-count`, `cycle` (reached cycle n), and `granted`
(named by a mission's `rewards.achievements`). `secret: true` hides the name
until earned. There is deliberately no trigger that can depend on hints.

## Rules that keep it fair

- Every reveal must rest on evidence the player could have found.
- Hints teach a method; they never contain the answer.
- Nothing optional may be needed to finish the main story.
- Don't rename an `id` once real players have it. If you must, the admin
  **Diagnostics → Content drift** panel shows the rows left pointing at the old one.
