import tree_sitter_language_pack as tslp
from typing import List, Optional, Tuple, Set, Dict, Any
from app.parsers.base import (
    BaseParser,
    ParsedFileResult,
    ParsedSymbol,
    ParsedImport,
    ParsedCall,
    ParsedInheritance
)

# Tree-sitter node types that increment McCabe cyclomatic complexity
COMPLEXITY_NODE_TYPES = {
    "if_statement",
    "for_statement",
    "for_in_statement",
    "for_of_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "ternary_expression",
}


def get_node_text(node, source_bytes: bytes) -> str:
    """Extract string content of a tree-sitter node."""
    return source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def compute_ts_complexity(node, source_bytes: bytes) -> int:
    """Calculate cyclomatic complexity on tree-sitter subtree."""
    complexity = 1
    cursor = node.walk()
    
    visited_children = False
    while True:
        if not visited_children:
            n = cursor.node
            if n.type in COMPLEXITY_NODE_TYPES:
                complexity += 1
            elif n.type == "binary_expression":
                op_node = n.child_by_field_name("operator")
                if op_node:
                    op = get_node_text(op_node, source_bytes)
                    if op in ("&&", "||", "??"):
                        complexity += 1
            if cursor.goto_first_child():
                continue
        if cursor.goto_next_sibling():
            visited_children = False
            continue
        if not cursor.goto_parent():
            break
        visited_children = True
        
    return complexity


class TreeSitterParser(BaseParser):
    def __init__(self):
        self._js_parser = None
        self._ts_parser = None
        self._tsx_parser = None

    def _get_parser_for_lang(self, language: str, is_tsx: bool = False):
        if language in ("typescript", "ts"):
            if is_tsx:
                if not self._tsx_parser:
                    self._tsx_parser = tslp.get_parser("tsx")
                return self._tsx_parser
            if not self._ts_parser:
                self._ts_parser = tslp.get_parser("typescript")
            return self._ts_parser
        else:
            if not self._js_parser:
                self._js_parser = tslp.get_parser("javascript")
            return self._js_parser

    def parse(self, file_path: str, content: str) -> ParsedFileResult:
        is_tsx = file_path.endswith(".tsx") or file_path.endswith(".jsx")
        is_ts = file_path.endswith(".ts") or file_path.endswith(".tsx")
        lang_str = "typescript" if is_ts else "javascript"

        lines = content.splitlines(keepends=True)
        line_count = len(lines)
        source_bytes = content.encode("utf-8")
        size_bytes = len(source_bytes)

        result = ParsedFileResult(
            path=file_path,
            language=lang_str,
            line_count=line_count,
            size_bytes=size_bytes
        )

        try:
            parser = self._get_parser_for_lang(lang_str, is_tsx=is_tsx)
            tree = parser.parse(source_bytes)
        except Exception as e:
            result.success = False
            result.error_message = f"Tree-sitter parse error: {str(e)}"
            return result

        root = tree.root_node
        if root.has_error and not root.named_children:
            result.success = False
            result.error_message = "Syntax error in JavaScript/TypeScript file."
            return result

        # Walk AST
        self._walk_tree(root, source_bytes, file_path, lines, result, parent_name=None)
        return result

    def _walk_tree(
        self,
        node,
        source_bytes: bytes,
        file_path: str,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str] = None
    ):
        for child in node.children:
            ntype = child.type

            # 1. Imports
            if ntype in ("import_statement", "import_declaration"):
                self._handle_es6_import(child, source_bytes, result)
            elif ntype == "variable_declaration" or ntype == "lexical_declaration":
                self._handle_variable_declaration(child, source_bytes, lines, result, parent_name)
            
            # 2. Classes
            elif ntype in ("class_declaration", "class"):
                self._handle_class(child, source_bytes, lines, result, parent_name)
            elif ntype in ("interface_declaration",):
                self._handle_interface(child, source_bytes, lines, result, parent_name)

            # 3. Functions
            elif ntype in ("function_declaration", "function_signature", "generator_function_declaration"):
                self._handle_function(child, source_bytes, lines, result, parent_name)

            # 4. Method definitions inside classes
            elif ntype in ("method_definition",):
                self._handle_method(child, source_bytes, lines, result, parent_name)

            # 5. Expression statements (calls, require, router declarations)
            elif ntype == "expression_statement":
                self._handle_expression_statement(child, source_bytes, lines, result, parent_name)

            # 6. Export statements
            elif ntype in ("export_statement", "export_default_declaration"):
                self._walk_tree(child, source_bytes, file_path, lines, result, parent_name)

            # 7. Function Calls
            elif ntype == "call_expression":
                self._handle_call(child, source_bytes, result, caller_name=parent_name)
                # continue walking children for nested calls
                self._walk_tree(child, source_bytes, file_path, lines, result, parent_name)

            else:
                # Recurse for nested blocks
                if child.named_child_count > 0:
                    self._walk_tree(child, source_bytes, file_path, lines, result, parent_name)

    def _handle_es6_import(self, node, source_bytes: bytes, result: ParsedFileResult):
        # Find source module (string literal)
        source_module = ""
        source_node = node.child_by_field_name("source")
        if source_node:
            source_module = get_node_text(source_node, source_bytes).strip("'\"`")

        line_num = node.start_point.row + 1

        # Check import clause / specifiers
        clause = node.child_by_field_name("import")
        if not clause:
            # check children for import_clause
            for ch in node.children:
                if ch.type == "import_clause":
                    clause = ch
                    break

        if clause:
            for ch in clause.children:
                if ch.type == "identifier":
                    # default import: import X from 'y'
                    name = get_node_text(ch, source_bytes)
                    result.imports.append(
                        ParsedImport(
                            source_module=source_module,
                            imported_name=name,
                            alias=None,
                            is_from_import=True,
                            line_number=line_num
                        )
                    )
                elif ch.type == "named_imports":
                    for spec in ch.children:
                        if spec.type == "import_specifier":
                            name_node = spec.child_by_field_name("name")
                            alias_node = spec.child_by_field_name("alias")
                            if name_node:
                                imp_name = get_node_text(name_node, source_bytes)
                                alias = get_node_text(alias_node, source_bytes) if alias_node else None
                                result.imports.append(
                                    ParsedImport(
                                        source_module=source_module,
                                        imported_name=imp_name,
                                        alias=alias,
                                        is_from_import=True,
                                        line_number=line_num
                                    )
                                )
                elif ch.type == "namespace_import":
                    # import * as X from 'y'
                    alias_node = ch.child_by_field_name("alias") or ch.children[-1]
                    alias_name = get_node_text(alias_node, source_bytes)
                    result.imports.append(
                        ParsedImport(
                            source_module=source_module,
                            imported_name="*",
                            alias=alias_name,
                            is_from_import=True,
                            line_number=line_num
                        )
                    )
        elif source_module:
            # Side-effect import: import 'styles.css'
            result.imports.append(
                ParsedImport(
                    source_module=source_module,
                    imported_name="*",
                    is_from_import=False,
                    line_number=line_num
                )
            )

    def _handle_variable_declaration(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        for declarator in node.children:
            if declarator.type == "variable_declarator":
                name_node = declarator.child_by_field_name("name")
                val_node = declarator.child_by_field_name("value")

                if not name_node:
                    continue

                var_name = get_node_text(name_node, source_bytes)
                line_start = declarator.start_point.row + 1
                line_end = declarator.end_point.row + 1

                # Check CommonJS require: const x = require('y')
                if val_node and val_node.type == "call_expression":
                    func_n = val_node.child_by_field_name("function")
                    if func_n and get_node_text(func_n, source_bytes) == "require":
                        args = val_node.child_by_field_name("arguments")
                        if args and args.named_children:
                            mod = get_node_text(args.named_children[0], source_bytes).strip("'\"`")
                            result.imports.append(
                                ParsedImport(
                                    source_module=mod,
                                    imported_name=var_name,
                                    is_from_import=False,
                                    line_number=line_start
                                )
                            )

                # Check Arrow Function or Function Expression
                if val_node and val_node.type in ("arrow_function", "function_expression"):
                    qname = f"{parent_name}.{var_name}" if parent_name else var_name
                    complexity = compute_ts_complexity(val_node, source_bytes)
                    
                    # Extract signature & params
                    params_node = val_node.child_by_field_name("parameters")
                    sig = f"({get_node_text(params_node, source_bytes)})" if params_node else "()"
                    
                    raw_source = "".join(lines[line_start - 1:line_end]) if lines else None
                    docstring = self._find_leading_doc(node, source_bytes)
                    is_async = "async" in get_node_text(val_node, source_bytes)[:15]

                    result.symbols.append(
                        ParsedSymbol(
                            name=var_name,
                            qualified_name=qname,
                            symbol_type="function",
                            start_line=line_start,
                            end_line=line_end,
                            start_col=declarator.start_point.column,
                            docstring=docstring,
                            signature=sig,
                            cyclomatic_complexity=complexity,
                            raw_source=raw_source,
                            is_async=is_async,
                            parent_name=parent_name
                        )
                    )

                    # Walk body of arrow function
                    body = val_node.child_by_field_name("body")
                    if body:
                        self._walk_tree(body, source_bytes, result.path, lines, result, parent_name=qname)

    def _handle_class(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        name_node = node.child_by_field_name("name")
        if not name_node:
            return

        class_name = get_node_text(name_node, source_bytes)
        qname = f"{parent_name}.{class_name}" if parent_name else class_name
        line_start = node.start_point.row + 1
        line_end = node.end_point.row + 1
        raw_source = "".join(lines[line_start - 1:line_end]) if lines else None
        docstring = self._find_leading_doc(node, source_bytes)

        # Check heritage / extends
        bases = []
        for ch in node.children:
            if ch.type == "class_heritage":
                for clause in ch.children:
                    if clause.type in ("extends_clause", "implements_clause"):
                        for base_ident in clause.named_children:
                            base_name = get_node_text(base_ident, source_bytes)
                            bases.append(base_name)
                            result.inheritances.append(
                                ParsedInheritance(
                                    child_class_name=qname,
                                    parent_class_name=base_name,
                                    line_number=line_start
                                )
                            )

        symbol_type = "class"
        if any(b in ("Model", "BaseEntity", "Schema", "Prisma") for b in bases):
            symbol_type = "model"

        result.symbols.append(
            ParsedSymbol(
                name=class_name,
                qualified_name=qname,
                symbol_type=symbol_type,
                start_line=line_start,
                end_line=line_end,
                start_col=node.start_point.column,
                docstring=docstring,
                raw_source=raw_source,
                parent_name=parent_name,
                metadata={"bases": bases}
            )
        )

        body = node.child_by_field_name("body")
        if body:
            self._walk_tree(body, source_bytes, result.path, lines, result, parent_name=qname)

    def _handle_interface(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        name_node = node.child_by_field_name("name")
        if not name_node:
            return
        ifname = get_node_text(name_node, source_bytes)
        qname = f"{parent_name}.{ifname}" if parent_name else ifname
        line_start = node.start_point.row + 1
        line_end = node.end_point.row + 1

        result.symbols.append(
            ParsedSymbol(
                name=ifname,
                qualified_name=qname,
                symbol_type="class",
                start_line=line_start,
                end_line=line_end,
                start_col=node.start_point.column,
                docstring=self._find_leading_doc(node, source_bytes),
                parent_name=parent_name
            )
        )

    def _handle_function(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        name_node = node.child_by_field_name("name")
        if not name_node:
            return

        func_name = get_node_text(name_node, source_bytes)
        qname = f"{parent_name}.{func_name}" if parent_name else func_name
        line_start = node.start_point.row + 1
        line_end = node.end_point.row + 1
        raw_source = "".join(lines[line_start - 1:line_end]) if lines else None
        docstring = self._find_leading_doc(node, source_bytes)
        complexity = compute_ts_complexity(node, source_bytes)

        params_node = node.child_by_field_name("parameters")
        sig = get_node_text(params_node, source_bytes) if params_node else "()"
        is_async = "async" in get_node_text(node, source_bytes)[:20]

        result.symbols.append(
            ParsedSymbol(
                name=func_name,
                qualified_name=qname,
                symbol_type="function",
                start_line=line_start,
                end_line=line_end,
                start_col=node.start_point.column,
                docstring=docstring,
                signature=sig,
                cyclomatic_complexity=complexity,
                raw_source=raw_source,
                is_async=is_async,
                parent_name=parent_name
            )
        )

        body = node.child_by_field_name("body")
        if body:
            self._walk_tree(body, source_bytes, result.path, lines, result, parent_name=qname)

    def _handle_method(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        name_node = node.child_by_field_name("name")
        if not name_node:
            return

        method_name = get_node_text(name_node, source_bytes)
        qname = f"{parent_name}.{method_name}" if parent_name else method_name
        line_start = node.start_point.row + 1
        line_end = node.end_point.row + 1
        raw_source = "".join(lines[line_start - 1:line_end]) if lines else None
        docstring = self._find_leading_doc(node, source_bytes)
        complexity = compute_ts_complexity(node, source_bytes)

        params_node = node.child_by_field_name("parameters")
        sig = get_node_text(params_node, source_bytes) if params_node else "()"
        is_async = "async" in get_node_text(node, source_bytes)[:25]

        result.symbols.append(
            ParsedSymbol(
                name=method_name,
                qualified_name=qname,
                symbol_type="method",
                start_line=line_start,
                end_line=line_end,
                start_col=node.start_point.column,
                docstring=docstring,
                signature=sig,
                cyclomatic_complexity=complexity,
                raw_source=raw_source,
                is_async=is_async,
                parent_name=parent_name
            )
        )

        body = node.child_by_field_name("body")
        if body:
            self._walk_tree(body, source_bytes, result.path, lines, result, parent_name=qname)

    def _handle_expression_statement(
        self,
        node,
        source_bytes: bytes,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        for ch in node.children:
            if ch.type == "call_expression":
                # Check for Express router definitions: app.get('/path', handler) or router.post(...)
                func_node = ch.child_by_field_name("function")
                if func_node and func_node.type == "member_expression":
                    prop_node = func_node.child_by_field_name("property")
                    if prop_node:
                        prop_name = get_node_text(prop_node, source_bytes).lower()
                        if prop_name in ("get", "post", "put", "delete", "patch", "use", "all"):
                            args_node = ch.child_by_field_name("arguments")
                            if args_node and args_node.named_children:
                                route_path = get_node_text(args_node.named_children[0], source_bytes).strip("'\"`")
                                line_start = ch.start_point.row + 1
                                line_end = ch.end_point.row + 1
                                qname = f"{prop_name.upper()} {route_path}"
                                result.symbols.append(
                                    ParsedSymbol(
                                        name=f"{prop_name.upper()} {route_path}",
                                        qualified_name=qname,
                                        symbol_type="api_route",
                                        start_line=line_start,
                                        end_line=line_end,
                                        start_col=ch.start_point.column,
                                        raw_source="".join(lines[line_start - 1:line_end]) if lines else None,
                                        metadata={"method": prop_name.upper(), "path": route_path}
                                    )
                                )
                
                # Extract calls inside expression
                self._handle_call(ch, source_bytes, result, caller_name=parent_name)
                self._walk_tree(ch, source_bytes, result.path, lines, result, parent_name)

    def _handle_call(self, node, source_bytes: bytes, result: ParsedFileResult, caller_name: Optional[str]):
        func_node = node.child_by_field_name("function")
        if func_node:
            callee_text = get_node_text(func_node, source_bytes)
            # Skip noise keywords
            if callee_text not in ("require", "import", "console.log", "console.error", "console.warn"):
                result.calls.append(
                    ParsedCall(
                        caller_name=caller_name,
                        callee_name=callee_text,
                        line_number=node.start_point.row + 1,
                        confidence="deterministic"
                    )
                )

    def _find_leading_doc(self, node, source_bytes: bytes) -> Optional[str]:
        """Look for JSDoc comment immediately preceding a node."""
        prev = node.prev_sibling
        if prev and prev.type == "comment":
            txt = get_node_text(prev, source_bytes).strip()
            if txt.startswith("/**") or txt.startswith("//"):
                return txt
        return None
