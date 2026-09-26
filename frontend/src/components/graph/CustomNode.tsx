import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { GraphNodeData } from '@/types';

interface CustomNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

/** Human-readable type labels */
const TYPE_LABELS: Record<string, string> = {
  file: 'File',
  module: 'Module',
  class: 'Class',
  function: 'Function',
  method: 'Method',
  api_route: 'API',
  model: 'Model',
  variable: 'Var',
};

/** Icons for node types (lightweight SVG paths) */
const TYPE_ICONS: Record<string, string> = {
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  module: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  class: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  function: 'M18 10h-4V4a2 2 0 0 0-4 0v6H6l6 8 6-8z',
  method: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
  api_route: 'M22 12h-4l-3 9L9 3l-3 9H2',
  model: 'M12 2L2 7v10l10 5 10-5V7L12 2z',
  variable: 'M12 2v20M2 12h20',
};

export const CustomNode = memo(function CustomNode({ data, selected }: CustomNodeProps) {
  const nodeType = data.node_type || 'file';
  const label = data.label || 'Unknown';
  const subtitle = data.path || data.qualified_name || (data.line_count ? `${data.line_count} lines` : '');
  const isEntry = data.isEntryPoint;
  const isIsolated = data.isIsolated;
  const isUpstream = data.isUpstream;
  const isDownstream = data.isDownstream;
  const importance = (data.importance as number) || 0;
  const layoutDirection = (data.layoutDirection as 'LR' | 'TB') || 'LR';

  // Visual emphasis for high-importance nodes
  const isHighImportance = importance >= 6;

  // Direction-aware handle positions: TB mode flows top-to-bottom, LR mode flows left-to-right
  const isTB = layoutDirection === 'TB';
  const targetPosition = isTB ? Position.Top : Position.Left;
  const sourcePosition = isTB ? Position.Bottom : Position.Right;

  const sourcePorts = (data.sourcePorts as number[]) || [];
  const targetPorts = (data.targetPorts as number[]) || [];

  return (
    <div
      className={[
        'rf-custom-node',
        selected ? 'selected' : '',
        isEntry ? 'entry-point' : '',
        isIsolated ? 'isolated' : '',
        isHighImportance ? 'high-importance' : '',
        isUpstream ? 'upstream-dep' : '',
        isDownstream ? 'downstream-dependent' : '',
        `type-${nodeType}`,
      ].filter(Boolean).join(' ')}
    >
      <Handle
        type="target"
        position={targetPosition}
        className={`rf-handle rf-handle-target handle-${layoutDirection.toLowerCase()}`}
        style={targetPorts.length > 1 ? { opacity: 0 } : undefined}
      />

      {/* Dynamic multi-port terminals for incoming connections */}
      {targetPorts.length > 1 &&
        targetPorts.map((offset, i) => (
          <span
            key={`target-port-${i}`}
            className={`rf-port-terminal target ${isTB ? 'tb' : 'lr'}`}
            style={
              isTB
                ? { left: `calc(50% + ${offset}px)`, top: 0 }
                : { top: `calc(50% + ${offset}px)`, left: 0 }
            }
          />
        ))}

      <div className="rf-node-header">
        <span className={`rf-node-type-badge ${nodeType}`}>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="rf-node-icon"
            style={{ marginRight: 4, flexShrink: 0 }}
          >
            <path d={TYPE_ICONS[nodeType] || TYPE_ICONS.file} />
          </svg>
          {TYPE_LABELS[nodeType] || nodeType}
        </span>
        {isEntry && (
          <span className="rf-entry-badge" title="Architectural Entry Point">
            ⚡ Entry
          </span>
        )}
        {isUpstream && (
          <span className="rf-dep-badge upstream" title="Direct Upstream Dependency (what selected node depends on)">
            ↑ Dep
          </span>
        )}
        {isDownstream && (
          <span className="rf-dep-badge downstream" title="Direct Downstream Dependent (what depends on selected node)">
            ↓ Used By
          </span>
        )}
      </div>

      <div className="rf-node-label-row">
        <span className="rf-node-label" title={label}>
          {label}
        </span>
      </div>

      {subtitle && (
        <div className="rf-node-sub" title={subtitle}>
          {subtitle}
        </div>
      )}

      {/* Metadata badges */}
      <div className="rf-node-badges">
        {data.complexity != null && data.complexity > 0 && (
          <span
            className={`rf-badge ${(data.complexity as number) > 10 ? 'danger' : 'info'}`}
            title={`Cyclomatic complexity: ${data.complexity}`}
          >
            CC:{data.complexity}
          </span>
        )}
        {data.is_async && (
          <span className="rf-badge warning" title="Async function">
            async
          </span>
        )}
        {data.line_count != null && (data.line_count as number) > 0 && (
          <span className="rf-badge muted" title={`${data.line_count} lines`}>
            {data.line_count}L
          </span>
        )}
      </div>

      {/* Dynamic multi-port terminals for outgoing connections */}
      {sourcePorts.length > 1 &&
        sourcePorts.map((offset, i) => (
          <span
            key={`source-port-${i}`}
            className={`rf-port-terminal source ${isTB ? 'tb' : 'lr'}`}
            style={
              isTB
                ? { left: `calc(50% + ${offset}px)`, top: '100%' }
                : { top: `calc(50% + ${offset}px)`, left: '100%' }
            }
          />
        ))}

      <Handle
        type="source"
        position={sourcePosition}
        className={`rf-handle rf-handle-source handle-${layoutDirection.toLowerCase()}`}
        style={sourcePorts.length > 1 ? { opacity: 0 } : undefined}
      />
    </div>
  );
});

/**
 * Group node — rendered as a semi-transparent container
 * behind clustered file nodes.
 */
export const GroupNode = memo(function GroupNode({ data }: { data: GraphNodeData }) {
  const label = data.label || '';

  return (
    <div className="rf-group-node">
      <div className="rf-group-label">{label}</div>
    </div>
  );
});
