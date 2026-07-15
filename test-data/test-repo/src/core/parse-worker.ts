/**
 * Worker thread entry for parsing files in isolation
 *
 * This worker receives file parsing requests via parentPort and delegates
 * to the existing parseFile function. The worker reports success/failure via structured
 * messages that can be serialized across the worker boundary.
 *
 * Note: Path validation is not needed here as repositories are explicitly managed
 * through the UI and only added repositories are indexed.
 */

import { parentPort } from 'node:worker_threads';
import { parseFile } from './parser.js';
import { ParseError } from './errors.js';

interface ParseRequest {
  filePath: string;
  repositoryId: string;
  workspaceRoot: string;
}

type ParseResponse =
  | { ok: true; parsed: any } // ParsedFile from parser.ts
  | { ok: false; kind: 'parse'; message: string };

if (!parentPort) {
  throw new Error('parse-worker.ts must be run as a worker thread');
}

parentPort.on('message', async (request: ParseRequest) => {
  try {
    const { filePath, repositoryId, workspaceRoot } = request;
    
    // Parse the file using the existing parseFile function
    // Note: Path validation removed as repositories are explicitly managed through UI
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