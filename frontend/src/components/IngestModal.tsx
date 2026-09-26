import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Plus, X } from 'lucide-react';

interface IngestModalProps {
  onClose: () => void;
}

export function IngestModal({ onClose }: IngestModalProps) {
  const ingestRepository = useAppStore((s) => s.ingestRepository);
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const presets = [
    {
      label: '📍 Current Project',
      path: 'C:/Users/abhra/OneDrive/Desktop/AI Codebase',
      name: 'AI Codebase Engine',
    },
    {
      label: '🧪 Test Fixture Repo',
      path: 'C:/Users/abhra/OneDrive/Desktop/AI Codebase/backend/tests/fixtures/sample_py_repo',
      name: 'Sample Python Repo',
    },
  ];

  const handleSubmit = async () => {
    if (!localPath && !url) {
      setError('Please provide a local path or GitHub URL.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await ingestRepository({
        name: name || undefined,
        local_path: localPath || undefined,
        url: url || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to ingest repository';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Plus size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Ingest & Analyze Codebase
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Repository Name (Optional)</label>
            <input
              className="form-input"
              placeholder="e.g. My Backend App"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Local Folder Absolute Path</label>
            <input
              className="form-input"
              placeholder="e.g. C:\Users\path\to\my_project"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Quick Presets:
              </span>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {presets.map((preset) => (
                  <button
                    key={preset.path}
                    className="preset-btn"
                    onClick={() => {
                      setLocalPath(preset.path);
                      if (!name) setName(preset.name);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="form-divider">
            <div className="form-divider-line" />
            <span>OR</span>
            <div className="form-divider-line" />
          </div>

          <div className="form-group">
            <label className="form-label">GitHub Repository URL</label>
            <input
              className="form-input"
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {error && (
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--color-error)',
                background: 'var(--color-error-bg)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Ingesting…' : 'Ingest & Analyze'}
          </button>
        </div>
      </div>
    </div>
  );
}
