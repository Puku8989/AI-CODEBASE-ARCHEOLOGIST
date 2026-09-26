import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { GraphNodeData } from '@/types';

interface CustomNodeProps {
  data: GraphNodeData;
  selected?: boolean;
}

export const CustomNode = memo(function CustomNode({ data, selected }: CustomNodeProps) {
  const nodeType = data.node_type || 'file';
  const label = data.label || 'Unknown';
  const subtitle = data.path || data.qualified_name || (data.line_count ? `${data.line_count} lines` : '');

  return (
    <div className={`rf-custom-node ${selected ? 'selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: 'var(--accent-primary)',
          width: 7,
          height: 7,
          border: '1.5px solid var(--bg-primary)',
        }}
      />

      <div className="rf-node-header">
        <span className={`rf-node-type-dot ${nodeType}`} />
        <span className="rf-node-label" title={label}>
          {label}
        </span>
      </div>

      {subtitle && (
        <div className="rf-node-sub" title={subtitle}>
          {subtitle}
        </div>
      )}

      {data.complexity != null && (
        <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.6rem',
              padding: '1px 4px',
              borderRadius: 3,
              background: data.complexity > 10 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.15)',
              color: data.complexity > 10 ? 'var(--color-error)' : 'var(--accent-secondary)',
              fontWeight: 600,
            }}
          >
            CC: {data.complexity}
          </span>
          {data.is_async && (
            <span
              style={{
                fontSize: '0.6rem',
                padding: '1px 4px',
                borderRadius: 3,
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--color-warning)',
                fontWeight: 600,
              }}
            >
              async
            </span>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: 'var(--accent-secondary)',
          width: 7,
          height: 7,
          border: '1.5px solid var(--bg-primary)',
        }}
      />
    </div>
  );
});
