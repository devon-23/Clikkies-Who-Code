import { Link } from 'react-router';
import { campaigns } from '../../../content/campaigns.ts';
import type { CampaignProgress, MissionSummary, ProgressResponse } from '../../shared/api.ts';
import type { Campaign } from '../../shared/content/campaign.ts';
import { Restricted } from '../components/Doc.tsx';
import { useApi } from '../lib/useApi.ts';

// All five eras, in order. Whether one is open comes from the server; what it
// is about comes from content/campaigns.ts. Nothing links to a mission that
// does not exist or is not open.
export function Campaigns() {
  const { data, error } = useApi<ProgressResponse>('/progress');

  return (
    <>
      <header className="page-head">
        <p className="kicker">Campaign directory · 5 eras recovered{data && data.run.number > 1 ? ` · cycle ${data.run.number}` : ''}</p>
        <h1 className="page-head__title">Five files, one city</h1>
        <p className="page-head__lede">
          Each era opens only when the one before it is closed. Training grounds and the archive sit outside this order.
        </p>
      </header>

      {error && <p className="alert" role="alert">{error}</p>}

      <ol className="eras">
        {campaigns.map((c, i) => (
          <EraCard key={c.id} campaign={c} previous={campaigns[i - 1]} progress={data?.campaigns.find((p) => p.id === c.id)} />
        ))}
      </ol>
    </>
  );
}

const LABEL: Record<MissionSummary['status'], string> = {
  locked: 'Sealed', available: 'Open', in_progress: 'In progress', completed: 'Closed',
};

function EraCard({ campaign: c, previous, progress: p }: { campaign: Campaign; previous?: Campaign; progress?: CampaignProgress }) {
  const hasMissions = (p?.missions.length ?? 0) > 0;
  const sealed = p ? !p.unlocked : c.order > 1;

  let status: { text: string; tone: '' | 'warn' | 'online' };
  if (p?.complete) status = { text: 'Closed', tone: 'online' };
  else if (!sealed && hasMissions) status = { text: `${p!.completed}/${p!.required} closed`, tone: 'online' };
  else if (!sealed) status = { text: c.status === 'in_development' ? 'Being restored' : 'Not built yet', tone: 'warn' };
  else status = { text: 'Sealed', tone: '' };

  return (
    <li className={`era${sealed ? ' era--sealed' : ''}`} data-era={c.id}>
      <div className="era__index" aria-hidden="true">{String(c.order).padStart(2, '0')}</div>
      <div className="era__body">
        <p className="kicker">{c.chapter} · {c.difficulty}</p>
        <h2 className="era__title">{c.title}</h2>
        <p className="era__tagline">{c.tagline}</p>
        <p className="era__teaser">{c.teaser}</p>

        {sealed && previous && (
          <Restricted code={`ERA-0${c.order}`}>Sealed until {previous.title} is closed</Restricted>
        )}

        {!sealed && hasMissions && (
          <ol className="missions">
            {p!.missions.map((m) => (
              <li key={m.id} className={`missions__row missions__row--${m.status}`}>
                <span className="missions__n">{String(m.order).padStart(2, '0')}</span>
                {m.status === 'locked' ? (
                  <span className="missions__title"><span className="redacted" aria-hidden="true">{'█'.repeat(12)}</span><span className="visually-hidden">Sealed mission</span></span>
                ) : (
                  <Link className="missions__title" to={`/missions/${m.id}`}>{m.title}</Link>
                )}
                <span className="missions__tags">
                  {m.optional && <span className="tag">optional</span>}
                  {m.finale && <span className="tag">finale</span>}
                  {m.completedEver && m.status !== 'completed' && <span className="tag" title="Closed in an earlier cycle">seen before</span>}
                </span>
                <span className={`status__light${m.status === 'completed' ? ' status__light--online' : m.status === 'in_progress' ? ' status__light--warn' : ''}`}>{LABEL[m.status]}</span>
              </li>
            ))}
          </ol>
        )}

        <details className="era__plan">
          <summary>What this campaign contains</summary>
          <p>{c.plannedContent}</p>
        </details>
      </div>
      <p className="era__status">
        <span className={`status__light${status.tone ? ` status__light--${status.tone}` : ''}`}>{status.text}</span>
      </p>
    </li>
  );
}
