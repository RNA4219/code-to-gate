"""FastAPI routes example."""

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from typing import List

app = FastAPI()
router = APIRouter()

@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Hello"}

@app.post("/items")
async def create_item(item_data: dict):
    """Create item endpoint."""
    return {"created": item_data}

@app.put("/items/{item_id}")
async def update_item(item_id: str, data: dict):
    """Update item endpoint."""
    return {"updated": item_id}

@app.delete("/items/{item_id}")
async def delete_item(item_id: str):
    """Delete item endpoint."""
    return {"deleted": item_id}

@router.get("/users")
async def list_users():
    """List users route."""
    return []

@router.post("/users")
async def create_user(user_data: dict):
    """Create user route."""
    return user_data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)