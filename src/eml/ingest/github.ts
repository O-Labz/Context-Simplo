/**
 * GitHub adapter (PRs / issues / reviews).
 *
 * SECURITY: egress is restricted to api.github.com (SSRF control). Upstream
 * auth failures map to `VcsAuthError` (502) and rate limits to
 * `VcsRateLimitError` (429 + Retry-After). The adapter only reads.
 */

import { VcsAuthError, VcsRateLimitError } from '../../core/errors.js';
import { EventValidationError } from '../../core/errors.js';
import type { EventStore } from '../events/store.js';
import { repoIdFromFullName } from './webhook.js';

const ALLOWED_GITHUB_HOSTS = new Set(['api.github.com']);

/** Reject any base URL whose host is not the GitHub API (SSRF control). */
export function assertGithubHost(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new EventValidationError(`invalid GitHub base URL: ${baseUrl}`);
  }
  if (url.protocol !== 'https:') {
    throw new EventValidationError(`GitHub base URL must be https: ${baseUrl}`);
  }
  if (!ALLOWED_GITHUB_HOSTS.has(url.host)) {
    throw new EventValidationError(`disallowed GitHub host (SSRF control): ${url.host}`);
  }
}

function mapOctokitError(err: unknown): never {
  const status = (err as { status?: number }).status;
  if (status === 401 || status === 403) {
    // 403 with rate-limit headers is a rate limit, not auth.
    const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
    const remaining = headers?.['x-ratelimit-remaining'];
    if (status === 403 && remaining === '0') {
      const reset = headers?.['x-ratelimit-reset'];
      const retryAfter = reset ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) : undefined;
      throw new VcsRateLimitError(retryAfter, err instanceof Error ? err : undefined);
    }
    throw new VcsAuthError(`GitHub returned ${status}`, err instanceof Error ? err : undefined);
  }
  if (status === 429) {
    throw new VcsRateLimitError(undefined, err instanceof Error ? err : undefined);
  }
  throw err as Error;
}

export interface GithubAdapterOptions {
  token?: string;
  baseUrl?: string;
}

export class GithubAdapter {
  private readonly token?: string;
  private readonly baseUrl: string;

  constructor(opts: GithubAdapterOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://api.github.com';
    assertGithubHost(this.baseUrl);
    this.token = opts.token;
  }

  private async client(): Promise<import('@octokit/rest').Octokit> {
    const { Octokit } = await import('@octokit/rest');
    return new Octokit({ auth: this.token, baseUrl: this.baseUrl });
  }

  /**
   * Fetch recent PRs/issues for a repo and append `vcs.*` events. Read-only.
   */
  async ingest(eventStore: EventStore, owner: string, repo: string, opts: { perPage?: number } = {}): Promise<number> {
    const octokit = await this.client();
    const repositoryId = repoIdFromFullName(`${owner}/${repo}`);
    const perPage = Math.min(opts.perPage ?? 30, 100);
    let count = 0;

    try {
      const prs = await octokit.pulls.list({ owner, repo, state: 'all', per_page: perPage });
      for (const pr of prs.data) {
        eventStore.append({
          type: 'vcs.pr.observed',
          source: 'vcs',
          sourceRef: `github:pr:${pr.number}`,
          repositoryId,
          payload: {
            number: pr.number,
            url: pr.html_url,
            author: pr.user?.login,
            merged: Boolean(pr.merged_at),
            delta: { message: `${pr.title ?? ''}\n${pr.body ?? ''}`.trim() },
          },
        });
        count++;
      }

      const issues = await octokit.issues.listForRepo({ owner, repo, state: 'all', per_page: perPage });
      for (const issue of issues.data) {
        if (issue.pull_request) continue; // issues endpoint also returns PRs
        eventStore.append({
          type: 'vcs.issue.observed',
          source: 'vcs',
          sourceRef: `github:issue:${issue.number}`,
          repositoryId,
          payload: {
            number: issue.number,
            url: issue.html_url,
            delta: { message: `${issue.title ?? ''}\n${issue.body ?? ''}`.trim() },
          },
        });
        count++;
      }
    } catch (err) {
      mapOctokitError(err);
    }

    return count;
  }
}
