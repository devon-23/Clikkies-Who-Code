import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { USERNAME_RULE, usernameSchema } from '../../shared/api.ts';
import { useSession } from '../auth/session.tsx';
import { Doc } from '../components/Doc.tsx';
import { LinkFailed, Linking } from '../components/States.tsx';
import { api, errorMessage } from '../lib/api.ts';

// Choosing an account handle. The page is careful to say what the handle is
// NOT: in the story the player has no name yet, and will not for a while.
export function Intake() {
  const { me, meError, refreshMe } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me === undefined) return <Linking />;
  if (me === null) return <LinkFailed message={meError} onRetry={() => void refreshMe()} />;
  if (me.access === 'granted') return <Navigate to="/hub" replace />;
  if (me.access === 'denied') return <Navigate to="/denied" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid username.');
    setBusy(true);
    setError(null);
    try {
      await api('/profile', { method: 'POST', body: { username: parsed.data } });
      await refreshMe();
      navigate('/hub', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title="Assignment of handle" form="FORM D-02 · REGISTRY">
          <div className="doc__body">
            <p>Choose the handle this system will know you by.</p>
            <p className="faint-ink">
              This is your <b>account name</b>, not a name in the story. In Dema you have not been given one. That comes later.
            </p>
          </div>
          <form className="form" onSubmit={(e) => void submit(e)} noValidate>
            <label className="form__row">
              <input
                className="field__input" name="username" autoComplete="username" autoCapitalize="none"
                spellCheck={false} required maxLength={24}
                value={username} onChange={(e) => setUsername(e.target.value)}
                aria-invalid={error ? true : undefined} aria-describedby="handle-rule"
              />
              <span className="field__label">Account handle</span>
              <span id="handle-rule" className="form__hint">{USERNAME_RULE}. Only you and the administrator see it.</span>
            </label>
            {error && <p className="alert" role="alert">{error}</p>}
            <button type="submit" className="button button--primary button--block" disabled={busy}>
              {busy ? 'Filing…' : 'File handle'}
            </button>
          </form>
          <p className="form__aside">Signed in as {me.email}</p>
        </Doc>
      </div>
    </div>
  );
}
