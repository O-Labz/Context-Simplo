import { useEmlResource } from './useEmlResource';
import { PanelCard, StateBlock } from './Panel';

interface IntentRecord {
  memoryId: string;
  goal: string;
  category: string;
  status: string;
  priority: number;
  targetDate?: string | null;
}

export function IntentsPanel({ repositoryId }: { repositoryId: string | null }) {
  const url = repositoryId ? `/api/eml/intents?repositoryId=${repositoryId}&limit=50` : null;
  const { data, loading, error, disabled, reload } = useEmlResource<{ results: IntentRecord[] }>(url);
  const intents = data?.results ?? [];

  return (
    <PanelCard title="Active Goals" icon="flag">
      <StateBlock
        loading={loading}
        error={error}
        disabled={disabled}
        empty={intents.length === 0}
        onRetry={reload}
        emptyLabel="No active goals tracked."
      />
      {!loading && !error && !disabled && intents.length > 0 && (
        <ul className="space-y-2 max-h-[36rem] overflow-y-auto pr-2 scrollable-panel">
          {intents.map((it) => (
            <li key={it.memoryId} className="p-3 rounded-xl border border-outline-variant/15">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-on-surface">{it.goal}</span>
                <span className="text-xs font-semibold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">
                  P{it.priority}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                <span className="uppercase tracking-wider">{it.category}</span>
                <span aria-hidden="true">·</span>
                <span>{it.status}</span>
                {it.targetDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>due {new Date(it.targetDate).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
