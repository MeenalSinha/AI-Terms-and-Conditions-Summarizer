"""
Compare Router - Document comparison endpoint
"""

import logging
from fastapi import APIRouter, HTTPException
from models.schemas import CompareRequest, ComparisonResult
from services.ai_service import inference_service
from services.document_service import clean_text
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)


class CompareRequestExt(CompareRequest):
    model_type: Optional[str] = "rule_based"


@router.post("/compare", response_model=ComparisonResult)
async def compare_documents(request: CompareRequestExt):
    """Compare two T&C documents and determine which is safer."""
    try:
        text_a = clean_text(request.document_a_text)
        text_b = clean_text(request.document_b_text)

        clauses_a = await inference_service.analyze_clauses(text_a, request.model_type)
        clauses_b = await inference_service.analyze_clauses(text_b, request.model_type)

        score_a = inference_service.compute_overall_score(clauses_a)
        score_b = inference_service.compute_overall_score(clauses_b)

        safer = request.document_a_name if score_a < score_b else request.document_b_name

        # Build comparison points
        categories = set(c.category for c in clauses_a + clauses_b)
        comparison_points = []
        category_comparison = {}

        for cat in list(categories)[:10]:
            cat_clauses_a = [c for c in clauses_a if c.category == cat]
            cat_clauses_b = [c for c in clauses_b if c.category == cat]

            avg_a = sum(c.risk_score for c in cat_clauses_a) / len(cat_clauses_a) if cat_clauses_a else None
            avg_b = sum(c.risk_score for c in cat_clauses_b) / len(cat_clauses_b) if cat_clauses_b else None

            category_comparison[cat.value] = {
                "doc_a_score": round(avg_a) if avg_a is not None else None,
                "doc_b_score": round(avg_b) if avg_b is not None else None,
                "safer": request.document_a_name if (avg_a or 100) < (avg_b or 100) else request.document_b_name
            }

            if avg_a is not None and avg_b is not None:
                winner = request.document_a_name if avg_a < avg_b else request.document_b_name
                comparison_points.append({
                    "category": cat.value,
                    "doc_a_score": round(avg_a),
                    "doc_b_score": round(avg_b),
                    "winner": winner,
                    "difference": abs(round(avg_a) - round(avg_b))
                })

        comparison_points.sort(key=lambda x: x["difference"], reverse=True)

        if score_a < score_b:
            explanation = (
                f"{request.document_a_name} is safer with a risk score of {score_a} "
                f"compared to {score_b} for {request.document_b_name}. "
                f"It has fewer high-risk clauses in critical categories."
            )
        else:
            explanation = (
                f"{request.document_b_name} is safer with a risk score of {score_b} "
                f"compared to {score_a} for {request.document_a_name}. "
                f"It offers better protections across key categories."
            )

        return ComparisonResult(
            document_a_score=score_a,
            document_b_score=score_b,
            safer_document=safer,
            comparison_points=comparison_points,
            winner_explanation=explanation,
            category_comparison=category_comparison
        )

    except Exception as e:
        logger.error(f"Comparison failed: {e}", exc_info=True)
        raise HTTPException(500, f"Comparison failed: {str(e)}")
