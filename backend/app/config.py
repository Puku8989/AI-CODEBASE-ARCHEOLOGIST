from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "AI Codebase Archaeologist"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api"
    
    # Storage & Workspace
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    STORAGE_DIR: Path = BASE_DIR / "data" / "repos"
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'codebase_archaeologist.db'}"
    
    # Limits & Security
    MAX_REPO_SIZE_MB: int = 250
    MAX_FILE_SIZE_BYTES: int = 1_500_000  # 1.5 MB per source file
    CLONE_TIMEOUT_SECONDS: int = 120
    
    # Ignore Patterns
    DEFAULT_IGNORE_PATTERNS: List[str] = [
        ".git",
        ".svn",
        ".hg",
        "node_modules",
        "venv",
        ".venv",
        "env",
        ".env",
        "__pycache__",
        "dist",
        "build",
        "coverage",
        ".cache",
        ".pytest_cache",
        ".mypy_cache",
        ".next",
        ".nuxt",
        "target",  # Rust/Java target
        "vendor",  # PHP/Go vendor
        "*.min.js",
        "*.min.css",
        "*.map",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
    ]
    
    # LLM Settings (for Phase 5)
    LLM_PROVIDER: str = "ollama"
    LLM_MODEL: str = "qwen2.5-coder:3b"
    LLM_BASE_URL: str = "http://localhost:11434"
    LLM_API_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

# Ensure directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
(settings.BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
