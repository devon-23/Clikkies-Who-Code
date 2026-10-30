import { Link } from 'react-router';
import type { EvidenceBlock, EvidenceRecord, EvidenceSummary, MeResponse, ProgressResponse } from '../../shared/api.ts';
import { BISHOPS, demaDate, districtFor } from '../../shared/dema.ts';
import { Doc, Field, Redacted } from './Doc.tsx';

// The record Dema keeps on the player. What it says changes as the story
// moves -- for now, before any campaign is closed, it is the official version.
export function CitizenRecord({ me, progress }: { me: MeResponse; progress?: ProgressResponse }) {
  const district = districtFor(me.id);
  const cycle = progress?.run.number ?? 1;
  return (
    <Doc as="h2" title="Citizen identification record" form="FORM D-17 · REV. 4" lit={district} stamp="Citizen">
      <div className="fields">
        <Field label="Name" strong blank><Redacted length={9} reveal="not recorded" /></Field>
        <div className="fields fields--2">
          <Field label="Designation" blank>Unassigned</Field>
          <Field label="District">{BISHOPS[district]}</Field>
        </div>
        <div className="fields fields--2">
          <Field label="Standing">Good</Field>
          <Field label="Record opened">{demaDate(me.profile?.createdAt ?? Date.now())}</Field>
        </div>
        {/* the record never admits to a second cycle */}
        <Field label="Departures on file">{cycle > 1 ? <Redacted length={4} reveal="redacted" /> : 'None'}</Field>
      </div>
    </Doc>
  );
}

const CLASS_LABEL = { public: 'Public', restricted: 'Restricted', classified: 'Classified' } as const;

// One recovered record, on paper. Not every record is a Dema document, so
// there is no letterhead -- just the archive's own file header.
export function EvidenceSheet({ record }: { record: EvidenceRecord }) {
  return (
    <article className="doc evidence" data-era={record.campaign}>
      <header className="evidence__head">
        <span className="evidence__file">{record.fileNo}</span>
        <span className={`evidence__class evidence__class--${record.classification}`}>{CLASS_LABEL[record.classification]}</span>
      </header>
      <h1 className="doc__title evidence__title">{record.title}</h1>
      <dl className="registry evidence__meta">
        <div className="registry__row"><dt>Type</dt><dd>{record.kind}</dd></div>
        <div className="registry__row"><dt>Source</dt><dd>{record.source}</dd></div>
        {record.dated && <div className="registry__row"><dt>Dated</dt><dd>{demaDate(`${record.dated}T00:00:00Z`)}</dd></div>}
        <div className="registry__row"><dt>Recovered</dt><dd>{demaDate(record.discoveredAt)}</dd></div>
      </dl>
      <hr className="doc__rule" />
      <div className="evidence__body">
        {record.body.map((b, i) => <Block key={i} block={b} />)}
      </div>
      {record.hidden && <span className="doc__stamp" aria-hidden="true">Off book</span>}
    </article>
  );
}

function Block({ block: b }: { block: EvidenceBlock }) {
  switch (b.type) {
    case 'paragraph': return <p>{b.text}</p>;
    case 'heading': return <h2 className="evidence__h">{b.text}</h2>;
    case 'preformatted': return <pre className="evidence__pre">{b.text}</pre>;
    case 'redacted': return <p><Redacted length={b.length} /></p>;
    case 'quote': return (
      <blockquote className="evidence__quote">
        <p>{b.text}</p>
        {b.attribution && <footer>— {b.attribution}</footer>}
      </blockquote>
    );
    case 'fields': return (
      <dl className="registry">
        {b.rows.map(([k, v], i) => <div key={i} className="registry__row"><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    );
  }
}

// a recovered record, as a line in a list
export function EvidenceLink({ record }: { record: EvidenceSummary }) {
  return (
    <Link to={`/archive/${record.id}`} className="evlink" data-era={record.campaign}>
      <span className="evlink__file">{record.fileNo}</span>
      <span className="evlink__title">{record.title}</span>
      <span className="evlink__kind">{record.kind}</span>
    </Link>
  );
}
