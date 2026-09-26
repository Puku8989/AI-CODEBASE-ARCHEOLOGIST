import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAppStore } from '@/store/useAppStore';
import { CustomNode } from './CustomNode';
import type { ViewMode, GraphNodeData } from '@/types';
import {
  Network,
  RefreshCw,
  X,
  FileCode,
  ArrowRight,
  Sliders,
} from 'lucide-react';

const nodeTypes = {
  custom: CustomNode,
  file: CustomNode,
  class: CustomNode,
  function: CustomNode,
  method: CustomNode,
  api_route: CustomNode,
  model: CustomNode,
  variable: CustomNode,
  module: CustomNode,
  default: CustomNode,
};

interface ArchitectureGraphProps {
  onOpenFileInExplorer?: (filePath: string) => void;
}

export function ArchitectureGraph({ onOpenFileInExplorer }: ArchitectureGraphProps) {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const graphData = useAppStore((s) => s.graphData);
  const graphViewMode = useAppStore((s) => s.graphViewMode);
  const setGraphViewMode = useAppStore((s) => s.setGraphViewMode);
  const fetchGraph = useAppStore((s) => s.fetchGraph);
  const loadingGraph = useAppStore((s) => s.loadingGraph);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeData, setSelectedNodeData] = useState<GraphNodeData | null>(null);

  // Sync store graphData to ReactFlow nodes & edges
  useEffect(() => {
    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const rfNodes: Node[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: n.type || 'custom',
      position: n.position || { x: Math.random() * 600, y: Math.random() * 400 },
      data: n.data,
    }));

    const rfEdges: Edge[] = graphData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      animated: e.animated ?? false,
      style: {
        stroke: e.style?.stroke || '#6366f1',
        strokeWidth: 1.5,
        opacity: 0.75,
      },
      data: e.data,
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graphData, setNodes, setEdges]);

  // Handle node selection
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeData((node.data as unknown as GraphNodeData) || null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
  }, []);

  // Compute incoming and outgoing edges for selected node
  const nodeRelationships = useMemo(() => {
    if (!selectedNodeData || !graphData) return { incoming: [], outgoing: [] };
    const nodeId = selectedNodeData.id;
    const incoming = graphData.edges.filter((e) => e.target === nodeId);
    const outgoing = graphData.edges.filter((e) => e.source === nodeId);
    return { incoming, outgoing };
  }, [selectedNodeData, graphData]);

  if (!activeRepo) return null;

  const viewModes: { id: ViewMode; label: string }[] = [
    { id: 'all', label: 'All Entities' },
    { id: 'architecture', label: 'High-Level Architecture' },
    { id: 'modules', label: 'File & Modules' },
    { id: 'classes', label: 'Classes & Inheritance' },
    { id: 'functions', label: 'Call Graph' },
    { id: 'apis', label: 'API Endpoints' },
  ];

  return (
    <div className="graph-layout">
      {/* Top Graph Controls Bar */}
      <div className="graph-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sliders size={13} /> View:
          </span>
          <div className="pill-group">
            {viewModes.map((vm) => (
              <button
                key={vm.id}
                className={`pill ${graphViewMode === vm.id ? 'active' : ''}`}
                onClick={() => setGraphViewMode(vm.id)}
              >
                {vm.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="graph-stats-bar">
            <div className="graph-stat">
              <span>Nodes:</span>
              <span className="graph-stat-value">{graphData?.stats.totalNodes ?? nodes.length}</span>
            </div>
            <div className="graph-stat">
              <span>Edges:</span>
              <span className="graph-stat-value">{graphData?.stats.totalEdges ?? edges.length}</span>
            </div>
            {(graphData?.stats.circularDependencyCount ?? 0) > 0 && (
              <div className="graph-stat" style={{ color: 'var(--color-error)' }}>
                <span>Cycles:</span>
                <span className="graph-stat-value">{graphData?.stats.circularDependencyCount}</span>
              </div>
            )}
          </div>

          <button
            className="btn btn-secondary btn-icon"
            onClick={() => fetchGraph(activeRepo.id)}
            disabled={loadingGraph}
            title="Refresh graph"
          >
            <RefreshCw size={13} className={loadingGraph ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Flow Canvas */}
      <div className="graph-container">
        {loadingGraph && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(10, 14, 23, 0.7)',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="spinner" />
            <span>Computing layout & dependencies…</span>
          </div>
        )}

        {nodes.length === 0 && !loadingGraph ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Network size={32} />
            </div>
            <div className="empty-state-title">No Graph Nodes Extracted</div>
            <div className="empty-state-desc">
              Try switching the view mode or re-analyze the repository to generate call graphs, imports, and inheritance chains.
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(99, 130, 200, 0.15)" />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const nodeType = (n.data as unknown as GraphNodeData)?.node_type;
                switch (nodeType) {
                  case 'file':
                    return '#3b82f6';
                  case 'class':
                    return '#a855f7';
                  case 'function':
                    return '#22c55e';
                  case 'api_route':
                    return '#f59e0b';
                  default:
                    return '#6366f1';
                }
              }}
              maskColor="rgba(10, 14, 23, 0.75)"
            />
          </ReactFlow>
        )}

        {/* Selected Node Details Drawer */}
        {selectedNodeData && (
          <div className="node-detail-panel">
            <div className="node-detail-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`rf-node-type-dot ${selectedNodeData.node_type}`} />
                <span className="node-detail-title">{selectedNodeData.label}</span>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setSelectedNodeData(null)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="node-detail-section">
              <div className="node-detail-section-title">Identity & Path</div>
              <div className="node-detail-item">
                <span style={{ color: 'var(--text-muted)' }}>Type:</span>
                <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                  {selectedNodeData.node_type}
                </span>
              </div>
              {(selectedNodeData.path || selectedNodeData.file_path) && (
                <div className="node-detail-item">
                  <span style={{ color: 'var(--text-muted)' }}>Path:</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedNodeData.path || selectedNodeData.file_path}
                  </span>
                </div>
              )}
              {selectedNodeData.start_line != null && (
                <div className="node-detail-item">
                  <span style={{ color: 'var(--text-muted)' }}>Lines:</span>
                  <span>
                    {selectedNodeData.start_line} – {selectedNodeData.end_line}
                  </span>
                </div>
              )}
              {selectedNodeData.complexity != null && (
                <div className="node-detail-item">
                  <span style={{ color: 'var(--text-muted)' }}>Complexity:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        selectedNodeData.complexity > 10
                          ? 'var(--color-error)'
                          : 'var(--color-success)',
                    }}
                  >
                    {selectedNodeData.complexity}
                  </span>
                </div>
              )}
            </div>

            {/* Outgoing edges */}
            <div className="node-detail-section">
              <div className="node-detail-section-title">
                Outbound Calls / Imports ({nodeRelationships.outgoing.length})
              </div>
              {nodeRelationships.outgoing.length === 0 ? (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  No outgoing relationships.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nodeRelationships.outgoing.slice(0, 6).map((e) => (
                    <div key={e.id} className="node-detail-item">
                      <ArrowRight size={12} style={{ color: 'var(--accent-secondary)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {e.label || e.data?.relationshipType || 'relates to'}:
                      </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {e.target}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Incoming edges */}
            <div className="node-detail-section">
              <div className="node-detail-section-title">
                Inbound Callers / Referrers ({nodeRelationships.incoming.length})
              </div>
              {nodeRelationships.incoming.length === 0 ? (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  No inbound references.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nodeRelationships.incoming.slice(0, 6).map((e) => (
                    <div key={e.id} className="node-detail-item">
                      <ArrowRight size={12} style={{ color: 'var(--color-info)' }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {e.source}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(selectedNodeData.path || selectedNodeData.file_path) && onOpenFileInExplorer && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    const target = selectedNodeData.path || selectedNodeData.file_path;
                    if (target) onOpenFileInExplorer(target);
                  }}
                >
                  <FileCode size={14} />
                  <span>Open in Code Explorer</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
