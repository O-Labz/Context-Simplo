import { useEmlResource } from './useEmlResource';
import { PanelCard, StateBlock } from './Panel';

interface KnowledgeGap {
  entityRef: string;
  entityType: string;
  riskScore: number;
  reasons: string[];
}

function riskColor(score: number): string {
  if (score >= 0.66) return 'text-error';
  if (score >= 0.33) return 'text-primary';
  return 'text-green-600';
}

export function GapsPanel({ repositoryId }: { repositoryId: string | null }) {
  const url = repositoryId ? `/api/eml/gaps?repositoryId=${repositoryId}&limit=20` : null;
  const { data, loading, error, disabled, reload } = useEmlResource<{ gaps: KnowledgeGap[] }>(url);
  const gaps = data?.gaps ?? [];

  return (
    <PanelCard title="Knowledge Gaps" icon="troubleshoot">
      <StateBlock
        loading={loading}
        error={error}
        disabled={disabled}
        empty={gaps.length === 0}
        onRetry={reload}
        emptyLabel="No knowledge gaps detected."
      />
      {!loading && !error && !disabled && gaps.length > 0 && (
        <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {gaps.map((g) => (
            <li key={g.entityRef} className="p-3 rounded-xl border border-outline-variant/15">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-on-surface truncate" title={g.entityRef}>
                  {g.entityRef}
                </span>
                <span className={`text-sm font-bold tabular-nums ${riskColor(g.riskScore)}`}>
                  {(g.riskScore * 100).toFixed(0)}%
                </span>
              </div>
              {g.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {g.reasons.map((r) => (
                    <span
                      key={r}
                      className="text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
