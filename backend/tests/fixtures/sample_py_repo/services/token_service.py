"""Token management service with intentional circular import to auth_service."""
import time
from services.auth_service import AuthService


class TokenService:
    """Issues and verifies JWT-like security tokens."""
    def __init__(self):
        self.active_tokens = {}

    def issue_token(self, user_id: int, secret: str) -> str:
        """Generate simulated JWT token string."""
        now = int(time.time())
        token_str = f"tok_{user_id}_{now}_{secret[:4]}"
        self.active_tokens[token_str] = user_id
        return token_str

    def validate_token(self, token_str: str) -> bool:
        """Validate if token is in active registry."""
        return token_str in self.active_tokens
