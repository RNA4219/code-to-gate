"""Import variations example."""

# Basic imports
import os
import sys
import json
from typing import Dict, List

# From imports
from collections import OrderedDict
from dataclasses import dataclass

# From imports with specific symbols
from flask import Flask, request, jsonify
from fastapi import FastAPI, APIRouter, Depends

# From import with alias
from datetime import datetime as dt
from typing import Optional as Opt

# Multiple from imports
from src.domain.order import create_order, Order, OrderRequest
from src.auth.guard import require_user, require_admin

# Relative imports
from .submodule import helper_func
from ..parent import parent_func

def use_imports():
    """Function that uses imports."""
    path = os.path.getcwd()
    data = json.dumps({})
    app = Flask(__name__)
    now = dt.now()
    order = create_order({}, "user")
    return True