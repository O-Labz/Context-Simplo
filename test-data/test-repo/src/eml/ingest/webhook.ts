/**
 * Webhook verification + payload mapping.
 *
 * SECURITY: signatures are verified with a constant-time comparison BEFORE the
 * body is parsed. Unverified bodies are never JSON-parsed or acted upon. GitHub
 * uses HMAC-SHA256 (`X-Hub-Signature-256`); GitLab uses a shared secret token
 * (`X-Gitlab-Token`).
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { createHash } from 'crypto';
import { WebhookSignatureError } from '../../core/errors.js';
import type { EmlEventInput } from '../events/types.js';

export const MAX_WEBHOOK_BYTES = 1_000_000; // 1MB

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Derive a stable 16-hex repository id from a VCS repo full name. */
export function repoIdFromFullName(fullName: string): string {
  return createHash('sha256').update(fullName).digest('hex').slice(0, 16);
}

/**
 * Verify a GitHub HMAC-SHA256 signature. Throws `WebhookSignatureError` on any
 * mismatch or missing secret/header.
 */
export function verifyGithubSignature(secret: string, rawBody: Buffer, signatureHeader?: string): void {
  if (!secret) throw new WebhookSignatureError('no webhook secret configured');
  if (!signatureHeader) throw new WebhookSignatureError('missing X-Hub-Signature-256 header');
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!constantTimeEqual(signatureHeader, expected)) {
    throw new WebhookSignatureError();
  }
}

/** Verify a GitLab shared-secret token (constant-time). */
export function verifyGitlabToken(secret: string, tokenHeader?: string): void {
  if (!secret) throw new WebhookSignatureError('no webhook secret configured');
  if (!tokenHeader) throw new WebhookSignatureError('missing X-Gitlab-Token header');
  if (!constantTimeEqual(tokenHeader, secret)) {
    throw new WebhookSignatureError('token mismatch');
  }
}

interface GithubRepoPayload {
  repository?: { full_name?: string };
}

function githubRepoId(payload: GithubRepoPayload): string {
  const fullName = payload.repository?.full_name ?? 'unknown/unknown';
  return repoIdFromFullName(fullName);
}

/** Map a verified GitHub webhook to EML events. Unknown events map to []. */
export function mapGithubEvent(eventName: string | undefined, payload: unknown): EmlEventInput[] {
  const p = (payload ?? {}) as Record<string, unknown> & GithubRepoPayload;
  const repositoryId = githubRepoId(p);

  if (eventName === 'pull_request') {
    const pr = (p.pull_request ?? {}) as Record<string, unknown>;
    const title = String(pr.title ?? '');
    const body = String(pr.body ?? '');
    return [
      {
        type: 'vcs.pr.observed',
        source: 'webhook',
        sourceRef: `github:pr:${pr.number ?? 'unknown'}`,
        repositoryId,
        payload: {
          action: p.action,
          number: pr.number,
          url: pr.html_url,
          author: (pr.user as Record<string, unknown> | undefined)?.login,
          merged: pr.merged,
          delta: { message: `${title}\n${body}`.trim() },
        },
      },
    ];
  }

  if (eventName === 'issues') {
    const issue = (p.issue ?? {}) as Record<string, unknown>;
    const title = String(issue.title ?? '');
    const body = String(issue.body ?? '');
    return [
      {
        type: 'vcs.issue.observed',
        source: 'webhook',
        sourceRef: `github:issue:${issue.number ?? 'unknown'}`,
        repositoryId,
        payload: {
          action: p.action,
          number: issue.number,
          url: issue.html_url,
          delta: { message: `${title}\n${body}`.trim() },
        },
      },
    ];
  }

  if (eventName === 'pull_request_review') {
    const review = (p.review ?? {}) as Record<string, unknown>;
    const pr = (p.pull_request ?? {}) as Record<string, unknown>;
    return [
      {
        type: 'vcs.review.observed',
        source: 'webhook',
        sourceRef: `github:review:${review.id ?? 'unknown'}`,
        repositoryId,
        payload: {
          state: review.state,
          prNumber: pr.number,
          author: (review.user as Record<string, unknown> | undefined)?.login,
          delta: { message: String(review.body ?? '') },
        },
      },
    ];
  }

  return [];
}

/** Map a verified GitLab webhook to EML events. Unknown events map to []. */
export function mapGitlabEvent(payload: unknown): EmlEventInput[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const project = (p.project ?? {}) as Record<string, unknown>;
  const repositoryId = repoIdFromFullName(String(project.path_with_namespace ?? 'unknown/unknown'));
  const kind = p.object_kind;

  if (kind === 'merge_request') {
    const attrs = (p.object_attributes ?? {}) as Record<string, unknown>;
    return [
      {
        type: 'vcs.pr.observed',
        source: 'webhook',
        sourceRef: `gitlab:mr:${attrs.iid ?? 'unknown'}`,
        repositoryId,
        payload: {
          action: attrs.action,
          url: attrs.url,
          delta: { message: `${String(attrs.title ?? '')}\n${String(attrs.description ?? '')}`.trim() },
        },
      },
    ];
  }

  if (kind === 'issue') {
    const attrs = (p.object_attributes ?? {}) as Record<string, unknown>;
    return [
      {
        type: 'vcs.issue.observed',
        source: 'webhook',
        sourceRef: `gitlab:issue:${attrs.iid ?? 'unknown'}`,
        repositoryId,
        payload: {
          action: attrs.action,
          url: attrs.url,
          delta: { message: `${String(attrs.title ?? '')}\n${String(attrs.description ?? '')}`.trim() },
        },
      },
    ];
  }

  if (kind === 'note') {
    const attrs = (p.object_attributes ?? {}) as Record<string, unknown>;
    return [
      {
        type: 'vcs.review.observed',
        source: 'webhook',
        sourceRef: `gitlab:note:${attrs.id ?? 'unknown'}`,
        repositoryId,
        payload: {
          url: attrs.url,
          delta: { message: String(attrs.note ?? '') },
        },
      },
    ];
  }

  return [];
}
