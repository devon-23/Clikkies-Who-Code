import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSession } from '../auth/session.tsx';
import { Doc } from '../components/Doc.tsx';
import { Linking, Unconfigured } from '../components/States.tsx';
import { supabase } from '../lib/supabase.ts';
import { PASSWORD_MIN, friendly } from './Enter.tsx';

// Step one: ask for a reset link. The reply is the same whether or not the
// address has an account, so this page cannot be used to test addresses.
export function ResetPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sb = supabase;
  if (!sb) return <Unconfigured />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setBusy(false);
    // only a rate limit or outage is worth telling them about
    if (err && /rate limit|fetch|network/i.test(err.message)) setError(friendly(err));
    else setSent(true);
  };

  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title="Lost credentials" form="FORM D-09 · REISSUE">
          {sent ? (
            <div className="doc__body" role="status">
              <p className="alert alert--ok">If that address has an account, a reset link is on its way.</p>
              <p>The link works once and expires. Open it on this device.</p>
            </div>
          ) : (
            <form className="form" onSubmit={(e) => void submit(e)}>
              <label className="form__row">
                <input className="field__input" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className="field__label">Email address</span>
              </label>
              {error && <p className="alert" role="alert">{error}</p>}
              <button type="submit" className="button button--primary button--block" disabled={busy}>
                {busy ? 'Filing…' : 'Send reset link'}
              </button>
            </form>
          )}
        </Doc>
        <p className="desk__below"><Link to="/enter">Back to sign in</Link></p>
      </div>
    </div>
  );
}

// Step two: the email link signs them in with a short-lived recovery session
// and lands here to choose a new password.
export function UpdatePassword() {
  const { session } = useSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sb = supabase;
  if (!sb) return <Unconfigured />;
  if (session === undefined) return <Linking />;

  if (!session) {
    return (
      <div className="desk">
        <div className="desk__sheet">
          <Doc title="Link expired" form="FORM D-09 · REISSUE" stamp="Void">
            <div className="doc__body">
              <p>This reset link has already been used or has expired.</p>
              <p><Link to="/reset-password">Request a new one</Link>.</p>
            </div>
          </Doc>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    const { error: err } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendly(err));
    navigate('/hub', { replace: true });
  };

  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title="New credentials" form="FORM D-09 · REISSUE">
          <form className="form" onSubmit={(e) => void submit(e)}>
            <label className="form__row">
              <input className="field__input" type="password" autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="field__label">New password</span>
              <span className="form__hint">At least {PASSWORD_MIN} characters.</span>
            </label>
            <label className="form__row">
              <input className="field__input" type="password" autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <span className="field__label">New password, again</span>
            </label>
            {error && <p className="alert" role="alert">{error}</p>}
            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? 'Filing…' : 'Save new password'}
            </button>
          </form>
        </Doc>
      </div>
    </div>
  );
}
