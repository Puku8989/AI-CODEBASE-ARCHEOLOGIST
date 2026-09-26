import os
import sys
import threading
import webbrowser
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

def launch_browser():
    try:
        webbrowser.open("http://127.0.0.1:8000")
    except Exception:
        pass

def main():
    import uvicorn
    print("\n" + "=" * 60)
    print(" 🏛️ AI Codebase Archaeologist is starting...")
    print(" 🌐 Web UI: http://127.0.0.1:8000")
    print(" 📚 API Docs: http://127.0.0.1:8000/docs")
    print("=" * 60 + "\n")
    # Launch browser automatically after a short delay
    threading.Timer(1.2, launch_browser).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()

