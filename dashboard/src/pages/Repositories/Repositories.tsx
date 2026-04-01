import { useState, useEffect } from 'react';
import FolderBrowser from '../../components/FolderBrowser';
import ToastContainer, { useToast } from '../../components/Toast';
import './Repositories.css';

interface Repository {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  languages: Record<string, number>;
  isWatched: boolean;
  lastIndexedAt?: string;
}

export default function Repositories() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<'browse' | 'manual'>('browse');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const { toasts, push: toast, dismiss: dismissToast } = useToast();

  useEffect(() => {
    loadRepositories();
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setWorkspaceRoot(d.workspaceRoot || ''))
      .catch((err) => console.warn('Failed to load workspace info:', err));
  }, []);

  const loadRepositories = async () => {
    try {
      const response = await fetch('/api/repositories');
      const data = await response.json();
      setRepos(data.repositories || []);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReindex = async (repoId: string) => {
    setBusyAction(`reindex-${repoId}`);
    try {
      const response = await fetch(`/api/repositories/${repoId}/reindex`, {
        method: 'POST',
      });
      if (response.ok) {
        toast('success', 'Re-indexing started. This may take a moment.');
        loadRepositories();
      } else {
        toast('error', 'Failed to start re-indexing.');
      }
    } catch (error) {
      toast('error', 'Network error — could not reach server.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (repoId: string) => {
    if (!confirm('Are you sure you want to delete this repository and all its indexed data?')) return;

    setBusyAction(`delete-${repoId}`);
    try {
      const response = await fetch(`/api/repositories/${repoId}`, { method: 'DELETE' });
      if (response.ok) {
        toast('success', 'Repository deleted.');
        loadRepositories();
      } else {
        toast('error', 'Failed to delete repository.');
      }
    } catch (error) {
      toast('error', 'Network error — could not reach server.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleWatch = async (repoId: string) => {
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return;

    setBusyAction(`watch-${repoId}`);
    try {
      const response = repo.isWatched
        ? await fetch(`/api/repositories/${repoId}/watch`, { method: 'DELETE' })
        : await fetch(`/api/repositories/${repoId}/watch`, { method: 'POST' });

      if (!response.ok) {
        toast('error', 'Server returned an error while toggling file watching.');
      } else {
        toast(repo.isWatched ? 'info' : 'success',
          repo.isWatched ? 'File watching stopped.' : 'File watching enabled — changes will auto-index.');
      }
      loadRepositories();
    } catch (error) {
      toast('error', 'Failed to toggle file watching.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddRepository = async () => {
    if (!newRepoPath.trim()) return;

    setAdding(true);
    try {
      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newRepoPath }),
      });

      if (response.ok) {
        setShowAddDialog(false);
        setNewRepoPath('');
        setAddMode('browse');
        toast('success', 'Repository added — indexing started.');
        loadRepositories();
      } else {
        const error = await response.text();
        toast('error', `Failed to add repository: ${error}`);
      }
    } catch (error) {
      toast('error', 'Network error — could not reach server.');
    } finally {
      setAdding(false);
    }
  };

  const getStatusBadge = (repo: Repository) => {
    if (repo.isWatched) {
      return <span className="status-badge status-active">Active Sync</span>;
    }
    return <span className="status-badge status-indexed">Indexed</span>;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="pt-24 pb-12 px-8 max-w-[1400px] mx-auto">
        <div className="text-center py-12">Loading repositories...</div>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-12 px-8 max-w-[1400px] mx-auto">
      {/* Hero Header Section */}
      <section className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <nav className="mb-4">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline">
              Organization
            </span>
            <span className="mx-2 text-outline">/</span>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-tertiary">
              Indexed Repositories
            </span>
          </nav>
          <h1 className="text-[2rem] font-bold text-on-surface tracking-tight leading-none mb-4">
            Code Intelligence Assets
          </h1>
          <p className="text-on-surface-variant text-[0.875rem] leading-relaxed">
            View and manage your indexed workspace repositories. Our semantic engine creates a
            multidimensional graph of your codebase, mapping nodes and functional edges for advanced
            AI context.
          </p>
        </div>
        <div className="flex gap-3">
          {repos.length > 0 && (
            <button
              onClick={() => {
                const data = repos.map(r => ({
                  id: r.id, name: r.name, path: r.path,
                  fileCount: r.fileCount, nodeCount: r.nodeCount, edgeCount: r.edgeCount,
                  languages: r.languages, isWatched: r.isWatched, lastIndexedAt: r.lastIndexedAt,
                }));
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `context-simplo-graph-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast('success', 'Graph data exported.');
              }}
              className="px-6 py-3 bg-surface-container-highest text-on-surface font-semibold text-[0.875rem] rounded-xl hover:bg-surface-dim transition-all"
            >
              Export Graph
            </button>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-6 py-3 primary-gradient font-semibold text-[0.875rem] rounded-xl shadow-lg shadow-tertiary/10 active:scale-95 transition-all flex items-center gap-2"
            style={{ color: 'white' }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Repository
          </button>
        </div>
      </section>

      {/* Empty State */}
      {repos.length === 0 && (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">
            folder_open
          </span>
          <h2 className="text-2xl font-bold mb-2">No Repositories Indexed</h2>
          <p className="text-on-surface-variant mb-6">
            Get started by adding a repository to index for code intelligence.
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-6 py-3 primary-gradient text-white font-semibold text-[0.875rem] rounded-xl shadow-lg shadow-tertiary/10 active:scale-95 transition-all inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Repository
          </button>
        </div>
      )}

      {/* Bento Grid Layout for Repositories */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Featured Repository Card (if we have repos) */}
        {repos.length > 0 && (
          <div className="md:col-span-8 bg-surface-container-lowest p-8 rounded-xl flex flex-col justify-between repo-card border border-transparent">
            <div className="repo-card-glow"></div>
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary-container flex items-center justify-center rounded-xl">
                  <span className="material-symbols-outlined text-on-primary-container">
                    folder_open
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-on-surface">{repos[0].name}</h3>
                  <div className="flex items-center gap-2">
                    {repos[0].isWatched && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                          Active Sync
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline block mb-1">
                    Files
                  </span>
                  <span className="text-2xl font-bold text-on-surface">
                    {repos[0].fileCount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline block mb-1">
                    Nodes
                  </span>
                  <span className="text-2xl font-bold text-on-surface">
                    {formatNumber(repos[0].nodeCount)}
                  </span>
                </div>
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline block mb-1">
                    Edges
                  </span>
                  <span className="text-2xl font-bold text-on-surface">
                    {formatNumber(repos[0].edgeCount)}
                  </span>
                </div>
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline block mb-1">
                    Path
                  </span>
                  <span className="text-sm font-medium text-on-surface truncate block">
                    {repos[0].path.split('/').pop()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-6 border-t border-surface-container-low">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">history</span>
                <span className="text-[0.875rem]">
                  Last indexed{' '}
                  {repos[0].lastIndexedAt
                    ? new Date(repos[0].lastIndexedAt).toLocaleDateString()
                    : 'recently'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReindex(repos[0].id)}
                  disabled={busyAction === `reindex-${repos[0].id}`}
                  className="p-2 rounded-lg hover:bg-surface-container-low text-tertiary transition-colors disabled:opacity-50"
                  title="Reindex"
                >
                  <span className={`material-symbols-outlined ${busyAction === `reindex-${repos[0].id}` ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                </button>
                <button
                  onClick={() => handleToggleWatch(repos[0].id)}
                  disabled={busyAction === `watch-${repos[0].id}`}
                  className="p-2 rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors disabled:opacity-50"
                  title={repos[0].isWatched ? 'Stop watching' : 'Start watching'}
                >
                  <span className={`material-symbols-outlined ${busyAction === `watch-${repos[0].id}` ? 'animate-pulse' : ''}`}>
                    {repos[0].isWatched ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
                <button
                  onClick={() => handleDelete(repos[0].id)}
                  disabled={busyAction === `delete-${repos[0].id}`}
                  className="p-2 rounded-lg hover:bg-error/10 text-error transition-colors disabled:opacity-50"
                  title="Delete Index"
                >
                  <span className={`material-symbols-outlined ${busyAction === `delete-${repos[0].id}` ? 'animate-pulse' : ''}`}>
                    delete
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats Card */}
        {repos.length > 0 && (
          <div className="md:col-span-4 bg-surface-container-low p-8 rounded-xl flex flex-col">
            <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline mb-6">
              Overall Stats
            </h4>
            <div className="flex-grow flex flex-col justify-center gap-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[0.875rem] font-semibold">Total Repositories</span>
                  <span className="text-[0.875rem] font-bold text-tertiary">{repos.length}</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[0.875rem] font-semibold">Total Nodes</span>
                  <span className="text-[0.875rem] font-bold text-tertiary">
                    {formatNumber(repos.reduce((sum, r) => sum + r.nodeCount, 0))}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[0.875rem] font-semibold">Total Edges</span>
                  <span className="text-[0.875rem] font-bold text-tertiary">
                    {formatNumber(repos.reduce((sum, r) => sum + r.edgeCount, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Standard Repository Cards */}
        {repos.slice(1).map((repo) => (
          <div
            key={repo.id}
            className="md:col-span-4 bg-surface-container-lowest p-6 rounded-xl border border-transparent hover:border-outline-variant/20 transition-all repo-card"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-secondary-container flex items-center justify-center rounded-lg">
                <span className="material-symbols-outlined text-on-secondary-container">
                  inventory_2
                </span>
              </div>
              {getStatusBadge(repo)}
            </div>
            <h3 className="text-lg font-bold text-on-surface mb-1">{repo.name}</h3>
            <span className="text-[0.6875rem] text-outline block mb-6">
              {repo.lastIndexedAt
                ? `Updated ${new Date(repo.lastIndexedAt).toLocaleDateString()}`
                : 'Recently updated'}
            </span>
            <div className="flex gap-6 mb-6">
              <div>
                <span className="text-[0.6875rem] font-semibold text-outline block">Files</span>
                <span className="text-md font-bold text-on-surface">
                  {repo.fileCount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[0.6875rem] font-semibold text-outline block">Nodes</span>
                <span className="text-md font-bold text-on-surface">
                  {formatNumber(repo.nodeCount)}
                </span>
              </div>
            </div>
            <div className="flex gap-2 repo-action-buttons">
              <button
                onClick={() => handleReindex(repo.id)}
                disabled={busyAction === `reindex-${repo.id}`}
                className="flex-1 py-2 bg-surface-container-low text-on-surface text-[0.875rem] font-semibold rounded-lg hover:bg-surface-container-high flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-sm ${busyAction === `reindex-${repo.id}` ? 'animate-spin' : ''}`}>
                  refresh
                </span>
                {busyAction === `reindex-${repo.id}` ? 'Reindexing...' : 'Reindex'}
              </button>
              <button
                onClick={() => handleToggleWatch(repo.id)}
                disabled={busyAction === `watch-${repo.id}`}
                className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg disabled:opacity-50"
                title={repo.isWatched ? 'Stop watching' : 'Start watching'}
              >
                <span className={`material-symbols-outlined ${busyAction === `watch-${repo.id}` ? 'animate-pulse' : ''}`}>
                  {repo.isWatched ? 'visibility' : 'visibility_off'}
                </span>
              </button>
              <button
                onClick={() => handleDelete(repo.id)}
                disabled={busyAction === `delete-${repo.id}`}
                className="p-2 text-error hover:bg-error/10 rounded-lg disabled:opacity-50"
              >
                <span className={`material-symbols-outlined ${busyAction === `delete-${repo.id}` ? 'animate-pulse' : ''}`}>
                  delete
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Workspace Info */}
      {workspaceRoot && (
        <div className="mt-8 bg-surface-container p-4 rounded-xl flex items-center gap-4">
          <span className="material-symbols-outlined text-tertiary">hard_drive</span>
          <div className="flex-1 min-w-0">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline block mb-0.5">
              {workspaceRoot.split('/').filter(Boolean).pop() || 'Workspace Root'}
            </span>
            <code className="text-[0.875rem] font-mono text-on-surface block truncate">
              {workspaceRoot}
            </code>
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="mt-3 bg-surface-container p-4 rounded-xl flex items-center gap-4">
        <span className="material-symbols-outlined text-tertiary">info</span>
        <p className="text-[0.875rem] text-on-surface-variant">
          Indexed data is stored locally in your workspace. Large repositories (10k+ files) may take
          several minutes to generate a full functional map.
        </p>
      </div>

      {/* Add Repository Dialog */}
      {showAddDialog && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fade-in"
            onClick={() => setShowAddDialog(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl w-full max-w-[560px] shadow-2xl pointer-events-auto animate-scale-in flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-6 pt-6 pb-0 border-b border-outline-variant/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 primary-gradient rounded-xl flex items-center justify-center shadow-md">
                      <span className="material-symbols-outlined text-white text-[20px]">
                        create_new_folder
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-on-surface">Add Repository</h2>
                      <p className="text-xs text-on-surface-variant">
                        Choose a folder to index for code intelligence
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddDialog(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-container-high text-outline transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-0">
                  <button
                    onClick={() => setAddMode('browse')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      addMode === 'browse'
                        ? 'border-tertiary text-tertiary'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    Browse
                  </button>
                  <button
                    onClick={() => setAddMode('manual')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                      addMode === 'manual'
                        ? 'border-tertiary text-tertiary'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    Enter Path
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden px-6 py-4">
                {addMode === 'browse' ? (
                  <FolderBrowser
                    selected={newRepoPath}
                    onSelect={(path) => setNewRepoPath(path)}
                    rootLabel={workspaceRoot ? workspaceRoot.split('/').filter(Boolean).pop() : undefined}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-on-surface mb-2">
                        Repository Path
                      </label>
                      <p className="text-xs text-on-surface-variant mb-3">
                        Enter the absolute path on the server, or a path relative to the workspace root.
                      </p>
                      <div className="relative">
                        <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 top-1/2 -translate-y-1/2">
                          terminal
                        </span>
                        <input
                          type="text"
                          value={newRepoPath}
                          onChange={(e) => setNewRepoPath(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newRepoPath.trim() && handleAddRepository()}
                          placeholder="/home/user/my-project"
                          className="w-full pl-10 pr-4 py-3 text-sm text-on-surface bg-surface-container border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-tertiary/40 focus:border-tertiary transition-all font-mono"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="bg-surface-container rounded-xl p-4 flex gap-3">
                      <span className="material-symbols-outlined text-[18px] text-tertiary shrink-0 mt-0.5">
                        info
                      </span>
                      <div className="text-xs text-on-surface-variant leading-relaxed">
                        <p className="mb-2">
                          <strong className="text-on-surface">Running in Docker?</strong>{' '}
                          Use paths inside the container. The workspace is typically mounted at{' '}
                          <code className="px-1 py-0.5 bg-surface-container-high rounded text-on-surface font-mono">/workspace</code>.
                        </p>
                        <p>
                          <strong className="text-on-surface">Running locally?</strong>{' '}
                          Use the full path from your system, e.g.{' '}
                          <code className="px-1 py-0.5 bg-surface-container-high rounded text-on-surface font-mono">~/projects/my-app</code>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowAddDialog(false);
                    setNewRepoPath('');
                    setAddMode('browse');
                  }}
                  className="px-5 py-2.5 text-on-surface-variant font-semibold text-sm rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleAddRepository}
                  disabled={adding || !newRepoPath.trim()}
                  className="px-6 py-2.5 primary-gradient font-semibold text-sm rounded-xl shadow-lg shadow-tertiary/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                  style={{ color: 'white' }}
                >
                  {adding ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                      Index Repository
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
