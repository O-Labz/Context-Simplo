/**
 * Worker thread entry for parsing files in isolation
 *
 * This worker receives file parsing requests via parentPort, validates the file path
 * to ensure it's within workspaceRoot (preventing directory traversal), and delegates
 * to the existing parseFile function. The worker reports success/failure via structured
 * messages that can be serialized across the worker boundary.
 *
 * Security: File paths MUST be validated against workspaceRoot using isSubpath to
 * prevent directory traversal attacks. On violation, reports security error without
 * crashing the worker.
 */

import { parentPort } from 'node:worker_threads';
import { resolve } from 'node:path';
import { parseFile } from './parser.js';
import { isSubpath } from './path-utils.js';
import { ParseError } from './errors.js';

interface ParseRequest {
  filePath: string;
  repositoryId: string;
  workspaceRoot: string;
}

type ParseResponse =
  | { ok: true; parsed: any } // ParsedFile from parser.ts
  | { ok: false; kind: 'security'; message: string }
  | { ok: false; kind: 'parse'; message: string };

if (!parentPort) {
  throw new Error('parse-worker.ts must be run as a worker thread');
}

parentPort.on('message', async (request: ParseRequest) => {
  try {
    const { filePath, repositoryId, workspaceRoot } = request;
    
    // Canonicalize and validate the file path
    const resolvedPath = resolve(filePath);
    const resolvedWorkspace = resolve(workspaceRoot);
    
    if (!isSubpath(resolvedWorkspace, resolvedPath)) {
      const response: ParseResponse = {
        ok: false,
        kind: 'security',
        message: `File path '${filePath}' is outside workspace root '${workspaceRoot}'`
      };
      parentPort!.postMessage(response);
      return;
    }

    // Parse the file using the existing parseFile function
    try {
      const parsed = await parseFile(filePath, repositoryId, workspaceRoot);
      const response: ParseResponse = { ok: true, parsed };
      parentPort!.postMessage(response);
    } catch (error) {
      if (error instanceof ParseError) {
        const response: ParseResponse = {
          ok: false,
          kind: 'parse',
          message: error.message
        };
        parentPort!.postMessage(response);
      } else {
        // Unexpected error - treat as parse error
        const response: ParseResponse = {
          ok: false,
          kind: 'parse',
          message: error instanceof Error ? error.message : String(error)
        };
        parentPort!.postMessage(response);
      }
    }
  } catch (error) {
    // Should not happen if request is well-formed, but handle gracefully
    const response: ParseResponse = {
      ok: false,
      kind: 'parse',
      message: `Worker error: ${error instanceof Error ? error.message : String(error)}`
    };
    parentPort!.postMessage(response);
  }
});

// Handle worker termination gracefully
parentPort.on('close', () => {
  process.exit(0);
});