import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../lib/auth';

export interface EmlResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True when the EML backend is disabled (HTTP 503 eml_disabled). */
  disabled: boolean;
  reload: () => void;
}

/**
 * Fetches an EML REST resource and exposes the four required UI states:
 * loading, error, disabled (503), and success (with empty handled by callers).
 */
export function useEmlResource<T>(url: string | null): EmlResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const load = useCallback(async () => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setDisabled(false);
    try {
      const res = await authFetch(url);
      if (res.status === 503) {
        setDisabled(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || body.error || `HTTP ${res.status}`);
      }
      setData((await res.json()) as T);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, disabled, reload: load };
}
