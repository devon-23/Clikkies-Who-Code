import type { ComponentType } from 'react';
import type { MissionView } from '../../../shared/api.ts';
import { EvidenceLink } from '../Records.tsx';

// Each mission opens in one reusable interface -- a document viewer, a fake
// website, a terminal, a cipher bench -- named by `interaction.component` in
// its content. Interfaces are added here as the missions that need them are
// built (Milestone 4). Their props come from content and are public: they
// never contain a solution.

export interface InteractionProps {
  view: MissionView;
  props: Record<string, unknown>;
  /** called after the interface saves its working state */
  onStateSaved: (version: number, state: Record<string, unknown>) => void;
}

const INTERFACES: Partial<Record<string, ComponentType<InteractionProps>>> = {};

export function Interaction({ view, onStateSaved }: { view: MissionView; onStateSaved: InteractionProps['onStateSaved'] }) {
  const Component = INTERFACES[view.interaction.component];
  if (Component) return <Component view={view} props={view.interaction.props} onStateSaved={onStateSaved} />;

  // the plain workspace: the file's records, to read side by side
  return (
    <section className="panel workspace" aria-labelledby="workspace">
      <div className="panel__head"><h2 id="workspace">Workspace</h2><span>{view.interaction.component}</span></div>
      <div className="panel__body">
        {view.evidence.length ? (
          <>
            <p className="dim">Open each record in this file. Read them against each other.</p>
            <div className="evlist">{view.evidence.map((e) => <EvidenceLink key={e.id} record={e} />)}</div>
          </>
        ) : (
          <p className="faint">No records in this file yet.</p>
        )}
      </div>
    </section>
  );
}
