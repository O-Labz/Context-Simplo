import { useState, useEffect, useCallback } from 'react';

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: DirEntry[];
  isRoot: boolean;
  rootName?: string;
}

interface FolderBrowserProps {
  onSelect: (path: string) => void;
  selected: string;
  rootLabel?: string;
  scope?: 'workspace' | 'mount';
}

export default function FolderBrowser({ onSelect, selected, rootLabel, scope = 'workspace' }: FolderBrowserProps) {
  const [browsePath, setBrowsePath] = useState('/');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedRootName, setResolvedRootName] = useState<string>('');

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const scopeParam = scope === 'mount' ? '&scope=mount' : '';
      const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}${scopeParam}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to browse');
      }
      const data: BrowseResult = await res.json();
      setEntries(data.directories);
      setBrowsePath(data.current);
      setParentPath(data.parent);
      if (data.rootName && !resolvedRootName) {
        setResolvedRootName(data.rootName);
      }
    } catch (e: any) {
      setError(e.message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadDirectory('/');
  }, [loadDirectory]);

  const navigateTo = (dirPath: string) => {
    loadDirectory(dirPath);
  };

  const handleSelect = (dirPath: string) => {
    onSelect(dirPath);
  };

  const displayRootName = rootLabel || resolvedRootName || 'workspace';
  const segments = browsePath === '/' ? [] : browsePath.split('/').filter(Boolean);
  const breadcrumbs = [displayRootName, ...segments];

  const breadcrumbPaths = breadcrumbs.map((_, i) => {
    if (i === 0) return '/';
    return segments.slice(0, i).join('/');
  });

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-1 px-4 py-2.5 bg-surface-container rounded-lg mb-3 overflow-x-auto text-sm min-h-[40px]">
        <span className="material-symbols-outlined text-[16px] text-outline mr-1 shrink-0">
          home
        </span>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <span className="material-symbols-outlined text-[14px] text-outline">
                chevron_right
              </span>
            )}
            <button
              onClick={() => navigateTo(breadcrumbPaths[i])}
              className={`px-1.5 py-0.5 rounded hover:bg-surface-container-high transition-colors ${
                i === breadcrumbs.length - 1
                  ? 'font-semibold text-on-surface'
                  : 'text-on-surface-variant'
              }`}
            >
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Directory listing */}
      <div className="flex-1 border border-outline-variant/30 rounded-xl overflow-hidden bg-surface-container-lowest">
        <div className="overflow-y-auto max-h-[320px]">
          {/* Up one level */}
          {parentPath !== null && (
            <button
              onClick={() => navigateTo(parentPath)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/15"
            >
              <span className="material-symbols-outlined text-[20px] text-outline">
                arrow_upward
              </span>
              <span className="text-sm text-on-surface-variant font-medium">..</span>
            </button>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-tertiary/30 border-t-tertiary rounded-full animate-spin" />
              <span className="text-sm text-on-surface-variant">Loading...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <span className="material-symbols-outlined text-3xl text-error">error</span>
              <span className="text-sm text-error">{error}</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl">folder_off</span>
              <span className="text-sm">No subdirectories here</span>
              <span className="text-xs text-outline">You can still select this folder</span>
            </div>
          ) : (
            entries.map((entry) => {
              const isSelected = selected === entry.path;
              return (
                <div
                  key={entry.path}
                  className={`group flex items-center w-full border-b border-outline-variant/10 last:border-b-0 transition-colors ${
                    isSelected
                      ? 'bg-tertiary/8'
                      : 'hover:bg-surface-container-low'
                  }`}
                >
                  {/* Clicking folder name selects it */}
                  <button
                    onClick={() => handleSelect(entry.path)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
                  >
                    <span
                      className={`material-symbols-outlined text-[20px] shrink-0 ${
                        isSelected ? 'text-tertiary' : 'text-outline'
                      }`}
                      style={isSelected ? { fontVariationSettings: "'FILL' 1" } : undefined}
                    >
                      folder
                    </span>
                    <span
                      className={`text-sm truncate ${
                        isSelected ? 'font-semibold text-tertiary' : 'text-on-surface'
                      }`}
                    >
                      {entry.name}
                    </span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[18px] text-tertiary ml-auto shrink-0">
                        check_circle
                      </span>
                    )}
                  </button>
                  {/* Arrow to navigate into directory */}
                  <button
                    onClick={() => navigateTo(entry.path)}
                    className="px-3 py-3 text-outline hover:text-on-surface hover:bg-surface-container transition-all shrink-0 rounded-lg mr-1"
                    title="Open folder"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_right
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Current selection indicator */}
      <div className="mt-3 px-4 py-2.5 bg-surface-container rounded-lg flex items-center gap-2 min-h-[40px]">
        <span className="material-symbols-outlined text-[16px] text-outline shrink-0">
          folder_open
        </span>
        <span className="text-xs text-on-surface-variant shrink-0">Selected:</span>
        <span className="text-sm font-medium text-on-surface truncate">
          {selected || browsePath}
        </span>
        {!selected && (
          <button
            onClick={() => handleSelect(browsePath)}
            className="ml-auto text-xs font-semibold text-tertiary hover:text-tertiary-dim transition-colors shrink-0"
          >
            Use current
          </button>
        )}
      </div>
    </div>
  );
}
