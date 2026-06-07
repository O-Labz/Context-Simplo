import { useState } from 'react';
import { useEmlResource } from './useEmlResource';
import { PanelCard, StateBlock, ConfidenceBar } from './Panel';

interface MemoryView {
  id: string;
  kind: string;
  title: string;
  summary: string;
  confidence: number;
  freshness: number;
  contradictionScore?: number;
}

const KINDS = ['all', 'decision', 'failure', 'intent', 'gap', 'ownership', 'note'] as const;

const KIND_ICON: Record<string, string> = {
  decision: 'gavel',
  failure: 'warning',
  intent: 'flag',
  gap: 'help',
  ownership: 'group',
  note: 'sticky_note_2',
};

export function MemoryList({ repositoryId }: { repositoryId: string | null }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>('all');
  const url = repositoryId
    ? `/api/eml/memories?repositoryId=${repositoryId}${kind === 'all' ? '' : `&kind=${kind}`}`
    : null;
  const { data, loading, error, disabled, reload } = useEmlResource<{ results: MemoryView[] }>(url);
  const results = data?.results ?? [];

  return (
    <PanelCard
      title="Memories"
      icon="psychology"
      actions={
        <div className="flex items-center gap-2">
          <label htmlFor="mem-kind" className="sr-only">
            Filter by kind
          </label>
          <select
            id="mem-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <StateBlock
        loading={loading}
        error={error}
        disabled={disabled}
        empty={results.length === 0}
        onRetry={reload}
        emptyLabel="No memories captured yet."
      />
      {!loading && !error && !disabled && results.length > 0 && (
        <ul className="space-y-3 max-h-[36rem] overflow-y-auto pr-2 scrollable-panel">
          {results.map((m) => (
            <li
              key={m.id}
              className="p-3 rounded-xl border border-outline-variant/15 hover:bg-surface-container/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-base text-tertiary" aria-hidden="true">
                    {KIND_ICON[m.kind] ?? 'memory'}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                    {m.kind}
                  </span>
                </div>
                <ConfidenceBar value={m.confidence} />
              </div>
              <h3 className="text-sm font-semibold text-on-surface mt-1.5">{m.title}</h3>
              {m.summary && <p className="text-sm text-on-surface-variant mt-0.5 line-clamp-2">{m.summary}</p>}
              {m.contradictionScore && m.contradictionScore > 0 ? (
                <span className="inline-block mt-1.5 text-xs font-semibold text-error">
                  contradiction risk {(m.contradictionScore * 100).toFixed(0)}%
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
