import { useEmlResource } from './useEmlResource';
import { PanelCard, StateBlock } from './Panel';

interface TimelineEntry {
  id: string;
  kind: string;
  title: string;
  occurredAt: string;
}

const KIND_COLOR: Record<string, string> = {
  decision: 'bg-tertiary',
  failure: 'bg-error',
  diff: 'bg-primary',
};

export function TimelinePanel({ repositoryId }: { repositoryId: string | null }) {
  const url = repositoryId ? `/api/eml/timeline?repositoryId=${repositoryId}&limit=50` : null;
  const { data, loading, error, disabled, reload } = useEmlResource<{ entries: TimelineEntry[] }>(url);
  const entries = data?.entries ?? [];

  return (
    <PanelCard title="Evolution Timeline" icon="timeline">
      <StateBlock
        loading={loading}
        error={error}
        disabled={disabled}
        empty={entries.length === 0}
        onRetry={reload}
        emptyLabel="No timeline events yet."
      />
      {!loading && !error && !disabled && entries.length > 0 && (
        <ol className="relative border-l border-outline-variant/30 ml-2 space-y-4 max-h-[36rem] overflow-y-auto pr-2 scrollable-panel">
          {entries.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="ml-4">
              <span
                className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full ${KIND_COLOR[e.kind] ?? 'bg-on-surface-variant'}`}
                aria-hidden="true"
              />
              <time className="text-xs text-on-surface-variant tabular-nums">
                {new Date(e.occurredAt).toLocaleDateString()}
              </time>
              <p className="text-sm font-medium text-on-surface">
                <span className="text-xs font-semibold uppercase tracking-wider text-tertiary mr-2">{e.kind}</span>
                {e.title}
              </p>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  );
}
