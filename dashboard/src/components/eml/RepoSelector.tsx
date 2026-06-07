import { useEffect, useState } from 'react';

interface Repository {
  id: string;
  name: string;
}

interface HealthState {
  ok: boolean;
  pendingEvents?: number;
}

export function RepoSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    fetch('/api/repositories')
      .then((r) => r.json())
      .then((data) => {
        const list: Repository[] = (data.repositories || data || []).map((r: Repository) => ({
          id: r.id,
          name: r.name,
        }));
        setRepos(list);
        if (!value && list[0]) onChange(list[0].id);
      })
      .catch(() => setRepos([]));
  }, []);

  useEffect(() => {
    fetch('/api/eml/health')
      .then(async (r) => {
        if (r.status === 503) {
          setDisabled(true);
          return null;
        }
        return r.json();
      })
      .then((data) => data && setHealth(data))
      .catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="eml-repo" className="text-sm font-semibold text-on-surface-variant">
        Repository
      </label>
      <select
        id="eml-repo"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-tertiary"
      >
        {repos.length === 0 && <option value="">No repositories</option>}
        {repos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          disabled
            ? 'bg-surface-container-high text-on-surface-variant'
            : health?.ok
              ? 'bg-green-500/10 text-green-600'
              : 'bg-error/10 text-error'
        }`}
        role="status"
      >
        <span
          className={`w-2 h-2 rounded-full ${
            disabled ? 'bg-outline-variant' : health?.ok ? 'bg-green-500' : 'bg-error'
          }`}
          aria-hidden="true"
        />
        {disabled ? 'EML disabled' : health?.ok ? 'EML healthy' : 'EML unavailable'}
        {health?.pendingEvents ? ` · ${health.pendingEvents} pending` : ''}
      </span>
    </div>
  );
}
