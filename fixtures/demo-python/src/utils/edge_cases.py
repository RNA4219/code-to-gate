"""Edge cases for parsing."""

# Malformed but valid Python
def    spaced_function   (   arg1   ,    arg2   )   :
    """Function with unusual spacing."""
    pass

# Decorators
@staticmethod
def static_func():
    pass

@classmethod
def class_func(cls):
    pass

@property
def prop_func(self):
    pass

@staticmethod
@classmethod
def multi_decorator():
    pass

# Multiple inheritance
class MultiInherit(BaseOne, BaseTwo, BaseThree):
    """Multiple inheritance class."""
    pass

# Nested decorators
@decorator_one
@decorator_two
class DecoratedClass:
    """Decorated class."""

    @route_decorator("/path")
    def route_method(self):
        """Route handler method."""
        pass

# Lambda assignments
simple_lambda = lambda x: x
complex_lambda = lambda x, y, z: x + y + z

# Generator expressions
def gen_expr_func():
    """Function with generator expression."""
    return (x for x in range(10))

# Try-except
def try_catch_func():
    """Function with try-catch."""
    try:
        do_something()
    except Exception as e:
        handle_error(e)
    finally:
        cleanup()

# With statement
def with_func():
    """Function with with statement."""
    with open("file.txt") as f:
        content = f.read()