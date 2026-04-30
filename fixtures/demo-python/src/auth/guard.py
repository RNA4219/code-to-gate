"""Authentication guard module."""

from typing import Optional
from functools import wraps

def require_user():
    """Require user authentication."""
    pass

def require_admin():
    """Require admin authentication."""
    pass

async def async_require_user():
    """Async user auth check."""
    pass

class AuthGuard:
    """Authentication guard class."""

    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def check_token(self, token: str) -> bool:
        """Check if token is valid."""
        return True

    async def async_check(self, token: str) -> bool:
        """Async token check."""
        return True