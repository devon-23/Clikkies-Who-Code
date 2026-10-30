import { Link } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import type { ProgressResponse } from '../../shared/api.ts';
import { useSession } from '../auth/session.tsx';
import { CitizenRecord } from '../components/Records.tsx';
import { useApi } from '../lib/useApi.ts';

// The recovered network. Left: the record Dema keeps on you. Right: where you
// are, and what the machine can and cannot do yet. Systems that are not built
// say so plainly -- they are not links, and they do not pretend.

interface System {
  name: string;
  to?: string;
  online: boolean;
  note: string;
}

export function Hub() {
  const { me } = useSession();
  const progress = useApi<ProgressResponse>('/progress');
  if (!me?.profile) return null;

  const p = progress.data;
  const isAdmin = me.profile.role === 'admin';

  const systems: System[] = [
    { name: 'Campaign directory', to: '/campaigns', online: true, note: 'Five recovered eras, opened in order.' },
    { name: 'Classified archive', to: '/archive', online: true, note: p ? `${p.evidenceCount} record${p.evidenceCount === 1 ? '' : 's'} recovered. Kept permanently.` : 'Every record you recover, kept permanently.' },
    { name: 'Investigator’s notebook', to: '/notebook', online: true, note: 'Your own notes and theories. Saved across devices.' },
    { name: 'Personnel file', to: '/profile', online: true, note: p ? `Cycle ${p.run.number} · ${p.achievementCount} commendation${p.achievementCount === 1 ? '' : 's'}.` : 'Your cycle, progress and achievements.' },
    { name: 'Training grounds', online: false, note: 'Flexbox and Grid challenges, separate from the story. Not built yet.' },
    ...(isAdmin ? [{ name: 'Administration', to: '/admin', online: true, note: 'Registration, testers, diagnostics.' }] : []),
  ];

  return (
    <>
      <header className="page-head">
        <p className="kicker">Recovered network · node 15398642_14{p && p.run.number > 1 ? ` · cycle ${p.run.number}` : ''}</p>
        <h1 className="page-head__title">The city keeps a file on you</h1>
        <p className="page-head__lede">
          It says you are a resident in good standing. It says you have never tried to leave. Read it carefully —
          it is the first document you will learn not to trust.
        </p>
      </header>

      <div className="hub">
        <section className="hub__record" aria-label="Your citizen record">
          <CitizenRecord me={me} progress={p} />
          <p className="hub__handle">
            <span className="kicker">Account handle</span>
            <b>{me.profile.username}</b>
            <span className="faint">Your handle is how this system knows you. It is not your name in the story.</span>
          </p>
        </section>

        <div className="hub__side">
          <Assignment progress={p} error={progress.error} />

          <section className="panel" aria-labelledby="systems">
            <div className="panel__head"><h2 id="systems">Systems</h2><span>{systems.filter((s) => s.online).length}/{systems.length} online</span></div>
            <ul className="status">
              {systems.map((s) => (
                <li key={s.name} className="status__row">
                  {s.to ? <Link className="status__name" to={s.to}>{s.name}</Link> : <span className="status__name">{s.name}</span>}
                  <span className={`status__light${s.online ? ' status__light--online' : ''}`}>{s.online ? 'online' : 'offline'}</span>
                  <span className="status__note">{s.note}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="last-tx">
            <div className="panel__head"><h2 id="last-tx">Last transmission</h2><Link to="/?replay" className="faint">Replay</Link></div>
            <pre className="terminal">
              <span className="sig">&gt; INTERCEPT · BEARING 090°</span>{'\n'}
              &gt; Do not trust a single document.{'\n'}
              &gt; Put two side by side and read the difference.{'\n'}
              &gt; <b>Start with your own.</b>{'\n'}
              <span className="lost">&gt; — signal lost —</span>
            </pre>
          </section>
        </div>
      </div>
    </>
  );
}

function Assignment({ progress: p, error }: { progress?: ProgressResponse; error: string | null }) {
  const current = p?.current;
  const campaign = current ? campaigns.find((c) => c.id === current.campaign) : campaigns[0];

  return (
    <section className="panel" aria-labelledby="assignment" data-era={campaign?.id}>
      <div className="panel__head">
        <h2 id="assignment">Current assignment</h2>
        <span className={`status__light${current ? ' status__light--online' : ''}`}>
          {current ? (current.status === 'in_progress' ? 'In progress' : 'Open') : 'Pending'}
        </span>
      </div>
      <div className="panel__body">
        {error ? (
          <p className="alert" role="alert">{error}</p>
        ) : current ? (
          <>
            <p className="mono assignment__era">{campaign?.title.toUpperCase()}</p>
            <p className="assignment__title">{current.title}</p>
            <Link className="button button--primary" to={`/missions/${current.missionId}`}>
              {current.status === 'in_progress' ? 'Resume investigation' : 'Open the file'}
            </Link>
          </>
        ) : p?.canStartNewCycle ? (
          <>
            <p className="dim">Every file is closed. The record says otherwise.</p>
            <Link className="button" to="/profile">Begin again</Link>
          </>
        ) : (
          <>
            <p className="mono">{campaign?.title.toUpperCase()} · {campaign?.tagline}</p>
            <p className="dim">
              The first investigation is still being restored. Nothing to open yet — when it is ready, it will appear
              here and you will pick up where you left off.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
