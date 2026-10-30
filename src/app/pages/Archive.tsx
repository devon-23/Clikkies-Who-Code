import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import type { ArchiveResponse, DiscoverResult, EvidenceRecord, EvidenceSummary, EvidenceSlot } from '../../shared/api.ts';
import { EvidenceSheet } from '../components/Records.tsx';
import { Seal } from '../components/Seal.tsx';
import { LinkFailed, Linking } from '../components/States.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFound } from './NotFound.tsx';

// The classified archive: a register of every record the player has
// recovered, permanently, across every cycle. Records not yet found show as
// empty numbered slots -- you can see the gap, not what fills it. Hidden
// records leave no gap at all until someone finds them.

type Cell = { found: true; record: EvidenceSummary } | { found: false; slot: EvidenceSlot };

export function Archive() {
  const { data, error, reload } = useApi<ArchiveResponse>('/archive');

  if (error && !data) return <LinkFailed message={error} onRetry={() => void reload()} />;
  if (!data) return <Linking label="Mounting archive" />;

  const cells: Cell[] = [
    ...data.records.map((record) => ({ found: true as const, record })),
    ...data.slots.map((slot) => ({ found: false as const, slot })),
  ].sort((a, b) => (a.found ? a.record.fileNo : a.slot.fileNo).localeCompare(b.found ? b.record.fileNo : b.slot.fileNo));

  // hidden records count separately: the register never admits how many exist
  const recovered = data.records.filter((r) => !r.hidden).length;
  const known = recovered + data.slots.length;

  return (
    <div className="archive">
      <div className="archive__mark" aria-hidden="true"><Seal all /></div>

      <header className="page-head">
        <p className="kicker">Classified archive · partially recovered</p>
        <h1 className="page-head__title">The register</h1>
        <p className="page-head__lede">
          Every record you recover is filed here and stays here — through replays, through everything. Read them
          against each other. That is where the truth is.
        </p>
      </header>

      <dl className="readout">
        <div><dt>Recovered</dt><dd>{recovered}<span>/{known}</span></dd></div>
        <div><dt>Off the books</dt><dd>{data.hiddenFound}</dd></div>
        <div><dt>Integrity</dt><dd>61%</dd></div>
      </dl>

      {cells.length === 0 ? (
        <p className="archive__empty">The register is empty. Records appear here as investigations recover them.</p>
      ) : (
        <ol className="register" aria-label="Records">
          {cells.map((c) => c.found ? (
            <li key={c.record.fileNo}>
              <Link className={`register__cell register__cell--found${c.record.hidden ? ' register__cell--hidden' : ''}`} to={`/archive/${c.record.id}`} data-era={c.record.campaign}>
                <span className="register__no">{c.record.fileNo}</span>
                <span className="register__title">{c.record.title}</span>
                <span className="register__kind">{c.record.kind}</span>
              </Link>
            </li>
          ) : (
            <li key={c.slot.fileNo}>
              <span className="register__cell register__cell--gap" data-era={c.slot.campaign}>
                <span className="register__no">{c.slot.fileNo}</span>
                <span className="register__title" aria-label="Not recovered"><span className="redacted" aria-hidden="true">{'█'.repeat(8)}</span></span>
                <span className="register__kind">{c.slot.classification} · {campaigns.find((x) => x.id === c.slot.campaign)?.title}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <Terminal onFound={() => void reload()} />
    </div>
  );
}

// the archive answers to phrases. most people never type anything here
function Terminal({ onFound }: { onFound: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: string; link?: string }[]>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = code.trim();
    if (!q) return;
    setBusy(true);
    try {
      const r = await api<DiscoverResult>('/archive/discover', { method: 'POST', body: { code: q } });
      if (r.found) {
        setLog((l) => [...l, {
          q,
          a: r.alreadyHad ? `${r.record.fileNo} — already on file.` : `${r.record.fileNo} recovered: ${r.record.title}`,
          link: `/archive/${r.record.id}`,
        }]);
        if (!r.alreadyHad) onFound();
      } else {
        setLog((l) => [...l, { q, a: r.message }]);
      }
      setCode('');
    } catch (err) {
      setLog((l) => [...l, { q, a: errorMessage(err) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel archive__terminal" aria-labelledby="terminal">
      <div className="panel__head"><h2 id="terminal">Archive query</h2><span>direct line</span></div>
      <div className="terminal archive__log" aria-live="polite">
        <span className="lost">&gt; awaiting query</span>
        {log.map((l, i) => (
          <span key={i}>{'\n'}&gt; {l.q}{'\n'}{l.link ? <Link to={l.link} className="sig">{l.a}</Link> : <span className="lost">{l.a}</span>}</span>
        ))}
      </div>
      <form className="archive__query" onSubmit={(e) => void submit(e)}>
        <label className="visually-hidden" htmlFor="query">Query the archive</label>
        <span className="archive__prompt" aria-hidden="true">&gt;</span>
        <input id="query" className="input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={200} autoComplete="off" spellCheck={false} />
        <button type="submit" className="button" disabled={busy}>Query</button>
      </form>
    </section>
  );
}

export function ArchiveRecord() {
  const { id = '' } = useParams();
  const { data, error, reload } = useApi<EvidenceRecord>(`/archive/${encodeURIComponent(id)}`);

  if (error && /no such record/i.test(error)) return <NotFound />;
  if (error) return <LinkFailed message={error} onRetry={() => void reload()} />;
  if (!data) return <Linking label="Retrieving record" />;

  return (
    <div className="record">
      <p className="record__back"><Link to="/archive">← The register</Link></p>
      <div className="record__grid">
        <EvidenceSheet record={data} />
        <aside className="record__side">
          <section className="panel" aria-labelledby="summary">
            <div className="panel__head"><h2 id="summary">Archivist’s summary</h2></div>
            <p className="panel__body dim">{data.summary}</p>
          </section>
          <section className="panel" aria-labelledby="related">
            <div className="panel__head"><h2 id="related">Cross-references</h2></div>
            <div className="panel__body">
              {data.related.length > 0 && (
                <ul className="xref">{data.related.map((r) => <li key={r.id}><Link to={`/archive/${r.id}`}><span className="mono">{r.fileNo}</span> {r.title}</Link></li>)}</ul>
              )}
              {data.relatedMissing > 0 && (
                <p className="faint">{data.relatedMissing} cross-referenced record{data.relatedMissing === 1 ? '' : 's'} not yet recovered.</p>
              )}
              {data.related.length === 0 && data.relatedMissing === 0 && <p className="faint">None.</p>}
            </div>
          </section>
          <Link className="button button--block" to={`/notebook?link=${encodeURIComponent(data.id)}`}>Write a note about this</Link>
        </aside>
      </div>
    </div>
  );
}
