import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminOverview, Tester } from '../../shared/api.ts';
import { demaDate } from '../../shared/dema.ts';
import { LinkFailed, Linking } from '../components/States.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { AdminTabs } from './AdminViews.tsx';

// Operational controls only. Mission content is edited in the repository,
// not here. Every action below is checked again by the API.
export function Admin() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setData(await api<AdminOverview>('/admin/overview'));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<AdminOverview>, success: string): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      setData(await action());
      setNotice({ ok: true, text: success });
      return true;
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <LinkFailed message={loadError} onRetry={() => void load()} />;
  if (!data) return <Linking label="Opening administration" />;

  const toggleRegistration = () => {
    const open = !data.registrationOpen;
    if (open && !window.confirm('Open registration to anyone with the link? Revoked addresses stay blocked.')) return;
    void run(
      () => api<AdminOverview>('/admin/registration', { method: 'PUT', body: { open } }),
      open ? 'Registration is now open to the public.' : 'Registration is closed. Invitations only.',
    );
  };

  return (
    <>
      <header className="page-head">
        <p className="kicker">Administration · restricted</p>
        <h1 className="page-head__title">Registry office</h1>
      </header>
      <AdminTabs />

      {notice && <p className={`alert${notice.ok ? ' alert--ok' : ''} admin__notice`} role={notice.ok ? 'status' : 'alert'}>{notice.text}</p>}

      <div className="admin">
        <section className="panel" aria-labelledby="reg">
          <div className="panel__head">
            <h2 id="reg">Registration</h2>
            <span className={`status__light status__light--${data.registrationOpen ? 'warn' : 'online'}`}>
              {data.registrationOpen ? 'Public' : 'Invitation only'}
            </span>
          </div>
          <div className="panel__body">
            <p className="dim">
              {data.registrationOpen
                ? 'Anyone can create an account. Revoked addresses are still refused.'
                : 'Only invited addresses can create an account. Enforced inside Supabase Auth, not just this page.'}
            </p>
            <button type="button" className={`button${data.registrationOpen ? '' : ' button--danger'}`} disabled={busy} onClick={toggleRegistration}>
              {data.registrationOpen ? 'Close registration' : 'Open registration'}
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="counts">
          <div className="panel__head"><h2 id="counts">Population</h2></div>
          <dl className="tally">
            <div><dt>Profiles</dt><dd>{data.counts.profiles}</dd></div>
            <div><dt>Admins</dt><dd>{data.counts.admins}</dd></div>
            <div><dt>Active</dt><dd>{data.counts.activeTesters}</dd></div>
            <div><dt>Invited</dt><dd>{data.counts.invited}</dd></div>
            <div><dt>Revoked</dt><dd>{data.counts.revoked}</dd></div>
          </dl>
        </section>

        <section className="panel admin__wide" aria-labelledby="testers">
          <div className="panel__head"><h2 id="testers">Testers</h2><span>{data.testers.length} on file</span></div>
          <div className="panel__body">
            <InviteForm busy={busy} onInvite={(email, note) => run(
              () => api<AdminOverview>('/admin/testers', { method: 'POST', body: { email, note: note || undefined } }),
              `${email} can now register.`,
            )} />
          </div>
          <ul className="roster">
            {data.testers.map((t) => (
              <TesterRow key={t.email} tester={t} busy={busy} onToggle={(revoke) => run(
                () => api<AdminOverview>(`/admin/testers/${encodeURIComponent(t.email)}/${revoke ? 'revoke' : 'restore'}`, { method: 'POST' }),
                revoke ? `${t.email} revoked.` : `${t.email} restored.`,
              )} />
            ))}
          </ul>
        </section>

        <section className="panel admin__wide" aria-labelledby="audit">
          <div className="panel__head"><h2 id="audit">Audit log</h2><span>last 25</span></div>
          {data.audit.length === 0 ? (
            <p className="panel__body faint">Nothing yet.</p>
          ) : (
            <ol className="log">
              {data.audit.map((a) => (
                <li key={a.id}>
                  <time dateTime={a.createdAt}>{demaDate(a.createdAt)} {a.createdAt.slice(11, 16)}</time>
                  <span>{a.action}</span>
                  <span className="faint">{a.target ?? ''}</span>
                  <span className="dim">{a.actor ?? 'system'}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function InviteForm({ busy, onInvite }: { busy: boolean; onInvite: (email: string, note: string) => Promise<boolean> }) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // keep what was typed if it failed, so it can be corrected
    if (await onInvite(email.trim(), note.trim())) {
      setEmail('');
      setNote('');
    }
  };

  return (
    <form className="invite" onSubmit={(e) => void submit(e)}>
      <div>
        <label className="label" htmlFor="invite-email">Email to invite</label>
        <input id="invite-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="invite-note">Note (optional)</label>
        <input id="invite-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button type="submit" className="button button--primary" disabled={busy}>Invite</button>
      <p className="hint invite__hint">
        This adds the address to the list. Send them the site link yourself — they register with this exact address.
      </p>
    </form>
  );
}

function TesterRow({ tester: t, busy, onToggle }: { tester: Tester; busy: boolean; onToggle: (revoke: boolean) => void }) {
  const light = t.status === 'active' ? 'online' : t.status === 'revoked' ? 'warn' : 'off';
  return (
    <li className="roster__row">
      <div className="roster__who">
        <span className="mono">{t.email}</span>
        <span className="faint">{t.username ? `@${t.username}` : 'no account yet'} · {t.source}{t.note ? ` · ${t.note}` : ''}</span>
      </div>
      <span className={`status__light status__light--${light}`}>{t.status}</span>
      <button
        type="button" className={`button button--small${t.status === 'revoked' ? '' : ' button--danger'}`} disabled={busy}
        onClick={() => onToggle(t.status !== 'revoked')}
        aria-label={`${t.status === 'revoked' ? 'Restore' : 'Revoke'} ${t.email}`}
      >
        {t.status === 'revoked' ? 'Restore' : 'Revoke'}
      </button>
    </li>
  );
}
