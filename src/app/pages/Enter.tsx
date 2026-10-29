import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { PublicConfig } from '../../shared/api.ts';
import { useSession } from '../auth/session.tsx';
import { Doc } from '../components/Doc.tsx';
import { Linking, Unconfigured } from '../components/States.tsx';
import { api } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';

export const PASSWORD_MIN = 10;

type Mode = 'signin' | 'register';

export function Enter() {
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/hub';

  const [mode, setMode] = useState<Mode>('signin');
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<PublicConfig>('/public-config').then(setConfig).catch(() => setConfig(null));
  }, []);

  const sb = supabase;
  if (!sb) return <Unconfigured />;
  if (session === undefined) return <Linking />;
  if (session) return <Navigate to={from} replace />;

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setSent(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters for your password.`);
      if (password !== confirm) return setError('The two passwords do not match.');
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await sb.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate(from, { replace: true });
      } else {
        const { data, error: err } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/enter` },
        });
        if (err) throw err;
        // with email confirmation on (it should be), there is no session yet
        if (!data.session) setSent(true);
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const registrationNote = config?.registrationOpen
    ? 'Registration is open.'
    : 'The archive is invitation-only. Register with the address your invitation was sent to.';

  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title={mode === 'signin' ? 'Return to the archive' : 'Citizen intake'} form={mode === 'signin' ? 'FORM D-00 · RE-ENTRY' : 'FORM D-01 · INTAKE'}>
          <div className="toggle" role="group" aria-label="Sign in or register">
            <button type="button" aria-pressed={mode === 'signin'} onClick={() => switchTo('signin')}>Sign in</button>
            <button type="button" aria-pressed={mode === 'register'} onClick={() => switchTo('register')}>Register</button>
          </div>

          {sent ? (
            <div className="doc__body" role="status">
              <p className="alert alert--ok">Check your inbox. A confirmation link is on its way to <b>{email}</b>.</p>
              <p>Open it on this device, then sign in. If nothing arrives within a few minutes, check spam.</p>
            </div>
          ) : (
            <form className="form" onSubmit={(e) => void submit(e)} noValidate>
              {mode === 'register' && <p className="form__note">{registrationNote}</p>}

              <label className="form__row">
                <input
                  className="field__input" type="email" name="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
                />
                <span className="field__label">Email address</span>
              </label>

              <label className="form__row">
                <input
                  className="field__input" type="password" name="password" required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode === 'register' ? PASSWORD_MIN : undefined}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={mode === 'register' ? 'pw-rule' : undefined}
                />
                <span className="field__label">Password</span>
                {mode === 'register' && <span id="pw-rule" className="form__hint">At least {PASSWORD_MIN} characters.</span>}
              </label>

              {mode === 'register' && (
                <label className="form__row">
                  <input
                    className="field__input" type="password" name="confirm" autoComplete="new-password" required
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  />
                  <span className="field__label">Password, again</span>
                </label>
              )}

              {error && <p className="alert" role="alert">{error}</p>}

              <button type="submit" className="button button--primary button--block" disabled={busy}>
                {busy ? 'Filing…' : mode === 'signin' ? 'Sign in' : 'Submit intake'}
              </button>

              {mode === 'signin' && (
                <p className="form__aside"><Link to="/reset-password">Forgotten your password?</Link></p>
              )}
            </form>
          )}
        </Doc>
        <p className="desk__below"><Link to="/?replay">Replay the transmission</Link></p>
      </div>
    </div>
  );
}

// Supabase's messages are written for developers. These are for players.
// Anything we do not recognise -- including the invitation gate's own
// refusal -- is passed through as written.
export function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match a record.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email address first — the link is in your inbox.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/password should be|weak password/i.test(msg)) return `Choose a stronger password — at least ${PASSWORD_MIN} characters.`;
  if (/fetch|network/i.test(msg)) return 'Could not reach the sign-in service. Check your connection.';
  return msg || 'Something went wrong.';
}
