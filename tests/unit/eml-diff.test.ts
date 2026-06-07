import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteStorageProvider } from '../../src/store/sqlite.js';
import { EventStore } from '../../src/eml/events/store.js';
import {
  DiffObserver,
  assertSafeRev,
  computeStructuralDelta,
  parseDependencyDelta,
  MAX_DIFF_BYTES,
  type GitDiffRunner,
} from '../../src/eml/ingest/diff.js';
import { crossCheck, MessageChecker, DISTRUSTED_PROSE_WEIGHT, TRUSTED_PROSE_WEIGHT } from '../../src/eml/ingest/message-check.js';
import { EventValidationError } from '../../src/core/errors.js';

const REPO = '0123456789abcdef';

const REMOVE_EXPORT_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 111..222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,4 +1,3 @@
-export function doThing() {
-  return 1;
-}
+export const x = 1;
`;

const ADD_DEP_DIFF = `diff --git a/package.json b/package.json
index aaa..bbb 100644
--- a/package.json
+++ b/package.json
@@ -10,6 +10,7 @@
   "dependencies": {
     "zod": "^3.0.0",
+    "simple-git": "^3.36.0",
-    "left-pad": "^1.0.0"
   }
`;

describe('EML diff observer', () => {
  describe('assertSafeRev (unsafe-option rejection)', () => {
    it('accepts ordinary revisions', () => {
      expect(() => assertSafeRev('HEAD')).not.toThrow();
      expect(() => assertSafeRev('HEAD~1')).not.toThrow();
      expect(() => assertSafeRev('abc123def')).not.toThrow();
      expect(() => assertSafeRev('main')).not.toThrow();
    });

    it('rejects option injection and transport tricks', () => {
      expect(() => assertSafeRev('--output=/etc/passwd')).toThrow(EventValidationError);
      expect(() => assertSafeRev('ext::sh -c whoami')).toThrow(EventValidationError);
      expect(() => assertSafeRev('HEAD; rm -rf /')).toThrow(EventValidationError);
      expect(() => assertSafeRev('-x')).toThrow(EventValidationError);
      expect(() => assertSafeRev('')).toThrow(EventValidationError);
    });
  });

  describe('computeStructuralDelta', () => {
    it('detects a removed export symbol', () => {
      const delta = computeStructuralDelta(REMOVE_EXPORT_DIFF);
      expect(delta.removedSymbols?.map((s) => s.name)).toContain('doThing');
      expect(delta.addedSymbols?.map((s) => s.name)).toContain('x');
    });

    it('detects dependency add/remove from package.json', () => {
      const { addedDependencies, removedDependencies } = parseDependencyDelta(ADD_DEP_DIFF);
      expect(addedDependencies).toContain('simple-git');
      expect(removedDependencies).toContain('left-pad');
    });
  });

  describe('DiffObserver.observe', () => {
    let dir: string;
    let storage: SqliteStorageProvider;
    let store: EventStore;

    beforeEach(async () => {
      dir = mkdtempSync(join(tmpdir(), 'eml-diff-'));
      storage = new SqliteStorageProvider(join(dir, 'test.db'));
      await storage.initialize();
      store = new EventStore(storage.getDatabase());
    });

    afterEach(() => {
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    });

    it('emits code.diff.observed with removed symbol and deleted files', async () => {
      const runner: GitDiffRunner = {
        async raw(args: string[]): Promise<string> {
          if (args.includes('--name-status')) return 'D\tsrc/old.ts\nM\tsrc/foo.ts\n';
          return REMOVE_EXPORT_DIFF;
        },
      };
      const result = await new DiffObserver(store).observe(runner, REPO, 'HEAD~1', 'HEAD');
      expect(result.eventId).toBeTruthy();
      expect(result.delta.removedSymbols?.map((s) => s.name)).toContain('doThing');
      expect(result.deletedFiles).toContain('src/old.ts');

      const event = store.getById(result.eventId!)!;
      expect(event.type).toBe('code.diff.observed');
    });

    it('caps diff size at MAX_DIFF_BYTES', async () => {
      const huge = '+' + 'a'.repeat(MAX_DIFF_BYTES + 5000);
      const runner: GitDiffRunner = {
        async raw(args: string[]): Promise<string> {
          if (args.includes('--name-status')) return 'M\tsrc/foo.ts\n';
          return huge;
        },
      };
      // Should not throw and should complete (internally truncated).
      const result = await new DiffObserver(store).observe(runner, REPO, 'HEAD~1', 'HEAD');
      expect(result.eventId).toBeTruthy();
    });

    it('rejects unsafe revisions before touching git', async () => {
      let called = false;
      const runner: GitDiffRunner = {
        async raw(): Promise<string> {
          called = true;
          return '';
        },
      };
      await expect(
        new DiffObserver(store).observe(runner, REPO, '--upload-pack=evil', 'HEAD')
      ).rejects.toThrow(EventValidationError);
      expect(called).toBe(false);
    });
  });

  describe('message cross-check', () => {
    it('flags a mismatch when prose claims removal but diff has none', () => {
      const result = crossCheck('removed the legacy adapter', {
        addedSymbols: [{ name: 'x', kind: 'variable' }],
      });
      expect(result.mismatches.length).toBeGreaterThan(0);
      expect(result.proseWeight).toBe(DISTRUSTED_PROSE_WEIGHT);
    });

    it('trusts prose that matches the diff', () => {
      const result = crossCheck('removed doThing export', {
        removedSymbols: [{ name: 'doThing', kind: 'function' }],
      });
      expect(result.mismatches).toHaveLength(0);
      expect(result.proseWeight).toBe(TRUSTED_PROSE_WEIGHT);
    });

    it('emits message_mismatch.detected event on contradiction', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'eml-msg-'));
      const storage = new SqliteStorageProvider(join(dir, 'test.db'));
      await storage.initialize();
      const store = new EventStore(storage.getDatabase());
      const checker = new MessageChecker(store);
      const res = checker.check(REPO, 'commit:abc', 'added a new feature', { removedSymbols: [{ name: 'y', kind: 'function' }] });
      expect(res.mismatches.length).toBeGreaterThan(0);
      expect(store.countByStatus('pending')).toBe(1);
      storage.close();
      rmSync(dir, { recursive: true, force: true });
    });
  });
});
