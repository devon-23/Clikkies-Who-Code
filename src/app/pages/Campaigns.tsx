import { campaigns } from '../../../content/campaigns.ts';
import type { Campaign } from '../../shared/content/campaign.ts';
import { Restricted } from '../components/Doc.tsx';

// All five eras, in order. Nothing here links to a mission that does not
// exist: Blurryface says it is being restored, and the rest are sealed.
export function Campaigns() {
  return (
    <>
      <header className="page-head">
        <p className="kicker">Campaign directory · 5 eras recovered</p>
        <h1 className="page-head__title">Five files, one city</h1>
        <p className="page-head__lede">
          Each era opens only when the one before it is closed. Training grounds and the archive sit outside this order —
          they will be open whenever they are built.
        </p>
      </header>

      <ol className="eras">
        {campaigns.map((c, i) => (
          <EraCard key={c.id} campaign={c} previous={campaigns[i - 1]} />
        ))}
      </ol>
    </>
  );
}

function EraCard({ campaign: c, previous }: { campaign: Campaign; previous?: Campaign }) {
  const sealed = c.status === 'planned';
  const statusLabel = { playable: 'Open', in_development: 'Being restored', planned: 'Sealed' }[c.status];

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

        <details className="era__plan">
          <summary>What this campaign will contain</summary>
          <p>{c.plannedContent}</p>
        </details>
      </div>
      <p className="era__status">
        <span className={`status__light${c.status === 'in_development' ? ' status__light--warn' : ''}`}>{statusLabel}</span>
      </p>
    </li>
  );
}
