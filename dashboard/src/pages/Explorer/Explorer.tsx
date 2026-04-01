import { useEffect, useRef, useState, useCallback } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import './Explorer.css';

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  filePath: string;
  language: string;
  x: number;
  y: number;
  size: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
  truncated: boolean;
}

interface NodeDetails {
  node: {
    id: string;
    name: string;
    qualifiedName: string;
    kind: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    language: string;
  };
  callers: Array<{ id: string; name: string; kind: string; filePath: string }>;
  callees: Array<{ id: string; name: string; kind: string; filePath: string }>;
  callersTotal: number;
  calleesTotal: number;
}

const EDGE_COLORS: Record<string, string> = {
  calls: '#0048e2',
  imports: '#6b7280',
  extends: '#059669',
  implements: '#7c3aed',
  references: '#a9b4b9',
};

export default function Explorer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const [selectedTool, setSelectedTool] = useState('select');
  const [renderMode, setRenderMode] = useState<'sigma' | 'raw'>('sigma');
  const [repositories, setRepositories] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeDetails | null>(null);
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0 });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [nodeError, setNodeError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/repositories')
      .then(res => res.json())
      .then(data => {
        const repos = data.repositories || [];
        setRepositories(repos);
        if (repos.length > 0) {
          setSelectedRepo(repos[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const getNodeColor = useCallback((kind: string): string => {
    const colors: Record<string, string> = {
      class: '#0048e2',
      function: '#526074',
      interface: '#0048e2',
      method: '#526074',
      variable: '#717c82',
      module: '#565e74',
      type: '#7c3aed',
    };
    return colors[kind] || '#565e74';
  }, []);

  const loadNodeDetails = useCallback(async (nodeId: string) => {
    if (!selectedRepo) return;
    setNodeError(null);
    try {
      const response = await fetch(`/api/graph/${selectedRepo}/node/${nodeId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setNodeError(errorData?.error || `Failed to load node (${response.status})`);
        return;
      }
      const data: NodeDetails = await response.json();
      setSelectedNode(data);
      setHighlightedNode(nodeId);
    } catch (error) {
      console.error('Failed to load node details:', error);
      setNodeError('Network error loading node details');
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedRepo) return;

    setLoading(true);

    fetch(`/api/graph/${selectedRepo}?maxNodes=500&includeEdges=true`)
      .then(res => res.json())
      .then((data: GraphData) => {
        setRawData(data);
        setGraphStats({ nodes: data.nodes.length, edges: data.edges.length });

        if (renderMode !== 'sigma' || !containerRef.current) {
          setLoading(false);
          return;
        }

        const graph = new Graph();

        data.nodes.forEach(node => {
          graph.addNode(node.id, {
            label: node.label,
            x: node.x,
            y: node.y,
            size: node.kind === 'class' || node.kind === 'interface' ? 14 : node.kind === 'function' || node.kind === 'method' ? 10 : 7,
            color: getNodeColor(node.kind),
            kind: node.kind,
            filePath: node.filePath,
          });
        });

        data.edges.forEach(edge => {
          if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
            try {
              graph.addEdge(edge.source, edge.target, {
                size: edge.kind === 'calls' ? 2 : 1,
                color: EDGE_COLORS[edge.kind] || '#a9b4b9',
                type: 'arrow',
                edgeKind: edge.kind,
              });
            } catch {
              /* duplicate */
            }
          }
        });

        if (sigmaRef.current) {
          sigmaRef.current.kill();
        }

        const sigma = new Sigma(graph, containerRef.current, {
          renderEdgeLabels: false,
          renderLabels: true,
          labelRenderedSizeThreshold: 6,
          defaultNodeColor: '#565e74',
          defaultEdgeColor: '#d1d5db',
          defaultEdgeType: 'arrow',
          labelColor: { color: '#1a1c1e' },
          labelSize: 12,
          labelWeight: 'bold',
          edgeLabelSize: 10,
          allowInvalidContainer: true,
          nodeReducer: (node, data) => {
            const res = { ...data };
            if (highlightedNode && highlightedNode !== node) {
              const neighbors = graph.neighbors(highlightedNode);
              if (!neighbors.includes(node)) {
                res.color = '#e5e7eb';
                res.label = '';
              }
            }
            return res;
          },
          edgeReducer: (edge, data) => {
            const res = { ...data };
            if (highlightedNode) {
              const src = graph.source(edge);
              const tgt = graph.target(edge);
              if (src !== highlightedNode && tgt !== highlightedNode) {
                res.color = '#f3f4f6';
              }
            }
            return res;
          },
        });

        sigma.on('clickNode', ({ node }) => {
          loadNodeDetails(node);
        });

        sigma.on('clickStage', () => {
          setHighlightedNode(null);
          setSelectedNode(null);
        });

        sigmaRef.current = sigma;
        graphRef.current = graph;
        setLoading(false);

        requestAnimationFrame(() => {
          sigma.getCamera().animatedReset({ duration: 300 });
        });
      })
      .catch(err => {
        console.error('Failed to load graph:', err);
        setLoading(false);
      });

    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
      graphRef.current = null;
    };
  }, [selectedRepo, refreshTrigger, renderMode, getNodeColor, loadNodeDetails]);

  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [highlightedNode]);

  const handleZoomIn = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) {
      camera.animatedZoom({ duration: 200, factor: 1.5 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) {
      camera.animatedUnzoom({ duration: 200, factor: 1.5 });
    }
  }, []);

  const handleResetView = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) {
      camera.animatedReset({ duration: 300 });
    }
  }, []);

  return (
    <div className="explorer-container flex flex-col h-screen overflow-hidden pt-16">
      {/* Sub-header: Context & Controls */}
      <section className="px-8 py-4 bg-surface-container-low flex justify-between items-center border-b border-outline-variant/10 shrink-0">
        <div className="flex flex-col">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
            Graph Explorer
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            {repositories.find(r => r.id === selectedRepo)?.name || 'Dependency Graph'}
          </h1>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-surface-container p-1 rounded-lg border border-outline-variant/20">
            <button
              onClick={() => setRenderMode('sigma')}
              className={`px-4 py-2 text-[0.75rem] font-semibold uppercase tracking-wider rounded-md transition-all ${
                renderMode === 'sigma'
                  ? 'text-white shadow-sm'
                  : 'text-on-surface hover:bg-surface-container-high'
              }`}
              style={renderMode === 'sigma' ? { backgroundColor: '#565e74' } : {}}
            >
              Sigma Engine
            </button>
            <button
              onClick={() => setRenderMode('raw')}
              className={`px-4 py-2 text-[0.75rem] font-semibold uppercase tracking-wider rounded-md transition-all ${
                renderMode === 'raw'
                  ? 'text-white shadow-sm'
                  : 'text-on-surface hover:bg-surface-container-high'
              }`}
              style={renderMode === 'raw' ? { backgroundColor: '#565e74' } : {}}
            >
              Raw Data
            </button>
          </div>
          <button
            onClick={() => setRefreshTrigger(prev => prev + 1)}
            disabled={!selectedRepo}
            className="px-6 py-2 rounded-lg text-[0.875rem] font-semibold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: '#565e74', color: 'white' }}
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Re-render
          </button>
        </div>
      </section>

      {/* The Canvas */}
      <div className="flex-1 relative overflow-hidden bg-surface-container-low p-6">
        <div className="w-full h-full bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 relative overflow-hidden graph-mesh-bg">

          {/* Sigma Graph View */}
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ display: renderMode === 'sigma' ? 'block' : 'none' }}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container-lowest/80 z-10">
                <div className="text-center">
                  <div className="w-16 h-16 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <span className="material-symbols-outlined text-tertiary text-4xl">hub</span>
                  </div>
                  <p className="text-on-surface font-semibold">Loading graph...</p>
                </div>
              </div>
            )}
            {!selectedRepo && !loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-tertiary text-4xl">hub</span>
                  </div>
                  <h2 className="text-xl font-bold text-on-surface mb-2">
                    No Repository Selected
                  </h2>
                  <p className="text-on-surface-variant text-[0.875rem]">
                    Index a repository first to visualize its dependency graph
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Raw Data View */}
          {renderMode === 'raw' && (
            <div className="absolute inset-0 overflow-auto p-6">
              {rawData && rawData.nodes.length > 0 ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="flex gap-4">
                    <div className="px-4 py-3 bg-surface-container rounded-xl">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant block mb-1">Total Nodes</span>
                      <span className="text-2xl font-bold text-on-surface">{rawData.nodes.length}</span>
                    </div>
                    <div className="px-4 py-3 bg-surface-container rounded-xl">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant block mb-1">Total Edges</span>
                      <span className="text-2xl font-bold text-on-surface">{rawData.edges.length}</span>
                    </div>
                    {rawData.truncated && (
                      <div className="px-4 py-3 bg-error/10 rounded-xl">
                        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-error block mb-1">Truncated</span>
                        <span className="text-sm font-medium text-error">{rawData.total} total nodes</span>
                      </div>
                    )}
                  </div>

                  {/* Nodes Table */}
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface mb-3">Nodes</h3>
                    <div className="border border-outline-variant/20 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-container-low border-b border-outline-variant/20">
                            <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Name</th>
                            <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Kind</th>
                            <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">File</th>
                            <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Language</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rawData.nodes.map((node) => (
                            <tr
                              key={node.id}
                              className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 cursor-pointer transition-colors"
                              onClick={() => loadNodeDetails(node.id)}
                            >
                              <td className="px-4 py-2.5 font-medium text-on-surface">{node.label}</td>
                              <td className="px-4 py-2.5">
                                <span
                                  className="inline-block px-2 py-0.5 text-[0.625rem] font-semibold uppercase rounded"
                                  style={{ backgroundColor: getNodeColor(node.kind) + '18', color: getNodeColor(node.kind) }}
                                >
                                  {node.kind}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-on-surface-variant font-mono text-xs truncate max-w-[300px]">{node.filePath}</td>
                              <td className="px-4 py-2.5 text-on-surface-variant">{node.language}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Edges Table */}
                  {rawData.edges.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface mb-3">Edges</h3>
                      <div className="border border-outline-variant/20 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-container-low border-b border-outline-variant/20">
                              <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Source</th>
                              <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Relationship</th>
                              <th className="text-left px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">Target</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rawData.edges.map((edge) => {
                              const sourceNode = rawData.nodes.find(n => n.id === edge.source);
                              const targetNode = rawData.nodes.find(n => n.id === edge.target);
                              return (
                                <tr key={edge.id} className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors">
                                  <td className="px-4 py-2.5 font-medium text-on-surface">{sourceNode?.label || edge.source}</td>
                                  <td className="px-4 py-2.5">
                                    <span className="inline-flex items-center gap-1 text-on-surface-variant text-xs">
                                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                      {edge.kind}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 font-medium text-on-surface">{targetNode?.label || edge.target}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-on-surface-variant">No graph data loaded</p>
                </div>
              )}
            </div>
          )}

          {/* Floating UI Overlays (only in Sigma mode) */}
          {renderMode === 'sigma' && (
            <>
              <div className="absolute top-6 left-6 flex flex-col gap-3 z-10">
                <div className="glass-panel p-2 rounded-xl flex flex-col gap-1 border border-outline-variant/20">
                  <button
                    onClick={() => setSelectedTool('select')}
                    title="Select nodes"
                    className={`tool-button w-10 h-10 flex items-center justify-center rounded-lg ${
                      selectedTool === 'select' ? 'active' : ''
                    }`}
                  >
                    <span className="material-symbols-outlined">near_me</span>
                  </button>
                  <button
                    onClick={handleResetView}
                    title="Reset view"
                    className="tool-button w-10 h-10 flex items-center justify-center rounded-lg"
                  >
                    <span className="material-symbols-outlined">fit_screen</span>
                  </button>
                  <button
                    onClick={handleZoomIn}
                    title="Zoom in"
                    className="tool-button w-10 h-10 flex items-center justify-center rounded-lg"
                  >
                    <span className="material-symbols-outlined">zoom_in</span>
                  </button>
                  <button
                    onClick={handleZoomOut}
                    title="Zoom out"
                    className="tool-button w-10 h-10 flex items-center justify-center rounded-lg"
                  >
                    <span className="material-symbols-outlined">zoom_out</span>
                  </button>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 glass-panel px-4 py-3 rounded-xl border border-outline-variant/20 flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#0048e2' }}></div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Class / Interface
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#526074' }}></div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Function
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#7c3aed' }}></div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Type
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#565e74' }}></div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Other
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Details Inspector (both modes) */}
          <div className="absolute right-6 top-6 bottom-6 w-80 glass-panel rounded-xl border border-outline-variant/20 p-6 flex flex-col gap-6 shadow-2xl details-panel overflow-y-auto z-20">
            {nodeError && (
              <div className="px-3 py-2 bg-error/10 border border-error/20 rounded-lg">
                <p className="text-sm text-error font-medium">{nodeError}</p>
                <button
                  onClick={() => setNodeError(null)}
                  className="text-xs text-error/70 mt-1 underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            {selectedNode ? (
              <>
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-tertiary mb-1 block">
                    Node Properties
                  </span>
                  <h3 className="text-lg font-bold text-on-surface">{selectedNode.node.name}</h3>
                  <p className="text-[0.75rem] text-on-surface-variant mt-1 font-mono">
                    {selectedNode.node.filePath}:{selectedNode.node.lineStart}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-block px-2 py-1 text-[0.6875rem] font-semibold uppercase bg-tertiary/10 text-tertiary rounded">
                      {selectedNode.node.kind}
                    </span>
                    <span className="text-[0.6875rem] text-on-surface-variant">
                      {selectedNode.node.language}
                    </span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-surface-container-low rounded-lg">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant block mb-1">
                        Inbound
                      </span>
                      <span className="text-lg font-bold text-on-surface">
                        {selectedNode.callersTotal}
                      </span>
                    </div>
                    <div className="p-3 bg-surface-container-low rounded-lg">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant block mb-1">
                        Outbound
                      </span>
                      <span className="text-lg font-bold text-on-surface">
                        {selectedNode.calleesTotal}
                      </span>
                    </div>
                  </div>
                  {selectedNode.callers.length > 0 && (
                    <div>
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
                        Depended on by
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {selectedNode.callers.slice(0, 10).map(caller => (
                          <div
                            key={caller.id}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-container-low rounded px-1 py-0.5"
                            onClick={() => loadNodeDetails(caller.id)}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getNodeColor(caller.kind) }}
                            />
                            <span className="text-on-surface truncate font-medium">{caller.name}</span>
                            <span className="text-on-surface-variant text-[0.625rem] uppercase shrink-0">{caller.kind}</span>
                          </div>
                        ))}
                        {selectedNode.callersTotal > 10 && (
                          <p className="text-[0.625rem] text-on-surface-variant">
                            +{selectedNode.callersTotal - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedNode.callees.length > 0 && (
                    <div>
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
                        Depends on
                      </p>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {selectedNode.callees.slice(0, 10).map(callee => (
                          <div
                            key={callee.id}
                            className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-container-low rounded px-1 py-0.5"
                            onClick={() => loadNodeDetails(callee.id)}
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: getNodeColor(callee.kind) }}
                            />
                            <span className="text-on-surface truncate font-medium">{callee.name}</span>
                            <span className="text-on-surface-variant text-[0.625rem] uppercase shrink-0">{callee.kind}</span>
                          </div>
                        ))}
                        {selectedNode.calleesTotal > 10 && (
                          <p className="text-[0.625rem] text-on-surface-variant">
                            +{selectedNode.calleesTotal - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedNode.callersTotal === 0 && selectedNode.calleesTotal === 0 && (
                    <p className="text-xs text-on-surface-variant italic">
                      No relationships found. Re-index to detect import dependencies.
                    </p>
                  )}
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <button
                    onClick={() => { setSelectedNode(null); setHighlightedNode(null); }}
                    className="w-full py-2.5 bg-surface-container-highest text-on-surface text-[0.875rem] font-semibold rounded-lg hover:bg-surface-variant transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                    Clear Selection
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-tertiary mb-1 block">
                    Node Properties
                  </span>
                  <h3 className="text-lg font-bold text-on-surface">Select a node</h3>
                  <p className="text-[0.875rem] text-on-surface-variant mt-2">
                    Click on a node in the {renderMode === 'sigma' ? 'graph' : 'table'} to view its properties and relationships
                  </p>
                </div>
                <div className="mt-4 text-[0.75rem] text-on-surface-variant space-y-2">
                  <p className="font-semibold text-on-surface text-[0.6875rem] uppercase tracking-wider">Controls</p>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">mouse</span>
                    Scroll to zoom, drag to pan
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">touch_app</span>
                    Click node to inspect
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="h-10 bg-surface-container-low border-t border-outline-variant/10 px-8 flex items-center justify-between status-bar">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
            <span className={`w-2 h-2 rounded-full ${selectedRepo ? 'bg-green-500 pulse-indicator' : 'bg-outline-variant'}`}></span>
            Graph Engine: {selectedRepo ? 'Ready' : 'No Repository'}
          </div>
          <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
            Nodes: {graphStats.nodes} | Edges: {graphStats.edges}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
          {selectedRepo && (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-surface-container-low border-none rounded px-2 py-1 text-[0.6875rem] font-semibold uppercase"
            >
              {repositories.map(repo => (
                <option key={repo.id} value={repo.id}>{repo.name}</option>
              ))}
            </select>
          )}
        </div>
      </footer>
    </div>
  );
}
