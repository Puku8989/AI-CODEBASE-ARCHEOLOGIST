import { useAppStore } from '@/store/useAppStore';
import { Layers, Plus, RefreshCw } from 'lucide-react';

interface HeaderProps {
  onOpenIngest: () => void;
}

export function Header({ onOpenIngest }: HeaderProps) {
  const serverOnline = useAppStore((s) => s.serverOnline);
  const checkHealth = useAppStore((s) => s.checkHealth);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const reanalyze = useAppStore((s) => s.reanalyze);
  const analysisPolling = useAppStore((s) => s.analysisPolling);

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-logo">
          <Layers size={18} />
        </div>
        <div>
          <h1 className="header-title">AI Codebase Archaeologist</h1>
          <span className="header-subtitle">AST-Driven Architectural Intelligence</span>
        </div>
      </div>

      <div className="header-actions">
        <div
          className={`status-badge ${serverOnline ? '' : 'offline'}`}
          title={serverOnline ? 'Backend API connected' : 'Backend API offline'}
          onClick={() => checkHealth()}
          style={{ cursor: 'pointer' }}
        >
          <span className="status-dot" />
          <span>{serverOnline ? 'API Connected' : 'API Offline'}</span>
        </div>

        {activeRepoId && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reanalyze(activeRepoId)}
            disabled={analysisPolling}
            title="Re-run AST extraction & analysis"
          >
            <RefreshCw size={13} className={analysisPolling ? 'animate-spin' : ''} />
            <span>Re-analyze</span>
          </button>
        )}

        <button className="btn btn-primary btn-sm" onClick={onOpenIngest}>
          <Plus size={14} />
          <span>Ingest Codebase</span>
        </button>
      </div>
    </header>
  );
}
