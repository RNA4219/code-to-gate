"""Domain models for orders."""

from typing import Dict, List, Optional, TypedDict
from dataclasses import dataclass
from src.db.orders import save_order, get_order_by_id

class OrderRequest(TypedDict):
    """Type definition for order request."""
    items: List[str]
    user_id: str

@dataclass
class Order:
    """Data class for order."""
    id: str
    items: List[str]
    user_id: str
    total: float

def create_order(request: OrderRequest, user: str) -> Order:
    """Create a new order."""
    order = Order(
        id="123",
        items=request["items"],
        user_id=user,
        total=0.0
    )
    save_order(order)
    return order

async def async_create_order(request: OrderRequest) -> Order:
    """Async order creation."""
    pass

def get_order(order_id: str) -> Optional[Order]:
    """Get order by ID."""
    return get_order_by_id(order_id)