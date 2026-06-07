import { useEmlResource } from './useEmlResource';
import { PanelCard, StateBlock } from './Panel';

interface DriftViolation {
  ruleId: string;
  ruleType: string;
  fromRef: string;
  toRef?: string;
  explanation: string;
}

export function DriftPanel({ repositoryId }: { repositoryId: string | null }) {
  const url = repositoryId ? `/api/eml/drift?repositoryId=${repositoryId}` : null;
  const { data, loading, error, disabled, reload } = useEmlResource<{ violations: DriftViolation[] }>(url);
  const violations = data?.violations ?? [];

  return (
    <PanelCard
      title="Architecture Drift"
      icon="rule"
      actions={
        violations.length > 0 ? (
          <span className="text-xs font-semibold text-error bg-error/10 px-2.5 py-1 rounded-full">
            {violations.length} violation{violations.length === 1 ? '' : 's'}
          </span>
        ) : undefined
      }
    >
      <StateBlock
        loading={loading}
        error={error}
        disabled={disabled}
        empty={violations.length === 0}
        onRetry={reload}
        emptyLabel="No drift detected. Architecture matches declared rules."
      />
      {!loading && !error && !disabled && violations.length > 0 && (
        <ul className="space-y-2 max-h-[36rem] overflow-y-auto pr-2 scrollable-panel">
          {violations.map((v, i) => (
            <li key={`${v.ruleId}-${i}`} className="p-3 rounded-xl bg-error/5 border border-error/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-base text-error" aria-hidden="true">
                  warning
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-error">{v.ruleType}</span>
              </div>
              <p className="text-sm text-on-surface">{v.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
