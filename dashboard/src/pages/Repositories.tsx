import { useState, useEffect } from 'react';
import { Database, RefreshCw, Trash2, Eye, EyeOff } from 'lucide-react';

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

  useEffect(() => {
    loadRepositories();
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
    console.log('Reindex:', repoId);
  };

  const handleDelete = async (repoId: string) => {
    if (!confirm('Are you sure you want to delete this repository?')) return;

    try {
      await fetch(`/api/repositories/${repoId}`, { method: 'DELETE' });
      loadRepositories();
    } catch (error) {
      console.error('Failed to delete repository:', error);
    }
  };

  const handleToggleWatch = async (repoId: string) => {
    console.log('Toggle watch:', repoId);
  };

  if (loading) {
    return <div className="text-center py-12">Loading repositories...</div>;
  }

  if (repos.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">No Repositories Indexed</h2>
        <p className="text-muted-foreground">
          Use the MCP tools to index a repository, or configure auto-indexing in setup.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Indexed Repositories</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {repos.map((repo) => (
          <div key={repo.id} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">{repo.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{repo.path}</p>
              </div>
              {repo.isWatched && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-900 rounded">
                  Watching
                </span>
              )}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Files:</span>
                <span className="font-medium">{repo.fileCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Nodes:</span>
                <span className="font-medium">{repo.nodeCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Edges:</span>
                <span className="font-medium">{repo.edgeCount.toLocaleString()}</span>
              </div>
              {repo.lastIndexedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last indexed:</span>
                  <span className="font-medium">
                    {new Date(repo.lastIndexedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleReindex(repo.id)}
                className="flex-1 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 flex items-center justify-center space-x-1"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reindex</span>
              </button>
              <button
                onClick={() => handleToggleWatch(repo.id)}
                className="px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              >
                {repo.isWatched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={() => handleDelete(repo.id)}
                className="px-3 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/80"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
