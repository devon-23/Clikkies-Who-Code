import { useState } from 'react';
import { campaigns } from '../../../content/campaigns.ts';
import type { AchievementsResponse, ProgressResponse } from '../../shared/api.ts';
import { demaDate } from '../../shared/dema.ts';
import { useSession } from '../auth/session.tsx';
import { CitizenRecord } from '../components/Records.tsx';
import { LinkFailed, Linking } from '../components/States.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { useApi } from '../lib/useApi.ts';

// The player's own file: account, cycle, how far each era has gone, every
// commendation, and the cycles before this one. Private -- nobody else can
// see it.
export function Profile() {
  const { me } = useSession();
  const progress = useApi<ProgressResponse>('/progress');
  const achievements = useApi<AchievementsResponse>('/achievements');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me?.profile) return null;
  if (progress.error && !progress.data) return <LinkFailed message={progress.error} onRetry={() => void progress.reload()} />;
  if (!progress.data) return <Linking label="Pulling your file" />;
  const p = progress.data;

  const beginAgain = async () => {
    if (!window.confirm('Begin a new cycle? Your missions start over. Your archive, notebook and commendations stay.')) return;
    setBusy(true);
    setError(null);
    try {
      progress.setData(await api<ProgressResponse>('/runs', { method: 'POST' }));
      void achievements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const earned = achievements.data?.achievements.filter((a) => a.awardedAt) ?? [];
  const open = achievements.data?.achievements.filter((a) => !a.awardedAt) ?? [];

  return (
    <>
      <header className="page-head">
        <p className="kicker">Personnel file · private</p>
        <h1 className="page-head__title">{me.profile.username}</h1>
        <p className="page-head__lede">Account handle, not a name in the story. Signed in as {me.email}.</p>
      </header>

      <div className="hub">
        <section className="hub__record" aria-label="Your citizen record">
          <CitizenRecord me={me} progress={p} />
        </section>

        <div className="hub__side">
          <section className="panel" aria-labelledby="cycle">
            <div className="panel__head"><h2 id="cycle">Cycle {p.run.number}</h2><span>since {demaDate(p.run.startedAt)}</span></div>
            <ul className="status">
              {p.campaigns.map((c) => {
                const meta = campaigns.find((x) => x.id === c.id)!;
                const pct = c.required ? Math.round((c.completed / c.required) * 100) : 0;
                return (
                  <li key={c.id} className="status__row progress-row" data-era={c.id}>
                    <span className="status__name">{meta.title}</span>
                    <span className={`status__light${c.complete ? ' status__light--online' : ''}`}>
                      {c.complete ? 'Closed' : !c.unlocked ? 'Sealed' : c.required ? `${c.completed}/${c.required}` : 'Not built'}
                    </span>
                    <span className="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                  </li>
                );
              })}
            </ul>
            {p.canStartNewCycle && (
              <div className="panel__body">
                <p className="dim">Every file is closed.</p>
                <button type="button" className="button button--danger" disabled={busy} onClick={() => void beginAgain()}>Begin again</button>
                {error && <p className="alert" role="alert">{error}</p>}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="commendations">
            <div className="panel__head"><h2 id="commendations">Commendations</h2><span>{earned.length} earned</span></div>
            <ul className="awards">
              {earned.map((a) => (
                <li key={a.id} className="award award--earned">
                  <b>{a.title}</b><span>{a.description}</span><time dateTime={a.awardedAt!}>{demaDate(a.awardedAt!)}</time>
                </li>
              ))}
              {open.map((a) => (
                <li key={a.id} className="award"><b>{a.title}</b><span>{a.description}</span></li>
              ))}
              {(achievements.data?.secretRemaining ?? 0) > 0 && (
                <li className="award award--secret">
                  <b><span className="redacted" aria-hidden="true">{'█'.repeat(10)}</span><span className="visually-hidden">Secret</span></b>
                  <span>{achievements.data!.secretRemaining} more, unlisted.</span>
                </li>
              )}
            </ul>
          </section>

          <section className="panel" aria-labelledby="history">
            <div className="panel__head"><h2 id="history">Earlier cycles</h2><span>{p.history.length}</span></div>
            {p.history.length ? (
              <ol className="log">
                {p.history.map((r) => (
                  <li key={r.number}>
                    <span>Cycle {r.number}</span>
                    <span className="faint">{demaDate(r.startedAt)} → {r.completedAt ? demaDate(r.completedAt) : '—'}</span>
                    <span className="dim">{r.missionsCompleted} files closed</span>
                    <span />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="panel__body faint">None. This is the first time. As far as the record knows.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
