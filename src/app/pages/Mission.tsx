import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import type { AnswerForm, MissionView, SubmitResult } from '../../shared/api.ts';
import { Doc } from '../components/Doc.tsx';
import { Interaction } from '../components/interactions/Interaction.tsx';
import { EvidenceLink } from '../components/Records.tsx';
import { LinkFailed, Linking } from '../components/States.tsx';
import { ApiClientError, api, errorMessage } from '../lib/api.ts';
import { NotFound } from './NotFound.tsx';

// One investigation: briefing, the interface it opens in, optional hints,
// and the box where findings are filed. Whether an answer is right is decided
// by the server alone.

const HINT_LABEL = { nudge: 'Nudge', direction: 'Direction', technique: 'Technique' } as const;

export function Mission() {
  const { id = '' } = useParams();
  const [view, setView] = useState<MissionView | null>(null);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);
  const [result, setResult] = useState<Extract<SubmitResult, { correct: true }> | null>(null);

  const open = useCallback(async () => {
    setProblem(null);
    try {
      // idempotent: marks the mission started and hands over its first records
      setView(await api<MissionView>(`/missions/${id}/start`, { method: 'POST' }));
    } catch (err) {
      setProblem({ code: err instanceof ApiClientError ? err.code : 'internal', message: errorMessage(err) });
    }
  }, [id]);

  useEffect(() => {
    setView(null);
    setResult(null);
    void open();
  }, [open]);

  if (problem?.code === 'not_found') return <NotFound />;
  if (problem?.code === 'locked') return <Sealed />;
  if (problem) return <LinkFailed message={problem.message} onRetry={() => void open()} />;
  if (!view) return <Linking label="Retrieving file" />;

  const campaign = campaigns.find((c) => c.id === view.campaign);

  return (
    <div className="mission" data-era={view.campaign}>
      <header className="page-head mission__head">
        <p className="kicker">
          <Link to="/campaigns">{campaign?.title}</Link> · File {String(view.order).padStart(2, '0')} · {view.difficulty}
        </p>
        <h1 className="page-head__title">{view.title}</h1>
        <p className="page-head__lede">{view.subtitle}</p>
        {view.status === 'completed' && !result && <p className="mission__closed"><span className="tape">Closed</span> You can work through it again; nothing you have found will be lost.</p>}
      </header>

      {view.mobile !== 'full' && (
        <p className="alert mission__mobile">
          {view.mobile === 'desktop-only' ? 'This investigation needs a larger screen. ' : 'Parts of this investigation are easier on a larger screen. '}
          {view.mobileNote}
        </p>
      )}

      <div className="mission__grid">
        <div className="mission__main">
          <section className="mission__brief prose" aria-label="Briefing">
            {view.intro.map((p, i) => <p key={i}>{p}</p>)}
          </section>

          <Interaction view={view} onStateSaved={(version, state) => setView({ ...view, version, state })} />

          {result ? (
            <Success result={result} />
          ) : (
            <Findings
              missionId={view.id}
              form={view.answerForm}
              replay={view.status === 'completed'}
              onSolved={(r) => {
                setResult(r);
                setView({ ...view, status: 'completed', success: r.success });
              }}
            />
          )}

          {!result && view.success && (
            <section className="panel mission__success" aria-labelledby="closed-note">
              <div className="panel__head"><h2 id="closed-note">Case notes on file</h2></div>
              <div className="panel__body prose">{view.success.map((p, i) => <p key={i}>{p}</p>)}</div>
            </section>
          )}
        </div>

        <aside className="mission__side">
          <section className="panel" aria-labelledby="objectives">
            <div className="panel__head"><h2 id="objectives">Objectives</h2></div>
            <ol className="objectives">{view.objectives.map((o, i) => <li key={i}>{o}</li>)}</ol>
          </section>

          <section className="panel" aria-labelledby="mission-evidence">
            <div className="panel__head"><h2 id="mission-evidence">Records in this file</h2><span>{view.evidence.length}</span></div>
            {view.evidence.length ? (
              <div className="evlist">{view.evidence.map((e) => <EvidenceLink key={e.id} record={e} />)}</div>
            ) : (
              <p className="panel__body faint">Nothing recovered for this file yet.</p>
            )}
          </section>

          {view.external.length > 0 && <External view={view} onUpdate={setView} />}

          <Hints view={view} onUpdate={(hints) => setView({ ...view, hints })} />

          <p className="mission__notes"><Link to="/notebook">Open your notebook ↗</Link></p>
        </aside>
      </div>
    </div>
  );
}

function Findings({ missionId, form, replay, onSolved }: {
  missionId: string;
  form: AnswerForm;
  replay: boolean;
  onSolved: (r: Extract<SubmitResult, { correct: true }>) => void;
}) {
  const [text, setText] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answer = form.kind === 'text' ? text : form.kind === 'fields' ? fields : picked;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<SubmitResult>(`/missions/${missionId}/submit`, { method: 'POST', body: { answer } });
      if (r.correct) onSolved(r);
      else setMessage(r.message);
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, multiple: boolean) =>
    setPicked((p) => (multiple ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));

  return (
    <section className="panel findings" aria-labelledby="findings">
      <div className="panel__head"><h2 id="findings">File your findings</h2>{replay && <span>replay</span>}</div>
      <form className="panel__body findings__form" onSubmit={(e) => void submit(e)}>
        {form.kind === 'text' && (
          <div>
            <label className="label" htmlFor="answer">{form.label}</label>
            <input id="answer" className="input" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={form.placeholder} autoComplete="off" spellCheck={false} maxLength={500} required />
          </div>
        )}

        {form.kind === 'fields' && form.fields.map((f) => (
          <div key={f.id}>
            <label className="label" htmlFor={`f-${f.id}`}>{f.label}</label>
            <input id={`f-${f.id}`} className="input" value={fields[f.id] ?? ''} placeholder={f.placeholder}
              onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })} autoComplete="off" spellCheck={false} maxLength={500} required />
          </div>
        ))}

        {form.kind === 'choice' && (
          <fieldset className="choices">
            <legend className="label">{form.prompt}{form.multiple ? ' (choose all that apply)' : ''}</legend>
            {form.options.map((o) => (
              <label key={o.id} className="choice">
                <input type={form.multiple ? 'checkbox' : 'radio'} name="choice" checked={picked.includes(o.id)}
                  onChange={() => toggle(o.id, form.multiple)} />
                <span>{o.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        <button type="submit" className="button button--primary" disabled={busy}>{busy ? 'Checking the record…' : 'Submit'}</button>

        <div aria-live="polite" className="findings__message">{message && <p className="alert" role="alert">{message}</p>}</div>
      </form>
    </section>
  );
}

function Success({ result }: { result: Extract<SubmitResult, { correct: true }> }) {
  return (
    <section className="mission__result" aria-live="polite" aria-labelledby="result-title">
      <pre className="terminal" aria-hidden="true"><span className="sig">&gt; RECORD VERIFIED</span>{result.replay ? ' · replay' : ''}</pre>
      <h2 id="result-title" className="visually-hidden">Findings verified</h2>
      <div className="prose mission__success-text">{result.success.map((p, i) => <p key={i}>{p}</p>)}</div>

      {result.rewards.evidence.length > 0 && (
        <div className="mission__rewards">
          <p className="kicker">Recovered</p>
          <div className="evlist">{result.rewards.evidence.map((e) => <EvidenceLink key={e.id} record={e} />)}</div>
        </div>
      )}

      {result.rewards.achievements.length > 0 && (
        <ul className="commendations">
          {result.rewards.achievements.map((a) => (
            <li key={a.id}><span className="tape">Commendation</span> <b>{a.title}</b> <span className="dim">{a.description}</span></li>
          ))}
        </ul>
      )}

      <div className="mission__next">
        {result.unlocked.missions.map((m) => (
          <Link key={m.id} className="button button--primary" to={`/missions/${m.id}`}>Next: {m.title}</Link>
        ))}
        {result.unlocked.campaigns.map((c) => (
          <Link key={c} className="button" to="/campaigns">{campaigns.find((x) => x.id === c)?.title} is open</Link>
        ))}
        <Link className="button" to="/hub">Back to the network</Link>
      </div>
    </section>
  );
}

function Hints({ view, onUpdate }: { view: MissionView; onUpdate: (h: MissionView['hints']) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const more = view.hints.length < view.hintsTotal;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdate((await api<{ hints: MissionView['hints'] }>(`/missions/${view.id}/hints`, { method: 'POST' })).hints);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel hints" aria-labelledby="hints">
      <div className="panel__head"><h2 id="hints">Help from outside</h2><span>{view.hints.length}/{view.hintsTotal}</span></div>
      <div className="panel__body">
        {view.hints.length > 0 && (
          <ol className="hints__list">
            {view.hints.map((h, i) => (
              <li key={i}><span className="tape">{HINT_LABEL[h.level]}</span><p>{h.text}</p></li>
            ))}
          </ol>
        )}
        {more ? (
          <button type="button" className="button button--block hints__ask" disabled={busy} onClick={() => void ask()}>
            {view.hints.length ? 'Ask again' : 'Sahlo Folina'}
          </button>
        ) : (
          <p className="faint">That is everything the Banditos can tell you.</p>
        )}
        <p className="hint">Hints never cost you anything — not progress, not achievements.</p>
        {error && <p className="alert" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function External({ view, onUpdate }: { view: MissionView; onUpdate: (v: MissionView) => void }) {
  const [error, setError] = useState<string | null>(null);
  const fallback = async (i: number) => {
    try {
      onUpdate(await api<MissionView>(`/missions/${view.id}/external/${i}/fallback`, { method: 'POST' }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section className="panel" aria-labelledby="external">
      <div className="panel__head"><h2 id="external">Outside the archive</h2></div>
      <ul className="external panel__body">
        {view.external.map((x, i) => (
          <li key={i}>
            <a href={x.url} target="_blank" rel="noopener noreferrer">{x.label} ↗</a>
            <span className="faint"> opens a new tab · your progress here is saved</span>
            {x.fallback ? (
              <p className="hint">Archived copy: <Link to={`/archive/${x.fallback.id}`}>{x.fallback.fileNo} {x.fallback.title}</Link></p>
            ) : (
              <p className="hint"><button type="button" className="linklike" onClick={() => void fallback(i)}>Link not working? Use the archived copy</button></p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="alert" role="alert">{error}</p>}
    </section>
  );
}

function Sealed() {
  return (
    <div className="mission-sealed">
      <Doc title="File sealed" form="NOTICE D-403" stamp="Sealed" as="h1">
        <div className="doc__body">
          <p>This file is not open to you yet. Close the files before it first.</p>
          <p><Link to="/campaigns">Back to the campaign directory</Link></p>
        </div>
      </Doc>
    </div>
  );
}
