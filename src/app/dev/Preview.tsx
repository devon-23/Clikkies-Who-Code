// DEVELOPMENT ONLY. Never shipped: main.tsx loads this behind
// import.meta.env.DEV, which production builds replace with `false`.
//
//   /dev/preview?as=admin&to=/archive    switch on (as player|admin)
//   /dev/preview?access=needs_profile&to=/intake
//   /dev/preview?conflict=1&to=/notebook  next notebook save hits a conflict
//   /dev/preview/off                      switch off
//
// While on, the whole app runs against a fake session and a fake in-memory
// API, so every real page can be designed and clicked through before
// Supabase exists. Everything here is made up.

import type { Session } from '@supabase/supabase-js';
import { useMemo, type ReactNode } from 'react';
import type {
  AchievementsResponse, AdminOverview, ArchiveResponse, Diagnostics, EvidenceRecord, MeResponse, MissionView,
  NotebookEntry, PlayerDetail, PlayerRow, ProgressResponse,
} from '../../shared/api.ts';
import { SessionContext, type SessionState } from '../auth/session.tsx';

const KEY = 'cwc:preview';

interface Settings {
  as: 'player' | 'admin';
  access: MeResponse['access'];
  reason: 'not_invited' | 'revoked' | null;
  conflict: boolean;
}

export function activate(): ((p: { children: ReactNode }) => ReactNode) | null {
  const url = new URL(window.location.href);
  if (url.pathname === '/dev/preview/off') {
    sessionStorage.removeItem(KEY);
    window.history.replaceState(null, '', '/');
    return null;
  }
  if (url.pathname.startsWith('/dev/preview')) {
    const q = url.searchParams;
    const settings: Settings = {
      as: q.get('as') === 'admin' ? 'admin' : 'player',
      access: (q.get('access') as Settings['access']) ?? 'granted',
      reason: (q.get('reason') as Settings['reason']) ?? null,
      conflict: q.get('conflict') === '1',
    };
    sessionStorage.setItem(KEY, JSON.stringify(settings));
    window.history.replaceState(null, '', q.get('to') ?? '/hub');
  }
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  installMockApi(settings);
  return function PreviewProvider({ children }) {
    return <PreviewSession settings={settings}>{children}</PreviewSession>;
  };
}

function PreviewSession({ settings, children }: { settings: Settings; children: ReactNode }) {
  const value = useMemo<SessionState>(() => ({
    session: { user: { id: 'preview-user' } } as unknown as Session,
    me: {
      id: 'b5c1e7a0-preview',
      email: 'resident@example.com',
      access: settings.access,
      reason: settings.access === 'denied' ? settings.reason ?? 'not_invited' : null,
      profile: settings.access === 'needs_profile' ? null : {
        username: settings.as === 'admin' ? 'warden' : 'resident_42',
        role: settings.as,
        introSeenAt: '2026-10-28T03:14:00Z',
        createdAt: '2026-10-28T03:14:00Z',
      },
    },
    meError: null,
    recovering: false,
    refreshMe: async () => {},
    signOut: async () => { window.location.href = '/dev/preview/off'; },
  }), [settings]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      <a href="/dev/preview/off" className="preview-badge">Preview · fake data · exit</a>
    </SessionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// the fake API

const at = '2026-10-28T03:14:00Z';
const later = '2026-10-29T01:02:00Z';

const records: EvidenceRecord[] = [
  {
    id: 'census-d4', fileNo: 'D-0001', title: 'District four census, page 12', kind: 'document', campaign: 'blurryface',
    classification: 'public', source: 'Office of the Census, District 4', dated: '2026-03-17', hidden: false, discoveredAt: at,
    summary: 'An ordinary census page. Eleven residents at the address. The twelfth line has been scraped.',
    body: [
      { type: 'heading', text: 'Household return · Sector 4, block 9' },
      { type: 'fields', rows: [['Residents listed', '11'], ['Residents counted', '12'], ['Enumerator', 'Unsigned']] },
      { type: 'paragraph', text: 'Line twelve is present in the ledger but absent from the summary. The ink has been lifted, not crossed out.' },
      { type: 'redacted', length: 24 },
    ],
    related: [{ id: 'letter-1', fileNo: 'D-0003', title: 'A letter with no return address' }],
    relatedMissing: 1,
  },
  {
    id: 'letter-1', fileNo: 'D-0003', title: 'A letter with no return address', kind: 'letter', campaign: 'blurryface',
    classification: 'restricted', source: 'Recovered from a drainage culvert, east wall', dated: null, hidden: false, discoveredAt: later,
    summary: 'Handwritten. Addressed to nobody. It knows things about your street it should not.',
    body: [
      { type: 'paragraph', text: 'If you have found this, you live where I used to. Check the census. Count the lines, not the total.' },
      { type: 'quote', text: 'The wall is only as tall as the record says it is.', attribution: 'unsigned' },
    ],
    related: [{ id: 'census-d4', fileNo: 'D-0001', title: 'District four census, page 12' }],
    relatedMissing: 0,
  },
  {
    id: 'other-letter', fileNo: 'T-0009', title: 'The other letter', kind: 'letter', campaign: 'trench',
    classification: 'classified', source: 'Origin unknown', dated: null, hidden: true, discoveredAt: later,
    summary: 'Not issued by any investigation. Somebody wanted this found by someone who was looking.',
    body: [{ type: 'preformatted', text: 'EAST IS UP\n\n||-//' }],
    related: [], relatedMissing: 0,
  },
];

const summary = ({ body: _b, related: _r, relatedMissing: _m, ...s }: EvidenceRecord) => s;

const missionView: MissionView = {
  id: 'name-in-the-source', campaign: 'blurryface', order: 2, title: 'A Name in the Source', subtitle: 'The page says one thing. Its source says another.',
  difficulty: 'Beginner',
  intro: [
    'The district notice board went online last spring. Every resident is listed. Every resident, the notice says, is accounted for.',
    'A web page is two documents: the one you see, and the one your browser reads. Somebody has left something in the second.',
  ],
  objectives: ['Open the district notice page', 'Read its source', 'Name the resident the page hides'],
  interaction: { component: 'website', props: {} },
  answerForm: { kind: 'text', label: 'The hidden resident’s name' },
  status: 'in_progress', state: {}, version: 1,
  hints: [{ level: 'nudge', text: 'What you see on a page is not everything the page contains.' }],
  hintsTotal: 3,
  evidence: [summary(records[0]!)],
  success: null,
  mobile: 'limited', mobileNote: 'Reading page source is easier with a keyboard.',
  external: [{ label: 'A district resident’s public profile (fictional)', url: 'https://example.com', fallback: null }],
};

const progress: ProgressResponse = {
  run: { number: 1, status: 'active', startedAt: at, completedAt: null, missionsCompleted: 1 },
  history: [],
  canStartNewCycle: false,
  evidenceCount: records.length,
  achievementCount: 1,
  current: { missionId: missionView.id, title: missionView.title, campaign: 'blurryface', status: 'in_progress' },
  campaigns: [
    {
      id: 'blurryface', unlocked: true, complete: false, required: 4, completed: 1,
      missions: [
        { id: 'letters', order: 1, title: 'Letters From Nowhere', subtitle: '', status: 'completed', completedEver: true, optional: false, finale: false },
        { id: missionView.id, order: 2, title: missionView.title, subtitle: '', status: 'in_progress', completedEver: false, optional: false, finale: false },
        { id: 'side', order: 3, title: 'The Unlisted Citizen', subtitle: '', status: 'available', completedEver: false, optional: true, finale: false },
        { id: 'x1', order: 4, title: null, subtitle: null, status: 'locked', completedEver: false, optional: false, finale: false },
        { id: 'x2', order: 5, title: null, subtitle: null, status: 'locked', completedEver: false, optional: false, finale: true },
      ],
    },
    ...(['trench', 'scaled-and-icy', 'clancy', 'breach'] as const).map((id) => ({ id, unlocked: false, complete: false, required: 0, completed: 0, missions: [] })),
  ],
};

const archive: ArchiveResponse = {
  records: records.map(summary),
  slots: [
    { fileNo: 'D-0002', campaign: 'blurryface', classification: 'restricted' },
    { fileNo: 'D-0004', campaign: 'blurryface', classification: 'public' },
    { fileNo: 'D-0005', campaign: 'blurryface', classification: 'classified' },
    { fileNo: 'D-0006', campaign: 'blurryface', classification: 'restricted' },
    { fileNo: 'T-0001', campaign: 'trench', classification: 'restricted' },
  ],
  hiddenFound: 1,
};

const achievements: AchievementsResponse = {
  achievements: [
    { id: 'first-record', title: 'Paper trail', description: 'Recover your first record.', secret: false, awardedAt: at },
    { id: 'blurryface-closed', title: 'The city that never lets you leave', description: 'Close the Blurryface campaign.', secret: false, awardedAt: null },
  ],
  secretRemaining: 1,
};

const notebook: NotebookEntry[] = [
  { id: '0b6c7a7e-1111-4c1d-9a55-000000000001', title: 'The twelfth line', body: 'Census says 11. Ledger says 12. Who was scraped off?\n\nThe letter says count the lines.', evidence: ['census-d4', 'letter-1'], version: 3, createdAt: at, updatedAt: later },
  { id: '0b6c7a7e-1111-4c1d-9a55-000000000002', title: '', body: 'bearing 090 = east?', evidence: [], version: 1, createdAt: at, updatedAt: at },
];

const players: PlayerRow[] = [
  { username: 'warden', role: 'admin', cycle: 1, missionsCompleted: 2, evidence: 4, lastActive: later, createdAt: at },
  { username: 'resident_42', role: 'player', cycle: 1, missionsCompleted: 1, evidence: 3, lastActive: at, createdAt: at },
  { username: 'vulture', role: 'player', cycle: 2, missionsCompleted: 6, evidence: 11, lastActive: null, createdAt: at },
];

const overview: AdminOverview = {
  registrationOpen: false,
  counts: { profiles: 3, admins: 1, activeTesters: 2, invited: 2, revoked: 1 },
  testers: [
    { email: 'warden@example.com', status: 'active', source: 'bootstrap', note: 'first administrator', username: 'warden', createdAt: at, revokedAt: null },
    { email: 'resident@example.com', status: 'active', source: 'invite', note: 'from the OSU show', username: 'resident_42', createdAt: at, revokedAt: null },
    { email: 'friend@example.com', status: 'invited', source: 'invite', note: null, username: null, createdAt: at, revokedAt: null },
    { email: 'gone@example.com', status: 'revoked', source: 'invite', note: null, username: 'gone', createdAt: at, revokedAt: later },
  ],
  audit: [
    { id: 2, action: 'tester.revoke', target: 'gone@example.com', actor: 'warden', createdAt: later },
    { id: 1, action: 'registration.close', target: null, actor: 'warden', createdAt: at },
  ],
};

const diagnostics: Diagnostics = {
  missions: [
    { missionId: 'letters', title: 'Letters From Nowhere', attempts: 14, correct: 3, players: 3, hintUse: [2, 1, 0], topWrong: [{ guess: 'nico', count: 5 }, { guess: 'torchbearer', count: 2 }] },
    { missionId: missionView.id, title: missionView.title, attempts: 4, correct: 0, players: 2, hintUse: [1, 0, 0], topWrong: [{ guess: 'keons', count: 3 }] },
    { missionId: 'archive-terminal', title: 'Archive terminal (hidden codes)', attempts: 9, correct: 1, players: 2, hintUse: [0, 0, 0], topWrong: [{ guess: 'east is up', count: 4 }] },
  ],
  errors: [],
  orphans: [],
};

type Handler = (body: unknown, match: RegExpMatchArray) => { status?: number; json?: unknown };

function installMockApi(settings: Settings) {
  let conflictArmed = settings.conflict;
  let hints = missionView.hints.length;

  const routes: [string, RegExp, Handler][] = [
    ['GET', /^\/api\/progress$/, () => ({ json: progress })],
    ['GET', /^\/api\/achievements$/, () => ({ json: achievements })],
    ['GET', /^\/api\/archive$/, () => ({ json: archive })],
    ['GET', /^\/api\/archive\/([^/]+)$/, (_b, m) => {
      const r = records.find((x) => x.id === decodeURIComponent(m[1]!));
      return r ? { json: r } : { status: 404, json: { error: { code: 'not_found', message: 'No such record on file.' } } };
    }],
    ['POST', /^\/api\/archive\/discover$/, (b) => ((b as { code: string }).code.toLowerCase().includes('sahlo')
      ? { json: { found: true, alreadyHad: true, record: summary(records[2]!), achievements: [] } }
      : { json: { found: false, message: 'Nothing on file under that.' } })],
    ['POST', /^\/api\/missions\/[^/]+\/start$/, () => ({ json: { ...missionView, hints: [...MORE_HINTS].slice(0, hints) } })],
    ['GET', /^\/api\/missions\/[^/]+$/, () => ({ json: { ...missionView, hints: [...MORE_HINTS].slice(0, hints) } })],
    ['POST', /^\/api\/missions\/[^/]+\/hints$/, () => {
      hints = Math.min(hints + 1, 3);
      return { json: { hints: MORE_HINTS.slice(0, hints) } };
    }],
    ['POST', /^\/api\/missions\/[^/]+\/submit$/, (b) => {
      const a = String((b as { answer: unknown }).answer).trim().toLowerCase();
      if (a !== 'clancy') return { json: { correct: false, message: a === 'keons' ? 'That name is on the page. The one you want is not.' : 'That does not match the record. Check your evidence and try again.' } };
      return { json: {
        correct: true, replay: false,
        success: ['The page lists eleven residents. Its source lists twelve. The twelfth is commented out, but not deleted.', 'Someone called Clancy lived on your street. The city removed the name from what you see — and forgot what the browser reads.'],
        rewards: { evidence: [summary(records[1]!)], achievements: [{ id: 'source', title: 'View source', description: 'Read what the browser reads.', secret: false, awardedAt: later }] },
        unlocked: { missions: [{ id: 'x1', title: 'The Unlisted Citizen' }], campaigns: [] },
      } };
    }],
    ['GET', /^\/api\/notebook$/, () => ({ json: { entries: [...notebook].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) } })],
    ['POST', /^\/api\/notebook$/, (b) => {
      const d = b as Pick<NotebookEntry, 'title' | 'body' | 'evidence'>;
      const now = new Date().toISOString();
      const entry: NotebookEntry = { id: crypto.randomUUID(), title: d.title ?? '', body: d.body ?? '', evidence: d.evidence ?? [], version: 1, createdAt: now, updatedAt: now };
      notebook.unshift(entry);
      return { status: 201, json: entry };
    }],
    ['PUT', /^\/api\/notebook\/([^/]+)$/, (b, m) => {
      const d = b as NotebookEntry;
      const entry = notebook.find((e) => e.id === m[1]);
      if (!entry) return { status: 404, json: { error: { code: 'not_found', message: 'No such entry.' } } };
      if (conflictArmed) {
        // pretend another device saved first
        conflictArmed = false;
        Object.assign(entry, { body: `${entry.body}\n\n(edited on a phone)`, version: entry.version + 1, updatedAt: new Date().toISOString() });
        return { status: 409, json: { error: { code: 'conflict', message: 'This entry was changed on another device.' }, current: { ...entry } } };
      }
      if (d.version !== entry.version) return { status: 409, json: { error: { code: 'conflict', message: 'Changed elsewhere.' }, current: { ...entry } } };
      Object.assign(entry, { title: d.title, body: d.body, evidence: d.evidence, version: entry.version + 1, updatedAt: new Date().toISOString() });
      return { json: { ...entry } };
    }],
    ['DELETE', /^\/api\/notebook\/([^/]+)$/, (_b, m) => {
      notebook.splice(notebook.findIndex((e) => e.id === m[1]), 1);
      return { status: 204 };
    }],
    ['GET', /^\/api\/admin\/overview$/, () => ({ json: overview })],
    ['GET', /^\/api\/admin\/players$/, () => ({ json: { players } })],
    ['GET', /^\/api\/admin\/players\/([^/]+)$/, (_b, m) => ({ json: { username: decodeURIComponent(m[1]!), role: 'player', progress, hintsUsed: [{ missionId: missionView.id, levels: 1 }] } satisfies PlayerDetail })],
    ['GET', /^\/api\/admin\/diagnostics$/, () => ({ json: diagnostics })],
    ['GET', /^\/api\/public-config$/, () => ({ json: { registrationOpen: false, databaseConfigured: true } })],
  ];

  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (!url.pathname.startsWith('/api/')) return real(input, init);
    for (const [m, re, handler] of routes) {
      const match = url.pathname.match(re);
      if (m === method && match) {
        await new Promise((r) => setTimeout(r, 250)); // feel like a network
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        const { status = 200, json } = handler(body, match);
        return new Response(status === 204 ? null : JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: `preview has no mock for ${method} ${url.pathname}` } }), { status: 404 });
  };
}

const MORE_HINTS: MissionView['hints'] = [
  { level: 'nudge', text: 'What you see on a page is not everything the page contains.' },
  { level: 'direction', text: 'Your browser can show you the page’s source. Look for text that is there but never displayed.' },
  { level: 'technique', text: 'In HTML, anything between <!-- and --> is a comment: kept in the file, never shown on screen.' },
];
