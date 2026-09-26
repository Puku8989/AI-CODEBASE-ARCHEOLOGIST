import { useAppStore } from '@/store/useAppStore';
import { GitBranch, GitCommit, Folder, RefreshCw, Trash2, Loader2 } from 'lucide-react';

export function RepoBanner() {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const reanalyze = useAppStore((s) => s.reanalyze);
  const deleteRepository = useAppStore((s) => s.deleteRepository);
  const analysisPolling = useAppStore((s) => s.analysisPolling);

  if (!activeRepo) return null;

  const analysis = activeRepo.latest_analysis;
  const isAnalyzing = analysis && ['QUEUED', 'IN_PROGRESS'].includes(analysis.status);

  return (
    <>
      <div className="repo-banner">
        <div className="repo-banner-left">
          <div className="repo-banner-icon">
            <Folder size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="repo-banner-name">{activeRepo.name}</h2>
              {isAnalyzing && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    background: 'var(--color-warning-bg)',
                    color: 'var(--color-warning)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 600,
                  }}
                >
                  {analysis?.current_step || 'Analyzing...'}
                </span>
              )}
            </div>
            <div className="repo-banner-path" title={activeRepo.local_path}>
              {activeRepo.local_path}
            </div>
          </div>
        </div>

        <div className="repo-banner-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <GitBranch size={13} />
              {activeRepo.default_branch || 'main'}
            </span>
            {activeRepo.commit_hash && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <GitCommit size={13} />
                {activeRepo.commit_hash.slice(0, 7)}
              </span>
            )}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reanalyze(activeRepo.id)}
            disabled={isAnalyzing || analysisPolling}
            title="Re-run analysis"
          >
            <RefreshCw size={13} className={isAnalyzing ? 'animate-spin' : ''} />
            <span>Re-analyze</span>
          </button>

          <button
            className="btn btn-danger btn-sm btn-icon"
            onClick={() => {
              if (window.confirm(`Delete repository "${activeRepo.name}"?`)) {
                deleteRepository(activeRepo.id);
              }
            }}
            title="Delete repository"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isAnalyzing && (
        <div className="progress-container">
          <div className="progress-info">
            <Loader2 size={13} />
            <span>
              {analysis?.current_step || 'Scanning & building graph…'} ({analysis?.progress_pct ?? 0}%)
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.max(5, analysis?.progress_pct ?? 10)}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
