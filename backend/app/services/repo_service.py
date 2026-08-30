import re
import shutil
from pathlib import Path
from typing import Tuple, Optional
import git
from app.config import settings


def validate_repo_url(url: str) -> bool:
    """Validate that repository URL is a legitimate git/github/gitlab URL and safe from injection."""
    if not url:
        return False
    
    # Block dangerous protocols
    if url.startswith("file://") or url.startswith("ext::") or url.startswith("ftp://"):
        return False
        
    # Match standard HTTP(S) and SSH Git URLs
    http_pattern = r"^(https?:\/\/)?(www\.)?(github\.com|gitlab\.com|bitbucket\.org)\/[\w.-]+\/[\w.-]+(\.git)?(\/)?$"
    ssh_pattern = r"^git@(github\.com|gitlab\.com|bitbucket\.org):[\w.-]+\/[\w.-]+(\.git)?$"
    generic_git = r"^https?:\/\/[\w.-]+(\.[\w.-]+)+\/[\w.-]+\/[\w.-]+(\.git)?$"

    return bool(re.match(http_pattern, url) or re.match(ssh_pattern, url) or re.match(generic_git, url))


def extract_repo_name(url: Optional[str], local_path: Optional[str]) -> str:
    """Derive repository name from URL or local path."""
    if url:
        cleaned = url.rstrip("/").rstrip(".git")
        return cleaned.split("/")[-1]
    if local_path:
        return Path(local_path).name
    return "unnamed-repo"


class RepoService:
    @staticmethod
    def prepare_repo_storage(repo_id: str) -> Path:
        """Create and return clean storage directory for repo."""
        repo_dir = settings.STORAGE_DIR / repo_id
        if repo_dir.exists():
            shutil.rmtree(repo_dir, ignore_errors=True)
        repo_dir.mkdir(parents=True, exist_ok=True)
        return repo_dir

    @staticmethod
    def clone_repository(url: str, target_dir: Path) -> Tuple[str, str]:
        """Clone git repo into target_dir with depth=1 for fast analysis. Returns (branch, commit_hash)."""
        if not validate_repo_url(url):
            raise ValueError(f"Invalid or untrusted repository URL: {url}")

        try:
            repo = git.Repo.clone_from(
                url,
                str(target_dir),
                depth=1,
                multi_options=["--single-branch"]
            )
            branch = repo.active_branch.name if repo.active_branch else "main"
            commit = repo.head.commit.hexsha if repo.head else ""
            return branch, commit
        except Exception as e:
            raise RuntimeError(f"Git clone failed: {str(e)}")

    @staticmethod
    def copy_local_repository(source_path: str, target_dir: Path) -> Tuple[str, str]:
        """Ingest local repository path safely."""
        src = Path(source_path).resolve()
        if not src.exists() or not src.is_dir():
            raise ValueError(f"Local path does not exist or is not a directory: {source_path}")

        # Copy files excluding giant node_modules/venv if possible
        def ignore_patterns(dirpath, contents):
            ignored = set()
            for item in contents:
                if item in [".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build"]:
                    ignored.add(item)
            return ignored

        shutil.copytree(src, target_dir, dirs_exist_ok=True, ignore=ignore_patterns)

        # Check if local repo had git
        branch = "main"
        commit = ""
        try:
            if (src / ".git").exists():
                local_repo = git.Repo(src)
                branch = local_repo.active_branch.name if not local_repo.head.is_detached else "detached"
                commit = local_repo.head.commit.hexsha
        except Exception:
            pass

        return branch, commit

    @staticmethod
    def delete_repo_storage(repo_id: str):
        """Remove cloned files for deleted repo."""
        repo_dir = settings.STORAGE_DIR / repo_id
        if repo_dir.exists():
            shutil.rmtree(repo_dir, ignore_errors=True)
