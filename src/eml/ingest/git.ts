/**
 * Git authorship ingest.
 *
 * Reads commit authorship (name/email/timestamp) and the files touched, then:
 *  - resolves the author to a `people` row (email is Confidential)
 *  - records `ownership_signals` (commit/authorship) per touched file
 *  - emits a `git.author.observed` event (carrying the masked author, never the
 *    full email)
 *
 * Implements `AuthorshipRecorder` so the diff observer can attach authorship.
 */

import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { EventStore } from '../events/store.js';
import { PeopleEngine, maskEmail, type Person } from '../engines/people.js';
import {
  assertSafeRev,
  parseNameStatus,
  type AuthorshipRecorder,
  type GitDiffRunner,
} from './diff.js';

const NUL = '\u0000';

export type OwnershipEntityType = 'file' | 'service' | 'repo' | 'symbol';
export type OwnershipSignalType = 'commit' | 'review' | 'authorship' | 'discussion';

export interface OwnershipSignalInput {
  personId: string;
  entityType: OwnershipEntityType;
  entityRef: string;
  signal: OwnershipSignalType;
  weight: number;
  lastActivityAt: string;
}

export interface CommitAuthorship {
  person: Person;
  date: string;
  files: string[];
}

export class GitIngest implements AuthorshipRecorder {
  private readonly db: Database.Database;
  private readonly eventStore: EventStore;
  private readonly people: PeopleEngine;

  constructor(db: Database.Database, eventStore: EventStore, people?: PeopleEngine) {
    this.db = db;
    this.eventStore = eventStore;
    this.people = people ?? new PeopleEngine(db);
  }

  /** Record a single ownership signal row. */
  addOwnershipSignal(input: OwnershipSignalInput): string {
    const id = `own_${randomUUID()}`;
    this.db
      .prepare(
        `INSERT INTO ownership_signals
           (id, person_id, entity_type, entity_ref, signal, weight, last_activity_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.personId, input.entityType, input.entityRef, input.signal, input.weight, input.lastActivityAt);
    return id;
  }

  /**
   * Observe authorship for a revision: resolve the author, record per-file
   * ownership signals, emit `git.author.observed`.
   */
  async observeAuthorship(
    runner: GitDiffRunner,
    repositoryId: string,
    rev: string
  ): Promise<CommitAuthorship | null> {
    assertSafeRev(rev);

    const raw = await runner.raw(['show', '-s', `--format=%an${NUL}%ae${NUL}%aI`, rev]);
    const [displayName, email, date] = raw.replace(/\n$/, '').split(NUL);
    if (!displayName) return null;

    const person = this.people.resolve({ displayName, email: email ?? null });
    const activityAt = date && date.trim() ? date.trim() : new Date().toISOString();

    const nameStatus = await runner.raw(['diff', '--name-status', `${rev}~1`, rev]);
    const files = parseNameStatus(nameStatus)
      .filter((e) => e.status !== 'D')
      .map((e) => e.path);

    for (const file of files) {
      this.addOwnershipSignal({
        personId: person.id,
        entityType: 'file',
        entityRef: file,
        signal: 'commit',
        weight: 1,
        lastActivityAt: activityAt,
      });
    }

    // Repo-level authorship signal.
    this.addOwnershipSignal({
      personId: person.id,
      entityType: 'repo',
      entityRef: repositoryId,
      signal: 'authorship',
      weight: 1,
      lastActivityAt: activityAt,
    });

    this.eventStore.append({
      type: 'git.author.observed',
      source: 'git',
      sourceRef: `${rev}`,
      repositoryId,
      actor: person.id,
      payload: {
        personId: person.id,
        displayName,
        emailMasked: email ? maskEmail(email) : null,
        fileCount: files.length,
        occurredAt: activityAt,
      },
      occurredAt: activityAt,
    });

    return { person, date: activityAt, files };
  }

  /** AuthorshipRecorder implementation used by the diff observer. */
  async recordForRevision(runner: GitDiffRunner, repositoryId: string, rev: string): Promise<void> {
    await this.observeAuthorship(runner, repositoryId, rev);
  }
}
