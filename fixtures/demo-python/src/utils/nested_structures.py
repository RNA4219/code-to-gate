"""Nested structures example."""

from typing import Callable, Dict

def create_nested_processor(config: Dict):
    """Create nested processor."""
    def inner_processor(data):
        """Inner nested function."""
        return process_data(data)

    return inner_processor

def process_data(data):
    """Process data helper."""
    return {"processed": data}

arrow_function_variations = {
    "simple": lambda x: x,
    "complex": lambda x, y: x + y
}

def deep_nesting_example():
    """Deep nesting example."""
    def level_one():
        def level_two():
            def level_three():
                return "deep"
            return level_three()
        return level_two()
    return level_one()

def create_calculator():
    """Create calculator with nested functions."""
    class Calculator:
        def add(self, a, b):
            return a + b

        def subtract(self, a, b):
            return a - b

    return Calculator()

class OuterClass:
    """Outer class with nested class."""

    class InnerClass:
        """Nested inner class."""

        def inner_method(self):
            """Inner class method."""
            pass