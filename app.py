"""
Launcher alias for AI Codebase Archaeologist.
Allows running via `python app.py` as well as `python run.py`.
"""
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from run import main

if __name__ == "__main__":
    main()
