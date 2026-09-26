import axios from 'axios';
import type {
  Repository,
  FileRecord,
  FileContent,
  SymbolRecord,
  ImportRecord,
  FunctionCallRecord,
  GraphPayload,
  CouplingMetric,
  CycleNode,
  AnalysisRun,
  ViewMode,
} from '@/types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Repositories ──────────────────────────────────────────────

export async function createRepository(payload: {
  name?: string;
  url?: string;
  local_path?: string;
}): Promise<Repository> {
  const { data } = await api.post<Repository>('/repositories', payload);
  return data;
}

export async function listRepositories(): Promise<Repository[]> {
  const { data } = await api.get<Repository[]>('/repositories');
  return data;
}

export async function getRepository(repoId: string): Promise<Repository> {
  const { data } = await api.get<Repository>(`/repositories/${repoId}`);
  return data;
}

export async function deleteRepository(repoId: string): Promise<void> {
  await api.delete(`/repositories/${repoId}`);
}

export async function triggerAnalysis(repoId: string): Promise<AnalysisRun> {
  const { data } = await api.post<AnalysisRun>(`/repositories/${repoId}/analyze`);
  return data;
}

export async function getAnalysisStatus(repoId: string): Promise<AnalysisRun> {
  const { data } = await api.get<AnalysisRun>(`/repositories/${repoId}/analysis-status`);
  return data;
}

// ── Files ─────────────────────────────────────────────────────

export async function listFiles(
  repoId: string,
  filters?: { language?: string; analysis_status?: string }
): Promise<FileRecord[]> {
  const { data } = await api.get<FileRecord[]>(`/repositories/${repoId}/files`, {
    params: filters,
  });
  return data;
}

export async function getFileContent(repoId: string, fileId: string): Promise<FileContent> {
  const { data } = await api.get<FileContent>(`/repositories/${repoId}/files/${fileId}`);
  return data;
}

// ── Symbols ───────────────────────────────────────────────────

export async function listSymbols(
  repoId: string,
  filters?: { symbol_type?: string; file_id?: string; q?: string }
): Promise<SymbolRecord[]> {
  const { data } = await api.get<SymbolRecord[]>(`/repositories/${repoId}/symbols`, {
    params: filters,
  });
  return data;
}

// ── Imports & Calls ───────────────────────────────────────────

export async function listImports(
  repoId: string,
  filters?: { file_id?: string; source_module?: string }
): Promise<ImportRecord[]> {
  const { data } = await api.get<ImportRecord[]>(`/repositories/${repoId}/imports`, {
    params: filters,
  });
  return data;
}

export async function listFunctionCalls(
  repoId: string,
  filters?: { file_id?: string; caller_symbol_id?: string; callee_name?: string }
): Promise<FunctionCallRecord[]> {
  const { data } = await api.get<FunctionCallRecord[]>(`/repositories/${repoId}/calls`, {
    params: filters,
  });
  return data;
}

// ── Graph ─────────────────────────────────────────────────────

export async function getGraph(
  repoId: string,
  viewMode: ViewMode = 'all',
  confidence?: string
): Promise<GraphPayload> {
  const { data } = await api.get<GraphPayload>(`/repositories/${repoId}/graph`, {
    params: { view_mode: viewMode, confidence },
  });
  return data;
}

export async function getCycles(
  repoId: string
): Promise<{ repository_id: string; total_cycles: number; cycles: CycleNode[][] }> {
  const { data } = await api.get(`/repositories/${repoId}/cycles`);
  return data;
}

export async function getCoupling(
  repoId: string
): Promise<{ repository_id: string; modules: CouplingMetric[] }> {
  const { data } = await api.get(`/repositories/${repoId}/coupling`);
  return data;
}

export async function getNodeDetails(
  repoId: string,
  nodeId: string
): Promise<Record<string, unknown>> {
  const { data } = await api.get(`/repositories/${repoId}/nodes/${encodeURIComponent(nodeId)}/details`);
  return data;
}

// ── Health ────────────────────────────────────────────────────

export async function checkHealth(): Promise<{ status: string }> {
  const { data } = await api.get<{ status: string }>('/health', { baseURL: '' });
  return data;
}
