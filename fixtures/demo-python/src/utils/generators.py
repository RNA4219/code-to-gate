"""Utility generators module."""

from typing import Generator, Iterator, List
from src.domain.order import Order

def iterate_cart_items(cart: List) -> Generator:
    """Iterate through cart items."""
    for item in cart:
        yield item

async def process_batches(items: List) -> Generator:
    """Async batch processing generator."""
    for item in items:
        yield item

def cart_summary_generator(orders: List[Order]) -> Iterator:
    """Generate cart summaries."""
    for order in orders:
        yield {"id": order.id, "count": len(order.items)}

class StreamProcessor:
    """Stream processing utility."""

    def stream_items(self, items: List):
        """Stream items as generator."""
        for item in items:
            yield item