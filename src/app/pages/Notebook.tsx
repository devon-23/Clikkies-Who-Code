import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  NOTEBOOK_BODY_MAX, NOTEBOOK_TITLE_MAX,
  type ArchiveResponse, type EvidenceSummary, type NotebookEntry,
} from '../../shared/api.ts';
import { demaDate } from '../../shared/dema.ts';
import { LinkFailed, Linking } from '../components/States.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { SAVE_LABEL, useAutosave } from '../lib/useAutosave.ts';
import { useApi } from '../lib/useApi.ts';

// The investigator's notebook. The player's own words, not a Dema document,
// so it is not set on Dema paper: it is the one place in the machine that is
// theirs. Saves itself a moment after typing stops, says so only once the
// server confirms, and never silently overwrites an edit from another device.

interface Draft {
  title: string;
  body: string;
  evidence: string[];
}

export function Notebook() {
  const list = useApi<{ entries: NotebookEntry[] }>('/notebook');
  const archive = useApi<ArchiveResponse>('/archive');
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = params.get('entry');
  const linkRequest = params.get('link');
  const records = archive.data?.records ?? [];
  const entries = list.data?.entries ?? [];
  const current = entries.find((e) => e.id === selected) ?? null;

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('entry', id); else next.delete('entry');
    next.delete('link');
    setParams(next);
  };

  const replace = useCallback((entry: NotebookEntry) => {
    list.setData((d) => d && { entries: [entry, ...d.entries.filter((e) => e.id !== entry.id)] });
  }, [list]);

  const create = async (evidence: string[] = []) => {
    setBusy(true);
    setError(null);
    try {
      const entry = await api<NotebookEntry>('/notebook', { method: 'POST', body: { title: '', body: '', evidence } });
      replace(entry);
      select(entry.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: NotebookEntry) => {
    if (!window.confirm(`Delete “${entry.title || 'Untitled'}”? This cannot be undone.`)) return;
    try {
      await api(`/notebook/${entry.id}`, { method: 'DELETE' });
      list.setData((d) => d && { entries: d.entries.filter((e) => e.id !== entry.id) });
      select(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (list.error && !list.data) return <LinkFailed message={list.error} onRetry={() => void list.reload()} />;
  if (!list.data) return <Linking label="Opening notebook" />;

  const linkRecord = linkRequest ? records.find((r) => r.id === linkRequest) : undefined;

  return (
    <div className="notebook" data-editing={current ? 'true' : undefined}>
      <header className="page-head notebook__head">
        <p className="kicker"><span className="tape">Yours</span> Not part of any record</p>
        <h1 className="page-head__title">Notebook</h1>
        <p className="page-head__lede">
          Theories, connections, things that do not add up. Nobody else can read this — not other players, not the
          administrator. Nothing here is needed to finish the story.
        </p>
      </header>

      {linkRecord && (
        <div className="alert alert--ok notebook__link">
          Start a note linked to <b>{linkRecord.fileNo} {linkRecord.title}</b>?{' '}
          <button type="button" className="button button--small" disabled={busy} onClick={() => void create([linkRecord.id])}>Start note</button>
        </div>
      )}
      {error && <p className="alert" role="alert">{error}</p>}

      <div className="notebook__grid">
        <nav className="notebook__list" aria-label="Entries">
          <button type="button" className="button button--primary button--block" disabled={busy} onClick={() => void create()}>New entry</button>
          {entries.length === 0 ? (
            <p className="faint notebook__none">No entries yet.</p>
          ) : (
            <ul>
              {entries.map((e) => (
                <li key={e.id}>
                  <button type="button" className="notebook__item" aria-current={e.id === selected ? 'true' : undefined} onClick={() => select(e.id)}>
                    <span className="notebook__item-title">{e.title || 'Untitled'}</span>
                    <span className="notebook__item-meta">{demaDate(e.updatedAt)}{e.evidence.length ? ` · ${e.evidence.length} linked` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="notebook__editor">
          {current ? (
            <Editor key={current.id} entry={current} records={records} onSaved={replace} onDelete={() => void remove(current)} onClose={() => select(null)} />
          ) : (
            <p className="notebook__blank faint">{entries.length ? 'Choose an entry, or start a new one.' : 'Start your first entry.'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Editor({ entry, records, onSaved, onDelete, onClose }: {
  entry: NotebookEntry;
  records: EvidenceSummary[];
  onSaved: (e: NotebookEntry) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ title: entry.title, body: entry.body, evidence: entry.evidence });
  // the version this draft is based on. a ref, so a save always sends the latest
  const base = useRef(entry.version);

  const readConflict = useCallback((b: Record<string, unknown>) => b.current as NotebookEntry, []);
  const save = useCallback(async (d: Draft) => {
    const saved = await api<NotebookEntry>(`/notebook/${entry.id}`, { method: 'PUT', body: { ...d, version: base.current } });
    base.current = saved.version;
    onSaved(saved);
    return saved;
  }, [entry.id, onSaved]);

  const autosave = useAutosave<Draft, NotebookEntry>({ save, readConflict });
  const theirs = autosave.conflict as NotebookEntry | null;

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    autosave.change(next);
  };

  // leaving the entry (or the page) saves whatever is pending first
  const latest = useRef(autosave);
  latest.current = autosave;
  useEffect(() => () => {
    if (latest.current.hasPending()) void latest.current.flush();
  }, []);

  const keepMine = async () => {
    if (!theirs) return;
    base.current = theirs.version;
    autosave.resolve();
    autosave.change(draft);
    await autosave.flush();
  };

  const useTheirs = () => {
    if (!theirs) return;
    base.current = theirs.version;
    setDraft({ title: theirs.title, body: theirs.body, evidence: theirs.evidence });
    onSaved(theirs);
    autosave.resolve();
  };

  const linked = useMemo(() => draft.evidence.map((id) => records.find((r) => r.id === id)).filter((r): r is EvidenceSummary => !!r), [draft.evidence, records]);
  const linkable = records.filter((r) => !draft.evidence.includes(r.id));

  return (
    <article className="entry" aria-label={draft.title || 'Untitled entry'}>
      <div className="entry__bar">
        <button type="button" className="button button--small entry__back" onClick={onClose}>← Entries</button>
        <span className={`entry__status entry__status--${autosave.status}`} role="status" aria-live="polite">{SAVE_LABEL[autosave.status]}</span>
        {(autosave.status === 'error' || autosave.status === 'dirty') && (
          <button type="button" className="button button--small" onClick={() => void autosave.flush()}>{autosave.status === 'error' ? 'Retry' : 'Save now'}</button>
        )}
        <button type="button" className="button button--small button--danger" onClick={onDelete}>Delete</button>
      </div>
      {autosave.error && <p className="alert" role="alert">{autosave.error}</p>}

      {theirs && (
        <div className="entry__conflict" role="alert">
          <p><b>This entry was changed on another device</b> ({demaDate(theirs.updatedAt)} {theirs.updatedAt.slice(11, 16)} UTC). Nothing has been overwritten. Choose which version to keep.</p>
          <div className="entry__versions">
            <div><p className="kicker">This device</p><pre>{draft.title}{'\n\n'}{draft.body || ' '}</pre></div>
            <div><p className="kicker">Other device</p><pre>{theirs.title}{'\n\n'}{theirs.body || ' '}</pre></div>
          </div>
          <div className="entry__choose">
            <button type="button" className="button button--primary" onClick={() => void keepMine()}>Keep this device’s</button>
            <button type="button" className="button" onClick={useTheirs}>Use the other device’s</button>
          </div>
        </div>
      )}

      <label className="visually-hidden" htmlFor="entry-title">Title</label>
      <input id="entry-title" className="entry__title" placeholder="Untitled" maxLength={NOTEBOOK_TITLE_MAX}
        value={draft.title} onChange={(e) => update({ title: e.target.value })} disabled={!!theirs} />

      <label className="visually-hidden" htmlFor="entry-body">Notes</label>
      <textarea id="entry-body" className="entry__body" maxLength={NOTEBOOK_BODY_MAX}
        placeholder="What doesn’t add up?" value={draft.body} onChange={(e) => update({ body: e.target.value })} disabled={!!theirs} />
      <p className="entry__count faint">{draft.body.length.toLocaleString()} / {NOTEBOOK_BODY_MAX.toLocaleString()}</p>

      <section className="entry__links" aria-labelledby="links">
        <h2 id="links" className="kicker">Linked records</h2>
        {linked.length > 0 && (
          <ul className="chips">
            {linked.map((r) => (
              <li key={r.id} className="chip">
                <Link to={`/archive/${r.id}`}><span className="mono">{r.fileNo}</span> {r.title}</Link>
                <button type="button" aria-label={`Unlink ${r.fileNo}`} onClick={() => update({ evidence: draft.evidence.filter((x) => x !== r.id) })} disabled={!!theirs}>×</button>
              </li>
            ))}
          </ul>
        )}
        {linkable.length > 0 ? (
          <select className="input entry__picker" value="" aria-label="Link a recovered record" disabled={!!theirs}
            onChange={(e) => e.target.value && update({ evidence: [...draft.evidence, e.target.value] })}>
            <option value="">Link a recovered record…</option>
            {linkable.map((r) => <option key={r.id} value={r.id}>{r.fileNo} — {r.title}</option>)}
          </select>
        ) : records.length === 0 ? (
          <p className="faint">Records you recover can be linked here.</p>
        ) : null}
      </section>
    </article>
  );
}
