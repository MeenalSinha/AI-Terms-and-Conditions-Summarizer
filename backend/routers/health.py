"""
Health Router - Reports service status and available inference engines
"""
import os
import torch
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    claude_available = bool(anthropic_key and anthropic_key != "your_anthropic_api_key_here")
    cuda_available = torch.cuda.is_available()

    return {
        "status": "healthy",
        "service": "LegalCopilot API",
        "version": "1.0.0",
        "engines": {
            "claude": claude_available,
            "mistral_local": True,
            "rule_based": True,
            "cuda_available": cuda_available,
            "cuda_device": torch.cuda.get_device_name(0) if cuda_available else None,
        }
    }
