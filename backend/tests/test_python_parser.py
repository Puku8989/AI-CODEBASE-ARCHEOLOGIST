from app.parsers.python_parser import PythonASTParser, compute_cyclomatic_complexity
import ast


def test_python_ast_parser_classes_and_functions():
    parser = PythonASTParser()
    code = """
class Calculator:
    \"\"\"Performs arithmetic.\"\"\"
    def add(self, a: int, b: int) -> int:
        \"\"\"Add two numbers.\"\"\"
        return a + b

def standalone_func(x: int):
    if x > 0:
        return True
    return False
"""
    result = parser.parse("calc.py", code)
    assert result.success is True
    assert len(result.symbols) >= 3

    sym_names = {s.name: s for s in result.symbols}
    assert "Calculator" in sym_names
    assert sym_names["Calculator"].symbol_type == "class"
    assert sym_names["Calculator"].docstring == "Performs arithmetic."

    assert "add" in sym_names
    assert sym_names["add"].symbol_type == "method"
    assert sym_names["add"].docstring == "Add two numbers."
    assert "a: int, b: int" in sym_names["add"].signature

    assert "standalone_func" in sym_names
    assert sym_names["standalone_func"].symbol_type == "function"
    assert sym_names["standalone_func"].cyclomatic_complexity == 2


def test_python_ast_parser_imports_and_calls():
    parser = PythonASTParser()
    code = """
import os
from math import sqrt, pi as PI_CONST

def compute_circle(r: float) -> float:
    area = PI_CONST * (r ** 2)
    print(f"Area: {area}")
    return area
"""
    result = parser.parse("circle.py", code)
    assert result.success is True
    
    # Check imports
    imports = result.imports
    assert len(imports) == 3
    
    imp_map = {i.imported_name: i for i in imports}
    assert "os" in imp_map
    assert imp_map["os"].is_from_import is False
    assert "sqrt" in imp_map
    assert "PI_CONST" in [i.alias for i in imports]

    # Check function calls
    calls = result.calls
    assert any(c.callee_name == "print" for c in calls)


def test_python_ast_parser_syntax_error_resilience():
    parser = PythonASTParser()
    malformed_code = "def broken_func(:\n    return 42"
    result = parser.parse("broken.py", malformed_code)
    
    assert result.success is False
    assert "SyntaxError" in result.error_message
    assert result.symbols == []
