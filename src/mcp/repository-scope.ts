import type { StorageProvider } from '../store/provider.js';

/** Explicit repositoryId, or the sole indexed repo when exactly one exists. */
export function resolveRepositoryId(
  storage: StorageProvider,
  explicit?: string
): string | undefined {
  if (explicit) {
    return explicit;
  }
  const repos = storage.listRepositories();
  if (repos.length === 1) {
    return repos[0]!.id;
  }
  return undefined;
}
