"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


class RiskLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    CRITICAL = "Critical"


class ClauseCategory(str, Enum):
    DATA_COLLECTION = "Data Collection"
    DATA_SHARING = "Data Sharing"
    USER_RIGHTS = "User Rights"
    INTELLECTUAL_PROPERTY = "Intellectual Property"
    TERMINATION = "Termination"
    LIABILITY = "Liability"
    ARBITRATION = "Arbitration"
    PRIVACY = "Privacy"
    ACCOUNT_SECURITY = "Account Security"
    PAYMENT = "Payment"
    CONTENT_MODERATION = "Content Moderation"
    JURISDICTION = "Jurisdiction"
    CHANGES_TO_TERMS = "Changes to Terms"
    COOKIES = "Cookies & Tracking"
    THIRD_PARTY = "Third Party Services"


class AnalyzedClause(BaseModel):
    id: str
    text: str
    category: ClauseCategory
    risk_level: RiskLevel
    risk_score: int = Field(ge=0, le=100)
    user_impact: str
    explanation: str
    confidence: float = Field(ge=0.0, le=1.0)
    start_char: int = 0
    end_char: int = 0
    red_flags: List[str] = []


class RiskDistribution(BaseModel):
    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0


class DocumentSummary(BaseModel):
    overall_risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    key_risks: List[str]
    user_rights: List[str]
    most_dangerous_clauses: List[str]
    total_clauses: int
    document_length: int
    red_flag_count: int
    verdict: str
    safe_aspects: List[str]


class AnalyzeResponse(BaseModel):
    document_id: str
    overall_risk_score: int
    risk_distribution: RiskDistribution
    clauses: List[AnalyzedClause]
    summary: DocumentSummary
    processing_time: float


class AnalyzeTextRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    text: str
    document_name: Optional[str] = "Pasted Document"
    model_type: Optional[str] = "claude"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    document_context: Optional[str] = None
    conversation_history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    relevant_clauses: List[str] = []
    confidence: float = 0.9


class CompareRequest(BaseModel):
    document_a_text: str
    document_b_text: str
    document_a_name: Optional[str] = "Document A"
    document_b_name: Optional[str] = "Document B"


class ComparisonResult(BaseModel):
    document_a_score: int
    document_b_score: int
    safer_document: str
    comparison_points: List[Dict[str, Any]]
    winner_explanation: str
    category_comparison: Dict[str, Dict[str, Any]]
