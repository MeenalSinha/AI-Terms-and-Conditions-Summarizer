"""
Analyze Router - Core document analysis endpoints
"""

import time
import uuid
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional

from models.schemas import AnalyzeResponse, AnalyzeTextRequest, RiskDistribution
from services.ai_service import inference_service
from services.document_service import extract_text_from_pdf, clean_text, validate_document

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory cache for analyzed documents (use Redis in production)
document_cache: dict = {}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_document(
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    document_name: Optional[str] = Form("Document"),
    model_type: Optional[str] = Form("claude")
):
    """
    Analyze a Terms & Conditions document.
    Accepts either a PDF file upload or raw text.
    """
    start_time = time.time()

    try:
        # Extract text
        if file:
            if not file.filename.lower().endswith(('.pdf', '.txt', '.md')):
                raise HTTPException(400, "Only PDF, TXT, and MD files are supported.")

            content = await file.read()

            if file.filename.lower().endswith('.pdf'):
                raw_text = extract_text_from_pdf(content)
            else:
                raw_text = content.decode('utf-8', errors='ignore')

            document_name = file.filename
        elif text:
            raw_text = text
        else:
            raise HTTPException(400, "Either a file or text must be provided.")

        # Clean and validate
        cleaned_text = clean_text(raw_text)
        validation_error = validate_document(cleaned_text)
        if validation_error:
            raise HTTPException(422, validation_error)

        # Generate document ID
        doc_id = str(uuid.uuid4())

        # Run AI analysis
        logger.info(f"Starting analysis for document: {document_name} using {model_type}")
        clauses = await inference_service.analyze_clauses(cleaned_text, model_type)

        # Compute metrics
        dist = inference_service.compute_risk_distribution(clauses)
        overall_score = inference_service.compute_overall_score(clauses)
        summary = inference_service.generate_summary(clauses, cleaned_text)

        processing_time = time.time() - start_time

        response = AnalyzeResponse(
            document_id=doc_id,
            overall_risk_score=overall_score,
            risk_distribution=dist,
            clauses=clauses,
            summary=summary,
            processing_time=processing_time
        )

        # Cache for chat/export
        document_cache[doc_id] = {
            "text": cleaned_text,
            "response": response.model_dump(),
            "name": document_name
        }

        logger.info(f"Analysis complete: {len(clauses)} clauses, score={overall_score}, time={processing_time:.2f}s")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(500, f"Analysis failed: {str(e)}")


@router.post("/analyze/text", response_model=AnalyzeResponse)
async def analyze_text(request: AnalyzeTextRequest):
    """Analyze raw text input."""
    start_time = time.time()

    cleaned_text = clean_text(request.text)
    validation_error = validate_document(cleaned_text)
    if validation_error:
        raise HTTPException(422, validation_error)

    doc_id = str(uuid.uuid4())
    clauses = await inference_service.analyze_clauses(cleaned_text, request.model_type)
    dist = inference_service.compute_risk_distribution(clauses)
    overall_score = inference_service.compute_overall_score(clauses)
    summary = inference_service.generate_summary(clauses, cleaned_text)
    processing_time = time.time() - start_time

    response = AnalyzeResponse(
        document_id=doc_id,
        overall_risk_score=overall_score,
        risk_distribution=dist,
        clauses=clauses,
        summary=summary,
        processing_time=processing_time
    )

    document_cache[doc_id] = {
        "text": cleaned_text,
        "response": response.model_dump(),
        "name": request.document_name
    }

    return response


@router.get("/document/{doc_id}")
async def get_document(doc_id: str):
    """Retrieve cached document analysis."""
    if doc_id not in document_cache:
        raise HTTPException(404, "Document not found. Please re-analyze.")
    return document_cache[doc_id]["response"]
