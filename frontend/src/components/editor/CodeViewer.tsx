import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Editor from '@monaco-editor/react';
import { FileCode, Search, Code2, FileText, CheckCircle2 } from 'lucide-react';

export function CodeViewer() {
  const activeRepo = useAppStore((s) => s.activeRepo);
  const files = useAppStore((s) => s.files);
  const activeFile = useAppStore((s) => s.activeFile);
  const fetchFileContent = useAppStore((s) => s.fetchFileContent);
  const loadingFiles = useAppStore((s) => s.loadingFiles);

  const [fileSearch, setFileSearch] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Filter files by search string
  const filteredFiles = files.filter(
    (f) =>
      f.path.toLowerCase().includes(fileSearch.toLowerCase()) ||
      f.filename.toLowerCase().includes(fileSearch.toLowerCase())
  );

  // Select first file automatically if none is selected
  useEffect(() => {
    if (!selectedFileId && files.length > 0 && activeRepo) {
      const first = files[0];
      setSelectedFileId(first.id);
      fetchFileContent(activeRepo.id, first.id);
    }
  }, [files, selectedFileId, activeRepo?.id]);

  const handleSelectFile = (fileId: string) => {
    setSelectedFileId(fileId);
    if (activeRepo) {
      fetchFileContent(activeRepo.id, fileId);
    }
  };

  // Determine Monaco editor language
  const getLanguage = (pathOrExt: string): string => {
    const ext = pathOrExt.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py':
        return 'python';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'sh':
      case 'bash':
        return 'shell';
      case 'sql':
        return 'sql';
      default:
        return 'plaintext';
    }
  };

  if (!activeRepo) return null;

  return (
    <div className="explorer-layout">
      {/* File Tree / List Sidebar */}
      <div className="file-tree-pane">
        <div className="file-tree-header">
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              className="form-input"
              style={{
                width: '100%',
                paddingLeft: 26,
                paddingTop: 4,
                paddingBottom: 4,
                fontSize: '0.74rem',
              }}
              placeholder="Search files…"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>{filteredFiles.length} files</span>
            <span>Click to inspect AST</span>
          </div>
        </div>

        <div className="file-tree-list">
          {loadingFiles ? (
            <div className="loading-overlay" style={{ height: 100 }}>
              <div className="spinner" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              No files match your query.
            </div>
          ) : (
            filteredFiles.map((file) => {
              const isSelected = file.id === selectedFileId;
              return (
                <div
                  key={file.id}
                  className={`file-item ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSelectFile(file.id)}
                  title={file.path}
                >
                  <div className="file-item-icon">
                    <FileCode size={14} />
                  </div>
                  <div className="file-item-name">{file.path}</div>
                  <span className="file-item-lang">{file.language || file.extension}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Monaco Code Viewer Area */}
      <div className="code-viewer-pane">
        {activeFile ? (
          <>
            <div className="code-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Code2 size={16} style={{ color: 'var(--accent-secondary)' }} />
                <span className="code-filename">{activeFile.path}</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-surface)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {activeFile.language}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span>{activeFile.line_count} lines</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-success)' }}>
                  <CheckCircle2 size={13} /> AST Parsed
                </span>
              </div>
            </div>

            <div className="monaco-container">
              <Editor
                height="100%"
                language={getLanguage(activeFile.path)}
                theme="vs-dark"
                value={activeFile.content}
                options={{
                  readOnly: true,
                  minimap: { enabled: true },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontLigatures: true,
                  renderLineHighlight: 'all',
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                }}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText size={32} />
            </div>
            <div className="empty-state-title">Select a File to View</div>
            <div className="empty-state-desc">
              Choose any source file from the repository explorer on the left to inspect its complete syntax-highlighted source code and AST metadata.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
