import { Link, NavLink, useParams } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import type { Diagnostics, PlayerDetail, PlayerRow } from '../../shared/api.ts';
import { demaDate } from '../../shared/dema.ts';
import { LinkFailed, Linking } from '../components/States.tsx';
import { useApi } from '../lib/useApi.ts';

// Operational views for the administrator. Progress and puzzle health only:
// notebook contents are never sent here, by design.

export function AdminTabs() {
  return (
    <nav className="tabs" aria-label="Administration">
      <NavLink end to="/admin" className="tabs__link">Registry</NavLink>
      <NavLink to="/admin/players" className="tabs__link">Players</NavLink>
      <NavLink to="/admin/diagnostics" className="tabs__link">Diagnostics</NavLink>
    </nav>
  );
}

const when = (iso: string | null) => (iso ? `${demaDate(iso)} ${iso.slice(11, 16)}` : '—');

export function AdminPlayers() {
  const { data, error, reload } = useApi<{ players: PlayerRow[] }>('/admin/players');
  return (
    <>
      <header className="page-head"><p className="kicker">Administration · restricted</p><h1 className="page-head__title">Players</h1></header>
      <AdminTabs />
      {error && !data ? <LinkFailed message={error} onRetry={() => void reload()} /> : !data ? <Linking /> : (
        <section className="panel">
          <div className="panel__head"><h2>{data.players.length} profiles</h2><span>last active</span></div>
          <ul className="roster">
            {data.players.map((p) => (
              <li key={p.username} className="roster__row">
                <div className="roster__who">
                  <Link className="mono" to={`/admin/players/${encodeURIComponent(p.username)}`}>{p.username}</Link>
                  <span className="faint">cycle {p.cycle} · {p.missionsCompleted} files · {p.evidence} records{p.role === 'admin' ? ' · admin' : ''}</span>
                </div>
                <span className="faint mono">{when(p.lastActive)}</span>
                <span />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function AdminPlayer() {
  const { username = '' } = useParams();
  const { data, error, reload } = useApi<PlayerDetail>(`/admin/players/${encodeURIComponent(username)}`);
  const hints = new Map(data?.hintsUsed.map((h) => [h.missionId, h.levels]));
  return (
    <>
      <header className="page-head"><p className="kicker"><Link to="/admin/players">Players</Link> · {username}</p><h1 className="page-head__title">{username}</h1></header>
      <AdminTabs />
      {error && !data ? <LinkFailed message={error} onRetry={() => void reload()} /> : !data ? <Linking /> : (
        <div className="admin">
          <section className="panel admin__wide">
            <div className="panel__head"><h2>Cycle {data.progress.run.number}</h2><span>{data.progress.evidenceCount} records · {data.progress.achievementCount} commendations</span></div>
            {data.progress.campaigns.map((c) => (
              <div key={c.id} className="admin__campaign" data-era={c.id}>
                <p className="kicker">{campaigns.find((x) => x.id === c.id)?.title} · {c.complete ? 'closed' : c.unlocked ? `${c.completed}/${c.required}` : 'sealed'}</p>
                {c.missions.length > 0 && (
                  <ul className="log">
                    {c.missions.map((m) => (
                      <li key={m.id}>
                        <span className="mono">{m.id}</span>
                        <span>{m.status}</span>
                        <span className="faint">{hints.get(m.id) ? `${hints.get(m.id)} hint${hints.get(m.id) === 1 ? '' : 's'}` : ''}</span>
                        <span className="dim">{m.completedEver && m.status !== 'completed' ? 'closed before' : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
          {data.progress.history.length > 0 && (
            <section className="panel admin__wide">
              <div className="panel__head"><h2>Earlier cycles</h2></div>
              <ol className="log">
                {data.progress.history.map((r) => (
                  <li key={r.number}><span>Cycle {r.number}</span><span className="faint">{when(r.startedAt)}</span><span className="faint">{when(r.completedAt)}</span><span>{r.missionsCompleted} files</span></li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </>
  );
}

export function AdminDiagnostics() {
  const { data, error, reload } = useApi<Diagnostics>('/admin/diagnostics');
  return (
    <>
      <header className="page-head">
        <p className="kicker">Administration · restricted</p>
        <h1 className="page-head__title">Diagnostics</h1>
        <p className="page-head__lede">Last 30 days. Wrong answers are kept, normalised, for 30 days to help tune puzzles and add fair variants — then deleted.</p>
      </header>
      <AdminTabs />
      {error && !data ? <LinkFailed message={error} onRetry={() => void reload()} /> : !data ? <Linking /> : (
        <div className="admin">
          <section className="panel admin__wide">
            <div className="panel__head"><h2>Puzzles</h2><span>attempts · solved · players · hints 1/2/3</span></div>
            {data.missions.length <= 1 && data.missions.every((m) => m.attempts === 0) ? (
              <p className="panel__body faint">No attempts yet.</p>
            ) : (
              <ul className="diag">
                {data.missions.map((m) => (
                  <li key={m.missionId} className="diag__row">
                    <div><span className="mono">{m.missionId}</span> <span className="faint">{m.title}</span></div>
                    <div className="diag__nums mono">{m.attempts} · {m.correct} · {m.players} · {m.hintUse.join('/')}</div>
                    {m.topWrong.length > 0 && (
                      <ul className="diag__wrong">{m.topWrong.map((w) => <li key={w.guess}><code>{w.guess}</code> ×{w.count}</li>)}</ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel__head"><h2>Content drift</h2><span>{data.orphans.length}</span></div>
            {data.orphans.length ? (
              <ul className="log">{data.orphans.map((o) => <li key={`${o.table}:${o.id}`}><span className="mono">{o.id}</span><span className="faint">{o.table}</span><span>{o.rows} rows</span><span /></li>)}</ul>
            ) : (
              <p className="panel__body faint">Every player row points at content that exists.</p>
            )}
            <p className="panel__body hint">Rows here usually mean an id was renamed in content. Players are unaffected; the engine ignores them.</p>
          </section>

          <section className="panel">
            <div className="panel__head"><h2>Recent errors</h2><span>{data.errors.length}</span></div>
            {data.errors.length ? (
              <ul className="log">{data.errors.map((e, i) => <li key={i}><time className="faint">{when(e.occurredAt)}</time><span className="mono">{e.route}</span><span>{e.message}</span><span className="faint">{e.requestId?.slice(0, 8)}</span></li>)}</ul>
            ) : (
              <p className="panel__body faint">None.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
