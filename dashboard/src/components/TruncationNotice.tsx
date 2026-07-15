/**
 * TruncationNotice Component
 *
 * Displays a warning when API results are truncated due to hard limits.
 * WCAG 2.2 AA compliant with proper contrast and keyboard accessibility.
 */

interface TruncationNoticeProps {
  total: number;
  shown: number;
  className?: string;
}

export default function TruncationNotice({ total, shown, className = '' }: TruncationNoticeProps) {
  const remaining = total - shown;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border-2 border-amber-600 bg-amber-50 text-amber-900 text-sm ${className}`}
      tabIndex={0}
    >
      <span className="material-symbols-outlined text-[20px] text-amber-600 mt-0.5" aria-hidden="true">
        warning
      </span>
      <div className="flex-1">
        <div className="font-semibold mb-1">Results Truncated</div>
        <div className="text-amber-800">
          Showing {shown.toLocaleString()} of {total.toLocaleString()} results. 
          {remaining > 0 && ` ${remaining.toLocaleString()} items not shown.`}
          {' '}Use filters or pagination to refine your query.
        </div>
      </div>
    </div>
  );
}
