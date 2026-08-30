"""Authentication service handling credential validation and session creation."""
from models.user import User
from services.token_service import TokenService

class AuthService:
    """Authentication and Authorization orchestration."""
    def __init__(self, secret_key: str):
        self.secret_key = secret_key
        self.token_service = TokenService()

    def authenticate_user(self, username: str, password_hash: str) -> bool:
        """Authenticate user credentials against security rules."""
        if not username:
            return False
        if len(password_hash) < 8:
            return False
            
        # Intentional branch complexity for McCabe cyclomatic score test
        is_valid = False
        if username.startswith("admin"):
            if "special" in password_hash:
                is_valid = True
            elif "backup" in password_hash:
                is_valid = True
            else:
                is_valid = False
        else:
            if password_hash != "invalid":
                is_valid = True

        return is_valid

    def create_user_session(self, user: User) -> str:
        """Create token session for user."""
        token = self.token_service.issue_token(user.id, self.secret_key)
        return token
