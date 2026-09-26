import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { RepoBanner } from '@/components/RepoBanner';
import { StatCards } from '@/components/StatCards';
import { TabNav, type ActiveTab } from '@/components/TabNav';
import { OverviewTab } from '@/components/overview/OverviewTab';
import { ArchitectureGraph } from '@/components/graph/ArchitectureGraph';
import { CodeViewer } from '@/components/editor/CodeViewer';
import { SymbolsTab } from '@/components/symbols/SymbolsTab';
import { IngestModal } from '@/components/IngestModal';
import { Compass, Plus } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  const repositories = useAppStore((s) => s.repositories);
  const activeRepo = useAppStore((s) => s.activeRepo);
  const activeRepoId = useAppStore((s) => s.activeRepoId);
  const fetchRepositories = useAppStore((s) => s.fetchRepositories);
  const selectRepository = useAppStore((s) => s.selectRepository);
  const checkHealth = useAppStore((s) => s.checkHealth);
  const files = useAppStore((s) => s.files);
  const fetchFileContent = useAppStore((s) => s.fetchFileContent);

  // Initial load
  useEffect(() => {
    checkHealth();
    fetchRepositories();

    const timer = setInterval(() => {
      checkHealth();
    }, 12000);
    return () => clearInterval(timer);
  }, [checkHealth, fetchRepositories]);

  // Auto-select first repository if none selected
  useEffect(() => {
    if (!activeRepoId && repositories.length > 0) {
      selectRepository(repositories[0].id);
    }
  }, [repositories, activeRepoId, selectRepository]);

  // Navigate directly to a file from graph node or symbol card
  const handleOpenFileInExplorer = async (filePath: string) => {
    if (!activeRepo) return;
    const match = files.find(
      (f) =>
        f.path === filePath ||
        filePath.endsWith(f.path) ||
        f.path.endsWith(filePath)
    );
    if (match) {
      await fetchFileContent(activeRepo.id, match.id);
    }
    setActiveTab('explorer');
  };

  return (
    <div className="app-layout">
      <Header onOpenIngest={() => setIsIngestOpen(true)} />

      <div className="app-body">
        <Sidebar onOpenIngest={() => setIsIngestOpen(true)} />

        <main className="main-content">
          {!activeRepo ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Compass size={36} style={{ color: 'var(--accent-primary)' }} />
              </div>
              <h2 className="empty-state-title">Select or Ingest a Codebase</h2>
              <p className="empty-state-desc">
                Begin archaeological analysis of your codebase to uncover dependencies,
                inheritance hierarchies, call graphs, and architectural health metrics.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setIsIngestOpen(true)}
                style={{ marginTop: 8 }}
              >
                <Plus size={16} />
                <span>Ingest Codebase Now</span>
              </button>
            </div>
          ) : (
            <>
              <RepoBanner />
              <StatCards />
              <TabNav activeTab={activeTab} onChangeTab={setActiveTab} />

              <div className="tab-panel">
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'graph' && (
                  <ArchitectureGraph onOpenFileInExplorer={handleOpenFileInExplorer} />
                )}
                {activeTab === 'explorer' && <CodeViewer />}
                {activeTab === 'symbols' && (
                  <SymbolsTab onOpenFileInExplorer={handleOpenFileInExplorer} />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {isIngestOpen && <IngestModal onClose={() => setIsIngestOpen(false)} />}
    </div>
  );
}

export default App;
