import { Navigate } from 'react-router';
import { useSession } from '../auth/session.tsx';
import { Doc } from '../components/Doc.tsx';
import { LinkFailed, Linking } from '../components/States.tsx';

export function Denied() {
  const { me, meError, refreshMe, signOut } = useSession();

  if (me === undefined) return <Linking />;
  if (me === null) return <LinkFailed message={meError} onRetry={() => void refreshMe()} />;
  if (me.access === 'granted') return <Navigate to="/hub" replace />;
  if (me.access === 'needs_profile') return <Navigate to="/intake" replace />;

  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title="Access not authorized" form="NOTICE D-403" stamp="Denied">
          <div className="doc__body">
            {me.reason === 'revoked' ? (
              <p>Access for this account has been withdrawn by the administrator.</p>
            ) : (
              <>
                <p>The archive is invitation-only while it is being tested.</p>
                <p>If you were invited, sign in with the exact address the invitation was sent to.</p>
              </>
            )}
            <p className="form__aside">Signed in as {me.email}</p>
          </div>
          <button type="button" className="button button--block" onClick={() => void signOut()}>Sign out</button>
        </Doc>
      </div>
    </div>
  );
}
