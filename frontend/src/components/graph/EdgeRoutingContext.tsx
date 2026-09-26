/**
 * EdgeRoutingContext.tsx
 *
 * React context providing memoized edge routes to OrthogonalRoutingEdge components.
 * Ensures zero re-computation on canvas zoom and pan, and updates dynamically
 * when nodes are dragged or filtered.
 */

import { createContext, useContext } from 'react';
import type { ComputedEdgeRoute } from './edge-routing-engine';

export const EdgeRoutingContext = createContext<Map<string, ComputedEdgeRoute>>(new Map());

export function useEdgeRoute(edgeId: string): ComputedEdgeRoute | undefined {
  const routes = useContext(EdgeRoutingContext);
  return routes.get(edgeId);
}
