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

function StatTile({ icon, label, value, sublabel, accent }: {
  icon: string;
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: 'tertiary' | 'primary' | 'error' | 'green';
}) {
  const accentColor = accent === 'tertiary' ? 'text-tertiary'
    : accent === 'primary' ? 'text-primary'
    : accent === 'error' ? 'text-error'
    : accent === 'green' ? 'text-green-600'
    : 'text-on-surface';

  return (
    <div className="stat-tile">
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-lg ${accentColor}`}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <span className={`stat-value ${accentColor}`}>{value}</span>
      {sublabel && <span className="stat-sublabel">{sublabel}</span>}
    </div>
  );
}

function SectionCard({ title, icon, children, className = '' }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`section-card ${className}`}>
      <div className="section-header">
        <span className="material-symbols-outlined text-tertiary">{icon}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
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

  const heapPercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
  const totalDisk = metrics.storage.totalDiskUsage || (metrics.storage.sqliteSize + metrics.storage.lancedbSize) || 1;
  const sqlitePct = Math.min(100, Math.round((metrics.storage.sqliteSize / totalDisk) * 100));
  const lancePct = Math.min(100, Math.round((metrics.storage.lancedbSize / totalDisk) * 100));

  const topLanguages = Object.entries(metrics.index.languages || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topTools = Object.entries(metrics.mcp?.toolBreakdown || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const totalIndexFiles = metrics.index.filesIndexing + metrics.index.filesPending + metrics.index.filesError;

  return (
    <div className="pt-24 pb-12 px-8 max-w-[1440px] mx-auto">
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
            Refresh
          </button>
        </div>
      </header>

      {/* Row 1: At-a-glance status tiles */}
      <div className="metrics-grid mb-6">
        <StatTile
          icon="timer"
          label="Process Uptime"
          value={formatUptime(metrics.system.uptime)}
          sublabel={`${metrics.system.platform} · ${metrics.system.arch}`}
          accent="tertiary"
        />
        <StatTile
          icon="memory"
          label="Heap Usage"
          value={`${heapPercent.toFixed(0)}%`}
          sublabel={`${formatBytes(metrics.memory.heapUsed)} of ${formatBytes(metrics.memory.heapTotal)}`}
          accent={heapPercent > 85 ? 'error' : heapPercent > 60 ? 'primary' : 'green'}
        />
        <StatTile
          icon="folder_open"
          label="Indexed Files"
          value={formatNumber(metrics.index.fileCount)}
          sublabel={`Across ${metrics.index.repositoryCount} ${metrics.index.repositoryCount === 1 ? 'repository' : 'repositories'}`}
          accent="primary"
        />
        <StatTile
          icon="smart_toy"
          label="Embedding Provider"
          value={metrics.llm.provider === 'none' ? 'Not configured' : metrics.llm.provider}
          sublabel={metrics.llm.connected ? 'Connected' : 'Disconnected'}
          accent={metrics.llm.connected ? 'green' : 'error'}
        />
      </div>

      {/* Row 2: Detailed sections */}
      <div className="metrics-grid-sections">

        {/* Memory Breakdown */}
        <SectionCard title="Memory Breakdown" icon="memory">
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-on-surface-variant">Heap Used / Total</span>
              <span className="font-semibold">{formatBytes(metrics.memory.heapUsed)} / {formatBytes(metrics.memory.heapTotal)}</span>
            </div>
            <div className="w-full bg-surface-container-low h-2.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full progress-bar"
                style={{
                  width: `${heapPercent}%`,
                  background: heapPercent > 85
                    ? 'var(--error)'
                    : heapPercent > 60
                      ? 'var(--primary)'
                      : '#16a34a',
                }}
              />
            </div>
          </div>
          <div className="detail-grid">
            <div className="detail-row">
              <span>Resident Set Size (RSS)</span>
              <span className="font-semibold">{formatBytes(metrics.memory.rss)}</span>
            </div>
            <div className="detail-row">
              <span>Knowledge Graph Memory</span>
              <span className="font-semibold">{formatBytes(metrics.memory.graphMemory)}</span>
            </div>
            <div className="detail-row">
              <span>External (C++ objects)</span>
              <span className="font-semibold">{formatBytes(metrics.memory.external)}</span>
            </div>
            <div className="detail-row">
              <span>Free Heap</span>
              <span className="font-semibold">{formatBytes(metrics.memory.heapTotal - metrics.memory.heapUsed)}</span>
            </div>
          </div>
        </SectionCard>

        {/* Knowledge Graph */}
        <SectionCard title="Knowledge Graph" icon="hub">
          <div className="inner-grid-2">
            <div className="inner-stat">
              <span className="inner-stat-value">{formatNumber(metrics.index.nodeCount)}</span>
              <span className="inner-stat-label">Graph Nodes</span>
            </div>
            <div className="inner-stat">
              <span className="inner-stat-value">{formatNumber(metrics.index.edgeCount)}</span>
              <span className="inner-stat-label">Graph Edges</span>
            </div>
          </div>

          {topLanguages.length > 0 && (
            <div className="mt-4">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
                Languages
              </span>
              <div className="space-y-1.5">
                {topLanguages.map(([lang, count]) => (
                  <div key={lang} className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant capitalize">{lang}</span>
                    <span className="font-semibold">{formatNumber(count)} files</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalIndexFiles > 0 && (
            <div className="mt-4 pt-3 border-t border-outline-variant/15">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
                Indexing Activity
              </span>
              <div className="flex gap-3">
                {metrics.index.filesIndexing > 0 && (
                  <span className="index-badge badge-active">
                    {metrics.index.filesIndexing} indexing
                  </span>
                )}
                {metrics.index.filesPending > 0 && (
                  <span className="index-badge badge-pending">
                    {metrics.index.filesPending} pending
                  </span>
                )}
                {metrics.index.filesError > 0 && (
                  <span className="index-badge badge-error">
                    {metrics.index.filesError} errors
                  </span>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Storage */}
        <SectionCard title="Disk Usage" icon="database">
          <div className="mb-1">
            <span className="text-2xl font-bold">{formatBytes(totalDisk)}</span>
            <span className="text-sm text-on-surface-variant ml-1.5">total</span>
          </div>

          <div className="storage-bar mb-4">
            <div className="storage-segment bg-primary" style={{ width: `${sqlitePct}%` }} />
            <div className="storage-segment bg-tertiary" style={{ width: `${lancePct}%` }} />
          </div>

          <div className="detail-grid">
            <div className="detail-row">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
                SQLite Database
              </span>
              <span className="font-semibold">{formatBytes(metrics.storage.sqliteSize)}</span>
            </div>
            <div className="detail-row">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-tertiary inline-block" />
                Vector Store (LanceDB)
              </span>
              <span className="font-semibold">{formatBytes(metrics.storage.lancedbSize)}</span>
            </div>
          </div>
        </SectionCard>

        {/* System Info */}
        <SectionCard title="Runtime Environment" icon="terminal">
          <div className="detail-grid">
            <div className="detail-row">
              <span>Node.js Version</span>
              <span className="font-mono font-semibold">{metrics.system.nodeVersion}</span>
            </div>
            <div className="detail-row">
              <span>Platform</span>
              <span className="font-semibold">{metrics.system.platform}</span>
            </div>
            <div className="detail-row">
              <span>Architecture</span>
              <span className="font-semibold">{metrics.system.arch}</span>
            </div>
            <div className="detail-row">
              <span>Process Uptime</span>
              <span className="font-semibold">{formatUptime(metrics.system.uptime)}</span>
            </div>
          </div>
        </SectionCard>

        {/* LLM / Embedding Provider */}
        <SectionCard title="Embedding Provider" icon="smart_toy">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${metrics.llm.connected ? 'bg-green-500 pulse-dot' : 'bg-outline-variant'}`} />
            <span className="text-sm font-semibold">
              {metrics.llm.provider === 'none' ? 'Not configured' : metrics.llm.provider}
              <span className={`ml-2 text-xs font-bold ${metrics.llm.connected ? 'text-green-600' : 'text-on-surface-variant'}`}>
                {metrics.llm.connected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </span>
          </div>

          <div className="detail-grid">
            {metrics.llm.model && (
              <div className="detail-row">
                <span>Model</span>
                <span className="font-mono font-semibold text-xs">{metrics.llm.model}</span>
              </div>
            )}
            {metrics.llm.totalCalls !== undefined && (
              <div className="detail-row">
                <span>Total API Calls</span>
                <span className="font-semibold">{formatNumber(metrics.llm.totalCalls)}</span>
              </div>
            )}
            {metrics.llm.estimatedCost !== undefined && metrics.llm.estimatedCost > 0 && (
              <div className="detail-row">
                <span>Estimated Cost</span>
                <span className="font-semibold">${metrics.llm.estimatedCost.toFixed(4)}</span>
              </div>
            )}
          </div>
        </SectionCard>

        {/* File Watcher */}
        <SectionCard title="File Watcher" icon="visibility">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${metrics.watcher && metrics.watcher.watchedDirectories > 0 ? 'bg-green-500 pulse-dot' : 'bg-outline-variant'}`} />
            <span className="text-sm font-semibold">
              {metrics.watcher && metrics.watcher.watchedDirectories > 0
                ? `Monitoring ${metrics.watcher.watchedDirectories} ${metrics.watcher.watchedDirectories === 1 ? 'directory' : 'directories'}`
                : 'Inactive'}
            </span>
          </div>
          {metrics.watcher && (
            <div className="detail-grid">
              <div className="detail-row">
                <span>Watched Directories</span>
                <span className="font-semibold">{metrics.watcher.watchedDirectories}</span>
              </div>
              <div className="detail-row">
                <span>Change Queue Depth</span>
                <span className="font-semibold">{metrics.watcher.queueDepth}</span>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Embedding Pipeline */}
        <SectionCard title="Embedding Pipeline" icon="neurology">
          {metrics.embedding ? (
            <>
              <div className="inner-grid-2 mb-3">
                <div className="inner-stat">
                  <span className="inner-stat-value">{formatNumber(metrics.embedding.completed)}</span>
                  <span className="inner-stat-label">Completed</span>
                </div>
                <div className="inner-stat">
                  <span className="inner-stat-value text-error">{metrics.embedding.failed}</span>
                  <span className="inner-stat-label">Failed</span>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-row">
                  <span>Queued</span>
                  <span className="font-semibold">{metrics.embedding.queueDepth}</span>
                </div>
                <div className="detail-row">
                  <span>In Flight</span>
                  <span className="font-semibold">{metrics.embedding.inFlight}</span>
                </div>
                <div className="detail-row">
                  <span>Total Tokens Processed</span>
                  <span className="font-semibold">{formatNumber(metrics.embedding.totalTokens)}</span>
                </div>
                <div className="detail-row">
                  <span>Rate Limit Hits</span>
                  <span className={`font-semibold ${metrics.embedding.rateLimitHits > 0 ? 'text-error' : ''}`}>
                    {metrics.embedding.rateLimitHits}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">No embedding pipeline active.</p>
          )}
        </SectionCard>

        {/* MCP Server Traffic */}
        <SectionCard title="MCP Server Traffic" icon="swap_horiz">
          {metrics.mcp && metrics.mcp.totalRequests !== undefined ? (
            <>
              <div className="inner-grid-2 mb-3">
                <div className="inner-stat">
                  <span className="inner-stat-value">{formatNumber(metrics.mcp.totalRequests)}</span>
                  <span className="inner-stat-label">Total Requests</span>
                </div>
                <div className="inner-stat">
                  <span className="inner-stat-value">{metrics.mcp.requestsPerMinute}</span>
                  <span className="inner-stat-label">Requests / min</span>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-row">
                  <span>Avg Response Time</span>
                  <span className="font-semibold">{metrics.mcp.averageResponseTime.toFixed(0)} ms</span>
                </div>
                <div className="detail-row">
                  <span>Error Rate</span>
                  <span className={`font-semibold ${metrics.mcp.errorRate > 0.05 ? 'text-error' : ''}`}>
                    {(metrics.mcp.errorRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {topTools.length > 0 && (
                <div className="mt-3 pt-3 border-t border-outline-variant/15">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
                    Tool Usage
                  </span>
                  <div className="space-y-1.5">
                    {topTools.map(([tool, count]) => (
                      <div key={tool} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs text-on-surface-variant">{tool}</span>
                        <span className="font-semibold">{formatNumber(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-on-surface-variant">No MCP server running.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
