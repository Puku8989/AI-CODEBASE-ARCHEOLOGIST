/**
 * edge-routing-engine.ts
 *
 * Professional Orthogonal Edge-Routing & Channel Allocation Engine.
 * Features:
 *  1. Multi-port dynamic handle distribution on source/target node borders
 *  2. Discrete lane allocation using interval coloring (no edge overlap)
 *  3. Symmetric parallel edge separation
 *  4. Dedicated self-loop routing
 *  5. Multi-track bypass corridors for backward edges (cycles/feedback)
 *  6. Crossing detection with SVG semi-circular jump-bridge arcs
 *  7. Rounded orthogonal corners (smooth 6-8px corner radii)
 *  8. Support for both LR (Left-to-Right) and TB (Top-to-Bottom) layouts
 *  9. Sub-millisecond memoized calculation; zero re-computation on zoom/pan
 */

import type { Node, Edge } from '@xyflow/react';
import type { GraphNodeData } from '@/types';
import { getNodeDimensions } from './graph-layout-engine';

export interface Point {
  x: number;
  y: number;
}

export interface NodeLayoutInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface ComputedEdgeRoute {
  id: string;
  source: string;
  target: string;
  path: string;
  labelPosition: Point;
  sourcePortOffset: number;
  targetPortOffset: number;
  sourcePoint: Point;
  targetPoint: Point;
  isSelfLoop: boolean;
  crossingsCount: number;
}

interface Segment {
  edgeId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHorizontal: boolean;
}

/**
 * Extract node bounding boxes and dimensions from React Flow nodes.
 */
export function extractNodeLayouts(nodes: Node[]): Map<string, NodeLayoutInfo> {
  const map = new Map<string, NodeLayoutInfo>();

  for (const node of nodes) {
    const nd = node.data as unknown as GraphNodeData;
    if (nd?.isGroup) continue; // Skip group boundary nodes

    const nodeType = nd?.node_type || (node.type !== 'custom' ? node.type : undefined) || 'default';
    const dims = getNodeDimensions(nodeType);

    const width = dims.width;
    const height = dims.height;
    const x = node.position.x;
    const y = node.position.y;

    map.set(node.id, {
      id: node.id,
      x,
      y,
      width,
      height,
      centerX: x + width / 2,
      centerY: y + height / 2,
    });
  }

  return map;
}

/**
 * Assign distinct connection ports along node borders for all edges.
 * Prevents multiple edges from stacking on the same exit or entry point.
 */
function assignConnectionPorts(
  edges: Edge[],
  nodeMap: Map<string, NodeLayoutInfo>,
  direction: 'LR' | 'TB',
): {
  sourcePortOffsets: Map<string, number>;
  targetPortOffsets: Map<string, number>;
} {
  const sourcePortOffsets = new Map<string, number>();
  const targetPortOffsets = new Map<string, number>();

  // Group outgoing and incoming edges by node
  const outgoingMap = new Map<string, Edge[]>();
  const incomingMap = new Map<string, Edge[]>();

  for (const edge of edges) {
    if (edge.source === edge.target) continue; // Self-loops handled separately

    if (!outgoingMap.has(edge.source)) outgoingMap.set(edge.source, []);
    outgoingMap.get(edge.source)!.push(edge);

    if (!incomingMap.has(edge.target)) incomingMap.set(edge.target, []);
    incomingMap.get(edge.target)!.push(edge);
  }

  // ── Source ports distribution ──────────────────────────────────
  for (const [sourceId, outEdges] of outgoingMap) {
    const node = nodeMap.get(sourceId);
    if (!node) continue;

    if (direction === 'LR') {
      // Sort outgoing edges by target's centerY to prevent crossing outside node
      outEdges.sort((a, b) => {
        const targetA = nodeMap.get(a.target);
        const targetB = nodeMap.get(b.target);
        const yA = targetA ? targetA.centerY : 0;
        const yB = targetB ? targetB.centerY : 0;
        if (yA !== yB) return yA - yB;
        return a.id.localeCompare(b.id);
      });

      const k = outEdges.length;
      if (k === 1) {
        sourcePortOffsets.set(outEdges[0].id, 0);
      } else {
        const span = Math.max(16, node.height - 24);
        const step = Math.min(12, span / (k - 1));
        const spread = (k - 1) * step;
        outEdges.forEach((edge, idx) => {
          const offset = -(spread / 2) + idx * step;
          sourcePortOffsets.set(edge.id, Math.round(offset));
        });
      }
    } else {
      // TB mode: sort outgoing edges by target's centerX
      outEdges.sort((a, b) => {
        const targetA = nodeMap.get(a.target);
        const targetB = nodeMap.get(b.target);
        const xA = targetA ? targetA.centerX : 0;
        const xB = targetB ? targetB.centerX : 0;
        if (xA !== xB) return xA - xB;
        return a.id.localeCompare(b.id);
      });

      const k = outEdges.length;
      if (k === 1) {
        sourcePortOffsets.set(outEdges[0].id, 0);
      } else {
        const span = Math.max(20, node.width - 28);
        const step = Math.min(14, span / (k - 1));
        const spread = (k - 1) * step;
        outEdges.forEach((edge, idx) => {
          const offset = -(spread / 2) + idx * step;
          sourcePortOffsets.set(edge.id, Math.round(offset));
        });
      }
    }
  }

  // ── Target ports distribution ──────────────────────────────────
  for (const [targetId, inEdges] of incomingMap) {
    const node = nodeMap.get(targetId);
    if (!node) continue;

    if (direction === 'LR') {
      // Sort incoming edges by source's centerY
      inEdges.sort((a, b) => {
        const sourceA = nodeMap.get(a.source);
        const sourceB = nodeMap.get(b.source);
        const yA = sourceA ? sourceA.centerY : 0;
        const yB = sourceB ? sourceB.centerY : 0;
        if (yA !== yB) return yA - yB;
        return a.id.localeCompare(b.id);
      });

      const m = inEdges.length;
      if (m === 1) {
        targetPortOffsets.set(inEdges[0].id, 0);
      } else {
        const span = Math.max(16, node.height - 24);
        const step = Math.min(12, span / (m - 1));
        const spread = (m - 1) * step;
        inEdges.forEach((edge, idx) => {
          const offset = -(spread / 2) + idx * step;
          targetPortOffsets.set(edge.id, Math.round(offset));
        });
      }
    } else {
      // TB mode: sort incoming edges by source's centerX
      inEdges.sort((a, b) => {
        const sourceA = nodeMap.get(a.source);
        const sourceB = nodeMap.get(b.source);
        const xA = sourceA ? sourceA.centerX : 0;
        const xB = sourceB ? sourceB.centerX : 0;
        if (xA !== xB) return xA - xB;
        return a.id.localeCompare(b.id);
      });

      const m = inEdges.length;
      if (m === 1) {
        targetPortOffsets.set(inEdges[0].id, 0);
      } else {
        const span = Math.max(20, node.width - 28);
        const step = Math.min(14, span / (m - 1));
        const spread = (m - 1) * step;
        inEdges.forEach((edge, idx) => {
          const offset = -(spread / 2) + idx * step;
          targetPortOffsets.set(edge.id, Math.round(offset));
        });
      }
    }
  }

  return { sourcePortOffsets, targetPortOffsets };
}

/**
 * Allocate intermediate routing lanes so parallel/competing edges
 * never share the same vertical or horizontal routing track.
 */
function allocateForwardLanes(
  forwardEdges: {
    edge: Edge;
    start: Point;
    end: Point;
  }[],
  direction: 'LR' | 'TB',
): Map<string, number> {
  const laneMap = new Map<string, number>();

  if (direction === 'LR') {
    // Sort forward edges from left to right, then by vertical midpoint
    const sorted = [...forwardEdges].sort((a, b) => {
      if (Math.abs(a.start.x - b.start.x) > 20) return a.start.x - b.start.x;
      const midYA = (a.start.y + a.end.y) / 2;
      const midYB = (b.start.y + b.end.y) / 2;
      return midYA - midYB;
    });

    // Track active edges in each lane to avoid vertical interval collisions
    interface ActiveLane {
      intervals: [number, number][]; // [minY, maxY]
    }
    const lanes: ActiveLane[] = [];

    for (const item of sorted) {
      const minY = Math.min(item.start.y, item.end.y) - 16;
      const maxY = Math.max(item.start.y, item.end.y) + 16;

      // Find first lane with no vertical overlap
      let assignedLane = -1;
      for (let l = 0; l < lanes.length; l++) {
        const lane = lanes[l];
        let hasConflict = false;
        for (const [sy, ey] of lane.intervals) {
          if (minY <= ey && maxY >= sy) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          assignedLane = l;
          lane.intervals.push([minY, maxY]);
          break;
        }
      }

      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push({ intervals: [[minY, maxY]] });
      }

      laneMap.set(item.edge.id, assignedLane);
    }
  } else {
    // TB mode: lanes are horizontal rows
    const sorted = [...forwardEdges].sort((a, b) => {
      if (Math.abs(a.start.y - b.start.y) > 20) return a.start.y - b.start.y;
      const midXA = (a.start.x + a.end.x) / 2;
      const midXB = (b.start.x + b.end.x) / 2;
      return midXA - midXB;
    });

    interface ActiveRow {
      intervals: [number, number][]; // [minX, maxX]
    }
    const rows: ActiveRow[] = [];

    for (const item of sorted) {
      const minX = Math.min(item.start.x, item.end.x) - 16;
      const maxX = Math.max(item.start.x, item.end.x) + 16;

      let assignedRow = -1;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        let hasConflict = false;
        for (const [sx, ex] of row.intervals) {
          if (minX <= ex && maxX >= sx) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          assignedRow = r;
          row.intervals.push([minX, maxX]);
          break;
        }
      }

      if (assignedRow === -1) {
        assignedRow = rows.length;
        rows.push({ intervals: [[minX, maxX]] });
      }

      laneMap.set(item.edge.id, assignedRow);
    }
  }

  return laneMap;
}

/**
 * Generate rounded orthogonal SVG path with crossing jump bridges.
 */
function buildPathWithJumpBridges(
  points: Point[],
  allVerticalSegments: Segment[],
  currentEdgeId: string,
  cornerRadius: number = 8,
  bridgeRadius: number = 4.5,
): { pathString: string; crossingsCount: number } {
  // Deduplicate consecutive identical or near-identical points
  const cleanPoints: Point[] = [];
  for (const pt of points) {
    if (cleanPoints.length === 0) {
      cleanPoints.push(pt);
    } else {
      const prev = cleanPoints[cleanPoints.length - 1];
      if (Math.abs(pt.x - prev.x) > 0.5 || Math.abs(pt.y - prev.y) > 0.5) {
        cleanPoints.push(pt);
      }
    }
  }

  if (cleanPoints.length < 2) return { pathString: '', crossingsCount: 0 };

  let d = `M ${cleanPoints[0].x} ${cleanPoints[0].y}`;
  let totalCrossings = 0;

  for (let i = 0; i < cleanPoints.length - 1; i++) {
    const p1 = cleanPoints[i];
    const p2 = cleanPoints[i + 1];
    const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;
    const isLastSegment = i === cleanPoints.length - 2;

    if (isHorizontal) {
      // Find all vertical segments from other edges that intersect this horizontal segment
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const y = p1.y;

      const crossings: number[] = [];

      for (const vSeg of allVerticalSegments) {
        if (vSeg.edgeId === currentEdgeId) continue; // Don't bridge self
        // Intersection condition with safety margin from endpoints
        if (
          vSeg.x1 > minX + 10 &&
          vSeg.x1 < maxX - 10 &&
          y > Math.min(vSeg.y1, vSeg.y2) + 6 &&
          y < Math.max(vSeg.y1, vSeg.y2) - 6
        ) {
          crossings.push(vSeg.x1);
        }
      }

      totalCrossings += crossings.length;

      // Sort crossings along direction of travel
      if (p1.x < p2.x) {
        crossings.sort((a, b) => a - b);
      } else {
        crossings.sort((a, b) => b - a);
      }

      // Filter crossings that are too close together to prevent overlapping arcs
      const cleanCrossings: number[] = [];
      for (const cx of crossings) {
        if (cleanCrossings.length === 0 || Math.abs(cx - cleanCrossings[cleanCrossings.length - 1]) >= bridgeRadius * 2.5) {
          cleanCrossings.push(cx);
        }
      }

      // Draw horizontal line with bridge arcs
      const goingRight = p1.x < p2.x;

      for (const cx of cleanCrossings) {
        const bridgeStart = goingRight ? cx - bridgeRadius : cx + bridgeRadius;
        const bridgeEnd = goingRight ? cx + bridgeRadius : cx - bridgeRadius;

        // Line to bridge start
        d += ` L ${bridgeStart} ${y}`;
        // Bridge semi-circle arc (sweep=1 for right, sweep=0 for left -> curves upward)
        const sweep = goingRight ? 1 : 0;
        d += ` A ${bridgeRadius} ${bridgeRadius} 0 0 ${sweep} ${bridgeEnd} ${y}`;
      }

      // If not last segment, stop clamped radius before p2 and curve into next segment
      if (!isLastSegment) {
        const nextP = cleanPoints[i + 2];
        const nextGoingDown = nextP.y > p2.y;
        const segLen = Math.abs(p1.x - p2.x);
        const nextSegLen = Math.abs(p2.y - nextP.y);
        const effectiveRadius = Math.min(cornerRadius, segLen / 2, nextSegLen / 2);

        if (effectiveRadius >= 1.5) {
          const cornerEndX = goingRight ? p2.x - effectiveRadius : p2.x + effectiveRadius;
          const cornerEndY = nextGoingDown ? p2.y + effectiveRadius : p2.y - effectiveRadius;
          d += ` L ${cornerEndX} ${y}`;
          d += ` Q ${p2.x} ${p2.y} ${p2.x} ${cornerEndY}`;
        } else {
          d += ` L ${p2.x} ${p2.y}`;
        }
      } else {
        d += ` L ${p2.x} ${p2.y}`;
      }
    } else {
      // Vertical segment
      const goingDown = p1.y < p2.y;

      if (!isLastSegment) {
        const nextP = cleanPoints[i + 2];
        const nextGoingRight = nextP.x > p2.x;
        const segLen = Math.abs(p1.y - p2.y);
        const nextSegLen = Math.abs(p2.x - nextP.x);
        const effectiveRadius = Math.min(cornerRadius, segLen / 2, nextSegLen / 2);

        if (effectiveRadius >= 1.5) {
          const cornerEndY = goingDown ? p2.y - effectiveRadius : p2.y + effectiveRadius;
          const cornerEndX = nextGoingRight ? p2.x + effectiveRadius : p2.x - effectiveRadius;
          d += ` L ${p1.x} ${cornerEndY}`;
          d += ` Q ${p2.x} ${p2.y} ${cornerEndX} ${p2.y}`;
        } else {
          d += ` L ${p2.x} ${p2.y}`;
        }
      } else {
        d += ` L ${p2.x} ${p2.y}`;
      }
    }
  }

  return { pathString: d, crossingsCount: totalCrossings };
}

/**
 * Main Entry Point: Compute high-readability orthogonal routes for all edges.
 */
export function computeGraphRoutes(
  nodes: Node[],
  edges: Edge[],
  direction: 'LR' | 'TB' = 'LR',
): Map<string, ComputedEdgeRoute> {
  const nodeMap = extractNodeLayouts(nodes);
  const routeMap = new Map<string, ComputedEdgeRoute>();

  if (nodes.length === 0 || edges.length === 0) {
    return routeMap;
  }

  // 1. Connection port assignment (unique entry/exit ports per node)
  const { sourcePortOffsets, targetPortOffsets } = assignConnectionPorts(edges, nodeMap, direction);

  // Separate self-loops, forward edges, and backward/bypass edges
  const selfLoops: Edge[] = [];
  const forwardEdges: { edge: Edge; start: Point; end: Point }[] = [];
  const backwardEdges: { edge: Edge; start: Point; end: Point }[] = [];

  // Determine graph bounds for bypass corridors
  let graphMinY = Infinity;
  let graphMaxY = -Infinity;
  let graphMinX = Infinity;
  let graphMaxX = -Infinity;

  for (const node of nodeMap.values()) {
    graphMinY = Math.min(graphMinY, node.y);
    graphMaxY = Math.max(graphMaxY, node.y + node.height);
    graphMinX = Math.min(graphMinX, node.x);
    graphMaxX = Math.max(graphMaxX, node.x + node.width);
  }

  for (const edge of edges) {
    if (edge.source === edge.target) {
      selfLoops.push(edge);
      continue;
    }

    const sNode = nodeMap.get(edge.source);
    const tNode = nodeMap.get(edge.target);
    if (!sNode || !tNode) continue;

    const sOffset = sourcePortOffsets.get(edge.id) || 0;
    const tOffset = targetPortOffsets.get(edge.id) || 0;

    let start: Point;
    let end: Point;

    if (direction === 'LR') {
      start = { x: sNode.x + sNode.width, y: sNode.centerY + sOffset };
      end = { x: tNode.x, y: tNode.centerY + tOffset };
      // Forward if target is sufficiently to the right
      if (end.x >= start.x + 35) {
        forwardEdges.push({ edge, start, end });
      } else {
        backwardEdges.push({ edge, start, end });
      }
    } else {
      start = { x: sNode.centerX + sOffset, y: sNode.y + sNode.height };
      end = { x: tNode.centerX + tOffset, y: tNode.y };
      // Forward if target is sufficiently below
      if (end.y >= start.y + 35) {
        forwardEdges.push({ edge, start, end });
      } else {
        backwardEdges.push({ edge, start, end });
      }
    }
  }

  // 2. Allocate intermediate lanes for forward edges
  const forwardLaneMap = allocateForwardLanes(forwardEdges, direction);

  // Group raw orthogonal waypoints before crossing computation
  const rawEdgeWaypoints = new Map<string, Point[]>();

  // ── Compute raw waypoints for forward edges ────────────────────
  for (const item of forwardEdges) {
    const { edge, start, end } = item;
    const laneIndex = forwardLaneMap.get(edge.id) || 0;

    if (direction === 'LR') {
      const minX = start.x + 22;
      const maxX = end.x - 26;
      const gap = Math.max(20, maxX - minX);
      const laneStep = Math.min(14, Math.max(8, gap / (laneIndex + 3)));
      const baseMidX = (start.x + end.x) / 2;

      // Stagger lane symmetrically or distribute evenly
      const laneOffset = (laneIndex % 2 === 0 ? 1 : -1) * Math.ceil(laneIndex / 2) * laneStep;
      let midX = Math.round(baseMidX + laneOffset);
      midX = Math.max(minX, Math.min(maxX, midX));

      // Check if straight line
      if (Math.abs(start.y - end.y) < 1.5 && Math.abs(midX - baseMidX) < 2) {
        rawEdgeWaypoints.set(edge.id, [start, end]);
      } else {
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: midX, y: start.y },
          { x: midX, y: end.y },
          end,
        ]);
      }
    } else {
      // TB mode
      const minY = start.y + 22;
      const maxY = end.y - 26;
      const gap = Math.max(20, maxY - minY);
      const laneStep = Math.min(14, Math.max(8, gap / (laneIndex + 3)));
      const baseMidY = (start.y + end.y) / 2;

      const laneOffset = (laneIndex % 2 === 0 ? 1 : -1) * Math.ceil(laneIndex / 2) * laneStep;
      let midY = Math.round(baseMidY + laneOffset);
      midY = Math.max(minY, Math.min(maxY, midY));

      if (Math.abs(start.x - end.x) < 1.5 && Math.abs(midY - baseMidY) < 2) {
        rawEdgeWaypoints.set(edge.id, [start, end]);
      } else {
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: start.x, y: midY },
          { x: end.x, y: midY },
          end,
        ]);
      }
    }
  }

  // ── Compute raw waypoints for backward/bypass edges ───────────
  backwardEdges.forEach((item, bIdx) => {
    const { edge, start, end } = item;
    const bypassTrackOffset = bIdx * 14;

    if (direction === 'LR') {
      const exitLane = start.x + 24 + (bIdx % 4) * 8;
      const approachLane = end.x - 26 - (bIdx % 4) * 8;
      const isUpper = (start.y + end.y) / 2 < (graphMinY + graphMaxY) / 2;

      if (isUpper) {
        // Route over top
        const topY = graphMinY - 32 - bypassTrackOffset;
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: exitLane, y: start.y },
          { x: exitLane, y: topY },
          { x: approachLane, y: topY },
          { x: approachLane, y: end.y },
          end,
        ]);
      } else {
        // Route under bottom
        const bottomY = graphMaxY + 32 + bypassTrackOffset;
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: exitLane, y: start.y },
          { x: exitLane, y: bottomY },
          { x: approachLane, y: bottomY },
          { x: approachLane, y: end.y },
          end,
        ]);
      }
    } else {
      // TB mode backward edge: bypass around left or right
      const exitLane = start.y + 24 + (bIdx % 4) * 8;
      const approachLane = end.y - 26 - (bIdx % 4) * 8;
      const isLeft = (start.x + end.x) / 2 < (graphMinX + graphMaxX) / 2;

      if (isLeft) {
        const leftX = graphMinX - 32 - bypassTrackOffset;
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: start.x, y: exitLane },
          { x: leftX, y: exitLane },
          { x: leftX, y: approachLane },
          { x: end.x, y: approachLane },
          end,
        ]);
      } else {
        const rightX = graphMaxX + 32 + bypassTrackOffset;
        rawEdgeWaypoints.set(edge.id, [
          start,
          { x: start.x, y: exitLane },
          { x: rightX, y: exitLane },
          { x: rightX, y: approachLane },
          { x: end.x, y: approachLane },
          end,
        ]);
      }
    }
  });

  // ── Compute dedicated self-loops ──────────────────────────────
  const selfLoopGroups = new Map<string, Edge[]>();
  for (const edge of selfLoops) {
    if (!selfLoopGroups.has(edge.source)) selfLoopGroups.set(edge.source, []);
    selfLoopGroups.get(edge.source)!.push(edge);
  }

  for (const [nodeId, loops] of selfLoopGroups) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    loops.forEach((edge, loopIdx) => {
      const loopOffset = loopIdx * 12;

      if (direction === 'LR') {
        const startPt = { x: node.x + node.width, y: node.y + 16 + loopIdx * 6 };
        const endPt = { x: node.x + node.width * 0.6 - loopIdx * 8, y: node.y };
        const rightX = node.x + node.width + 24 + loopOffset;
        const topY = node.y - 18 - loopOffset;

        const points = [
          startPt,
          { x: rightX, y: startPt.y },
          { x: rightX, y: topY },
          { x: endPt.x, y: topY },
          endPt,
        ];
        rawEdgeWaypoints.set(edge.id, points);
      } else {
        const startPt = { x: node.x + node.width - 16 - loopIdx * 6, y: node.y + node.height };
        const endPt = { x: node.x + node.width, y: node.y + node.height * 0.6 - loopIdx * 8 };
        const bottomY = node.y + node.height + 24 + loopOffset;
        const rightX = node.x + node.width + 22 + loopOffset;

        const points = [
          startPt,
          { x: startPt.x, y: bottomY },
          { x: rightX, y: bottomY },
          { x: rightX, y: endPt.y },
          endPt,
        ];
        rawEdgeWaypoints.set(edge.id, points);
      }
    });
  }

  // 3. Extract all vertical segments across all edges for crossing checks
  const allVerticalSegments: Segment[] = [];
  for (const [edgeId, points] of rawEdgeWaypoints) {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (Math.abs(p1.x - p2.x) < 0.5) {
        allVerticalSegments.push({
          edgeId,
          x1: p1.x,
          y1: Math.min(p1.y, p2.y),
          x2: p1.x,
          y2: Math.max(p1.y, p2.y),
          isHorizontal: false,
        });
      }
    }
  }

  // 4. Build final SVG paths with rounded corners and jump bridges
  for (const [edgeId, points] of rawEdgeWaypoints) {
    const { pathString, crossingsCount } = buildPathWithJumpBridges(
      points,
      allVerticalSegments,
      edgeId,
      8,   // Corner radius
      4.5, // Bridge radius
    );

    // Label position: placed cleanly on the approach segment before target
    let labelPos: Point;
    if (points.length >= 2) {
      const lastSegStart = points[points.length - 2];
      const lastSegEnd = points[points.length - 1];
      labelPos = {
        x: Math.round((lastSegStart.x + lastSegEnd.x) / 2),
        y: Math.round((lastSegStart.y + lastSegEnd.y) / 2 - 8),
      };
    } else {
      labelPos = points[0];
    }

    const edgeObj = edges.find((e) => e.id === edgeId)!;
    const isSelf = edgeObj.source === edgeObj.target;

    routeMap.set(edgeId, {
      id: edgeId,
      source: edgeObj.source,
      target: edgeObj.target,
      path: pathString,
      labelPosition: labelPos,
      sourcePortOffset: sourcePortOffsets.get(edgeId) || 0,
      targetPortOffset: targetPortOffsets.get(edgeId) || 0,
      sourcePoint: points[0],
      targetPoint: points[points.length - 1],
      isSelfLoop: isSelf,
      crossingsCount,
    });
  }

  return routeMap;
}
