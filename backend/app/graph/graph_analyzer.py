from typing import Dict, List, Any, Optional
import networkx as nx


class GraphAnalyzer:
    def __init__(self, graph: nx.MultiDiGraph):
        self.graph = graph

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

    def format_react_flow_payload(
        self,
        view_mode: str = "all",
        confidence_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """Convert graph into React Flow compatible node and edge structures."""
        rf_nodes = []
        rf_edges = []
        
        allowed_types = None
        if view_mode == "modules" or view_mode == "architecture":
            allowed_types = {"file", "module"}
        elif view_mode == "functions":
            allowed_types = {"function", "method", "api_route"}
        elif view_mode == "classes":
            allowed_types = {"class", "model"}
        elif view_mode == "apis":
            allowed_types = {"api_route", "function", "method"}

        # Filter nodes
        for node_id, data in self.graph.nodes(data=True):
            ntype = data.get("node_type", "unknown")
            if allowed_types and ntype not in allowed_types:
                continue

            rf_nodes.append({
                "id": node_id,
                "type": f"{ntype}Node",
                "data": {
                    **data,
                    "id": node_id,
                },
                "position": {"x": 0, "y": 0}  # Client layout computes positions
            })

        valid_node_ids = {n["id"] for n in rf_nodes}
        edge_idx = 0

        # Filter edges
        for u, v, ed in self.graph.edges(data=True):
            if u not in valid_node_ids or v not in valid_node_ids:
                continue

            conf = ed.get("confidence", "deterministic")
            if confidence_filter and conf != confidence_filter:
                continue

            rel_type = ed.get("relationship_type", "depends_on")
            if rel_type == "contains" and view_mode != "all":
                continue

            rf_edges.append({
                "id": f"edge_{edge_idx}",
                "source": u,
                "target": v,
                "label": rel_type,
                "animated": conf == "inferred",
                "style": {"strokeDasharray": "5,5"} if conf == "inferred" else {},
                "data": {
                    "relationshipType": rel_type,
                    "confidence": conf,
                    **ed
                }
            })
            edge_idx += 1

        cycles = self.find_circular_dependencies()

        return {
            "nodes": rf_nodes,
            "edges": rf_edges,
            "stats": {
                "totalNodes": len(rf_nodes),
                "totalEdges": len(rf_edges),
                "circularDependencyCount": len(cycles),
                "viewMode": view_mode
            }
        }
