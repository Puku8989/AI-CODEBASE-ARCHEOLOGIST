import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
