import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { demaDate } from '../../shared/dema.ts';
import { useSession } from '../auth/session.tsx';
import { Colophon } from '../components/Colophon.tsx';
import { Linking } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { introSeenHere, markIntroSeenHere } from '../lib/intro.ts';

// The first thing a new visitor sees: a message that was not meant for them.
// Plays once. After that, signed-in players go straight to the network and
// signed-out visitors get a one-line reminder with the option to replay.

const LINES = [
  'If this reached you, the wall did not catch everything.',
  'They say every resident of Dema is recorded twice, and that the two records agree. They do not.',
  'Someone lived where you live now. Their name was taken out of the record — but not carefully.',
  'Do not trust a single document. Put two side by side and read the difference.',
  'Start with your own.',
];

export function Transmission() {
  const { session, me, refreshMe } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [revealAll, setRevealAll] = useState(false);

  const replay = params.has('replay');
  const granted = me?.access === 'granted';
  const seenOnAccount = Boolean(me?.profile?.introSeenAt);
  const seenHere = introSeenHere();

  if (session === undefined || (session && me === undefined)) return <Linking label="Searching for signal" />;
  if (!replay && granted && (seenOnAccount || seenHere)) return <Navigate to="/hub" replace />;
  if (!replay && !session && seenHere) return <Archived />;

  const answer = async () => {
    markIntroSeenHere();
    if (granted && !seenOnAccount) {
      // best effort: if this fails the browser still remembers
      await api('/profile/intro-seen', { method: 'POST' }).catch(() => {});
      await refreshMe();
    }
    navigate(granted ? '/hub' : '/enter');
  };

  return (
    <div className="tx" data-reveal={revealAll ? 'all' : undefined}>
      <main className="tx__main" id="main">
        <p className="tx__brand kicker">Clikkies Who Code</p>

        <h1 className="tx__title">Intercepted<br />transmission</h1>

        <dl className="tx__meta">
          <div><dt>Received</dt><dd>{demaDate(new Date())}</dd></div>
          <div><dt>Source</dt><dd>Unresolved · bearing 090°</dd></div>
          <div><dt>Integrity</dt><dd>61%</dd></div>
        </dl>

        <ol className="tx__lines">
          {LINES.map((line, i) => (
            <li key={i} className="tx__line" style={{ '--i': i } as React.CSSProperties}>{line}</li>
          ))}
          <li className="tx__line tx__lost" style={{ '--i': LINES.length } as React.CSSProperties} aria-label="Signal lost">
            — signal lost —
          </li>
        </ol>

        <div className="tx__actions" style={{ '--i': LINES.length + 1 } as React.CSSProperties}>
          <button type="button" className="button button--primary" onClick={() => void answer()}>
            Answer the transmission
          </button>
          {session ? null : (
            <Link className="button" to="/enter" onClick={markIntroSeenHere}>I already have access</Link>
          )}
        </div>

        {!revealAll && (
          <button type="button" className="tx__skip linklike" onClick={() => setRevealAll(true)}>
            Show the whole message
          </button>
        )}
      </main>
      <Colophon />
    </div>
  );
}

function Archived() {
  return (
    <div className="tx tx--archived" data-reveal="all">
      <main className="tx__main" id="main">
        <p className="tx__brand kicker">Clikkies Who Code</p>
        <h1 className="tx__title">Transmission<br />archived</h1>
        <p className="tx__note">This device has already received the message.</p>
        <div className="tx__actions">
          <Link className="button button--primary" to="/enter">Sign in</Link>
          <Link className="button" to="/?replay">Replay it</Link>
        </div>
      </main>
      <Colophon />
    </div>
  );
}
