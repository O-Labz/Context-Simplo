/**
 * GitLab adapter (merge requests / issues).
 *
 * SECURITY: egress is restricted to the configured GITLAB_HOST (SSRF control);
 * arbitrary hosts are rejected. Upstream 401/403 -> `VcsAuthError` (502),
 * 429 -> `VcsRateLimitError` (429 + Retry-After). Read-only.
 */

import { EventValidationError, VcsAuthError, VcsRateLimitError } from '../../core/errors.js';
import type { EventStore } from '../events/store.js';
import { repoIdFromFullName } from './webhook.js';

/**
 * Validate the GitLab base URL against the configured allowed host (SSRF
 * control). The default allowed host is gitlab.com.
 */
export function assertGitlabHost(baseUrl: string, allowedHost: string = 'gitlab.com'): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new EventValidationError(`invalid GitLab base URL: ${baseUrl}`);
  }
  if (url.protocol !== 'https:') {
    throw new EventValidationError(`GitLab base URL must be https: ${baseUrl}`);
  }
  let allowed: URL;
  try {
    allowed = new URL(allowedHost.includes('://') ? allowedHost : `https://${allowedHost}`);
  } catch {
    throw new EventValidationError(`invalid configured GitLab host: ${allowedHost}`);
  }
  if (url.host !== allowed.host) {
    throw new EventValidationError(`disallowed GitLab host (SSRF control): ${url.host}`);
  }
  return url;
}

export interface GitlabAdapterOptions {
  token?: string;
  host?: string;
  fetchImpl?: typeof fetch;
}

export class GitlabAdapter {
  private readonly token?: string;
  private readonly host: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GitlabAdapterOptions = {}) {
    this.host = opts.host ?? 'https://gitlab.com';
    assertGitlabHost(this.host, this.host);
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get(path: string): Promise<unknown> {
    const url = `${this.host.replace(/\/$/, '')}/api/v4${path}`;
    assertGitlabHost(url, this.host);
    const res = await this.fetchImpl(url, {
      headers: this.token ? { 'PRIVATE-TOKEN': this.token } : {},
    });
    if (res.status === 401 || res.status === 403) {
      throw new VcsAuthError(`GitLab returned ${res.status}`);
    }
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      throw new VcsRateLimitError(retry ? Number(retry) : undefined);
    }
    if (!res.ok) {
      throw new VcsAuthError(`GitLab returned ${res.status}`);
    }
    return res.json();
  }

  /** Fetch MRs + issues for a project (URL-encoded path) and append events. */
  async ingest(eventStore: EventStore, projectPath: string, opts: { perPage?: number } = {}): Promise<number> {
    const encoded = encodeURIComponent(projectPath);
    const perPage = Math.min(opts.perPage ?? 30, 100);
    const repositoryId = repoIdFromFullName(projectPath);
    let count = 0;

    const mrs = (await this.get(`/projects/${encoded}/merge_requests?per_page=${perPage}`)) as Array<
      Record<string, unknown>
    >;
    for (const mr of mrs) {
      eventStore.append({
        type: 'vcs.pr.observed',
        source: 'vcs',
        sourceRef: `gitlab:mr:${mr.iid}`,
        repositoryId,
        payload: {
          url: mr.web_url,
          delta: { message: `${String(mr.title ?? '')}\n${String(mr.description ?? '')}`.trim() },
        },
      });
      count++;
    }

    const issues = (await this.get(`/projects/${encoded}/issues?per_page=${perPage}`)) as Array<
      Record<string, unknown>
    >;
    for (const issue of issues) {
      eventStore.append({
        type: 'vcs.issue.observed',
        source: 'vcs',
        sourceRef: `gitlab:issue:${issue.iid}`,
        repositoryId,
        payload: {
          url: issue.web_url,
          delta: { message: `${String(issue.title ?? '')}\n${String(issue.description ?? '')}`.trim() },
        },
      });
      count++;
    }

    return count;
  }
}
