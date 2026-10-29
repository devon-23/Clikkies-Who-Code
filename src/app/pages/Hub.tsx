import { Link } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import { BISHOPS, demaDate, districtFor } from '../../shared/dema.ts';
import { useSession } from '../auth/session.tsx';
import { Doc, Field, Redacted } from '../components/Doc.tsx';

// The recovered network. Left: the record Dema keeps on you. Right: what the
// machine can and cannot do yet. Systems that are not built say so plainly --
// they are not links, and they do not pretend.

interface System {
  name: string;
  to?: string;
  state: 'online' | 'offline' | 'restricted';
  note: string;
}

export function Hub() {
  const { me } = useSession();
  if (!me?.profile) return null;

  const district = districtFor(me.id);
  const first = campaigns[0]!;
  const isAdmin = me.profile.role === 'admin';

  const systems: System[] = [
    { name: 'Campaign directory', to: '/campaigns', state: 'online', note: 'Five recovered eras. One is being restored.' },
    { name: 'Classified archive', state: 'offline', note: 'Evidence you recover will be kept here permanently. Not built yet.' },
    { name: 'Investigator’s notebook', state: 'offline', note: 'Your own notes and theories, saved across devices. Not built yet.' },
    { name: 'Training grounds', state: 'offline', note: 'Flexbox and Grid challenges, separate from the story. Not built yet.' },
    ...(isAdmin ? [{ name: 'Administration', to: '/admin', state: 'online' as const, note: 'Registration and tester access.' }] : []),
  ];

  return (
    <>
      <header className="page-head">
        <p className="kicker">Recovered network · node 15398642_14</p>
        <h1 className="page-head__title">The city keeps a file on you</h1>
        <p className="page-head__lede">
          It says you are a resident in good standing. It says you have never tried to leave. Read it carefully —
          it is the first document you will learn not to trust.
        </p>
      </header>

      <div className="hub">
        <section className="hub__record" aria-labelledby="record-title">
          <Doc as="h2" title={<span id="record-title">Citizen identification record</span>} form="FORM D-17 · REV. 4" lit={district} stamp="Citizen">
            <div className="fields">
              <Field label="Name" strong blank><Redacted length={9} reveal="not recorded" /></Field>
              <div className="fields fields--2">
                <Field label="Designation" blank>Unassigned</Field>
                <Field label="District">{BISHOPS[district]}</Field>
              </div>
              <div className="fields fields--2">
                <Field label="Standing">Good</Field>
                <Field label="Record opened">{demaDate(me.profile.createdAt)}</Field>
              </div>
              <Field label="Departures on file">None</Field>
            </div>
          </Doc>
          <p className="hub__handle">
            <span className="kicker">Account handle</span>
            <b>{me.profile.username}</b>
            <span className="faint">Your handle is how this system knows you. It is not your name in the story.</span>
          </p>
        </section>

        <div className="hub__side">
          <section className="panel" aria-labelledby="assignment">
            <div className="panel__head"><h2 id="assignment">Current assignment</h2><span className="status__light">Pending</span></div>
            <div className="panel__body">
              <p className="mono">{first.title.toUpperCase()} · {first.tagline}</p>
              <p className="dim">
                The first investigation is still being restored. Nothing to open yet — when it is ready, it will appear
                here and you will pick up where you left off.
              </p>
            </div>
          </section>

          <section className="panel" aria-labelledby="systems">
            <div className="panel__head"><h2 id="systems">Systems</h2><span>{systems.filter((s) => s.state === 'online').length}/{systems.length} online</span></div>
            <ul className="status">
              {systems.map((s) => (
                <li key={s.name} className="status__row">
                  {s.to ? <Link className="status__name" to={s.to}>{s.name}</Link> : <span className="status__name">{s.name}</span>}
                  <span className={`status__light status__light--${s.state === 'online' ? 'online' : 'off'}`}>{s.state}</span>
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
