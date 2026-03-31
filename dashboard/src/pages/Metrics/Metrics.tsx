import { useState, useEffect } from 'react';
import './Metrics.css';

interface MetricsData {
  system: {
    uptime: number;
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    graphMemory: number;
  };
  index: {
    repositoryCount: number;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    languages: Record<string, number>;
    filesIndexing: number;
    filesPending: number;
    filesError: number;
  };
  storage: {
    sqliteSize: number;
    lancedbSize: number;
    totalDiskUsage: number;
  };
  llm: {
    connected: boolean;
    provider: string;
    model?: string;
    totalCalls?: number;
    estimatedCost?: number;
  };
  embedding?: {
    queueDepth: number;
    inFlight: number;
    completed: number;
    failed: number;
    averageLatency: number;
    totalTokens: number;
    rateLimitHits: number;
  };
  watcher?: {
    watchedDirectories: number;
    recentChanges: any[];
    queueDepth: number;
  };
  mcp?: {
    requestsPerMinute: number;
    toolBreakdown: Record<string, number>;
    averageResponseTime: number;
    errorRate: number;
    totalRequests: number;
  };
  timestamp: string;
}

export default function Metrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      const response = await fetch('/api/metrics');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  if (!metrics && error) {
    return (
      <div className="pt-24 pb-12 px-8 max-w-[1440px] mx-auto">
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-6xl text-error mb-4 block">error</span>
          <h2 className="text-2xl font-bold text-on-surface mb-2">Failed to Load Metrics</h2>
          <p className="text-on-surface-variant mb-6">{error}</p>
          <button
            onClick={loadMetrics}
            className="px-6 py-3 primary-gradient text-white font-semibold rounded-xl hover:shadow-lg transition-all active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="pt-24 pb-12 px-8 max-w-[1440px] mx-auto">
        <div className="text-center py-12">Loading metrics...</div>
      </div>
    );
  }

  const memoryUsagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;

  return (
    <div className="pt-24 pb-12 px-8 max-w-[1440px] mx-auto">
      {/* Header Section */}
      <header className="mb-10 flex justify-between items-end">
        <div>
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2 block">
            System Analytics
          </span>
          <h1 className="text-4xl font-bold text-on-surface tracking-tight">System Metrics</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `context-simplo-metrics-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 bg-surface-container-highest text-on-surface text-[0.875rem] font-semibold rounded-xl hover:bg-surface-container-high transition-all"
          >
            Export Data
          </button>
          <button
            onClick={loadMetrics}
            className="px-4 py-2 bg-gradient-to-br from-tertiary to-tertiary-dim text-white text-[0.875rem] font-semibold rounded-xl hover:shadow-lg transition-all active:scale-95"
          >
            Refresh Dashboard
          </button>
        </div>
      </header>

      {/* Bento Grid Metrics */}
      <div className="bento-grid">
        {/* Memory Usage Card (Primary Focus) */}
        <div className="col-span-12 md:col-span-8 bg-surface-container-lowest p-8 rounded-xl relative overflow-hidden metric-card">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Total System Memory
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold tracking-tight">
                  {formatBytes(metrics.memory.heapUsed)}
                </span>
                <span className="text-xl font-medium text-on-surface-variant">
                  / {formatBytes(metrics.memory.heapTotal)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[0.6875rem] font-bold text-tertiary bg-tertiary/10 px-2 py-1 rounded-full">
                ACTIVE SESSION
              </span>
            </div>
          </div>
          <div className="h-48 w-full bg-surface-container-low rounded-lg relative overflow-hidden mt-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex gap-4">
                <div className="text-center">
                  <span className="block text-2xl font-bold text-tertiary">
                    {memoryUsagePercent.toFixed(0)}%
                  </span>
                  <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
                    In Use
                  </span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20 self-center"></div>
                <div className="text-center">
                  <span className="block text-2xl font-bold text-on-surface">
                    {formatBytes(metrics.memory.heapTotal - metrics.memory.heapUsed)}
                  </span>
                  <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
                    Free
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
            <div className="flex-shrink-0 bg-surface-container-low px-4 py-3 rounded-xl border-l-4 border-tertiary">
              <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">
                Graph Memory
              </span>
              <span className="text-lg font-bold">{formatBytes(metrics.memory.graphMemory)}</span>
            </div>
            <div className="flex-shrink-0 bg-surface-container-low px-4 py-3 rounded-xl border-l-4 border-primary">
              <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">
                RSS
              </span>
              <span className="text-lg font-bold">{formatBytes(metrics.memory.rss)}</span>
            </div>
            <div className="flex-shrink-0 bg-surface-container-low px-4 py-3 rounded-xl border-l-4 border-outline">
              <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">
                External
              </span>
              <span className="text-lg font-bold">{formatBytes(metrics.memory.external)}</span>
            </div>
          </div>
        </div>

        {/* Uptime Metric */}
        <div className="col-span-12 md:col-span-4 bg-surface-container-low p-8 rounded-xl flex flex-col justify-between metric-card">
          <div>
            <span className="material-symbols-outlined text-tertiary text-4xl mb-4 block">
              timer
            </span>
            <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
              Total System Uptime
            </h3>
            <p className="text-3xl font-bold tracking-tight">{formatUptime(metrics.system.uptime)}</p>
          </div>
          <div className="mt-8 pt-6 border-t border-outline-variant/10">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[0.6875rem] font-bold text-on-surface-variant uppercase">
                Platform
              </span>
              <span className="text-[0.6875rem] font-bold text-on-surface">
                {metrics.system.platform}
              </span>
            </div>
          </div>
        </div>

        {/* Storage Analytics */}
        <div className="col-span-12 md:col-span-4 bg-surface-container-lowest p-8 rounded-xl metric-card">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary">database</span>
            <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface">
              Storage Capacity
            </h3>
          </div>
          <div className="space-y-6">
            {(() => {
              const totalDisk = metrics.storage.totalDiskUsage || (metrics.storage.sqliteSize + metrics.storage.lancedbSize) || 1;
              const sqlitePct = Math.min(100, Math.round((metrics.storage.sqliteSize / totalDisk) * 100));
              const lancePct = Math.min(100, Math.round((metrics.storage.lancedbSize / totalDisk) * 100));
              return (
                <>
                  <div>
                    <div className="flex justify-between text-[0.875rem] mb-2">
                      <span className="font-medium">SQLite Database</span>
                      <span className="font-bold">{formatBytes(metrics.storage.sqliteSize)}</span>
                    </div>
                    <div className="w-full bg-surface-container-low h-2 rounded-full">
                      <div className="bg-primary h-full rounded-full progress-bar transition-all" style={{ width: `${sqlitePct}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[0.875rem] mb-2">
                      <span className="font-medium">Vector Storage</span>
                      <span className="font-bold">{formatBytes(metrics.storage.lancedbSize)}</span>
                    </div>
                    <div className="w-full bg-surface-container-low h-2 rounded-full">
                      <div className="bg-tertiary h-full rounded-full progress-bar transition-all" style={{ width: `${lancePct}%` }}></div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Graph Topology Status */}
        <div className="col-span-12 md:col-span-8 bg-surface-container-lowest p-8 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-8 metric-card">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-tertiary">hub</span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface">
                Knowledge Graph
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">
                  Nodes
                </span>
                <span className="text-2xl font-bold tracking-tight">
                  {formatNumber(metrics.index.nodeCount)}
                </span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">
                  Edges
                </span>
                <span className="text-2xl font-bold tracking-tight">
                  {formatNumber(metrics.index.edgeCount)}
                </span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              {metrics.watcher && metrics.watcher.watchedDirectories > 0 ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500 pulse-dot"></div>
                  <span className="text-[0.6875rem] font-bold text-on-surface-variant uppercase">
                    Watching {metrics.watcher.watchedDirectories} {metrics.watcher.watchedDirectories === 1 ? 'directory' : 'directories'}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-outline-variant"></div>
                  <span className="text-[0.6875rem] font-bold text-on-surface-variant uppercase">
                    File watching inactive
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="border-l border-outline-variant/10 pl-0 md:pl-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6">
              Provider Status
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm">smart_toy</span>
                  </div>
                  <span className="text-[0.875rem] font-semibold">
                    {metrics.llm.provider === 'none' ? 'Not configured' : metrics.llm.provider}
                  </span>
                </div>
                <span
                  className={`text-[0.6875rem] font-bold ${
                    metrics.llm.connected ? 'text-green-600' : 'text-on-surface-variant'
                  }`}
                >
                  {metrics.llm.connected ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              {metrics.llm.model && (
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg mt-2">
                  <span className="text-xs text-on-surface-variant">Model</span>
                  <span className="text-xs font-mono font-bold text-on-surface">{metrics.llm.model}</span>
                </div>
              )}
              {metrics.llm.totalCalls !== undefined && metrics.llm.totalCalls > 0 && (
                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg mt-2">
                  <span className="text-xs text-on-surface-variant">Total Calls</span>
                  <span className="text-xs font-bold text-on-surface">{formatNumber(metrics.llm.totalCalls)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Embedding Pipeline */}
        {metrics.embedding && (metrics.embedding.completed > 0 || metrics.embedding.queueDepth > 0) && (
          <div className="col-span-12 md:col-span-6 bg-surface-container-lowest p-8 rounded-xl metric-card">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-tertiary">neurology</span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface">
                Embedding Pipeline
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Queue</span>
                <span className="text-2xl font-bold">{metrics.embedding.queueDepth}</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">In Flight</span>
                <span className="text-2xl font-bold">{metrics.embedding.inFlight}</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Completed</span>
                <span className="text-2xl font-bold">{formatNumber(metrics.embedding.completed)}</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Failed</span>
                <span className="text-2xl font-bold text-error">{metrics.embedding.failed}</span>
              </div>
            </div>
          </div>
        )}

        {/* MCP Traffic */}
        {metrics.mcp && metrics.mcp.totalRequests !== undefined && (
          <div className="col-span-12 md:col-span-6 bg-surface-container-lowest p-8 rounded-xl metric-card">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">swap_horiz</span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface">
                MCP Traffic
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Req/min</span>
                <span className="text-2xl font-bold">{metrics.mcp.requestsPerMinute}</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Avg Response</span>
                <span className="text-2xl font-bold">{metrics.mcp.averageResponseTime.toFixed(0)}ms</span>
              </div>
              <div className="bg-surface-container-low p-4 rounded-xl">
                <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Error Rate</span>
                <span className={`text-2xl font-bold ${metrics.mcp.errorRate > 0.1 ? 'text-error' : ''}`}>
                  {(metrics.mcp.errorRate * 100).toFixed(1)}%
                </span>
              </div>
              {metrics.mcp.toolBreakdown && Object.keys(metrics.mcp.toolBreakdown).length > 0 && (
                <div className="bg-surface-container-low p-4 rounded-xl">
                  <span className="block text-[0.6875rem] text-on-surface-variant font-bold uppercase mb-1">Top Tool</span>
                  <span className="text-sm font-bold font-mono">
                    {Object.entries(metrics.mcp.toolBreakdown).sort(([,a],[,b]) => b - a)[0]?.[0] || '-'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
