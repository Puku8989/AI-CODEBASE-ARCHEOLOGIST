import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { FolderGit2, Trash2, Search, Database } from 'lucide-react';

interface SidebarProps {
  onOpenIngest: () => void;
}

export function Sidebar({ onOpenIngest }: SidebarProps) {
  const repositories = useAppStore((s) => s.repositories);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const selectRepository = useAppStore((s) => s.selectRepository);
  const deleteRepository = useAppStore((s) => s.deleteRepository);
  const loadingRepos = useAppStore((s) => s.loadingRepos);

  const [filter, setFilter] = useState('');

  const filteredRepos = repositories.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    r.local_path.toLowerCase().includes(filter.toLowerCase())
  );

  const handleDelete = async (e: React.MouseEvent, repoId: string, repoName: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete repository "${repoName}" from the archaeologist?`)) {
      await deleteRepository(repoId);
    }
  };

  const getStatusClass = (status?: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'completed';
      case 'IN_PROGRESS':
        return 'in-progress';
      case 'QUEUED':
        return 'queued';
      case 'FAILED':
        return 'failed';
      default:
        return 'completed';
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Repositories</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {repositories.length} total
        </span>
      </div>

      <div style={{ padding: '8px 10px 4px' }}>
        <div style={{ position: 'relative' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="form-input"
            style={{
              width: '100%',
              paddingLeft: 28,
              paddingTop: 5,
              paddingBottom: 5,
              fontSize: '0.74rem',
            }}
            placeholder="Filter repositories…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar-list">
        {loadingRepos && repositories.length === 0 ? (
          <div className="loading-overlay" style={{ height: 120 }}>
            <div className="spinner" />
          </div>
        ) : filteredRepos.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Database size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p style={{ fontSize: '0.75rem', marginBottom: 10 }}>
              {filter ? 'No matching repositories.' : 'No repositories ingested yet.'}
            </p>
            {!filter && (
              <button className="btn btn-secondary btn-sm" onClick={onOpenIngest}>
                + Ingest First Repo
              </button>
            )}
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isActive = repo.id === activeRepoId;
            const status = repo.latest_analysis?.status;
            return (
              <div
                key={repo.id}
                className={`repo-item ${isActive ? 'active' : ''}`}
                onClick={() => selectRepository(repo.id)}
              >
                <div className="repo-item-icon">
                  <FolderGit2 size={16} />
                </div>
                <div className="repo-item-info">
                  <div className="repo-item-name" title={repo.name}>
                    {repo.name}
                  </div>
                  <div className="repo-item-meta">
                    {repo.total_files} files • {repo.total_symbols} symbols
                  </div>
                </div>

                <div
                  className={`repo-item-status ${getStatusClass(status)}`}
                  title={`Analysis status: ${status || 'COMPLETED'}`}
                />

                <button
                  className="btn btn-ghost btn-icon"
                  style={{ opacity: isActive ? 0.8 : 0.4 }}
                  onClick={(e) => handleDelete(e, repo.id, repo.name)}
                  title="Delete repository"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        AST Engine: Tree-Sitter & Python ast
      </div>
    </aside>
  );
}
