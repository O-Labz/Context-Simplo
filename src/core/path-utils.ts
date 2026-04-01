/**
 * Path Utilities
 *
 * Provides secure path validation helpers for preventing directory traversal attacks.
 */

import path from 'node:path';

/**
 * Check if a child path is a subpath of a parent directory.
 *
 * This is the secure way to validate paths against a workspace root.
 * Using string prefix checks like `child.startsWith(parent)` is vulnerable
 * to attacks like `/foo` matching `/foo_private`.
 *
 * @param parent - The parent directory path
 * @param child - The child path to validate
 * @returns true if child is within parent, false otherwise
 *
 * @example
 * isSubpath('/workspace', '/workspace/src') // true
 * isSubpath('/workspace', '/workspace_private') // false
 * isSubpath('/workspace', '/etc/passwd') // false
 */
export function isSubpath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
