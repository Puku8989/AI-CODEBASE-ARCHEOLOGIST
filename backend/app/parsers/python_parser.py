import ast
from typing import List, Optional, Tuple, Set
from app.parsers.base import (
    BaseParser,
    ParsedFileResult,
    ParsedSymbol,
    ParsedImport,
    ParsedCall,
    ParsedInheritance
)


def compute_cyclomatic_complexity(node: ast.AST) -> int:
    """Calculate cyclomatic complexity (McCabe) for an AST subtree."""
    complexity = 1
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor, ast.ExceptHandler, ast.With, ast.AsyncWith, ast.Assert)):
            complexity += 1
        elif isinstance(child, ast.BoolOp):
            complexity += len(child.values) - 1
        elif isinstance(child, ast.IfExp):
            complexity += 1
    return complexity


def get_call_name(node: ast.AST) -> Optional[str]:
    """Extract callee name representation from an ast.Call node."""
    if isinstance(node, ast.Name):
        return node.id
    elif isinstance(node, ast.Attribute):
        value_str = get_call_name(node.value)
        if value_str:
            return f"{value_str}.{node.attr}"
        return node.attr
    elif isinstance(node, ast.Call):
        return get_call_name(node.func)
    return None


def get_decorator_name(node: ast.AST) -> str:
    """Format decorator expression to string."""
    if isinstance(node, ast.Name):
        return node.id
    elif isinstance(node, ast.Attribute):
        value_str = get_decorator_name(node.value)
        return f"{value_str}.{node.attr}"
    elif isinstance(node, ast.Call):
        func_name = get_decorator_name(node.func)
        return f"{func_name}()"
    return ast.unparse(node) if hasattr(ast, "unparse") else "decorator"


def format_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    """Build a clean string signature for a function or method."""
    args = []
    
    # Positional args
    for arg in node.args.args:
        arg_str = arg.arg
        if arg.annotation:
            try:
                arg_str += f": {ast.unparse(arg.annotation)}"
            except Exception:
                pass
        args.append(arg_str)
        
    # *args
    if node.args.vararg:
        args.append(f"*{node.args.vararg.arg}")
        
    # Kwonly args
    for arg in node.args.kwonlyargs:
        arg_str = arg.arg
        if arg.annotation:
            try:
                arg_str += f": {ast.unparse(arg.annotation)}"
            except Exception:
                pass
        args.append(arg_str)
        
    # **kwargs
    if node.args.kwarg:
        args.append(f"**{node.args.kwarg.arg}")
        
    sig = f"({', '.join(args)})"
    if node.returns:
        try:
            sig += f" -> {ast.unparse(node.returns)}"
        except Exception:
            pass
    return sig


class PythonASTParser(BaseParser):
    def parse(self, file_path: str, content: str) -> ParsedFileResult:
        lines = content.splitlines(keepends=True)
        line_count = len(lines)
        size_bytes = len(content.encode("utf-8"))
        
        result = ParsedFileResult(
            path=file_path,
            language="python",
            line_count=line_count,
            size_bytes=size_bytes
        )

        try:
            tree = ast.parse(content, filename=file_path)
        except SyntaxError as e:
            result.success = False
            result.error_message = f"SyntaxError at line {e.lineno}, col {e.offset}: {e.msg}"
            return result
        except Exception as e:
            result.success = False
            result.error_message = f"Parse error: {str(e)}"
            return result

        # Extract Module docstring
        module_doc = ast.get_docstring(tree)
        if module_doc:
            result.symbols.append(
                ParsedSymbol(
                    name="__doc__",
                    qualified_name=f"{file_path}::__doc__",
                    symbol_type="module",
                    start_line=1,
                    end_line=min(10, line_count),
                    docstring=module_doc,
                    raw_source=module_doc
                )
            )

        # Traverse AST
        self._extract_elements(tree, file_path, lines, result, parent_name=None)
        return result

    def _extract_elements(
        self,
        node: ast.AST,
        file_path: str,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str] = None
    ):
        for stmt in getattr(node, "body", []):
            if isinstance(stmt, ast.Import):
                for alias in stmt.names:
                    result.imports.append(
                        ParsedImport(
                            source_module=alias.name,
                            imported_name=alias.name,
                            alias=alias.asname,
                            is_from_import=False,
                            line_number=stmt.lineno
                        )
                    )
            elif isinstance(stmt, ast.ImportFrom):
                module_name = stmt.module or ""
                if stmt.level > 0:
                    module_name = "." * stmt.level + module_name
                for alias in stmt.names:
                    result.imports.append(
                        ParsedImport(
                            source_module=module_name,
                            imported_name=alias.name,
                            alias=alias.asname,
                            is_from_import=True,
                            line_number=stmt.lineno
                        )
                    )
            elif isinstance(stmt, ast.ClassDef):
                self._process_class(stmt, file_path, lines, result, parent_name)
            elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                self._process_function(stmt, file_path, lines, result, parent_name)
            elif isinstance(stmt, ast.Assign) and parent_name is None:
                # Top level constants/variables
                self._process_assign(stmt, file_path, lines, result)

    def _process_class(
        self,
        node: ast.ClassDef,
        file_path: str,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        start_line = node.lineno
        end_line = getattr(node, "end_lineno", start_line)
        raw_source = "".join(lines[start_line - 1:end_line]) if lines else None
        
        qname = f"{parent_name}.{node.name}" if parent_name else node.name
        docstring = ast.get_docstring(node)
        
        # Determine symbol type (model if inherits from Base/Model/BaseModel)
        bases_names = []
        for base in node.bases:
            b_name = None
            if isinstance(base, ast.Name):
                b_name = base.id
            elif isinstance(base, ast.Attribute):
                b_name = f"{ast.unparse(base.value)}.{base.attr}" if hasattr(ast, "unparse") else base.attr
            if b_name:
                bases_names.append(b_name)
                result.inheritances.append(
                    ParsedInheritance(
                        child_class_name=qname,
                        parent_class_name=b_name,
                        line_number=node.lineno
                    )
                )

        symbol_type = "class"
        if any(b in ["Base", "Model", "DeclarativeBase", "BaseModel", "db.Model"] for b in bases_names):
            symbol_type = "model"

        decorators = [get_decorator_name(d) for d in node.decorator_list]
        
        result.symbols.append(
            ParsedSymbol(
                name=node.name,
                qualified_name=qname,
                symbol_type=symbol_type,
                start_line=start_line,
                end_line=end_line,
                start_col=node.col_offset,
                docstring=docstring,
                raw_source=raw_source,
                parent_name=parent_name,
                decorators=decorators,
                metadata={"bases": bases_names}
            )
        )

        # Process methods and nested classes
        self._extract_elements(node, file_path, lines, result, parent_name=qname)

    def _process_function(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        file_path: str,
        lines: List[str],
        result: ParsedFileResult,
        parent_name: Optional[str]
    ):
        start_line = node.lineno
        end_line = getattr(node, "end_lineno", start_line)
        raw_source = "".join(lines[start_line - 1:end_line]) if lines else None
        
        qname = f"{parent_name}.{node.name}" if parent_name else node.name
        docstring = ast.get_docstring(node)
        signature = format_signature(node)
        complexity = compute_cyclomatic_complexity(node)
        is_async = isinstance(node, ast.AsyncFunctionDef)
        
        decorators = [get_decorator_name(d) for d in node.decorator_list]
        
        # Check if API endpoint (FastAPI/Flask decorators)
        symbol_type = "method" if parent_name else "function"
        for dec in decorators:
            dec_lower = dec.lower()
            if any(method in dec_lower for method in [".get(", ".post(", ".put(", ".delete(", ".patch(", "@app.route", "@router."]):
                symbol_type = "api_route"
                break

        result.symbols.append(
            ParsedSymbol(
                name=node.name,
                qualified_name=qname,
                symbol_type=symbol_type,
                start_line=start_line,
                end_line=end_line,
                start_col=node.col_offset,
                docstring=docstring,
                signature=signature,
                cyclomatic_complexity=complexity,
                raw_source=raw_source,
                is_async=is_async,
                parent_name=parent_name,
                decorators=decorators
            )
        )

        # Extract function calls inside function body
        for child in ast.walk(node):
            if isinstance(child, ast.Call):
                callee_name = get_call_name(child.func)
                if callee_name:
                    result.calls.append(
                        ParsedCall(
                            caller_name=qname,
                            callee_name=callee_name,
                            line_number=getattr(child, "lineno", start_line),
                            confidence="deterministic"
                        )
                    )

    def _process_assign(
        self,
        node: ast.Assign,
        file_path: str,
        lines: List[str],
        result: ParsedFileResult
    ):
        for target in node.targets:
            if isinstance(target, ast.Name) and (target.id.isupper() or not target.id.startswith("_")):
                raw_source = lines[node.lineno - 1].strip() if lines and node.lineno <= len(lines) else None
                result.symbols.append(
                    ParsedSymbol(
                        name=target.id,
                        qualified_name=target.id,
                        symbol_type="variable",
                        start_line=node.lineno,
                        end_line=getattr(node, "end_lineno", node.lineno),
                        start_col=node.col_offset,
                        raw_source=raw_source
                    )
                )
