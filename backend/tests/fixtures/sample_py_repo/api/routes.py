"""API Route definitions."""
from services.auth_service import AuthService
from models.user import User

# Simulated web framework router decorators
class Router:
    def post(self, path: str):
        def decorator(f):
            return f
        return decorator

    def get(self, path: str):
        def decorator(f):
            return f
        return decorator

router = Router()
auth_service = AuthService(secret_key="topsecret123")


@router.post("/login")
def login_endpoint(username: str, password_hash: str) -> dict:
    """Handle user login request."""
    success = auth_service.authenticate_user(username, password_hash)
    if success:
        user = User(id=1, username=username, email=f"{username}@example.com")
        token = auth_service.create_user_session(user)
        return {"status": "success", "token": token}
    return {"status": "error", "message": "Invalid credentials"}


@router.get("/health")
def api_health() -> dict:
    """Check API server health."""
    return {"status": "ok"}
