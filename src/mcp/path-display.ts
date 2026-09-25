import type { StorageProvider } from '../store/provider.js';

/** Strip mount/host prefix so MCP responses use repo-relative paths. */
export function repoRelativeFilePath(
  storage: StorageProvider,
  repositoryId: string | undefined,
  filePath: string
): string {
  if (!repositoryId) {
    return normalizeSlashes(filePath);
  }
  const repo = storage.getRepository(repositoryId);
  if (!repo?.path) {
    return normalizeSlashes(filePath);
  }
  const repoPath = normalizeSlashes(repo.path);
  const fp = normalizeSlashes(filePath);
  if (fp === repoPath) {
    return '.';
  }
  if (fp.startsWith(`${repoPath}/`)) {
    return fp.slice(repoPath.length + 1);
  }
  const repoTail = repoPath.split('/').pop();
  if (repoTail && fp.includes(`/${repoTail}/`)) {
    const idx = fp.indexOf(`/${repoTail}/`);
    return fp.slice(idx + repoTail.length + 2);
  }
  return fp;
}

export function attachRepoRootEnvelope(
  storage: StorageProvider,
  repositoryId: string | undefined,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!repositoryId) {
    return payload;
  }
  const repo = storage.getRepository(repositoryId);
  if (!repo?.path) {
    return payload;
  }
  return { ...payload, repoRoot: normalizeSlashes(repo.path) };
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}
