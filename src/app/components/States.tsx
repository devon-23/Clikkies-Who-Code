import { Link } from 'react-router';
import { Doc } from './Doc.tsx';

export function Linking({ label = 'Establishing link' }: { label?: string }) {
  return (
    <div className="linking" role="status" aria-live="polite">
      <span>{label}</span>
    </div>
  );
}

export function LinkFailed({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  return (
    <div className="desk">
      <div className="desk__sheet panel">
        <div className="panel__head"><h2>Link failed</h2><span className="status__light status__light--warn">Offline</span></div>
        <div className="panel__body">
          <p role="alert">{message ?? 'The archive did not answer.'}</p>
          {onRetry && <button type="button" className="button" onClick={onRetry}>Try again</button>}
        </div>
      </div>
    </div>
  );
}

// Shown when the browser build has no Supabase settings -- a fresh checkout
// before .env is filled in. Never reached on a correctly deployed site.
export function Unconfigured() {
  return (
    <div className="desk">
      <div className="desk__sheet">
        <Doc title="System not configured" form="DEVELOPER NOTICE" benediction={false}>
          <div className="doc__body">
            <p>Sign-in is not set up in this build yet.</p>
            <p>
              Copy <code>.env.example</code> to <code>.env</code>, add your Supabase project URL and
              publishable key, and restart <code>npm run dev</code>. The steps are in{' '}
              <code>docs/setup.md</code>.
            </p>
          </div>
        </Doc>
        <p className="desk__below"><Link to="/">Back to the transmission</Link></p>
      </div>
    </div>
  );
}
