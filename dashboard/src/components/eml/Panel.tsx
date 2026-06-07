import type { ReactNode, ReactElement } from 'react';

export function PanelCard({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-6 shadow-sm"
      aria-label={title}
    >
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary" aria-hidden="true">
            {icon}
          </span>
          <h2 className="text-lg font-bold text-on-surface tracking-tight">{title}</h2>
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/**
 * Renders the standard loading/error/disabled/empty states. Returns null when
 * the panel has data to show (the caller renders the success content).
 */
export function StateBlock({
  loading,
  error,
  disabled,
  empty,
  onRetry,
  emptyLabel = 'Nothing here yet.',
}: {
  loading: boolean;
  error: string | null;
  disabled: boolean;
  empty: boolean;
  onRetry?: () => void;
  emptyLabel?: string;
}): ReactElement | null {
  if (disabled) {
    return (
      <div className="py-8 text-center" role="status">
        <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2 block" aria-hidden="true">
          memory_alt
        </span>
        <p className="text-sm text-on-surface-variant">
          Engineering Memory Layer is disabled. Set <code className="font-mono">EML_ENABLED=true</code> to enable it.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-on-surface-variant" role="status" aria-live="polite">
        <span className="material-symbols-outlined animate-spin align-middle mr-2" aria-hidden="true">
          progress_activity
        </span>
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="py-8 text-center" role="alert">
        <span className="material-symbols-outlined text-3xl text-error mb-2 block" aria-hidden="true">
          error
        </span>
        <p className="text-sm text-on-surface-variant mb-3">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-surface-container-highest text-on-surface text-sm font-semibold rounded-lg hover:bg-surface-container-high transition-all"
          >
            Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="py-8 text-center text-sm text-on-surface-variant" role="status">
        {emptyLabel}
      </div>
    );
  }
  return null;
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = pct >= 70 ? '#16a34a' : pct >= 40 ? 'var(--primary)' : 'var(--error)';
  return (
    <div className="flex items-center gap-2" title={`Confidence ${pct}%`}>
      <div className="w-16 h-1.5 bg-surface-container-low rounded-full overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-on-surface-variant tabular-nums">{pct}%</span>
    </div>
  );
}
