import { create } from 'zustand';
import type {
  Repository,
  FileRecord,
  FileContent,
  SymbolRecord,
  GraphPayload,
  ViewMode,
  AnalysisRun,
} from '@/types';
import * as api from '@/api/client';

// ────────────────────────────────────────────────────────────────
// App-wide store: repositories, active repo, files, symbols, graph
// ────────────────────────────────────────────────────────────────

interface AppState {
  // Repositories
  repositories: Repository[];
  activeRepoId: string | null;
  activeRepo: Repository | null;
  loadingRepos: boolean;

  // Files
  files: FileRecord[];
  activeFile: FileContent | null;
  loadingFiles: boolean;

  // Symbols
  symbols: SymbolRecord[];
  symbolFilter: string;
  symbolTypeFilter: string;
  loadingSymbols: boolean;

  // Graph
  graphData: GraphPayload | null;
  graphViewMode: ViewMode;
  loadingGraph: boolean;

  // Analysis polling
  analysisPolling: boolean;

  // Server health
  serverOnline: boolean;

  // Actions
  fetchRepositories: () => Promise<void>;
  selectRepository: (repoId: string) => Promise<void>;
  ingestRepository: (payload: { name?: string; url?: string; local_path?: string }) => Promise<Repository>;
  deleteRepository: (repoId: string) => Promise<void>;
  reanalyze: (repoId: string) => Promise<void>;

  fetchFiles: (repoId: string) => Promise<void>;
  fetchFileContent: (repoId: string, fileId: string) => Promise<void>;
  clearActiveFile: () => void;

  fetchSymbols: (repoId: string, filters?: { symbol_type?: string; q?: string }) => Promise<void>;
  setSymbolFilter: (q: string) => void;
  setSymbolTypeFilter: (t: string) => void;

  fetchGraph: (repoId: string, viewMode?: ViewMode) => Promise<void>;
  setGraphViewMode: (mode: ViewMode) => void;

  pollAnalysis: (repoId: string) => void;
  stopPolling: () => void;

  checkHealth: () => Promise<void>;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  repositories: [],
  activeRepoId: null,
  activeRepo: null,
  loadingRepos: false,

  files: [],
  activeFile: null,
  loadingFiles: false,

  symbols: [],
  symbolFilter: '',
  symbolTypeFilter: 'all',
  loadingSymbols: false,

  graphData: null,
  graphViewMode: 'all',
  loadingGraph: false,

  analysisPolling: false,
  serverOnline: false,

  // ── Repositories ────────────────────────────────────────────

  fetchRepositories: async () => {
    set({ loadingRepos: true });
    try {
      const repos = await api.listRepositories();
      set({ repositories: repos, loadingRepos: false });
    } catch {
      set({ loadingRepos: false });
    }
  },

  selectRepository: async (repoId: string) => {
    set({ activeRepoId: repoId, activeFile: null });
    try {
      const repo = await api.getRepository(repoId);
      set({ activeRepo: repo });

      // If analysis is in progress, start polling
      if (
        repo.latest_analysis &&
        ['QUEUED', 'IN_PROGRESS'].includes(repo.latest_analysis.status)
      ) {
        get().pollAnalysis(repoId);
      }

      // Load subsidiary data in parallel
      await Promise.all([
        get().fetchFiles(repoId),
        get().fetchSymbols(repoId),
        get().fetchGraph(repoId),
      ]);
    } catch (err) {
      console.error('Failed to select repo:', err);
    }
  },

  ingestRepository: async (payload) => {
    const repo = await api.createRepository(payload);
    await get().fetchRepositories();
    await get().selectRepository(repo.id);
    return repo;
  },

  deleteRepository: async (repoId: string) => {
    await api.deleteRepository(repoId);
    const state = get();
    if (state.activeRepoId === repoId) {
      set({ activeRepoId: null, activeRepo: null, files: [], symbols: [], graphData: null });
    }
    await get().fetchRepositories();
  },

  reanalyze: async (repoId: string) => {
    await api.triggerAnalysis(repoId);
    get().pollAnalysis(repoId);
  },

  // ── Files ───────────────────────────────────────────────────

  fetchFiles: async (repoId: string) => {
    set({ loadingFiles: true });
    try {
      const files = await api.listFiles(repoId);
      set({ files, loadingFiles: false });
    } catch {
      set({ loadingFiles: false });
    }
  },

  fetchFileContent: async (repoId: string, fileId: string) => {
    try {
      const content = await api.getFileContent(repoId, fileId);
      set({ activeFile: content });
    } catch (err) {
      console.error('Failed to load file content:', err);
    }
  },

  clearActiveFile: () => set({ activeFile: null }),

  // ── Symbols ─────────────────────────────────────────────────

  fetchSymbols: async (repoId: string, filters?: { symbol_type?: string; q?: string }) => {
    set({ loadingSymbols: true });
    try {
      const cleanFilters: { symbol_type?: string; q?: string } = {};
      if (filters?.symbol_type && filters.symbol_type !== 'all') {
        cleanFilters.symbol_type = filters.symbol_type;
      }
      if (filters?.q) cleanFilters.q = filters.q;

      const symbols = await api.listSymbols(repoId, cleanFilters);
      set({ symbols, loadingSymbols: false });
    } catch {
      set({ loadingSymbols: false });
    }
  },

  setSymbolFilter: (q: string) => {
    set({ symbolFilter: q });
    const { activeRepoId, symbolTypeFilter } = get();
    if (activeRepoId) {
      get().fetchSymbols(activeRepoId, { symbol_type: symbolTypeFilter, q });
    }
  },

  setSymbolTypeFilter: (t: string) => {
    set({ symbolTypeFilter: t });
    const { activeRepoId, symbolFilter } = get();
    if (activeRepoId) {
      get().fetchSymbols(activeRepoId, { symbol_type: t, q: symbolFilter });
    }
  },

  // ── Graph ───────────────────────────────────────────────────

  fetchGraph: async (repoId: string, viewMode?: ViewMode) => {
    const mode = viewMode || get().graphViewMode;
    set({ loadingGraph: true });
    try {
      const data = await api.getGraph(repoId, mode);
      set({ graphData: data, loadingGraph: false, graphViewMode: mode });
    } catch {
      set({ loadingGraph: false });
    }
  },

  setGraphViewMode: (mode: ViewMode) => {
    set({ graphViewMode: mode });
    const { activeRepoId } = get();
    if (activeRepoId) {
      get().fetchGraph(activeRepoId, mode);
    }
  },

  // ── Analysis Polling ────────────────────────────────────────

  pollAnalysis: (repoId: string) => {
    if (pollingInterval) clearInterval(pollingInterval);

    set({ analysisPolling: true });

    pollingInterval = setInterval(async () => {
      try {
        const run: AnalysisRun = await api.getAnalysisStatus(repoId);
        set((state) => ({
          activeRepo: state.activeRepo
            ? { ...state.activeRepo, latest_analysis: run }
            : null,
        }));

        if (run.status === 'COMPLETED' || run.status === 'FAILED') {
          get().stopPolling();
          // Refresh all data
          await Promise.all([
            get().fetchRepositories(),
            get().selectRepository(repoId),
          ]);
        }
      } catch {
        get().stopPolling();
      }
    }, 2000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    set({ analysisPolling: false });
  },

  // ── Health ──────────────────────────────────────────────────

  checkHealth: async () => {
    try {
      const health = await api.checkHealth();
      set({ serverOnline: health.status === 'healthy' });
    } catch {
      set({ serverOnline: false });
    }
  },
}));
