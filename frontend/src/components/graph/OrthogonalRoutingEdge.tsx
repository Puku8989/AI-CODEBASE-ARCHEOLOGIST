/**
 * OrthogonalRoutingEdge.tsx
 *
 * Custom React Flow edge that renders high-readability orthogonal paths
 * with dynamic multi-port endpoints, channel-allocated lanes, and jump-bridge crossings.
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { ComputedEdgeRoute } from './edge-routing-engine';
import { useEdgeRoute } from './EdgeRoutingContext';

export const OrthogonalRoutingEdge = memo(function OrthogonalRoutingEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected,
  data,
}: EdgeProps) {
  const contextRoute = useEdgeRoute(id);
  const route = contextRoute || ((data as Record<string, unknown>)?.route as ComputedEdgeRoute | undefined);

  let edgePath = '';
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;

  if (route && route.path) {
    edgePath = route.path;
    labelX = route.labelPosition.x;
    labelY = route.labelPosition.y;
  } else {
    // Graceful fallback to smoothstep if route is not yet computed
    const [fallbackPath, fallbackLabelX, fallbackLabelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    });
    edgePath = fallbackPath;
    labelX = fallbackLabelX;
    labelY = fallbackLabelY;
  }

  // Enhanced styling for active/selected edges
  const edgeStyle = {
    ...style,
    strokeWidth: selected ? 2.5 : (style.strokeWidth || 1.5),
    filter: selected ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.6))' : undefined,
  };

  return (
    <>
      {/* Background interaction path with generous hover/click target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        className="react-flow__edge-interaction"
      />

      {/* Contrast halo behind edge to make overlapping/crossing paths distinctly clear */}
      <path
        d={edgePath}
        fill="none"
        stroke="#0b0f19"
        strokeWidth={(Number(edgeStyle.strokeWidth) || 1.5) + 3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'none', opacity: 0.95 }}
        className="rf-edge-halo"
      />

      {/* Main visual edge path with jump bridges and orthogonal routing */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={markerEnd}
      />

      {/* Edge label badge rendered cleanly on its dedicated approach lane */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: selected ? 20 : 5,
            }}
            className={`rf-edge-label-badge ${selected ? 'selected' : ''}`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
