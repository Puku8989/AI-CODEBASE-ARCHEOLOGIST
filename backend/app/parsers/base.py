from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


@dataclass
class ParsedSymbol:
    name: str
    qualified_name: str
    symbol_type: str  # module, class, function, method, variable, api_route, model
    start_line: int
    end_line: int
    start_col: int = 0
    end_col: int = 0
    docstring: Optional[str] = None
    signature: Optional[str] = None
    cyclomatic_complexity: Optional[int] = None
    raw_source: Optional[str] = None
    is_async: bool = False
    is_exported: bool = True
    parent_name: Optional[str] = None
    decorators: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedImport:
    source_module: str
    imported_name: str
    alias: Optional[str] = None
    is_from_import: bool = True
    line_number: int = 1


@dataclass
class ParsedCall:
    caller_name: Optional[str]  # qualified name of enclosing function/method
    callee_name: str
    line_number: int
    confidence: str = "deterministic"  # deterministic vs inferred


@dataclass
class ParsedInheritance:
    child_class_name: str
    parent_class_name: str
    line_number: int


@dataclass
class ParsedFileResult:
    path: str
    language: str
    line_count: int
    size_bytes: int
    symbols: List[ParsedSymbol] = field(default_factory=list)
    imports: List[ParsedImport] = field(default_factory=list)
    calls: List[ParsedCall] = field(default_factory=list)
    inheritances: List[ParsedInheritance] = field(default_factory=list)
    success: bool = True
    error_message: Optional[str] = None


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: str, content: str) -> ParsedFileResult:
        """Parse source code string into structured ParsedFileResult."""
        pass
