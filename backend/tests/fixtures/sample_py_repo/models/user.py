"""User model definition."""

class BaseModel:
    """Generic base model."""
    def to_dict(self):
        return {}


class User(BaseModel):
    """User entity representing authenticated account."""
    def __init__(self, id: int, username: str, email: str, is_active: bool = True):
        self.id = id
        self.username = username
        self.email = email
        self.is_active = is_active

    def get_display_name(self) -> str:
        """Return formatted user display name."""
        return f"{self.username} <{self.email}>"
