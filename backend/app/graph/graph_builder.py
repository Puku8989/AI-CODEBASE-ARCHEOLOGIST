from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
import networkx as nx
from sqlalchemy.orm import Session

from app.models import (
    Repository,
    FileRecord,
    SymbolRecord,
    ImportRecord,
    FunctionCallRecord,
    ClassInheritanceRecord,
    GraphEdgeRecord
)


class GraphBuilder:
    def __init__(self, db: Session, repo: Repository):
        self.db = db
        self.repo = repo
        self.graph = nx.MultiDiGraph()
        self.file_map: Dict[str, FileRecord] = {}
        self.symbol_map: Dict[str, SymbolRecord] = {}
        self.symbol_by_qname: Dict[str, SymbolRecord] = {}
        self.symbol_by_name: Dict[str, List[SymbolRecord]] = {}
        self.files_by_clean_path: Dict[str, FileRecord] = {}

    def build_and_persist(self) -> Tuple[nx.MultiDiGraph, int, int]:
        """Build in-memory graph and persist edge records into database."""
        self._load_entities()
        self._build_nodes()
        self._build_import_edges()
        self._build_call_edges()
        self._build_inheritance_edges()
        self._build_api_and_model_edges()
        
        # Persist to database
        det_count, inf_count = self._persist_edges()
        return self.graph, det_count, inf_count

    def _load_entities(self):
        files = self.db.query(FileRecord).filter(FileRecord.repository_id == self.repo.id).all()
        for f in files:
            self.file_map[f.id] = f
            clean_p = f.path.replace("\\", "/").rstrip("/").lower()
            self.files_by_clean_path[clean_p] = f
            # Without extension for easy import resolution
            no_ext = clean_p.rsplit(".", 1)[0] if "." in clean_p else clean_p
            self.files_by_clean_path[no_ext] = f
            self.files_by_clean_path[no_ext.replace("/", ".")] = f

        symbols = self.db.query(SymbolRecord).filter(SymbolRecord.repository_id == self.repo.id).all()
        for sym in symbols:
            self.symbol_map[sym.id] = sym
            self.symbol_by_qname[sym.qualified_name] = sym
            if sym.name not in self.symbol_by_name:
                self.symbol_by_name[sym.name] = []
            self.symbol_by_name[sym.name].append(sym)

    def _build_nodes(self):
        # 1. Add file nodes
        for f in self.file_map.values():
            node_id = f"file:{f.id}"
            self.graph.add_node(
                node_id,
                node_type="file",
                entity_id=f.id,
                label=f.filename,
                path=f.path,
                language=f.language,
                line_count=f.line_count,
                analysis_status=f.analysis_status
            )

        # 2. Add symbol nodes (functions, classes, models, api_routes)
        for sym in self.symbol_map.values():
            file_rec = self.file_map.get(sym.file_id)
            node_id = f"sym:{sym.id}"
            self.graph.add_node(
                node_id,
                node_type=sym.symbol_type,
                entity_id=sym.id,
                label=sym.name,
                qualified_name=sym.qualified_name,
                file_id=sym.file_id,
                file_path=file_rec.path if file_rec else "",
                start_line=sym.start_line,
                end_line=sym.end_line,
                complexity=sym.cyclomatic_complexity,
                is_async=sym.is_async
            )
            # Member edge: File contains Symbol
            if file_rec:
                self.graph.add_edge(
                    f"file:{file_rec.id}",
                    node_id,
                    relationship_type="contains",
                    confidence="deterministic"
                )

    def _resolve_imported_file(self, current_file_path: str, source_module: str) -> Optional[FileRecord]:
        """Resolve import source path (relative or absolute) to a known FileRecord."""
        norm_source = source_module.replace("\\", "/").strip("./")
        curr_dir = Path(current_file_path).parent.as_posix().replace("\\", "/").rstrip("/")
        if curr_dir == ".":
            curr_dir = ""

        # Try relative to current directory
        if curr_dir:
            cand1 = f"{curr_dir}/{norm_source}".lower()
            if cand1 in self.files_by_clean_path:
                return self.files_by_clean_path[cand1]
            cand1_init = f"{curr_dir}/{norm_source}/__init__".lower()
            if cand1_init in self.files_by_clean_path:
                return self.files_by_clean_path[cand1_init]
            cand1_index = f"{curr_dir}/{norm_source}/index".lower()
            if cand1_index in self.files_by_clean_path:
                return self.files_by_clean_path[cand1_index]

        # Try relative to repo root
        cand2 = norm_source.lower()
        if cand2 in self.files_by_clean_path:
            return self.files_by_clean_path[cand2]
        cand2_init = f"{norm_source}/__init__".lower()
        if cand2_init in self.files_by_clean_path:
            return self.files_by_clean_path[cand2_init]
        cand2_index = f"{norm_source}/index".lower()
        if cand2_index in self.files_by_clean_path:
            return self.files_by_clean_path[cand2_index]

        # Try dot notation e.g. services.auth_service -> services/auth_service
        cand3 = norm_source.replace(".", "/").lower()
        if cand3 in self.files_by_clean_path:
            return self.files_by_clean_path[cand3]

        return None

    def _build_import_edges(self):
        imports = self.db.query(ImportRecord).filter(ImportRecord.repository_id == self.repo.id).all()
        for imp in imports:
            src_file = self.file_map.get(imp.file_id)
            if not src_file:
                continue

            target_file = self._resolve_imported_file(src_file.path, imp.source_module)
            if target_file and target_file.id != src_file.id:
                self.graph.add_edge(
                    f"file:{src_file.id}",
                    f"file:{target_file.id}",
                    relationship_type="imports",
                    confidence="deterministic",
                    source_module=imp.source_module,
                    imported_name=imp.imported_name,
                    line_number=imp.line_number
                )

    def _build_call_edges(self):
        calls = self.db.query(FunctionCallRecord).filter(FunctionCallRecord.repository_id == self.repo.id).all()
        for call in calls:
            caller_sym = self.symbol_map.get(call.caller_symbol_id) if call.caller_symbol_id else None
            src_node = f"sym:{caller_sym.id}" if caller_sym else f"file:{call.file_id}"

            # Attempt deterministic resolution
            callee_sym = self.symbol_by_qname.get(call.callee_name)
            confidence = "deterministic" if callee_sym else "inferred"

            if not callee_sym:
                # Try simple name resolution
                simple_name = call.callee_name.split(".")[-1]
                matches = self.symbol_by_name.get(simple_name, [])
                if len(matches) == 1:
                    callee_sym = matches[0]
                    confidence = "inferred"
                elif len(matches) > 1:
                    # Pick match in same file if available
                    same_file_matches = [m for m in matches if m.file_id == call.file_id]
                    if same_file_matches:
                        callee_sym = same_file_matches[0]
                        confidence = "deterministic"
                    else:
                        callee_sym = matches[0]
                        confidence = "inferred"

            if callee_sym:
                self.graph.add_edge(
                    src_node,
                    f"sym:{callee_sym.id}",
                    relationship_type="calls",
                    confidence=confidence,
                    callee_name=call.callee_name,
                    line_number=call.line_number
                )

    def _build_inheritance_edges(self):
        inhs = self.db.query(ClassInheritanceRecord).filter(ClassInheritanceRecord.repository_id == self.repo.id).all()
        for inh in inhs:
            child_sym = self.symbol_map.get(inh.child_symbol_id)
            if not child_sym:
                continue

            parent_sym = self.symbol_by_qname.get(inh.parent_class_name)
            confidence = "deterministic" if parent_sym else "inferred"

            if not parent_sym:
                matches = self.symbol_by_name.get(inh.parent_class_name, [])
                if matches:
                    parent_sym = matches[0]

            if parent_sym:
                self.graph.add_edge(
                    f"sym:{child_sym.id}",
                    f"sym:{parent_sym.id}",
                    relationship_type="inherits",
                    confidence=confidence,
                    line_number=inh.line_number
                )

    def _build_api_and_model_edges(self):
        # Link API route symbols to function calls or controllers
        for sym in self.symbol_map.values():
            if sym.symbol_type == "api_route":
                # Find calls inside or associated with this route
                for succ in self.graph.successors(f"sym:{sym.id}"):
                    if succ.startswith("sym:"):
                        succ_sym_id = succ.split(":", 1)[1]
                        target_sym = self.symbol_map.get(succ_sym_id)
                        if target_sym and target_sym.symbol_type in ("function", "method"):
                            self.graph.add_edge(
                                f"sym:{sym.id}",
                                succ,
                                relationship_type="invokes",
                                confidence="deterministic"
                            )

    def _persist_edges(self) -> Tuple[int, int]:
        """Save graph edges to database table."""
        # Clear existing edges for this repository
        self.db.query(GraphEdgeRecord).filter(GraphEdgeRecord.repository_id == self.repo.id).delete()
        self.db.commit()

        deterministic_count = 0
        inferred_count = 0

        for u, v, data in self.graph.edges(data=True):
            rel_type = data.get("relationship_type", "depends_on")
            if rel_type == "contains":
                continue  # internal hierarchy, keep in-memory / UI

            conf = data.get("confidence", "deterministic")
            if conf == "deterministic":
                deterministic_count += 1
            else:
                inferred_count += 1

            u_type = self.graph.nodes[u].get("node_type", "unknown")
            u_name = self.graph.nodes[u].get("label", u)
            v_type = self.graph.nodes[v].get("node_type", "unknown")
            v_name = self.graph.nodes[v].get("label", v)

            edge_rec = GraphEdgeRecord(
                repository_id=self.repo.id,
                relationship_type=rel_type,
                source_id=u,
                source_type=u_type,
                source_name=u_name,
                target_id=v,
                target_type=v_type,
                target_name=v_name,
                confidence=conf,
                edge_metadata=data
            )
            self.db.add(edge_rec)

        self.db.commit()
        return deterministic_count, inferred_count
