/**
 * graph-layout-engine.ts
 *
 * Deterministic hierarchical DAG layout using Dagre.
 * Handles: node sizing, directory clustering (compound graph), isolated nodes,
 * entry-point ranking, and direction-aware handle positioning.
 */

import Dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { GraphNodeData } from '@/types';

// ── Layout configuration ────────────────────────────────────────
export interface LayoutConfig {
  /** Direction: LR = left-to-right, TB = top-to-bottom */
  direction: 'LR' | 'TB';
  /** Horizontal/inter-node gap between nodes in same rank */
  nodeSep: number;
  /** Vertical gap between ranks/layers */
  rankSep: number;
  /** Padding inside group clusters */
  clusterPadding: number;
  /** Node width for layout calculation */
  nodeWidth: number;
  /** Node height for layout calculation */
  nodeHeight: number;
  /** Enable directory clustering */
  enableClustering: boolean;
}

const DEFAULT_CONFIG: LayoutConfig = {
  direction: 'LR',
  nodeSep: 80,
  rankSep: 160,
  clusterPadding: 32,
  nodeWidth: 200,
  nodeHeight: 60,
  enableClustering: true,
};

// ── Node dimension estimates by type ────────────────────────────
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  file:      { width: 210, height: 60 },
  module:    { width: 210, height: 60 },
  class:     { width: 220, height: 68 },
  function:  { width: 200, height: 60 },
  method:    { width: 200, height: 60 },
  api_route: { width: 230, height: 68 },
  model:     { width: 210, height: 64 },
  variable:  { width: 180, height: 52 },
  default:   { width: 200, height: 60 },
};

export function getNodeDimensions(nodeType: string): { width: number; height: number } {
  return NODE_DIMENSIONS[nodeType] || NODE_DIMENSIONS.default;
}

// ── Main layout function ────────────────────────────────────────

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  groupNodes: Node[];
  isolatedNodes: Node[];
  groups: Map<string, Node[]>;
}

export function computeHierarchicalLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
  entryPoints: string[],
  directoryGroups: Record<string, string[]>,
  config: Partial<LayoutConfig> = {},
): LayoutResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // ── Separate connected vs isolated nodes ──────────────────
  const connectedNodeIds = new Set<string>();
  for (const edge of rawEdges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  const connectedNodes: Node[] = [];
  const isolatedNodes: Node[] = [];

  for (const node of rawNodes) {
    if (connectedNodeIds.has(node.id)) {
      connectedNodes.push(node);
    } else {
      isolatedNodes.push(node);
    }
  }

  // ── Build Dagre graph with compound support ───────────────
  const g = new Dagre.graphlib.Graph({ multigraph: false, compound: true });
  g.setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: cfg.direction,
    nodesep: cfg.nodeSep,
    ranksep: cfg.rankSep,
    marginx: 50,
    marginy: 50,
    acyclicer: 'greedy',      // Cycle handling
    ranker: 'network-simplex', // Deterministic layering
  });

  // Add nodes with estimated dimensions
  const nodeSet = new Set<string>();
  for (const node of connectedNodes) {
    const nodeData = node.data as unknown as GraphNodeData;
    const nodeType = nodeData?.node_type || node.type || 'default';
    const dims = getNodeDimensions(nodeType);

    // Adjust width based on label length
    const label = nodeData?.label || '';
    const estimatedLabelWidth = Math.min(label.length * 7.5 + 48, 320);
    const width = Math.max(dims.width, Math.round(estimatedLabelWidth));

    g.setNode(node.id, {
      width,
      height: dims.height,
      label: label,
    });
    nodeSet.add(node.id);
  }

  // Add directory clusters if clustering is enabled
  const validClusterDirs = new Set<string>();
  if (cfg.enableClustering && directoryGroups) {
    for (const [dir, nodeIds] of Object.entries(directoryGroups)) {
      if (dir === '(root)') continue;
      const memberIds = nodeIds.filter((id) => nodeSet.has(id));
      if (memberIds.length >= 2) {
        const clusterId = `group:${dir}`;
        g.setNode(clusterId, { label: dir, clusterNode: true });
        validClusterDirs.add(dir);
        for (const mId of memberIds) {
          g.setParent(mId, clusterId);
        }
      }
    }
  }

  // Add edges (only if both endpoints exist)
  for (const edge of rawEdges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      if (edge.source !== edge.target) {
        g.setEdge(edge.source, edge.target);
      }
    }
  }

  // ── Run layout ────────────────────────────────────────────
  try {
    Dagre.layout(g);
  } catch (err) {
    console.warn('Dagre layout error, falling back to simple layout:', err);
  }

  // ── Apply computed positions to nodes ─────────────────────
  const entryPointSet = new Set(entryPoints);
  const positionedNodes: Node[] = [];

  for (const node of connectedNodes) {
    const layoutNode = g.node(node.id);
    if (!layoutNode) continue;

    const nodeData = node.data as unknown as GraphNodeData;
    const isEntry = entryPointSet.has(node.id);
    const width = layoutNode.width || 200;
    const height = layoutNode.height || 60;

    positionedNodes.push({
      ...node,
      position: {
        x: Math.round(layoutNode.x - width / 2),
        y: Math.round(layoutNode.y - height / 2),
      },
      data: {
        ...node.data,
        isEntryPoint: isEntry,
        importance: nodeData?.importance ?? 0,
        layoutDirection: cfg.direction,
      },
    });
  }

  // ── Extract directory group container nodes ───────────────
  const groupNodes: Node[] = [];
  const groups = new Map<string, Node[]>();

  for (const dir of validClusterDirs) {
    const clusterId = `group:${dir}`;
    const layoutCluster = g.node(clusterId);
    const memberNodes = positionedNodes.filter((n) =>
      directoryGroups[dir]?.includes(n.id)
    );

    if (memberNodes.length > 0) {
      groups.set(dir, memberNodes);
    }

    if (layoutCluster && layoutCluster.width && layoutCluster.height) {
      groupNodes.push({
        id: clusterId,
        type: 'group',
        position: {
          x: Math.round(layoutCluster.x - layoutCluster.width / 2),
          y: Math.round(layoutCluster.y - layoutCluster.height / 2),
        },
        data: {
          label: dir,
          isGroup: true,
        },
        style: {
          width: Math.round(layoutCluster.width),
          height: Math.round(layoutCluster.height),
          background: 'rgba(99, 102, 241, 0.035)',
          border: '1px dashed rgba(99, 130, 200, 0.22)',
          borderRadius: '12px',
          zIndex: -1,
          pointerEvents: 'none',
        },
        selectable: false,
        draggable: false,
      } as unknown as Node);
    } else if (memberNodes.length >= 2) {
      // Fallback bounding box calculation
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const m of memberNodes) {
        minX = Math.min(minX, m.position.x);
        minY = Math.min(minY, m.position.y);
        maxX = Math.max(maxX, m.position.x + 220);
        maxY = Math.max(maxY, m.position.y + 60);
      }
      groupNodes.push({
        id: clusterId,
        type: 'group',
        position: { x: minX - 24, y: minY - 32 },
        data: { label: dir, isGroup: true },
        style: {
          width: maxX - minX + 48,
          height: maxY - minY + 48,
          background: 'rgba(99, 102, 241, 0.035)',
          border: '1px dashed rgba(99, 130, 200, 0.22)',
          borderRadius: '12px',
          zIndex: -1,
          pointerEvents: 'none',
        },
        selectable: false,
        draggable: false,
      } as unknown as Node);
    }
  }

  // ── Position isolated nodes in a dedicated island ─────────
  const positionedIsolated: Node[] = [];
  if (isolatedNodes.length > 0) {
    let maxY = 0;
    let minX = Infinity;
    let maxX = 0;

    for (const node of positionedNodes) {
      const y = node.position.y + 60;
      if (y > maxY) maxY = y;
      if (node.position.x < minX) minX = node.position.x;
      if (node.position.x > maxX) maxX = node.position.x;
    }

    if (positionedNodes.length === 0) {
      maxY = 40;
      minX = 40;
      maxX = 400;
    }

    const startY = maxY + 140; // Gap below main graph
    const cols = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(isolatedNodes.length))));
    const colWidth = 240;
    const rowHeight = 84;
    const startX = minX !== Infinity ? Math.max(40, minX) : 40;

    isolatedNodes.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      positionedIsolated.push({
        ...node,
        position: {
          x: startX + col * colWidth,
          y: startY + row * rowHeight,
        },
        data: {
          ...node.data,
          isIsolated: true,
          layoutDirection: cfg.direction,
        },
      });
    });

    // Add a container box for the isolated components island
    let isoMinX = Infinity, isoMinY = Infinity, isoMaxX = -Infinity, isoMaxY = -Infinity;
    for (const iso of positionedIsolated) {
      isoMinX = Math.min(isoMinX, iso.position.x);
      isoMinY = Math.min(isoMinY, iso.position.y);
      isoMaxX = Math.max(isoMaxX, iso.position.x + 220);
      isoMaxY = Math.max(isoMaxY, iso.position.y + 64);
    }

    groupNodes.push({
      id: 'group:isolated_components',
      type: 'group',
      position: { x: isoMinX - 20, y: isoMinY - 36 },
      data: {
        label: `Standalone / Utility Nodes (${isolatedNodes.length})`,
        isGroup: true,
      },
      style: {
        width: isoMaxX - isoMinX + 40,
        height: isoMaxY - isoMinY + 54,
        background: 'rgba(100, 116, 139, 0.03)',
        border: '1px dashed rgba(100, 116, 139, 0.25)',
        borderRadius: '12px',
        zIndex: -1,
        pointerEvents: 'none',
      },
      selectable: false,
      draggable: false,
    } as unknown as Node);
  }

  return {
    nodes: [...positionedNodes, ...positionedIsolated],
    edges: rawEdges,
    groupNodes,
    isolatedNodes: positionedIsolated,
    groups,
  };
}

/**
 * Fallback / manual group boundary computation.
 */
export function computeGroupBoundaries(
  groups: Map<string, Node[]>,
  padding: number = 30,
): Node[] {
  const groupNodes: Node[] = [];

  for (const [dir, nodes] of groups) {
    if (nodes.length < 2 || dir === '(root)') continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      const nd = node.data as unknown as GraphNodeData;
      const dims = getNodeDimensions(nd?.node_type || 'default');

      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + dims.width);
      maxY = Math.max(maxY, node.position.y + dims.height);
    }

    groupNodes.push({
      id: `group:${dir}`,
      type: 'group',
      position: {
        x: minX - padding,
        y: minY - padding - 24,
      },
      data: {
        label: dir,
        isGroup: true,
      },
      style: {
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2 + 24,
        background: 'rgba(99, 102, 241, 0.035)',
        border: '1px dashed rgba(99, 130, 200, 0.20)',
        borderRadius: '12px',
        zIndex: -1,
        pointerEvents: 'none',
      },
      selectable: false,
      draggable: false,
    } as unknown as Node);
  }

  return groupNodes;
}
