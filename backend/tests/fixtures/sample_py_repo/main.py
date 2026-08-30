"""Application main bootstrap file."""
import sys
from api.routes import router

APP_VERSION = "2.1.0"
DEBUG_MODE = True


def start_server(port: int = 8080):
    """Start application web listener."""
    print(f"Starting server on port {port}, version={APP_VERSION}")
    return True


if __name__ == "__main__":
    start_server()
