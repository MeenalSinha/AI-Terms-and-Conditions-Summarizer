"""
AI Inference Service
Handles clause analysis using Anthropic Claude API as the primary engine,
with rule-based fallback for robustness.
"""

import re
import json
import time
import uuid
import logging
from typing import List, Tuple, Optional
import httpx
import os

from models.schemas import (
    AnalyzedClause, RiskLevel, ClauseCategory,
    DocumentSummary, RiskDistribution
)
from services.mistral_service import analyze_with_mistral

logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

RISK_KEYWORDS = {
    RiskLevel.CRITICAL: [
        "sell your data", "sell your personal", "share with advertisers",
        "waive your right", "class action waiver", "mandatory arbitration",
        "terminate without notice", "no refund", "irrevocable license",
        "perpetual license", "sublicense", "transfer your data",
        "monitor your communications", "access your device",
        "sell to third parties"
    ],
    RiskLevel.HIGH: [
        "share with third parties", "disclose to partners", "track your",
        "collect location", "collect biometric", "retain indefinitely",
        "modify terms at any time", "unilateral", "sole discretion",
        "without prior notice", "indemnify", "hold harmless",
        "limit liability", "no warranty", "as is", "change pricing",
        "cancel at any time"
    ],
    RiskLevel.MEDIUM: [
        "share with affiliates", "anonymized data", "aggregate data",
        "third party services", "cookies", "analytics", "marketing",
        "promotional", "opt-out", "reasonable notice", "material changes",
        "limited liability", "dispute resolution", "governing law"
    ],
    RiskLevel.LOW: [
        "protect your data", "security measures", "encryption",
        "opt in", "your consent", "right to delete", "right to access",
        "portability", "gdpr", "ccpa", "transparency", "notify you"
    ]
}

CATEGORY_PATTERNS = {
    ClauseCategory.DATA_SHARING: ["share", "disclose", "transfer", "sell", "third part"],
    ClauseCategory.DATA_COLLECTION: ["collect", "gather", "obtain", "record", "store your"],
    ClauseCategory.PRIVACY: ["privacy", "personal information", "personally identifiable"],
    ClauseCategory.ARBITRATION: ["arbitration", "class action", "dispute resolution", "waive"],
    ClauseCategory.LIABILITY: ["liability", "indemnif", "hold harmless", "warranty", "as is"],
    ClauseCategory.TERMINATION: ["terminat", "suspend", "cancel", "end your account"],
    ClauseCategory.INTELLECTUAL_PROPERTY: ["intellectual property", "copyright", "license", "content you"],
    ClauseCategory.COOKIES: ["cookie", "tracking", "pixel", "beacon", "analytics"],
    ClauseCategory.USER_RIGHTS: ["your right", "right to", "opt-out", "opt out", "request deletion"],
    ClauseCategory.PAYMENT: ["payment", "charge", "billing", "subscription", "fee", "refund"],
    ClauseCategory.CHANGES_TO_TERMS: ["change", "modify", "update", "amend", "revise"],
    ClauseCategory.JURISDICTION: ["jurisdiction", "governing law", "applicable law", "venue"],
    ClauseCategory.ACCOUNT_SECURITY: ["account", "password", "authentication", "security"],
    ClauseCategory.THIRD_PARTY: ["third-party", "third party", "partner", "affiliate", "vendor"],
    ClauseCategory.CONTENT_MODERATION: ["content", "post", "upload", "publish", "moderate"],
}


async def analyze_with_claude(clauses: List[str], full_text: str) -> List[dict]:
    """Use Anthropic Claude to analyze clauses."""
    if not ANTHROPIC_API_KEY:
        return []

    system_prompt = """You are a legal AI expert specializing in Terms & Conditions and Privacy Policy analysis. 
Your job is to analyze legal clauses and identify risks for everyday users.

For each clause provided, return a JSON array where each element has:
- category: one of [Data Collection, Data Sharing, User Rights, Intellectual Property, Termination, Liability, Arbitration, Privacy, Account Security, Payment, Content Moderation, Jurisdiction, Changes to Terms, Cookies & Tracking, Third Party Services]
- risk_level: one of [Low, Medium, High, Critical]  
- risk_score: integer 0-100
- user_impact: one sentence explaining what this means for the user
- explanation: 2-3 sentences explaining the clause in plain language
- red_flags: array of specific concerning phrases (empty if none)
- confidence: float 0-1

Return ONLY a valid JSON array, no other text."""

    clauses_text = "\n\n---\n\n".join([f"Clause {i+1}: {c}" for i, c in enumerate(clauses[:20])])

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                ANTHROPIC_API_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 4000,
                    "system": system_prompt,
                    "messages": [
                        {
                            "role": "user",
                            "content": f"Analyze these {len(clauses)} legal clauses:\n\n{clauses_text}"
                        }
                    ]
                }
            )

            if response.status_code == 200:
                data = response.json()
                text = data["content"][0]["text"]
                # Clean JSON
                text = re.sub(r'```json\s*', '', text)
                text = re.sub(r'```\s*', '', text)
                results = json.loads(text.strip())
                return results if isinstance(results, list) else []
    except Exception as e:
        logger.warning(f"Claude API call failed: {e}")

    return []


def classify_category(text: str) -> ClauseCategory:
    """Rule-based category classification."""
    text_lower = text.lower()
    scores = {}
    for cat, patterns in CATEGORY_PATTERNS.items():
        score = sum(1 for p in patterns if p in text_lower)
        if score > 0:
            scores[cat] = score
    if scores:
        return max(scores, key=scores.get)
    return ClauseCategory.USER_RIGHTS


def assess_risk_rule_based(text: str) -> Tuple[RiskLevel, int, List[str]]:
    """Rule-based risk assessment fallback."""
    text_lower = text.lower()
    found_flags = []

    for level, keywords in RISK_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                found_flags.append(kw)

    critical_count = sum(1 for kw in RISK_KEYWORDS[RiskLevel.CRITICAL] if kw in text_lower)
    high_count = sum(1 for kw in RISK_KEYWORDS[RiskLevel.HIGH] if kw in text_lower)
    medium_count = sum(1 for kw in RISK_KEYWORDS[RiskLevel.MEDIUM] if kw in text_lower)
    low_count = sum(1 for kw in RISK_KEYWORDS[RiskLevel.LOW] if kw in text_lower)

    if critical_count >= 1:
        score = min(95, 75 + critical_count * 8)
        return RiskLevel.CRITICAL, score, found_flags
    elif high_count >= 2:
        score = min(74, 55 + high_count * 5)
        return RiskLevel.HIGH, score, found_flags
    elif high_count == 1 or medium_count >= 2:
        score = min(54, 35 + medium_count * 5)
        return RiskLevel.MEDIUM, score, found_flags
    elif low_count > 0:
        score = max(5, 20 - low_count * 3)
        return RiskLevel.LOW, score, found_flags
    else:
        return RiskLevel.LOW, 15, []


IMPACT_TEMPLATES = {
    ClauseCategory.DATA_SHARING: {
        RiskLevel.CRITICAL: "Your personal data may be sold to advertisers and third parties without meaningful consent.",
        RiskLevel.HIGH: "Your data may be shared with external companies for purposes beyond the service.",
        RiskLevel.MEDIUM: "Some of your data may be shared with affiliated companies.",
        RiskLevel.LOW: "Limited data sharing occurs, primarily for service functionality."
    },
    ClauseCategory.ARBITRATION: {
        RiskLevel.CRITICAL: "You lose your right to sue in court and must use private arbitration, likely waiving class-action rights.",
        RiskLevel.HIGH: "Disputes must go through arbitration, limiting your legal options.",
        RiskLevel.MEDIUM: "Most disputes are handled through arbitration processes.",
        RiskLevel.LOW: "Standard dispute resolution procedures apply."
    },
    ClauseCategory.LIABILITY: {
        RiskLevel.CRITICAL: "The company accepts no responsibility for damages — you bear all risk.",
        RiskLevel.HIGH: "Your ability to claim compensation for damages is significantly limited.",
        RiskLevel.MEDIUM: "The company limits its liability in certain scenarios.",
        RiskLevel.LOW: "Standard liability limitations apply with reasonable protections."
    },
    ClauseCategory.TERMINATION: {
        RiskLevel.CRITICAL: "Your account can be deleted at any time without notice or reason.",
        RiskLevel.HIGH: "Your account may be suspended or terminated with minimal notice.",
        RiskLevel.MEDIUM: "Account termination is possible under defined circumstances.",
        RiskLevel.LOW: "Account termination follows fair processes with advance notice."
    },
}


def generate_user_impact(category: ClauseCategory, risk_level: RiskLevel, text: str) -> str:
    """Generate user impact statement."""
    if category in IMPACT_TEMPLATES and risk_level in IMPACT_TEMPLATES[category]:
        return IMPACT_TEMPLATES[category][risk_level]

    templates = {
        RiskLevel.CRITICAL: "This clause poses serious risks to your privacy, rights, or financial protection.",
        RiskLevel.HIGH: "This clause significantly restricts your rights or exposes you to notable risks.",
        RiskLevel.MEDIUM: "This clause has moderate implications for your rights or data.",
        RiskLevel.LOW: "This clause has minimal impact and follows standard practice."
    }
    return templates[risk_level]


def generate_explanation(text: str, category: ClauseCategory, risk_level: RiskLevel) -> str:
    """Generate plain-language explanation."""
    explanations = {
        ClauseCategory.DATA_SHARING: "This clause governs how your personal information may be shared with other parties. Review carefully to understand who can access your data and under what conditions.",
        ClauseCategory.ARBITRATION: "This clause requires you to resolve disputes through private arbitration rather than public court proceedings, which typically favors the company.",
        ClauseCategory.LIABILITY: "This clause limits the company's legal responsibility for problems that may arise from using the service, potentially leaving you without recourse.",
        ClauseCategory.TERMINATION: "This clause outlines the conditions under which your account or access to the service can be ended.",
        ClauseCategory.DATA_COLLECTION: "This clause describes what personal information the company collects about you and how it may be used.",
        ClauseCategory.PRIVACY: "This clause outlines how the company handles your private information and what privacy protections are in place.",
        ClauseCategory.INTELLECTUAL_PROPERTY: "This clause defines who owns content you create or upload, and what rights the company has to use it.",
        ClauseCategory.COOKIES: "This clause describes tracking technologies used to monitor your behavior on and off the platform.",
        ClauseCategory.USER_RIGHTS: "This clause outlines what rights you have regarding your account, data, and use of the service.",
        ClauseCategory.PAYMENT: "This clause covers billing, charges, refunds, and subscription terms.",
        ClauseCategory.CHANGES_TO_TERMS: "This clause explains how and when the company can modify these terms, and how you'll be notified.",
        ClauseCategory.JURISDICTION: "This clause determines which laws govern the agreement and where legal disputes must be settled.",
        ClauseCategory.ACCOUNT_SECURITY: "This clause outlines your responsibilities for maintaining account security.",
        ClauseCategory.THIRD_PARTY: "This clause addresses how third-party services integrated with this platform handle your data.",
        ClauseCategory.CONTENT_MODERATION: "This clause explains the company's rights to review, remove, or moderate content you post.",
    }
    base = explanations.get(category, "This clause contains legal terms that affect your rights and responsibilities as a user.")

    if risk_level == RiskLevel.CRITICAL:
        base += " This is flagged as critical — consider whether these terms are acceptable before agreeing."
    elif risk_level == RiskLevel.HIGH:
        base += " This warrants careful consideration before accepting the terms."

    return base


def extract_red_flags(text: str) -> List[str]:
    """Extract specific red flag phrases."""
    flags = []
    text_lower = text.lower()
    for kw in RISK_KEYWORDS[RiskLevel.CRITICAL]:
        if kw in text_lower:
            flags.append(kw.title())
    for kw in RISK_KEYWORDS[RiskLevel.HIGH]:
        if kw in text_lower and len(flags) < 3:
            flags.append(kw.title())
    return flags[:3]


class AIInferenceService:
    """Main AI inference service for clause analysis."""

    def segment_clauses(self, text: str) -> List[str]:
        """Segment document into meaningful clauses."""
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        # Try splitting by numbered sections
        numbered = re.split(r'\n(?=\d+\.\s+[A-Z])', text)
        if len(numbered) > 3:
            clauses = []
            for section in numbered:
                sub = re.split(r'\n(?=[a-z]\)\s)', section)
                clauses.extend(sub)
            clauses = [c.strip() for c in clauses if len(c.strip()) > 80]
            if len(clauses) >= 3:
                return clauses[:50]

        # Paragraph-based splitting
        paragraphs = re.split(r'\n\s*\n', text)
        clauses = [p.strip() for p in paragraphs if len(p.strip()) > 80]

        # If too few, split by sentences
        if len(clauses) < 3:
            sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
            chunks = []
            current = ""
            for s in sentences:
                current += " " + s
                if len(current) > 200:
                    chunks.append(current.strip())
                    current = ""
            if current:
                chunks.append(current.strip())
            clauses = [c for c in chunks if len(c) > 80]

        return clauses[:50]

    async def analyze_clauses(self, text: str, model_type: str = "claude") -> List[AnalyzedClause]:
        """Analyze all clauses in the document."""
        clauses = self.segment_clauses(text)
        logger.info(f"Segmented into {len(clauses)} clauses")

        # Try AI-powered analysis first
        ai_results = []
        if model_type == "mistral":
            try:
                ai_results = await analyze_with_mistral(clauses, text)
                logger.info(f"Got {len(ai_results)} results from Mistral local model")
            except Exception as e:
                logger.warning(f"Mistral analysis failed, using rule-based: {e}")
        elif model_type == "claude" and ANTHROPIC_API_KEY:
            try:
                ai_results = await analyze_with_claude(clauses, text)
                logger.info(f"Got {len(ai_results)} results from Claude API")
            except Exception as e:
                logger.warning(f"AI analysis failed, using rule-based: {e}")

        analyzed = []
        for i, clause_text in enumerate(clauses):
            clause_id = str(uuid.uuid4())

            if i < len(ai_results) and ai_results[i]:
                ai = ai_results[i]
                try:
                    risk_level = RiskLevel(ai.get("risk_level", "Low"))
                    category = ClauseCategory(ai.get("category", "User Rights"))
                    
                    if "risk_score" in ai:
                        risk_score = int(ai["risk_score"])
                    else:
                        risk_score_map = {RiskLevel.LOW: 20, RiskLevel.MEDIUM: 50, RiskLevel.HIGH: 80, RiskLevel.CRITICAL: 95}
                        risk_score = risk_score_map.get(risk_level, 20)
                        
                    user_impact = ai.get("user_impact", "")
                    explanation = ai.get("explanation", "")
                    
                    if "red_flags" in ai:
                        red_flags = ai["red_flags"]
                    else:
                        red_flags = extract_red_flags(clause_text)
                        
                    confidence = float(ai.get("confidence", 0.85))
                except (ValueError, TypeError):
                    risk_level, risk_score, red_flags = assess_risk_rule_based(clause_text)
                    category = classify_category(clause_text)
                    user_impact = generate_user_impact(category, risk_level, clause_text)
                    explanation = generate_explanation(clause_text, category, risk_level)
                    confidence = 0.72
            else:
                risk_level, risk_score, red_flags = assess_risk_rule_based(clause_text)
                category = classify_category(clause_text)
                user_impact = generate_user_impact(category, risk_level, clause_text)
                explanation = generate_explanation(clause_text, category, risk_level)
                red_flags = extract_red_flags(clause_text)
                confidence = 0.72

            analyzed.append(AnalyzedClause(
                id=clause_id,
                text=clause_text,
                category=category,
                risk_level=risk_level,
                risk_score=risk_score,
                user_impact=user_impact,
                explanation=explanation,
                confidence=confidence,
                red_flags=red_flags
            ))

        return analyzed

    def compute_risk_distribution(self, clauses: List[AnalyzedClause]) -> RiskDistribution:
        dist = RiskDistribution()
        for c in clauses:
            if c.risk_level == RiskLevel.LOW:
                dist.low += 1
            elif c.risk_level == RiskLevel.MEDIUM:
                dist.medium += 1
            elif c.risk_level == RiskLevel.HIGH:
                dist.high += 1
            elif c.risk_level == RiskLevel.CRITICAL:
                dist.critical += 1
        return dist

    def compute_overall_score(self, clauses: List[AnalyzedClause]) -> int:
        if not clauses:
            return 0
        weights = {RiskLevel.CRITICAL: 4, RiskLevel.HIGH: 3, RiskLevel.MEDIUM: 2, RiskLevel.LOW: 1}
        weighted_sum = sum(c.risk_score * weights[c.risk_level] for c in clauses)
        max_possible = sum(100 * weights[c.risk_level] for c in clauses)
        return int((weighted_sum / max_possible) * 100) if max_possible > 0 else 0

    def generate_summary(self, clauses: List[AnalyzedClause], text: str) -> DocumentSummary:
        score = self.compute_overall_score(clauses)
        dist = self.compute_risk_distribution(clauses)

        if score >= 70:
            risk_level = RiskLevel.CRITICAL
            verdict = "These terms pose serious risks. Consider alternatives or seek legal advice before agreeing."
        elif score >= 50:
            risk_level = RiskLevel.HIGH
            verdict = "These terms have significant concerning clauses. Read carefully before accepting."
        elif score >= 30:
            risk_level = RiskLevel.MEDIUM
            verdict = "These terms are typical but contain some clauses worth noting."
        else:
            risk_level = RiskLevel.LOW
            verdict = "These terms appear relatively user-friendly with standard protections."

        critical_clauses = [c for c in clauses if c.risk_level == RiskLevel.CRITICAL]
        high_clauses = [c for c in clauses if c.risk_level == RiskLevel.HIGH]

        key_risks = []
        for c in (critical_clauses + high_clauses)[:5]:
            key_risks.append(c.user_impact)

        safe_clauses = [c for c in clauses if c.risk_level == RiskLevel.LOW]
        safe_aspects = [c.user_impact for c in safe_clauses[:3]]

        user_rights = []
        rights_clauses = [c for c in clauses if c.category == ClauseCategory.USER_RIGHTS]
        for c in rights_clauses[:3]:
            user_rights.append(c.user_impact)

        dangerous = []
        for c in (critical_clauses + high_clauses)[:3]:
            dangerous.append(c.text[:100] + "..." if len(c.text) > 100 else c.text)

        red_flag_count = sum(len(c.red_flags) for c in clauses)

        return DocumentSummary(
            overall_risk_score=score,
            risk_level=risk_level,
            key_risks=key_risks if key_risks else ["Standard terms with typical data collection practices."],
            user_rights=user_rights if user_rights else ["Rights are not explicitly detailed in this document."],
            most_dangerous_clauses=dangerous,
            total_clauses=len(clauses),
            document_length=len(text),
            red_flag_count=red_flag_count,
            verdict=verdict,
            safe_aspects=safe_aspects if safe_aspects else ["Standard service delivery commitments."]
        )


inference_service = AIInferenceService()
