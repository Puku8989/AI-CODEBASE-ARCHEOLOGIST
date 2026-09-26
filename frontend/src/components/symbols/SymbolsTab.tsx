import { useAppStore } from '@/store/useAppStore';
import { Binary, Code2, ArrowUpRight, Cpu } from 'lucide-react';

interface SymbolsTabProps {
  onOpenFileInExplorer?: (filePath: string) => void;
}

export function SymbolsTab({ onOpenFileInExplorer }: SymbolsTabProps) {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const symbols = useAppStore((s) => s.symbols);
  const loadingSymbols = useAppStore((s) => s.loadingSymbols);
  const symbolFilter = useAppStore((s) => s.symbolFilter);
  const setSymbolFilter = useAppStore((s) => s.setSymbolFilter);
  const symbolTypeFilter = useAppStore((s) => s.symbolTypeFilter);
  const setSymbolTypeFilter = useAppStore((s) => s.setSymbolTypeFilter);

  if (!activeRepo) return null;

  const typeOptions = [
    { id: 'all', label: 'All Symbols' },
    { id: 'function', label: 'Functions' },
    { id: 'method', label: 'Methods' },
    { id: 'class', label: 'Classes' },
    { id: 'api_route', label: 'API Routes' },
    { id: 'model', label: 'Data Models' },
    { id: 'variable', label: 'Variables' },
  ];

  return (
    <div className="symbols-layout">
      {/* Search & Filter Bar */}
      <div className="filter-bar">
        <div className="pill-group">
          {typeOptions.map((opt) => (
            <button
              key={opt.id}
              className={`pill ${symbolTypeFilter === opt.id ? 'active' : ''}`}
              onClick={() => setSymbolTypeFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <input
            className="search-input"
            placeholder="Search symbols by name or signature…"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of Symbol Cards */}
      {loadingSymbols ? (
        <div className="loading-overlay" style={{ height: 200 }}>
          <div className="spinner" />
          <span>Searching symbol index…</span>
        </div>
      ) : symbols.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Binary size={32} />
          </div>
          <div className="empty-state-title">No Matching Symbols Found</div>
          <div className="empty-state-desc">
            Try adjusting your type filter or search keywords to locate defined functions, classes, and routes.
          </div>
        </div>
      ) : (
        <div className="symbols-grid">
          {symbols.map((sym) => {
            return (
              <div
                key={sym.id}
                className="symbol-card"
                onClick={() => {
                  if (sym.file_path && onOpenFileInExplorer) {
                    onOpenFileInExplorer(sym.file_path);
                  }
                }}
              >
                <div className="symbol-card-header">
                  <span className={`symbol-type-badge ${sym.symbol_type}`}>
                    {sym.symbol_type}
                  </span>
                  <span className="symbol-name">{sym.name}</span>
                </div>

                <div className="symbol-qname" title={sym.qualified_name}>
                  {sym.qualified_name}
                </div>

                {sym.signature && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--accent-secondary)',
                      background: 'var(--bg-elevated)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 8,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={sym.signature}
                  >
                    {sym.signature}
                  </div>
                )}

                {sym.docstring && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      marginBottom: 8,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {sym.docstring}
                  </div>
                )}

                <div className="symbol-meta">
                  <div className="symbol-meta-item" title={sym.file_path || ''}>
                    <Code2 size={12} />
                    <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sym.file_path?.split('/').pop() || sym.file_path}
                    </span>
                    <span>:L{sym.start_line}</span>
                  </div>

                  {sym.cyclomatic_complexity != null && (
                    <div className="symbol-meta-item">
                      <Cpu size={12} />
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            sym.cyclomatic_complexity > 10
                              ? 'var(--color-error)'
                              : 'var(--color-success)',
                        }}
                      >
                        CC {sym.cyclomatic_complexity}
                      </span>
                    </div>
                  )}

                  <div className="symbol-meta-item" style={{ marginLeft: 'auto', color: 'var(--accent-primary)' }}>
                    <span>Inspect</span>
                    <ArrowUpRight size={12} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
