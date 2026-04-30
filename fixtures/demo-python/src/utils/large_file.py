"""Large file with many symbols for testing."""

from typing import Dict, List, Optional, TypedDict
from dataclasses import dataclass

# Types
class TypeOne(TypedDict):
    field_one: str

class TypeTwo(TypedDict):
    field_two: int

class TypeThree(TypedDict):
    field_three: bool

class TypeFour(TypedDict):
    field_four: float

@dataclass
class DataClassOne:
    name: str

@dataclass
class DataClassTwo:
    value: int

@dataclass
class DataClassThree:
    enabled: bool

@dataclass
class DataClassFour:
    price: float

# Functions
def function_one():
    """Function one."""
    pass

def function_two():
    """Function two."""
    pass

def function_three():
    """Function three."""
    pass

def function_four():
    """Function four."""
    pass

def function_five():
    """Function five."""
    pass

def function_six():
    """Function six."""
    pass

def function_seven():
    """Function seven."""
    pass

def function_eight():
    """Function eight."""
    pass

def function_nine():
    """Function nine."""
    pass

def function_ten():
    """Function ten."""
    pass

def function_eleven():
    """Function eleven."""
    pass

def function_twelve():
    """Function twelve."""
    pass

async def async_function_one():
    """Async function one."""
    pass

async def async_function_two():
    """Async function two."""
    pass

# Classes
class ClassOne:
    """Class one."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

class ClassTwo:
    """Class two."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

class ClassThree:
    """Class three."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

class ClassFour:
    """Class four."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

class ClassFive:
    """Class five."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

class ClassSix:
    """Class six."""
    def method_one(self):
        pass
    def method_two(self):
        pass
    def method_three(self):
        pass

# More functions with calls
def caller_function():
    """Calls other functions."""
    function_one()
    function_two()
    ClassOne().method_one()

def nested_calls():
    """Nested calls."""
    caller_function()
    async_function_one()