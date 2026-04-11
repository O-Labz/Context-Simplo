/**
 * Path Utilities
 *
 * Provides secure path validation helpers for preventing directory traversal attacks.
 */

import path from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * Strip absolute filesystem paths from error messages before sending
 * to HTTP clients. Prevents leaking internal directory structure.
 */
export function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/(?:\/[\w.-]+){3,}/g, '<path>');
}

/**
 * Check if a child path is a subpath of a parent directory.
 *
 * Resolves symlinks on both paths before comparison so a symlink inside
 * /host pointing to /etc cannot escape the jail.
 *
 * Using string prefix checks like `child.startsWith(parent)` is vulnerable
 * to attacks like `/foo` matching `/foo_private`.
 *
 * @param parent - The parent directory path
 * @param child - The child path to validate
 * @returns true if child is within parent, false otherwise
 */
export function isSubpath(parent: string, child: string): boolean {
  try {
    const realParent = realpathSync(parent);
    const realChild = realpathSync(child);
    const rel = path.relative(realParent, realChild);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    // If either path doesn't exist, fall back to lexical check
    const rel = path.relative(path.resolve(parent), path.resolve(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }
}
