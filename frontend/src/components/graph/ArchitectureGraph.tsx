import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAppStore } from '@/store/useAppStore';
import { CustomNode, GroupNode } from './CustomNode';
import { computeHierarchicalLayout } from './graph-layout-engine';
import { computeGraphRoutes } from './edge-routing-engine';
import { EdgeRoutingContext } from './EdgeRoutingContext';
import { OrthogonalRoutingEdge } from './OrthogonalRoutingEdge';
import type { ViewMode, GraphNodeData } from '@/types';
import {
  Network,
  RefreshCw,
  X,
  FileCode,
  ArrowRight,
  Sliders,
  Focus,
  Eye,
  EyeOff,
  Search,
  Maximize2,
  Filter,
  Layers,
  Info,
  ExternalLink,
} from 'lucide-react';

// ── Node type registry ──────────────────────────────────────────
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
  group: GroupNode,
};

// ── Edge type registry (custom orthogonal routing edge) ─────────
const edgeTypes = {
  orthogonalRouting: OrthogonalRoutingEdge,
};

// ── Relationship type filter options ────────────────────────────
const RELATIONSHIP_FILTERS = [
  { id: 'all', label: 'All Relationships' },
  { id: 'imports', label: 'Imports' },
  { id: 'calls', label: 'Calls' },
  { id: 'inherits', label: 'Inheritance' },
  { id: 'contains', label: 'Contains' },
  { id: 'invokes', label: 'Invokes' },
];

// ── Edge colors by relationship type ────────────────────────────
const EDGE_COLORS: Record<string, string> = {
  imports: '#3b82f6',   // Blue
  calls: '#22c55e',     // Emerald
  inherits: '#a855f7',  // Violet
  invokes: '#10b981',   // Teal
  contains: '#f59e0b',  // Amber
  depends_on: '#6366f1',
};

// ── Inner component (needs ReactFlow context) ───────────────────

interface ArchitectureGraphInnerProps {
  onOpenFileInExplorer?: (filePath: string) => void;
}

function ArchitectureGraphInner({ onOpenFileInExplorer }: ArchitectureGraphInnerProps) {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const graphData = useAppStore((s) => s.graphData);
  const graphViewMode = useAppStore((s) => s.graphViewMode);
  const setGraphViewMode = useAppStore((s) => s.setGraphViewMode);
  const fetchGraph = useAppStore((s) => s.fetchGraph);
  const loadingGraph = useAppStore((s) => s.loadingGraph);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeData, setSelectedNodeData] = useState<GraphNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [relationshipFilter, setRelationshipFilter] = useState('all');
  const [showGroups, setShowGroups] = useState(true);
  const [showIsolated, setShowIsolated] = useState(true);
  const [layoutDirection, setLayoutDirection] = useState<'LR' | 'TB'>('LR');
  const [computedRoutes, setComputedRoutes] = useState<Map<string, import('./edge-routing-engine').ComputedEdgeRoute>>(new Map());
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragRafRef = useRef<number | null>(null);
  const { fitView, setCenter, getZoom } = useReactFlow();
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  // ── Run layout engine when graphData or view settings change ──
  useEffect(() => {
    // A new layout invalidates any hover or focus state from the old graph.
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setFocusedNodeId(null);

    if (!graphData) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Convert backend payload to React Flow nodes
    const rfNodes: Node[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: n.type || 'custom',
      position: { x: 0, y: 0 },
      data: n.data,
    }));

    // Filter edges by relationship type
    let rawEdges = graphData.edges;
    if (relationshipFilter !== 'all') {
      rawEdges = rawEdges.filter(
        (e) => (e.data as Record<string, unknown>)?.relationshipType === relationshipFilter
      );
    }

    // Convert edges with arrows, colors, and orthogonal routing
    const rfEdges: Edge[] = rawEdges.map((e) => {
      const relType = ((e.data as Record<string, unknown>)?.relationshipType as string) || 'depends_on';
      const color = EDGE_COLORS[relType] || '#6366f1';
      const isInferred = (e.data as Record<string, unknown>)?.confidence === 'inferred';

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || relType,
        type: 'orthogonalRouting',
        animated: e.animated ?? isInferred,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: color,
        },
        style: {
          stroke: color,
          strokeWidth: 1.5,
          opacity: 0.75,
          strokeDasharray: isInferred ? '5,5' : undefined,
        },
        data: e.data,
      };
    });

    // Run deterministic hierarchical layout
    const layoutResult = computeHierarchicalLayout(
      rfNodes,
      rfEdges,
      graphData.entryPoints || [],
      graphData.directoryGroups || {},
      {
        direction: layoutDirection,
        enableClustering: showGroups,
      }
    );

    // Filter isolated nodes if toggled off
    let finalNodes = layoutResult.nodes;
    if (!showIsolated) {
      finalNodes = finalNodes.filter(
        (n) => !(n.data as unknown as GraphNodeData)?.isIsolated
      );
    }

    // Prepend group boundary nodes behind member nodes
    if (showGroups && layoutResult.groupNodes.length > 0) {
      let activeGroupNodes = layoutResult.groupNodes;
      if (!showIsolated) {
        activeGroupNodes = activeGroupNodes.filter(
          (g) => g.id !== 'group:isolated_components'
        );
      }
      finalNodes = [...activeGroupNodes, ...finalNodes];
    }

    // ── Compute orthogonal edge routes ────────────────────────────
    const routes = computeGraphRoutes(finalNodes, layoutResult.edges, layoutDirection);

    // Build maps of per-node source/target port offsets for multi-port rendering
    const nodeSourcePorts = new Map<string, number[]>();
    const nodeTargetPorts = new Map<string, number[]>();
    for (const route of routes.values()) {
      if (route.isSelfLoop) continue;
      // Source ports
      if (!nodeSourcePorts.has(route.source)) nodeSourcePorts.set(route.source, []);
      nodeSourcePorts.get(route.source)!.push(route.sourcePortOffset);
      // Target ports
      if (!nodeTargetPorts.has(route.target)) nodeTargetPorts.set(route.target, []);
      nodeTargetPorts.get(route.target)!.push(route.targetPortOffset);
    }

    // Deduplicate port offsets for clean dot rendering
    for (const [id, ports] of nodeSourcePorts) {
      nodeSourcePorts.set(id, Array.from(new Set(ports)).sort((a, b) => a - b));
    }
    for (const [id, ports] of nodeTargetPorts) {
      nodeTargetPorts.set(id, Array.from(new Set(ports)).sort((a, b) => a - b));
    }

    // Inject port arrays into node data for multi-port terminal rendering
    const nodesWithPorts = finalNodes.map((n) => {
      const sp = nodeSourcePorts.get(n.id);
      const tp = nodeTargetPorts.get(n.id);
      if (!sp && !tp) return n;
      return {
        ...n,
        data: {
          ...n.data,
          sourcePorts: sp || [],
          targetPorts: tp || [],
        },
      };
    });

    // Inject route data into each edge for the custom edge component
    const edgesWithRoutes = layoutResult.edges.map((e) => {
      const route = routes.get(e.id);
      if (!route) return e;
      return {
        ...e,
        data: {
          ...(e.data || {}),
          route,
        },
      };
    });

    setNodes(nodesWithPorts);
    setEdges(edgesWithRoutes);
    setComputedRoutes(routes);

    // Auto fit to view with smooth animation
    requestAnimationFrame(() => {
      fitViewRef.current({ padding: 0.12, duration: 350 });
    });
  }, [
    graphData,
    setNodes,
    setEdges,
    relationshipFilter,
    showGroups,
    showIsolated,
    layoutDirection,
  ]);

  // ── Handle node click / selection ─────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as unknown as GraphNodeData;
    if (data?.isGroup) return; // Don't select group background containers

    setSelectedNodeData(data || null);
    setSelectedEdge(null);
    setFocusedNodeId(node.id);
  }, []);

  // ── Handle edge click ─────────────────────────────────────────
  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNodeData(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
    setSelectedEdge(null);
    setFocusedNodeId(null);
  }, []);

  // ── Hover & Drag event handlers for interactive tracing ───────
  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as unknown as GraphNodeData;
    if (data?.isGroup) return;
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const handleEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setHoveredEdgeId(edge.id);
  }, []);

  const handleEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null);
  }, []);

  const handleNodeDrag = useCallback((_: MouseEvent | TouchEvent, _node: Node) => {
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      setNodes((currentNodes) => {
        const updatedRoutes = computeGraphRoutes(currentNodes, edges, layoutDirection);
        setComputedRoutes(updatedRoutes);
        return currentNodes;
      });
    });
  }, [edges, layoutDirection, setNodes]);

  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, _node: Node) => {
    setNodes((currentNodes) => {
      const updatedRoutes = computeGraphRoutes(currentNodes, edges, layoutDirection);
      setComputedRoutes(updatedRoutes);
      return currentNodes;
    });
  }, [edges, layoutDirection, setNodes]);

  // ── Unified Interactive Tracing & Focus Effect ────────────────
  useEffect(() => {
    // 1. Edge hover tracing: highlight specific edge and its two endpoint nodes
    if (hoveredEdgeId) {
      const targetEdge = edges.find((e) => e.id === hoveredEdgeId);
      if (targetEdge) {
        const sourceId = targetEdge.source;
        const destId = targetEdge.target;

        setNodes((nds) =>
          nds.map((n) => {
            const isEndpoint = n.id === sourceId || n.id === destId;
            return {
              ...n,
              data: {
                ...n.data,
                isUpstream: n.id === destId,
                isDownstream: n.id === sourceId,
              },
              style: {
                ...n.style,
                opacity: isEndpoint ? 1 : 0.22,
                transition: 'opacity 0.15s ease',
                zIndex: isEndpoint ? 25 : 1,
              },
            };
          })
        );

        setEdges((eds) =>
          eds.map((e) => {
            const isHovered = e.id === hoveredEdgeId;
            const relType = ((e.data as Record<string, unknown>)?.relationshipType as string) || 'depends_on';
            const color = EDGE_COLORS[relType] || '#6366f1';
            return {
              ...e,
              style: {
                ...e.style,
                stroke: isHovered ? color : '#334155',
                strokeWidth: isHovered ? 3.2 : 1,
                opacity: isHovered ? 1 : 0.12,
                filter: isHovered ? `drop-shadow(0 0 6px ${color})` : undefined,
                transition: 'all 0.15s ease',
              },
              zIndex: isHovered ? 50 : 1,
            };
          })
        );
        return;
      }
    }

    // 2. Node hover or click focus: highlight incoming (cyan) & outgoing (emerald)
    const activeNodeId = hoveredNodeId || focusedNodeId;
    if (activeNodeId) {
      const up = new Set<string>();   // Targets of outgoing edges
      const down = new Set<string>(); // Sources of incoming edges
      const connected = new Set<string>([activeNodeId]);

      for (const edge of edges) {
        if (edge.source === activeNodeId) {
          up.add(edge.target);
          connected.add(edge.target);
        }
        if (edge.target === activeNodeId) {
          down.add(edge.source);
          connected.add(edge.source);
        }
      }

      setNodes((nds) =>
        nds.map((n) => {
          const nd = n.data as unknown as GraphNodeData;
          if (nd?.isGroup) return n;

          const isSelf = n.id === activeNodeId;
          const isUp = up.has(n.id);
          const isDown = down.has(n.id);
          const isConn = connected.has(n.id);

          return {
            ...n,
            data: {
              ...n.data,
              isUpstream: isUp,
              isDownstream: isDown,
            },
            style: {
              ...n.style,
              opacity: isConn ? 1 : 0.14,
              transition: 'opacity 0.15s ease',
              zIndex: isSelf ? 30 : isConn ? 15 : 1,
            },
          };
        })
      );

      setEdges((eds) =>
        eds.map((e) => {
          const isOutgoing = e.source === activeNodeId;
          const isIncoming = e.target === activeNodeId;

          if (isOutgoing) {
            // Outgoing edges: emerald/green (#10b981)
            return {
              ...e,
              style: {
                ...e.style,
                stroke: '#10b981',
                strokeWidth: 2.6,
                opacity: 1,
                filter: 'drop-shadow(0 0 5px rgba(16, 185, 129, 0.7))',
                transition: 'all 0.15s ease',
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: '#10b981',
              },
              zIndex: 40,
            };
          } else if (isIncoming) {
            // Incoming edges: cyan/blue (#06b6d4)
            return {
              ...e,
              style: {
                ...e.style,
                stroke: '#06b6d4',
                strokeWidth: 2.6,
                opacity: 1,
                filter: 'drop-shadow(0 0 5px rgba(6, 182, 212, 0.7))',
                transition: 'all 0.15s ease',
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: '#06b6d4',
              },
              zIndex: 40,
            };
          } else {
            return {
              ...e,
              style: {
                ...e.style,
                opacity: 0.08,
                strokeWidth: 1,
                filter: undefined,
                transition: 'all 0.15s ease',
              },
              zIndex: 1,
            };
          }
        })
      );
      return;
    }

    // 3. Default state (no hover, no focus): restore clean styling
    setNodes((nds) =>
      nds.map((n) => {
        const nd = n.data as unknown as GraphNodeData;
        if (nd?.isGroup) return n;
        return {
          ...n,
          data: {
            ...n.data,
            isUpstream: false,
            isDownstream: false,
          },
          style: {
            ...n.style,
            opacity: 1,
            transition: 'opacity 0.2s ease',
            zIndex: 1,
          },
        };
      })
    );

    setEdges((eds) =>
      eds.map((e) => {
        const relType = ((e.data as Record<string, unknown>)?.relationshipType as string) || 'depends_on';
        const color = EDGE_COLORS[relType] || '#6366f1';
        return {
          ...e,
          style: {
            ...e.style,
            stroke: color,
            strokeWidth: 1.5,
            opacity: 0.75,
            filter: undefined,
            transition: 'all 0.2s ease',
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: color,
          },
          zIndex: 5,
        };
      })
    );
  // `edges` is deliberately omitted: this effect updates edges itself, so
  // watching them here would schedule an update loop. Interaction changes
  // trigger the effect, and each render supplies the current edge list.
  }, [hoveredEdgeId, hoveredNodeId, focusedNodeId, setNodes, setEdges]);

  // ── Search functionality ──────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery || !graphData) return [];
    const q = searchQuery.toLowerCase();
    return graphData.nodes.filter(
      (n) =>
        n.data.label?.toLowerCase().includes(q) ||
        n.data.path?.toLowerCase().includes(q) ||
        n.data.qualified_name?.toLowerCase().includes(q)
    );
  }, [searchQuery, graphData]);

  const focusOnNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        setCenter(node.position.x + 100, node.position.y + 30, {
          zoom: Math.max(getZoom(), 1.1),
          duration: 500,
        });
        setSelectedNodeData(node.data as unknown as GraphNodeData);
        setSelectedEdge(null);
        setFocusedNodeId(nodeId);
        setShowSearch(false);
        setSearchQuery('');
      }
    },
    [nodes, setCenter, getZoom]
  );

  // ── Keyboard shortcut for search ──────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
        setFocusedNodeId(null);
        setSelectedNodeData(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Compute relationships for detail panel ────────────────────
  const nodeRelationships = useMemo(() => {
    if (!selectedNodeData || !graphData) return { incoming: [], outgoing: [] };
    const nodeId = selectedNodeData.id;
    const incoming = graphData.edges.filter((e) => e.target === nodeId);
    const outgoing = graphData.edges.filter((e) => e.source === nodeId);
    return { incoming, outgoing };
  }, [selectedNodeData, graphData]);

  // ── Symbols defined inside selected file ──────────────────────
  const definedSymbols = useMemo(() => {
    if (!selectedNodeData || selectedNodeData.node_type !== 'file' || !graphData) return [];
    const filePath = selectedNodeData.path || selectedNodeData.file_path || '';
    if (!filePath) return [];
    return graphData.nodes.filter(
      (n) =>
        n.id !== selectedNodeData.id &&
        (n.data.file_path === filePath || n.data.path === filePath)
    );
  }, [selectedNodeData, graphData]);

  if (!activeRepo) return null;

  const viewModes: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'architecture', label: 'Architecture', icon: '🏛️' },
    { id: 'modules', label: 'Modules', icon: '📦' },
    { id: 'classes', label: 'Classes', icon: '🔷' },
    { id: 'functions', label: 'Functions', icon: '⚡' },
    { id: 'apis', label: 'APIs', icon: '🌐' },
    { id: 'all', label: 'All Entities', icon: '🔍' },
  ];

  return (
    <div className="graph-layout">
      {/* ── Top Toolbar ─────────────────────────────────────────── */}
      <div className="graph-toolbar">
        <div className="graph-toolbar-left">
          <span className="graph-toolbar-label">
            <Layers size={13} />
            View:
          </span>
          <div className="pill-group">
            {viewModes.map((vm) => (
              <button
                key={vm.id}
                className={`pill ${graphViewMode === vm.id ? 'active' : ''}`}
                onClick={() => setGraphViewMode(vm.id)}
                title={vm.label}
              >
                <span className="pill-icon">{vm.icon}</span>
                {vm.label}
              </button>
            ))}
          </div>
        </div>

        <div className="graph-toolbar-right">
          {/* Relationship filter */}
          <div className="graph-filter-group">
            <Filter size={12} />
            <select
              className="graph-select"
              value={relationshipFilter}
              onChange={(e) => setRelationshipFilter(e.target.value)}
              title="Filter by relationship type"
            >
              {RELATIONSHIP_FILTERS.map((rf) => (
                <option key={rf.id} value={rf.id}>
                  {rf.label}
                </option>
              ))}
            </select>
          </div>

          {/* Layout direction toggle */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() =>
              setLayoutDirection((d) => (d === 'LR' ? 'TB' : 'LR'))
            }
            title={`Direction: ${layoutDirection === 'LR' ? 'Left-to-Right (click for Top-to-Bottom)' : 'Top-to-Bottom (click for Left-to-Right)'}`}
          >
            <Sliders size={13} />
            <span style={{ fontSize: '0.66rem', fontWeight: 700, marginLeft: 2 }}>
              {layoutDirection}
            </span>
          </button>

          {/* Toggle groups */}
          <button
            className={`btn btn-ghost btn-icon ${showGroups ? 'active-toggle' : ''}`}
            onClick={() => setShowGroups(!showGroups)}
            title={showGroups ? 'Hide directory clusters' : 'Show directory clusters'}
          >
            {showGroups ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>

          {/* Toggle isolated nodes */}
          <button
            className={`btn btn-ghost btn-icon ${!showIsolated ? 'active-toggle' : ''}`}
            onClick={() => setShowIsolated(!showIsolated)}
            title={showIsolated ? 'Hide standalone / utility nodes' : 'Show standalone / utility nodes'}
          >
            <Focus size={13} />
          </button>

          {/* Search button */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => {
              setShowSearch(!showSearch);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            title="Search nodes (Ctrl+F)"
          >
            <Search size={13} />
          </button>

          {/* Legend toggle */}
          <button
            className={`btn btn-ghost btn-icon ${showLegend ? 'active-toggle' : ''}`}
            onClick={() => setShowLegend(!showLegend)}
            title="Toggle Graph Legend"
          >
            <Info size={13} />
          </button>

          {/* Stats */}
          <div className="graph-stats-bar">
            <div className="graph-stat">
              <span>Nodes:</span>
              <span className="graph-stat-value">
                {graphData?.stats.totalNodes ?? nodes.length}
              </span>
            </div>
            <div className="graph-stat">
              <span>Edges:</span>
              <span className="graph-stat-value">
                {graphData?.stats.totalEdges ?? edges.length}
              </span>
            </div>
            {(graphData?.stats.circularDependencyCount ?? 0) > 0 && (
              <div className="graph-stat" style={{ color: 'var(--color-error)' }}>
                <span>Cycles:</span>
                <span className="graph-stat-value">
                  {graphData?.stats.circularDependencyCount}
                </span>
              </div>
            )}
          </div>

          {/* Refresh */}
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => fetchGraph(activeRepo.id)}
            disabled={loadingGraph}
            title="Refresh graph"
          >
            <RefreshCw
              size={13}
              className={loadingGraph ? 'animate-spin' : ''}
            />
          </button>

          {/* Fit view */}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => fitView({ padding: 0.12, duration: 400 })}
            title="Fit to screen"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Search Bar ─────────────────────────────────────────── */}
      {showSearch && (
        <div className="graph-search-bar">
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={searchInputRef}
            type="text"
            className="graph-search-input"
            placeholder="Search nodes by name, path, or qualified name… (Esc to close)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchResults.length > 0 && (
            <span className="graph-search-count">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
          >
            <X size={13} />
          </button>

          {/* Search results dropdown */}
          {searchQuery && searchResults.length > 0 && (
            <div className="graph-search-results">
              {searchResults.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  className="graph-search-result-item"
                  onClick={() => focusOnNode(n.id)}
                >
                  <span className={`rf-node-type-dot ${n.data.node_type}`} />
                  <span className="search-result-label">{n.data.label}</span>
                  <span className="search-result-path">
                    {n.data.path || n.data.file_path || ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Legend Overlay ─────────────────────────────────────── */}
      {showLegend && (
        <div className="graph-legend-overlay">
          <div className="legend-section">
            <div className="legend-title">Entity Types</div>
            <div className="legend-items">
              <span className="legend-item"><span className="rf-node-type-dot file" /> File</span>
              <span className="legend-item"><span className="rf-node-type-dot class" /> Class</span>
              <span className="legend-item"><span className="rf-node-type-dot function" /> Function</span>
              <span className="legend-item"><span className="rf-node-type-dot method" /> Method</span>
              <span className="legend-item"><span className="rf-node-type-dot api_route" /> API Route</span>
              <span className="legend-item"><span className="legend-entry-symbol">⚡</span> Entry Point</span>
            </div>
          </div>
          <div className="legend-section">
            <div className="legend-title">Relationships</div>
            <div className="legend-items">
              <span className="legend-item"><span className="legend-line" style={{ background: '#3b82f6' }} /> Imports</span>
              <span className="legend-item"><span className="legend-line" style={{ background: '#22c55e' }} /> Calls</span>
              <span className="legend-item"><span className="legend-line" style={{ background: '#a855f7' }} /> Inherits</span>
              <span className="legend-item"><span className="legend-line" style={{ background: '#10b981' }} /> Invokes</span>
              <span className="legend-item"><span className="legend-line" style={{ background: '#f59e0b' }} /> Contains</span>
            </div>
          </div>
          <div className="legend-section">
            <div className="legend-title">Selection Focus</div>
            <div className="legend-items">
              <span className="legend-item"><span className="legend-dot" style={{ background: '#06b6d4' }} /> Upstream Dependency (depends on)</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: '#f59e0b' }} /> Downstream Dependent (used by)</span>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon legend-close-btn"
            onClick={() => setShowLegend(false)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Main Flow Canvas ───────────────────────────────────── */}
      <div className="graph-container">
        {loadingGraph && (
          <div className="graph-loading-overlay">
            <div className="spinner" />
            <span>Computing layout &amp; dependencies…</span>
          </div>
        )}

        {nodes.length === 0 && !loadingGraph ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Network size={32} />
            </div>
            <div className="empty-state-title">No Graph Nodes Extracted</div>
            <div className="empty-state-desc">
              Try switching the view mode or re-analyze the repository to generate
              call graphs, imports, and inheritance chains.
            </div>
          </div>
        ) : (
          <EdgeRoutingContext.Provider value={computedRoutes}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onEdgeMouseEnter={handleEdgeMouseEnter}
            onEdgeMouseLeave={handleEdgeMouseLeave}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.08}
            maxZoom={2.5}
            defaultEdgeOptions={{
              type: 'orthogonalRouting',
              style: { strokeWidth: 1.5 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="rgba(99, 130, 200, 0.12)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) => {
                const nodeData = n.data as unknown as GraphNodeData;
                if (nodeData?.isGroup) return 'transparent';
                const nodeType = nodeData?.node_type;
                switch (nodeType) {
                  case 'file':
                  case 'module':
                    return '#3b82f6';
                  case 'class':
                  case 'model':
                    return '#a855f7';
                  case 'function':
                  case 'method':
                    return '#22c55e';
                  case 'api_route':
                    return '#f59e0b';
                  default:
                    return '#6366f1';
                }
              }}
              maskColor="rgba(10, 14, 23, 0.75)"
              pannable
              zoomable
            />
          </ReactFlow>
          </EdgeRoutingContext.Provider>
        )}

        {/* ── Selected Edge Details Card ─────────────────────────── */}
        {selectedEdge && (
          <div className="edge-detail-card">
            <div className="edge-detail-header">
              <span className="edge-detail-title">Relationship Details</span>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setSelectedEdge(null)}
              >
                <X size={13} />
              </button>
            </div>
            <div className="edge-endpoints-row">
              <button
                className="edge-endpoint-btn"
                onClick={() => focusOnNode(selectedEdge.source)}
                title="Focus source node"
              >
                {selectedEdge.source.replace(/^(file:|sym:)/, '')}
              </button>
              <div className="edge-rel-badge">
                <ArrowRight size={12} />
                <span>
                  {String(
                    (selectedEdge.data as Record<string, unknown>)?.relationshipType ||
                    (typeof selectedEdge.label === 'string' ? selectedEdge.label : '') ||
                    'relates to'
                  )}
                </span>
              </div>
              <button
                className="edge-endpoint-btn"
                onClick={() => focusOnNode(selectedEdge.target)}
                title="Focus target node"
              >
                {selectedEdge.target.replace(/^(file:|sym:)/, '')}
              </button>
            </div>
            <div className="edge-meta-list">
              {Boolean((selectedEdge.data as Record<string, unknown>)?.confidence) && (
                <div className="edge-meta-item">
                  <span>Confidence:</span>
                  <span className="edge-meta-val">
                    {String((selectedEdge.data as Record<string, unknown>)?.confidence)}
                  </span>
                </div>
              )}
              {Boolean((selectedEdge.data as Record<string, unknown>)?.imported_name) && (
                <div className="edge-meta-item">
                  <span>Imported:</span>
                  <span className="edge-meta-val">
                    {String((selectedEdge.data as Record<string, unknown>)?.imported_name)}
                  </span>
                </div>
              )}
              {Boolean((selectedEdge.data as Record<string, unknown>)?.callee_name) && (
                <div className="edge-meta-item">
                  <span>Callee:</span>
                  <span className="edge-meta-val">
                    {String((selectedEdge.data as Record<string, unknown>)?.callee_name)}
                  </span>
                </div>
              )}
              {(selectedEdge.data as Record<string, unknown>)?.line_number != null && (
                <div className="edge-meta-item">
                  <span>Line:</span>
                  <span className="edge-meta-val">
                    {String((selectedEdge.data as Record<string, unknown>)?.line_number)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Selected Node Details Drawer ──────────────────────── */}
        {selectedNodeData && (
          <div className="node-detail-panel">
            <div className="node-detail-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`rf-node-type-dot ${selectedNodeData.node_type}`} />
                <span className="node-detail-title">{selectedNodeData.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => focusOnNode(selectedNodeData.id)}
                  title="Focus on this node"
                >
                  <Focus size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => {
                    setSelectedNodeData(null);
                    setFocusedNodeId(null);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Identity & Path */}
            <div className="node-detail-section">
              <div className="node-detail-section-title">Identity &amp; Path</div>
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
                        (selectedNodeData.complexity as number) > 10
                          ? 'var(--color-error)'
                          : 'var(--color-success)',
                    }}
                  >
                    {selectedNodeData.complexity}
                  </span>
                </div>
              )}
              {selectedNodeData.importance != null && (
                <div className="node-detail-item">
                  <span style={{ color: 'var(--text-muted)' }}>Importance:</span>
                  <span style={{ fontWeight: 600 }}>
                    {(selectedNodeData.importance as number).toFixed(1)}
                  </span>
                </div>
              )}
              {selectedNodeData.isEntryPoint && (
                <div className="node-detail-item">
                  <span style={{ color: 'var(--text-muted)' }}>Role:</span>
                  <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                    ⚡ Architectural Entry Point
                  </span>
                </div>
              )}
            </div>

            {/* Defined symbols if file node */}
            {definedSymbols.length > 0 && (
              <div className="node-detail-section">
                <div className="node-detail-section-title">
                  Defined Symbols ({definedSymbols.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {definedSymbols.slice(0, 8).map((sym) => (
                    <button
                      key={sym.id}
                      className="node-detail-item clickable"
                      onClick={() => focusOnNode(sym.id)}
                    >
                      <span className={`rf-node-type-dot ${sym.data.node_type}`} />
                      <span style={{ fontWeight: 600, fontSize: '0.72rem' }}>
                        {sym.data.label}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.62rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {sym.data.node_type}
                      </span>
                    </button>
                  ))}
                  {definedSymbols.length > 8 && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      +{definedSymbols.length - 8} more symbols
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Outgoing edges (what it depends on) */}
            <div className="node-detail-section">
              <div className="node-detail-section-title">
                Depends On / Outbound ({nodeRelationships.outgoing.length})
              </div>
              {nodeRelationships.outgoing.length === 0 ? (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  No outgoing relationships.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nodeRelationships.outgoing.slice(0, 10).map((e) => (
                    <button
                      key={e.id}
                      className="node-detail-item clickable"
                      onClick={() => focusOnNode(e.target)}
                    >
                      <ArrowRight
                        size={12}
                        style={{ color: '#06b6d4', flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {e.data?.relationshipType || e.label || 'relates to'}
                      </span>
                      <span
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.target.replace(/^(file:|sym:)/, '')}
                      </span>
                    </button>
                  ))}
                  {nodeRelationships.outgoing.length > 10 && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      +{nodeRelationships.outgoing.length - 10} more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Incoming edges (what depends on it) */}
            <div className="node-detail-section">
              <div className="node-detail-section-title">
                Depended Upon By / Inbound ({nodeRelationships.incoming.length})
              </div>
              {nodeRelationships.incoming.length === 0 ? (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  No inbound references.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {nodeRelationships.incoming.slice(0, 10).map((e) => (
                    <button
                      key={e.id}
                      className="node-detail-item clickable"
                      onClick={() => focusOnNode(e.source)}
                    >
                      <ArrowRight
                        size={12}
                        style={{
                          color: '#f59e0b',
                          transform: 'rotate(180deg)',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          color: 'var(--text-primary)',
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.source.replace(/^(file:|sym:)/, '')}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                          marginLeft: 'auto',
                        }}
                      >
                        {e.data?.relationshipType || e.label || 'relates to'}
                      </span>
                    </button>
                  ))}
                  {nodeRelationships.incoming.length > 10 && (
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                      +{nodeRelationships.incoming.length - 10} more
                    </div>
                  )}
                </div>
              )}
            </div>

            {(selectedNodeData.path || selectedNodeData.file_path) &&
              onOpenFileInExplorer && (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      const target =
                        selectedNodeData.path || selectedNodeData.file_path;
                      if (target) onOpenFileInExplorer(target);
                    }}
                  >
                    <FileCode size={14} />
                    <span>Open in Code Explorer</span>
                    <ExternalLink size={12} style={{ marginLeft: 4 }} />
                  </button>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wrapped export with ReactFlowProvider ───────────────────────

interface ArchitectureGraphProps {
  onOpenFileInExplorer?: (filePath: string) => void;
}

export function ArchitectureGraph({ onOpenFileInExplorer }: ArchitectureGraphProps) {
  return (
    <ReactFlowProvider>
      <ArchitectureGraphInner onOpenFileInExplorer={onOpenFileInExplorer} />
    </ReactFlowProvider>
  );
}
