from typing import Dict, List, Any, Optional, Set, Tuple
from collections import defaultdict
from pathlib import PurePosixPath
import networkx as nx


# ── Low-value symbols that should be hidden by default ────────────────
_NOISE_SYMBOLS: Set[str] = {
    "__doc__", "__name__", "__file__", "__all__", "__version__",
    "__package__", "__loader__", "__spec__", "__builtins__",
    "__cached__", "__path__", "__annotations__",
    "logger", "log", "logging", "T", "Self",
}

# ── Symbol types considered "architectural" vs "detail" ───────────────
_ARCHITECTURE_TYPES: Set[str] = {"file", "module"}
_MODULE_TYPES: Set[str] = {"file", "module", "class", "function", "api_route"}
_CLASS_TYPES: Set[str] = {"class", "model"}
_FUNCTION_TYPES: Set[str] = {"function", "method", "api_route"}
_API_TYPES: Set[str] = {"api_route"}

# ── Entry-point detection patterns ────────────────────────────────────
_ENTRY_POINT_NAMES: Set[str] = {
    "main", "__main__", "app", "application", "server",
    "cli", "run", "start", "entrypoint", "wsgi", "asgi",
}

_ENTRY_POINT_FILES: Set[str] = {
    "main.py", "app.py", "wsgi.py", "asgi.py", "manage.py",
    "server.py", "cli.py", "run.py", "__main__.py",
    "index.py", "index.ts", "index.js", "main.ts", "main.js",
    "app.ts", "app.js", "server.ts", "server.js",
}


class GraphAnalyzer:
    def __init__(self, graph: nx.MultiDiGraph):
        self.graph = graph

    # ══════════════════════════════════════════════════════════════════
    # Core analysis helpers
    # ══════════════════════════════════════════════════════════════════

    def find_circular_dependencies(self) -> List[List[Dict[str, Any]]]:
        """Detect circular dependency cycles in file-level import graph."""
        file_dg = nx.DiGraph()

        # Build pure DiGraph of file imports
        for u, v, data in self.graph.edges(data=True):
            if data.get("relationship_type") in ("imports", "depends_on"):
                if u.startswith("file:") and v.startswith("file:"):
                    file_dg.add_edge(u, v)

        cycles = []
        try:
            raw_cycles = list(nx.simple_cycles(file_dg))
            for raw_cycle in raw_cycles:
                formatted_cycle = []
                for node_id in raw_cycle:
                    node_data = self.graph.nodes.get(node_id, {})
                    formatted_cycle.append({
                        "node_id": node_id,
                        "label": node_data.get("label", node_id),
                        "path": node_data.get("path", "")
                    })
                # Close the loop for clear UI presentation
                if formatted_cycle:
                    formatted_cycle.append(formatted_cycle[0])
                cycles.append(formatted_cycle)
        except Exception:
            pass

        return cycles

    def compute_coupling_metrics(self) -> List[Dict[str, Any]]:
        """Calculate Afferent (Ca), Efferent (Ce) coupling and Instability (I)."""
        file_dg = nx.DiGraph()
        for u, v, data in self.graph.edges(data=True):
            if data.get("relationship_type") in ("imports", "depends_on"):
                if u.startswith("file:") and v.startswith("file:"):
                    file_dg.add_edge(u, v)

        metrics = []
        for node_id in self.graph.nodes:
            if node_id.startswith("file:"):
                node_data = self.graph.nodes[node_id]
                ca = file_dg.in_degree(node_id) if node_id in file_dg else 0
                ce = file_dg.out_degree(node_id) if node_id in file_dg else 0
                total = ca + ce
                instability = round(ce / total, 2) if total > 0 else 0.0

                metrics.append({
                    "file_id": node_data.get("entity_id", ""),
                    "path": node_data.get("path", ""),
                    "label": node_data.get("label", ""),
                    "afferent_coupling": ca,
                    "efferent_coupling": ce,
                    "instability": instability,
                    "is_hub": ca >= 3 or ce >= 4
                })

        return sorted(metrics, key=lambda x: x["efferent_coupling"] + x["afferent_coupling"], reverse=True)

    def get_node_details(self, node_id: str) -> Dict[str, Any]:
        """Fetch node information, incoming callers/dependents and outgoing callees/dependencies."""
        if node_id not in self.graph:
            return {"error": f"Node {node_id} not found in graph."}

        node_data = self.graph.nodes[node_id]

        incoming = []
        for pred in self.graph.predecessors(node_id):
            edge_data = self.graph.get_edge_data(pred, node_id)
            for k, ed in (edge_data or {}).items():
                incoming.append({
                    "source_id": pred,
                    "source_label": self.graph.nodes[pred].get("label", pred),
                    "source_type": self.graph.nodes[pred].get("node_type", "unknown"),
                    "relationship_type": ed.get("relationship_type", "depends_on"),
                    "confidence": ed.get("confidence", "deterministic")
                })

        outgoing = []
        for succ in self.graph.successors(node_id):
            edge_data = self.graph.get_edge_data(node_id, succ)
            for k, ed in (edge_data or {}).items():
                outgoing.append({
                    "target_id": succ,
                    "target_label": self.graph.nodes[succ].get("label", succ),
                    "target_type": self.graph.nodes[succ].get("node_type", "unknown"),
                    "relationship_type": ed.get("relationship_type", "depends_on"),
                    "confidence": ed.get("confidence", "deterministic")
                })

        return {
            "node_id": node_id,
            "node_data": node_data,
            "incoming": incoming,
            "outgoing": outgoing,
            "in_degree": len(incoming),
            "out_degree": len(outgoing)
        }

    # ══════════════════════════════════════════════════════════════════
    # Noise filtering / deduplication helpers
    # ══════════════════════════════════════════════════════════════════

    def _is_noise_symbol(self, node_id: str, data: dict) -> bool:
        """Determine if a symbol node is low-value noise."""
        name = data.get("label", "")
        ntype = data.get("node_type", "")

        # Always keep files, modules, classes, API routes
        if ntype in ("file", "module", "class", "api_route", "model"):
            return False

        # Filter known noise symbols
        if name in _NOISE_SYMBOLS:
            return True

        # Filter dunder methods (except __init__, __call__)
        if name.startswith("__") and name.endswith("__") and name not in ("__init__", "__call__"):
            return True

        # Filter single-letter type variables
        if len(name) == 1 and name.isupper():
            return True

        # Filter variables (they clutter architecture views)
        if ntype == "variable":
            return True

        return False

    def _compute_directory_groups(self, node_ids: Set[str]) -> Dict[str, List[str]]:
        """Group file nodes by their parent directory for visual clustering."""
        groups: Dict[str, List[str]] = defaultdict(list)

        for node_id in node_ids:
            data = self.graph.nodes.get(node_id, {})
            path = data.get("path", "") or data.get("file_path", "")
            if not path:
                groups["(root)"].append(node_id)
                continue

            clean = path.replace("\\", "/")
            parts = PurePosixPath(clean).parts
            if len(parts) > 1:
                group_name = "/".join(parts[:-1])
            else:
                group_name = "(root)"

            groups[group_name].append(node_id)

        return dict(groups)

    def _detect_entry_points(self, node_ids: Set[str]) -> Set[str]:
        """Find likely entry-point nodes based on naming conventions and graph centrality."""
        entry_points: Set[str] = set()

        for node_id in node_ids:
            data = self.graph.nodes.get(node_id, {})
            name = data.get("label", "").lower()
            ntype = data.get("node_type", "")
            path = (data.get("path", "") or data.get("file_path", "") or "").replace("\\", "/")
            filename = path.split("/")[-1].lower() if path else ""

            # API route nodes are always entry points
            if ntype == "api_route":
                entry_points.add(node_id)
                continue

            # Named entry points
            if name in _ENTRY_POINT_NAMES or filename in _ENTRY_POINT_FILES:
                entry_points.add(node_id)
                continue

            # Files with many outgoing deps but few incoming (likely root orchestrators)
            if ntype == "file" and node_id in self.graph:
                in_d = self.graph.in_degree(node_id)
                out_d = self.graph.out_degree(node_id)
                if out_d >= 3 and in_d == 0:
                    entry_points.add(node_id)

        return entry_points

    def _compute_node_importance(self, node_id: str) -> float:
        """Calculate a numeric importance score for a node based on graph connectivity."""
        if node_id not in self.graph:
            return 0.0

        in_d = self.graph.in_degree(node_id)
        out_d = self.graph.out_degree(node_id)
        data = self.graph.nodes[node_id]
        ntype = data.get("node_type", "")

        score = float(in_d * 2 + out_d)

        # Boost for API endpoints
        if ntype == "api_route":
            score += 5.0
        # Boost for entry point files
        label = data.get("label", "").lower()
        if label in _ENTRY_POINT_NAMES or (data.get("path", "").split("/")[-1:] or [""])[0].lower() in _ENTRY_POINT_FILES:
            score += 4.0
        # Boost for classes (structural importance)
        if ntype == "class":
            score += 2.0

        return score

    # ══════════════════════════════════════════════════════════════════
    # React Flow payload generation with proper validation
    # ══════════════════════════════════════════════════════════════════

    def format_react_flow_payload(
        self,
        view_mode: str = "all",
        confidence_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Convert graph into React Flow compatible node and edge structures.

        Now includes: deduplication, noise filtering, directory grouping,
        entry point detection, importance scoring, and data validation.
        """

        # ── Step 1: Determine which node types to include ─────────
        allowed_types: Optional[Set[str]] = None
        filter_noise = True  # Hide noisy symbols by default

        if view_mode == "architecture":
            allowed_types = _ARCHITECTURE_TYPES
            filter_noise = True
        elif view_mode == "modules":
            allowed_types = _MODULE_TYPES
            filter_noise = True
        elif view_mode == "functions":
            allowed_types = _FUNCTION_TYPES
            filter_noise = True
        elif view_mode == "classes":
            allowed_types = _CLASS_TYPES
            filter_noise = True
        elif view_mode == "apis":
            allowed_types = _API_TYPES | {"function", "method", "file"}
            filter_noise = True
        elif view_mode == "all":
            filter_noise = False  # "All" mode shows everything

        # ── Step 2: Collect and deduplicate nodes ─────────────────
        seen_ids: Set[str] = set()
        rf_nodes: List[Dict[str, Any]] = []

        for node_id, data in self.graph.nodes(data=True):
            # Skip duplicate IDs (stable dedup by node_id)
            if node_id in seen_ids:
                continue

            ntype = data.get("node_type", "unknown")

            # Type filter
            if allowed_types and ntype not in allowed_types:
                continue

            # Noise filter
            if filter_noise and self._is_noise_symbol(node_id, data):
                continue

            seen_ids.add(node_id)

            # Build enriched node data
            file_path = data.get("path", "") or data.get("file_path", "")
            importance = self._compute_node_importance(node_id)

            # Compute directory/package for grouping
            clean_path = file_path.replace("\\", "/")
            parts = PurePosixPath(clean_path).parts if clean_path else ()
            directory = "/".join(parts[:-1]) if len(parts) > 1 else "(root)"

            rf_nodes.append({
                "id": node_id,
                "type": ntype,
                "data": {
                    **{k: v for k, v in data.items()},
                    "id": node_id,
                    "importance": importance,
                    "directory": directory,
                },
                "position": {"x": 0, "y": 0}  # Layout computed client-side
            })

        valid_node_ids = {n["id"] for n in rf_nodes}

        # ── Step 3: Collect and validate edges ────────────────────
        rf_edges: List[Dict[str, Any]] = []
        seen_edges: Set[Tuple[str, str, str]] = set()  # (src, tgt, rel_type) dedup
        edge_idx = 0

        for u, v, ed in self.graph.edges(data=True):
            # Validate: both endpoints must exist in filtered nodes
            if u not in valid_node_ids or v not in valid_node_ids:
                continue

            # No self-referencing unless genuinely recursive
            if u == v:
                continue

            rel_type = ed.get("relationship_type", "depends_on")

            # Skip "contains" edges in non-"all" views
            if rel_type == "contains" and view_mode != "all":
                continue

            # Confidence filter
            conf = ed.get("confidence", "deterministic")
            if confidence_filter and conf != confidence_filter:
                continue

            # Deduplicate edges (same source, target, and relationship type)
            edge_key = (u, v, rel_type)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)

            # Color-code edges by relationship type
            edge_color = {
                "imports": "var(--edge-imports, #3b82f6)",
                "calls": "var(--edge-calls, #22c55e)",
                "inherits": "var(--edge-inherits, #a855f7)",
                "invokes": "var(--edge-invokes, #f59e0b)",
                "contains": "var(--edge-contains, #334155)",
                "depends_on": "#6366f1",
            }.get(rel_type, "#6366f1")

            rf_edges.append({
                "id": f"edge_{edge_idx}",
                "source": u,
                "target": v,
                "label": rel_type,
                "animated": conf == "inferred",
                "type": "smoothstep",
                "style": {
                    "stroke": edge_color,
                    "strokeWidth": "1.5",
                    "strokeDasharray": "5,5" if conf == "inferred" else "",
                },
                "data": {
                    "relationshipType": rel_type,
                    "confidence": conf,
                    "line_number": ed.get("line_number"),
                    "source_module": ed.get("source_module"),
                    "imported_name": ed.get("imported_name"),
                    "callee_name": ed.get("callee_name"),
                }
            })
            edge_idx += 1

        # ── Step 4: Detect entry points and directory groups ──────
        entry_points = list(self._detect_entry_points(valid_node_ids))
        directory_groups = self._compute_directory_groups(valid_node_ids)

        # ── Step 5: Compute cycles ────────────────────────────────
        cycles = self.find_circular_dependencies()

        return {
            "nodes": rf_nodes,
            "edges": rf_edges,
            "stats": {
                "totalNodes": len(rf_nodes),
                "totalEdges": len(rf_edges),
                "circularDependencyCount": len(cycles),
                "viewMode": view_mode,
            },
            "entryPoints": entry_points,
            "directoryGroups": directory_groups,
        }
