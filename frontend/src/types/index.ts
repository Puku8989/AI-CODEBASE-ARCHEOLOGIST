// ────────────────────────────────────────────────────────────────
// Domain types mirroring the FastAPI Pydantic schemas
// ────────────────────────────────────────────────────────────────

export interface AnalysisRun {
  id: string;
  repository_id: string;
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress_pct: number;
  current_step: string;
  total_files: number;
  scanned_files: number;
  parsed_files: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Repository {
  id: string;
  name: string;
  url: string | null;
  local_path: string;
  default_branch: string;
  commit_hash: string | null;
  detected_languages: Record<string, number> | null;
  total_files: number;
  total_lines: number;
  total_symbols: number;
  created_at: string;
  updated_at: string;
  latest_analysis: AnalysisRun | null;
}

export interface FileRecord {
  id: string;
  repository_id: string;
  path: string;
  filename: string;
  extension: string;
  language: string;
  size_bytes: number;
  line_count: number;
  analysis_status: string;
  error_detail: string | null;
}

export interface FileContent {
  id: string;
  path: string;
  filename: string;
  language: string;
  line_count: number;
  content: string;
}

export interface SymbolRecord {
  id: string;
  repository_id: string;
  file_id: string;
  file_path: string | null;
  parent_symbol_id: string | null;
  name: string;
  qualified_name: string;
  symbol_type: 'module' | 'class' | 'function' | 'method' | 'variable' | 'api_route' | 'model';
  start_line: number;
  end_line: number;
  start_col: number;
  end_col: number;
  docstring: string | null;
  signature: string | null;
  cyclomatic_complexity: number | null;
  raw_source: string | null;
  is_async: boolean;
  is_exported: boolean;
}

export interface ImportRecord {
  id: string;
  file_id: string;
  source_module: string;
  imported_name: string;
  alias: string | null;
  is_from_import: boolean;
  line_number: number;
}

export interface FunctionCallRecord {
  id: string;
  caller_symbol_id: string | null;
  file_id: string;
  callee_name: string;
  line_number: number;
  confidence: 'deterministic' | 'inferred';
}

// ────────────────────────────────────────────────────────────────
// React Flow compatible graph types (from backend /graph endpoint)
// ────────────────────────────────────────────────────────────────

export interface GraphNodeData {
  id: string;
  node_type: string;
  entity_id: string;
  label: string;
  path?: string;
  language?: string;
  line_count?: number;
  qualified_name?: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  complexity?: number | null;
  is_async?: boolean;
  analysis_status?: string;
  importance?: number;
  directory?: string;
  isEntryPoint?: boolean;
  isIsolated?: boolean;
  isGroup?: boolean;
  layoutDirection?: 'LR' | 'TB';
  isUpstream?: boolean;
  isDownstream?: boolean;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: string;
  data: GraphNodeData;
  position: { x: number; y: number };
}

export interface GraphEdgeData {
  relationshipType: string;
  confidence: string;
  line_number?: number;
  source_module?: string;
  imported_name?: string;
  callee_name?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  animated: boolean;
  type?: string;
  style: Record<string, string>;
  data: GraphEdgeData;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    circularDependencyCount: number;
    viewMode: string;
  };
  entryPoints?: string[];
  directoryGroups?: Record<string, string[]>;
}

export interface CouplingMetric {
  file_id: string;
  path: string;
  label: string;
  afferent_coupling: number;
  efferent_coupling: number;
  instability: number;
  is_hub: boolean;
}

export interface CycleNode {
  node_id: string;
  label: string;
  path: string;
}

export type ViewMode = 'all' | 'architecture' | 'modules' | 'functions' | 'apis' | 'classes';
