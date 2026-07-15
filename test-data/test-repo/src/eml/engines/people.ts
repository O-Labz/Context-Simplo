/**
 * People / identity resolution.
 *
 * Resolves authors to a stable `people` row by unifying on email (primary key
 * for identity) and display-name aliases. Emails are Confidential: they are
 * stored for matching but MUST NOT be logged in full anywhere.
 */

import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

export interface PersonInput {
  displayName: string;
  email?: string | null;
  aliases?: string[];
}

export interface Person {
  id: string;
  displayName: string;
  emails: string[];
  aliases: string[];
}

interface PersonRow {
  id: string;
  display_name: string;
  emails: string;
  aliases: string;
}

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function union(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/** Mask an email for safe logging: `j***@e***`. Never logs the full value. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const head = (s: string | undefined): string => (s && s.length > 0 ? `${s[0]}***` : '***');
  return `${head(local)}@${head(domain)}`;
}

export class PeopleEngine {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Resolve (find-or-create) a person. Matches an existing record by any shared
   * email (case-insensitive) or alias/display-name; merges new identifiers in.
   */
  resolve(input: PersonInput): Person {
    const email = input.email ? normalizeEmail(input.email) : null;
    const aliases = input.aliases ?? [];

    const existing = this.findMatch(email, input.displayName, aliases);
    if (existing) {
      const merged: Person = {
        id: existing.id,
        displayName: existing.displayName || input.displayName,
        emails: email ? union(existing.emails, [email]) : existing.emails,
        aliases: union(existing.aliases, [input.displayName, ...aliases]),
      };
      this.persist(merged);
      return merged;
    }

    const id = this.makeId(email, input.displayName);
    const person: Person = {
      id,
      displayName: input.displayName,
      emails: email ? [email] : [],
      aliases: union([input.displayName], aliases),
    };
    this.persist(person);
    return person;
  }

  get(id: string): Person | null {
    const row = this.db.prepare('SELECT * FROM people WHERE id = ?').get(id) as PersonRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByEmail(email: string): Person | null {
    const normalized = normalizeEmail(email);
    return this.all().find((p) => p.emails.includes(normalized)) ?? null;
  }

  private findMatch(email: string | null, displayName: string, aliases: string[]): Person | null {
    const people = this.all();
    if (email) {
      const byEmail = people.find((p) => p.emails.includes(email));
      if (byEmail) return byEmail;
    }
    const names = new Set([displayName, ...aliases].map((n) => n.toLowerCase()));
    return (
      people.find((p) => p.aliases.some((a) => names.has(a.toLowerCase()))) ?? null
    );
  }

  private all(): Person[] {
    const rows = this.db.prepare('SELECT * FROM people').all() as PersonRow[];
    return rows.map((r) => this.mapRow(r));
  }

  private persist(person: Person): void {
    this.db
      .prepare(
        `INSERT INTO people (id, display_name, emails, aliases)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           emails = excluded.emails,
           aliases = excluded.aliases`
      )
      .run(person.id, person.displayName, JSON.stringify(person.emails), JSON.stringify(person.aliases));
  }

  private makeId(email: string | null, displayName: string): string {
    const seed = email ?? displayName.toLowerCase();
    return `person_${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
  }

  private mapRow(row: PersonRow): Person {
    return {
      id: row.id,
      displayName: row.display_name,
      emails: parseArray(row.emails),
      aliases: parseArray(row.aliases),
    };
  }
}
