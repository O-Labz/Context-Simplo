import { useState, useEffect } from 'react';
import { Activity, Database, Cpu, HardDrive } from 'lucide-react';

interface MetricsData {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    graphMemory: number;
  };
  graph: {
    nodeCount: number;
    edgeCount: number;
  };
  storage: {
    sqliteSize: number;
    lancedbSize: number;
  };
  llm: {
    connected: boolean;
    provider: string;
    model?: string;
  };
}

export default function Metrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      const response = await fetch('/api/metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load metrics:', error);
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

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  if (!metrics) {
    return <div className="text-center py-12">Loading metrics...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">System Metrics</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Uptime</h3>
          </div>
          <p className="text-2xl font-bold">{formatUptime(metrics.uptime)}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Cpu className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Memory</h3>
          </div>
          <p className="text-2xl font-bold">{formatBytes(metrics.memory.heapUsed)}</p>
          <p className="text-sm text-muted-foreground">
            of {formatBytes(metrics.memory.heapTotal)}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-2">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Graph</h3>
          </div>
          <p className="text-2xl font-bold">{metrics.graph.nodeCount.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">
            nodes, {metrics.graph.edgeCount.toLocaleString()} edges
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Storage</h3>
          </div>
          <p className="text-2xl font-bold">{formatBytes(metrics.storage.sqliteSize)}</p>
          <p className="text-sm text-muted-foreground">
            + {formatBytes(metrics.storage.lancedbSize)} vectors
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">LLM Provider Status</h2>
        <div className="flex items-center space-x-4">
          <div
            className={`w-3 h-3 rounded-full ${
              metrics.llm.connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <div>
            <p className="font-medium">
              {metrics.llm.provider === 'none' ? 'Not configured' : metrics.llm.provider}
            </p>
            {metrics.llm.model && (
              <p className="text-sm text-muted-foreground">Model: {metrics.llm.model}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Graph Memory</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Estimated: {formatBytes(metrics.memory.graphMemory)}
        </p>
        <div className="w-full bg-muted rounded-full h-4">
          <div
            className="bg-primary h-4 rounded-full"
            style={{
              width: `${Math.min((metrics.memory.graphMemory / (512 * 1024 * 1024)) * 100, 100)}%`,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Limit: 512 MB (configurable via GRAPH_MEMORY_LIMIT_MB)
        </p>
      </div>
    </div>
  );
}
