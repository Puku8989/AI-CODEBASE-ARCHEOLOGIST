import os
import fnmatch
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from app.config import settings

LANGUAGE_EXTENSIONS = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".md": "markdown",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".dockerfile": "dockerfile",
    "dockerfile": "dockerfile",
}

SUPPORTED_CODE_LANGUAGES = {"python", "javascript", "typescript"}


@dataclass
class ScannedFileInfo:
    path: str  # relative path (e.g., app/main.py)
    full_path: Path
    filename: str
    extension: str
    language: str
    size_bytes: int
    line_count: int
    is_supported: bool
    is_binary: bool = False


def is_binary_file(file_path: Path) -> bool:
    """Check if file is binary by probing for null bytes in initial chunk."""
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            return b"\x00" in chunk
    except Exception:
        return True


def should_ignore(relative_path: str, ignore_patterns: List[str]) -> bool:
    """Check if path matches any ignore pattern."""
    path_parts = relative_path.replace("\\", "/").split("/")
    
    for pattern in ignore_patterns:
        # Check against parts (like node_modules, .git)
        for part in path_parts:
            if fnmatch.fnmatch(part, pattern):
                return True
        # Check against full relative path
        if fnmatch.fnmatch(relative_path.replace("\\", "/"), pattern):
            return True
    return False


class ScannerService:
    def __init__(self, custom_ignore_patterns: Optional[List[str]] = None):
        self.ignore_patterns = list(settings.DEFAULT_IGNORE_PATTERNS)
        if custom_ignore_patterns:
            self.ignore_patterns.extend(custom_ignore_patterns)

    def scan_directory(self, root_dir: Path) -> Tuple[List[ScannedFileInfo], Dict[str, float]]:
        """Walk directory tree, filter ignored/binary/oversized files, and compute language stats."""
        scanned_files: List[ScannedFileInfo] = []
        language_line_counts: Dict[str, int] = {}
        total_code_lines = 0

        for root, dirs, files in os.walk(root_dir):
            rel_root = os.path.relpath(root, root_dir)
            if rel_root == ".":
                rel_root = ""

            # In-place filter directories to avoid traversing ignored folders
            dirs[:] = [
                d for d in dirs
                if not should_ignore(f"{rel_root}/{d}" if rel_root else d, self.ignore_patterns)
            ]

            for filename in sorted(files):
                rel_path = f"{rel_root}/{filename}" if rel_root else filename
                rel_path = rel_path.replace("\\", "/")

                if should_ignore(rel_path, self.ignore_patterns):
                    continue

                full_path = Path(root) / filename
                if not full_path.is_file():
                    continue

                try:
                    size_bytes = full_path.stat().st_size
                except OSError:
                    continue

                # Skip oversized files
                if size_bytes > settings.MAX_FILE_SIZE_BYTES:
                    continue

                ext = full_path.suffix.lower()
                lang = LANGUAGE_EXTENSIONS.get(ext, LANGUAGE_EXTENSIONS.get(filename.lower(), "unknown"))
                
                # Check binary
                is_binary = is_binary_file(full_path)
                if is_binary:
                    continue

                # Count lines
                line_count = 0
                try:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                        line_count = sum(1 for _ in f)
                except Exception:
                    line_count = 0

                is_supported = lang in SUPPORTED_CODE_LANGUAGES

                info = ScannedFileInfo(
                    path=rel_path,
                    full_path=full_path,
                    filename=filename,
                    extension=ext,
                    language=lang,
                    size_bytes=size_bytes,
                    line_count=line_count,
                    is_supported=is_supported,
                    is_binary=False
                )
                scanned_files.append(info)

                if is_supported and line_count > 0:
                    language_line_counts[lang] = language_line_counts.get(lang, 0) + line_count
                    total_code_lines += line_count

        # Compute percentage breakdown
        language_percentages: Dict[str, float] = {}
        if total_code_lines > 0:
            for lang, count in language_line_counts.items():
                language_percentages[lang] = round((count / total_code_lines) * 100, 1)

        return scanned_files, language_percentages
