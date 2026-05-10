"""
ToS;DR Legal Clause Analyzer v2.0 — Mistral-7B QLoRA (Production-Grade)

Full-pipeline fine-tuning of Mistral-7B-Instruct on Terms of Service &
Privacy Policy data.

Dataset : meenalsinha/terms-of-service-didnt-read-tosdr (Kaggle)
Model   : mistral-ai/mistral — pytorch/7b-instruct-v0.1-hf (Kaggle offline)
Hardware: Kaggle T4 ×2 or P100 (16 GB VRAM recommended)
"""

# ===========================================================================
# 1. Environment Setup
# ===========================================================================
import subprocess
import sys

packages = [
    "transformers>=4.40.0,<4.46.0",  # >=4.41 needed by sentence-transformers; <4.46 keeps trl==0.8.6 happy
    "datasets==2.18.0",
    "peft==0.10.0",
    "bitsandbytes>=0.43.3",
    "accelerate>=0.29.3",
    "trl==0.8.6",
    "einops",
    "rouge-score",
    "nltk",
    "scipy",
]

for pkg in packages:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", pkg], check=True)

# Force-reinstall bitsandbytes so the CUDA-enabled wheel is active in this
# process (a cached CPU-only build from a prior run won't satisfy bnb's own
# GPU check even if a newer version is nominally installed).
subprocess.run(
    [sys.executable, "-m", "pip", "install", "-q", "--force-reinstall",
     "--no-deps", "bitsandbytes"],
    check=True,
)
# Reload the module so the running interpreter picks up the new shared library.
import importlib, bitsandbytes as _bnb; importlib.reload(_bnb)

import nltk
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)

print("✅ All packages installed.")


# ===========================================================================
# 2. Import Libraries
# ===========================================================================
import os
import gc
import re
import json
import warnings
import random

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from copy import deepcopy
from collections import Counter

import torch
from nltk.tokenize import sent_tokenize

from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    PeftModel,
)
from trl import SFTTrainer
from datasets import Dataset as HFDataset, DatasetDict
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    confusion_matrix,
    f1_score,
)
from rouge_score import rouge_scorer

warnings.filterwarnings("ignore")
pd.set_option("display.max_colwidth", 150)

# Suppress tokenizers fork warning
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# ── Device ────────────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🖥️  Device : {DEVICE}")
if DEVICE == "cuda":
    print(f"   GPU    : {torch.cuda.get_device_name(0)}")
    print(f"   VRAM   : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# ── Seeds ─────────────────────────────────────────────────────────────────────
SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

# ── Global paths ──────────────────────────────────────────────────────────────
# Dataset — Kaggle input: meenalsinha/terms-of-service-didnt-read-tosdr
DATA_DIR = Path("/kaggle/input/datasets/meenal1710/terms-of-service-didnt-read-tosdr")

# Model — Kaggle input: mistral-ai/mistral/pytorch/7b-instruct-v0.1-hf/1
MODEL_DIR = Path("/kaggle/input/models/mistral-ai/mistral/pytorch/7b-instruct-v0.1-hf/1")

# Output
OUTPUT_DIR = Path("/kaggle/working/tos_mistral_v2")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_SEQ_LEN = 512

# Verify inputs are present
print("📁 Verifying Kaggle input paths...")
assert DATA_DIR.exists(),  f"❌ Dataset not found: {DATA_DIR}"
assert MODEL_DIR.exists(), f"❌ Model not found: {MODEL_DIR}"
print(f"  ✅ Dataset : {DATA_DIR}")
print(f"  ✅ Model   : {MODEL_DIR}")
print(f"  ✅ Output  : {OUTPUT_DIR}")
print("✅ Setup complete.")


# ===========================================================================
# 3. Full Relational Dataset Load
# ===========================================================================
def load_csv(path, name):
    if not path.exists():
        print(f"  ⚠️  {name}: NOT FOUND — {path}")
        return pd.DataFrame()
    df = pd.read_csv(path, low_memory=False)
    df.columns = [c.lower().strip() for c in df.columns]
    print(f"  ✅ {name:12s}: {df.shape[0]:>6,} rows | cols: {list(df.columns)}")
    return df


print("📂 Loading ToS;DR tables...")
docs_df     = load_csv(DATA_DIR / "documents.csv", "documents")
cases_df    = load_csv(DATA_DIR / "cases.csv",     "cases")
points_df   = load_csv(DATA_DIR / "points.csv",    "points")
topics_df   = load_csv(DATA_DIR / "topics.csv",    "topics")
services_df = load_csv(DATA_DIR / "services.csv",  "services")

assert not points_df.empty, "points.csv failed to load — check DATA_DIR path"


# ── Normalise ID columns across versions ─────────────────────────────────────
def first_col(df, candidates):
    """Return first matching column name from a list of candidates."""
    for c in candidates:
        if c in df.columns:
            return c
    return None


def full_relational_merge(points, cases, topics, services, documents):
    """
    Build a unified training DataFrame by joining all five tables.
    Returns columns: clause_text, label, topic, category_slug,
                     case_description, service_name, doc_type
    """
    df = points.copy()

    # ── 1. Rename core point columns ─────────────────────────────────────────
    alias = {
        # clause text
        "quotetext":  "clause_text",
        "quote_text": "clause_text",
        "quote":      "clause_text",
        "text":       "clause_text",
        # label
        "tosdr_class":    "label",
        "status":         "label",
        "rating":         "label",
        "classification": "label",
        # foreign keys
        "topicid":    "topic_id",
        "serviceid":  "service_id",
        "caseid":     "case_id",
        "documentid": "document_id",
    }
    df.rename(columns={k: v for k, v in alias.items() if k in df.columns}, inplace=True)

    # ── 2. Merge topics ───────────────────────────────────────────────────────
    if not topics.empty:
        tid   = first_col(topics, ["id", "topic_id"])
        tname = first_col(topics, ["title", "name", "topic"])
        tslug = first_col(topics, ["slug", "keyword", "category"])
        if tid and tname:
            topic_map = topics.set_index(tid)[tname].to_dict()
            df["topic"] = df.get("topic_id", pd.Series(dtype=str)).map(topic_map)
            if tslug:
                slug_map = topics.set_index(tid)[tslug].to_dict()
                df["topic_slug"] = df.get("topic_id", pd.Series(dtype=str)).map(slug_map)
            print("  ✅ Topics merged")

    # ── 3. Merge cases (adds legal description) ───────────────────────────────
    if not cases.empty:
        cases_c = cases.copy()
        cid    = first_col(cases_c, ["id", "case_id"])
        cdesc  = first_col(cases_c, ["description", "text", "title", "summary"])
        ctitle = first_col(cases_c, ["title", "name"])
        if cid and cdesc:
            cases_c = cases_c.rename(columns={cid: "case_id", cdesc: "case_description"})
            keep_case_cols = ["case_id", "case_description"]
            if ctitle and ctitle != cdesc:
                cases_c = cases_c.rename(columns={ctitle: "case_title"})
                keep_case_cols.append("case_title")
            if "case_id" in df.columns:
                df = df.merge(cases_c[keep_case_cols], on="case_id", how="left")
                print("  ✅ Cases merged (added legal descriptions)")

    # ── 4. Merge services ─────────────────────────────────────────────────────
    if not services.empty:
        svc  = services.copy()
        sid  = first_col(svc, ["id", "service_id"])
        snam = first_col(svc, ["name", "title"])
        scty = first_col(svc, ["country", "jurisdiction"])
        if sid and snam:
            svc = svc.rename(columns={sid: "service_id", snam: "service_name"})
            keep_svc = ["service_id", "service_name"]
            if scty:
                svc = svc.rename(columns={scty: "service_country"})
                keep_svc.append("service_country")
            if "service_id" in df.columns:
                df = df.merge(svc[keep_svc], on="service_id", how="left")
                print("  ✅ Services merged (added company names)")

    # ── 5. Merge documents (adds doc_type) ────────────────────────────────────
    if not documents.empty:
        ddocs = documents.copy()
        did   = first_col(ddocs, ["id", "document_id"])
        dtype = first_col(ddocs, ["type", "doc_type", "document_type"])
        if did and dtype:
            ddocs = ddocs.rename(columns={did: "document_id", dtype: "doc_type"})
            if "document_id" in df.columns:
                df = df.merge(ddocs[["document_id", "doc_type"]], on="document_id", how="left")
                print("  ✅ Documents merged (added doc type)")

    # ── 6. Fill defaults ──────────────────────────────────────────────────────
    for col, default in [
        ("topic",            "General Terms"),
        ("topic_slug",       "general"),
        ("case_description", ""),
        ("case_title",       ""),
        ("service_name",     "Unknown Service"),
        ("service_country",  "Unknown"),
        ("doc_type",         "terms-of-service"),
    ]:
        if col not in df.columns:
            df[col] = default
        else:
            df[col] = df[col].fillna(default)

    return df


print("\n🔗 Running full relational merge...")
merged_df = full_relational_merge(points_df, cases_df, topics_df, services_df, docs_df)
print(f"\n📊 Merged dataset: {merged_df.shape[0]:,} rows × {merged_df.shape[1]} cols")
print(merged_df.head(3))


# ===========================================================================
# 4. Category Taxonomy & Risk Mapping
# ===========================================================================
CATEGORY_KEYWORDS = {
    "data_collection":      ["collect", "gather", "cookie", "track", "monitor", "sensor",
                              "location", "device", "browser", "analytics", "log", "usage"],
    "data_sharing":         ["share", "third party", "third-party", "advertis", "partner",
                              "sell", "transfer", "disclose", "provide to", "give to"],
    "account_termination":  ["terminat", "suspend", "delete account", "cancel", "ban",
                              "deactivat", "close account", "removal"],
    "arbitration":          ["arbitrat", "class action", "dispute", "lawsuit", "litigation",
                              "legal action", "court", "waive", "jury"],
    "auto_renewal":         ["renew", "subscription", "billing", "charge", "payment",
                              "automatically", "recurring", "fee", "invoice"],
    "liability":            ["liabilit", "warrant", "indemnif", "disclaim", "as-is",
                              "no guarantee", "not responsible", "damages"],
    "intellectual_property":["copyright", "intellectual property", "license", "ownership",
                              "content you", "your content", "royalt", "trademark"],
    "user_rights":          ["gdpr", "right to", "opt-out", "opt out", "withdraw",
                              "portabilit", "erasure", "forget", "consent", "access"],
}

LABEL_TO_RISK = {
    "good":     "Low",
    "neutral":  "Medium",
    "bad":      "High",
    "blocker":  "Critical",
    "0": "Low",  "1": "Medium",  "2": "High",  "3": "Critical",
    "-1": "Low", "approved": "Low", "pending": "Medium", "declined": "High",
}

RISK_ORDER = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}


def classify_category(text, topic_str=""):
    """
    Assign canonical category by keyword matching on clause text + topic string.
    Returns the best-matching category slug.
    """
    combined = (text + " " + topic_str).lower()
    scores = {}
    for cat, kws in CATEGORY_KEYWORDS.items():
        scores[cat] = sum(kw in combined for kw in kws)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general_terms"


CATEGORY_DISPLAY = {
    "data_collection":       "Data Collection",
    "data_sharing":          "Data Sharing",
    "account_termination":   "Account Termination",
    "arbitration":           "Arbitration & Disputes",
    "auto_renewal":          "Auto-Renewal & Billing",
    "liability":             "Liability & Warranty",
    "intellectual_property": "Intellectual Property",
    "user_rights":           "User Rights",
    "general_terms":         "General Terms",
}

print(f"✅ {len(CATEGORY_KEYWORDS)} canonical categories defined")
print(f"   Categories: {list(CATEGORY_KEYWORDS.keys())}")


# ===========================================================================
# 5. Data Cleaning & Clause Segmentation Pipeline
# ===========================================================================
def clean_and_segment(df):
    """
    Full cleaning + segmentation pipeline.
    Returns a clean DataFrame with one row per training-worthy clause.
    """
    # ── Step 1: require clause_text and label ──────────────────────────────
    df = df.dropna(subset=[c for c in ["clause_text", "label"] if c in df.columns])
    if "clause_text" not in df.columns:
        raise ValueError("No clause_text column found after merging. Check column aliases.")

    # ── Step 2: map risk labels ────────────────────────────────────────────
    df["label_clean"] = df["label"].astype(str).str.lower().str.strip()
    df["risk_level"]  = df["label_clean"].map(LABEL_TO_RISK)
    df = df.dropna(subset=["risk_level"])

    # ── Step 3: normalize text ────────────────────────────────────────────
    df["clause_text"] = (
        df["clause_text"]
        .astype(str)
        .str.strip()
        .str.replace(r"[\r\n\t]+", " ", regex=True)
        .str.replace(r" {2,}", " ", regex=True)
    )

    # ── Step 4: sentence segmentation ────────────────────────────────────
    records = []
    for _, row in df.iterrows():
        full_text  = row["clause_text"]
        risk       = row["risk_level"]
        topic      = str(row.get("topic", "General Terms"))
        case_desc  = str(row.get("case_description", ""))
        case_title = str(row.get("case_title", ""))
        service    = str(row.get("service_name", "Unknown Service"))
        doc_type   = str(row.get("doc_type", "terms-of-service"))

        # Always include the full clause as a training example
        sentences = [full_text]
        # Also try sentence splitting for longer texts
        if len(full_text) > 150:
            try:
                sents = sent_tokenize(full_text)
                for s in sents:
                    s = s.strip()
                    word_count = len(s.split())
                    if 20 <= len(s) <= 600 and word_count >= 5 and s != full_text:
                        sentences.append(s)
            except Exception:
                pass

        for sent in sentences:
            if len(sent) < 20 or len(sent.split()) < 5:
                continue
            canon_cat = classify_category(sent, topic)
            records.append({
                "clause_text":    sent,
                "risk_level":     risk,
                "topic":          topic,
                "category":       canon_cat,
                "category_label": CATEGORY_DISPLAY[canon_cat],
                "case_description": case_desc,
                "case_title":     case_title,
                "service_name":   service,
                "doc_type":       doc_type,
            })

    clean = pd.DataFrame(records)
    clean = clean.drop_duplicates(subset=["clause_text"])
    clean = clean.reset_index(drop=True)
    return clean


print("⏳ Running cleaning + segmentation pipeline...")
clean_df = clean_and_segment(merged_df)

print(f"\n✅ Clean dataset: {len(clean_df):,} clause records")
print("\n📊 Risk level distribution:")
print(clean_df["risk_level"].value_counts())
print("\n📊 Category distribution:")
print(clean_df["category"].value_counts())

# ── Visualise distributions ───────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(14, 4))

risk_colors = {"Low": "#2ecc71", "Medium": "#f39c12", "High": "#e74c3c", "Critical": "#8e44ad"}
risk_counts = clean_df["risk_level"].value_counts().reindex(["Low","Medium","High","Critical"])
axes[0].bar(risk_counts.index, risk_counts.values,
            color=[risk_colors[r] for r in risk_counts.index])
axes[0].set_title("Risk Level Distribution", fontweight="bold")
axes[0].set_ylabel("Count")
for i, v in enumerate(risk_counts.values):
    axes[0].text(i, v + 20, str(v), ha="center", fontsize=9)

cat_counts = clean_df["category"].value_counts()
axes[1].barh(cat_counts.index, cat_counts.values, color="#3498db")
axes[1].set_title("Category Distribution", fontweight="bold")
axes[1].set_xlabel("Count")

plt.tight_layout()
plt.savefig(OUTPUT_DIR / "dataset_distributions.png", dpi=120, bbox_inches="tight")
plt.show()
print("✅ Distribution plots saved.")


# ===========================================================================
# 5b. Dataset Statistics
# ===========================================================================
def print_dataset_stats(df, label="Dataset"):
    print(f"{'='*60}")
    print(f"📊 {label} Statistics")
    print(f"{'='*60}")
    print(f"  Total clauses       : {len(df):,}")
    print(f"  Unique services     : {df['service_name'].nunique():,}")
    print(f"  Unique topics       : {df['topic'].nunique():,}")
    print()

    # Risk breakdown
    print("  Risk Level Breakdown:")
    risk_order = ["Low", "Medium", "High", "Critical"]
    total = len(df)
    for risk in risk_order:
        count = (df["risk_level"] == risk).sum()
        pct   = 100 * count / total if total else 0
        bar   = "█" * int(pct / 2)
        icons = {"Low": "🟢", "Medium": "🟡", "High": "🔴", "Critical": "🚨"}
        print(f"    {icons[risk]} {risk:<10}: {count:>6,}  ({pct:5.1f}%)  {bar}")
    print()

    # Category breakdown
    print("  Category Breakdown:")
    cat_counts = df["category"].value_counts()
    for cat, cnt in cat_counts.items():
        pct = 100 * cnt / total
        print(f"    {cat:<28}: {cnt:>6,}  ({pct:5.1f}%)")
    print()

    # Clause length stats
    lengths = df["clause_text"].str.split().str.len()
    print("  Clause Length (words):")
    print(f"    Min    : {lengths.min()}")
    print(f"    Median : {lengths.median():.0f}")
    print(f"    Mean   : {lengths.mean():.1f}")
    print(f"    Max    : {lengths.max()}")
    print(f"    >100w  : {(lengths > 100).sum():,} ({100*(lengths>100).mean():.1f}%)")
    print(f"{'='*60}")


# ===========================================================================
# 6. Data Augmentation
# ===========================================================================

# ── Hard Negative Examples ────────────────────────────────────────────────────
HARD_NEGATIVES = [
    ("You retain full ownership of any content you upload or create on our platform.",
     "intellectual_property", "Low"),
    ("We will never sell your personal data to third parties.",
     "data_sharing", "Low"),
    ("You can delete your account and all associated data at any time.",
     "user_rights", "Low"),
    ("We will notify you 30 days in advance before making any material changes to these terms.",
     "user_rights", "Low"),
    ("We use end-to-end encryption to protect your messages and personal communications.",
     "data_collection", "Low"),
    ("You may cancel your subscription at any time with no cancellation fee.",
     "auto_renewal", "Low"),
    ("We will provide you with a full refund within 30 days if you are not satisfied.",
     "auto_renewal", "Low"),
    ("Your data will not be used for advertising or marketing purposes.",
     "data_sharing", "Low"),
    ("You can export all your data in a standard machine-readable format at any time.",
     "user_rights", "Low"),
    ("We do not collect or store your browsing history outside of this service.",
     "data_collection", "Low"),
    ("We comply with all applicable GDPR requirements and honor data subject requests.",
     "user_rights", "Low"),
    ("Your location data is only used to provide you with local features and is never shared.",
     "data_collection", "Low"),
]

# ── Synthetic High-Risk / Critical Templates ───────────────────────────────────
SYNTHETIC_HIGH = [
    ("We may sell your personal data, including browsing history and purchase records, to third-party data brokers.",
     "data_sharing", "Critical"),
    ("By creating an account, you waive your right to participate in any class action lawsuit against us.",
     "arbitration", "Critical"),
    ("We may collect your precise GPS location at all times, including when the app is closed.",
     "data_collection", "Critical"),
    ("We reserve the right to terminate your account and delete all associated data without notice or explanation.",
     "account_termination", "High"),
    ("We are not responsible for any direct, indirect, or consequential damages arising from your use of this service.",
     "liability", "High"),
    ("Your subscription will automatically renew at the full price unless you cancel at least 7 days before the renewal date.",
     "auto_renewal", "High"),
    ("By uploading content, you grant us an irrevocable, royalty-free, worldwide license to use, reproduce, and distribute your content.",
     "intellectual_property", "High"),
    ("We may share your data with government authorities without notifying you, unless prohibited by law.",
     "data_sharing", "High"),
    ("We may change these terms at any time without notice, and your continued use constitutes acceptance.",
     "user_rights", "Critical"),
    ("We may access your private messages and files to improve our AI models without your explicit consent.",
     "data_collection", "Critical"),
    ("All disputes must be resolved through binding arbitration; you give up your right to sue us in court.",
     "arbitration", "Critical"),
    ("We may share your health and biometric data with insurance companies and employers.",
     "data_sharing", "Critical"),
]

# ── Paraphrase-style augmentation (lexical substitution) ──────────────────────
PARAPHRASE_SUBS = [
    (r"\bmay\b",    ["can", "is permitted to", "reserves the right to", "might"]),
    (r"\bshare\b",  ["disclose", "transfer", "provide", "sell", "distribute"]),
    (r"\bremove\b", ["delete", "terminate", "suspend", "deactivate"]),
    (r"\bcollect\b",["gather", "obtain", "store", "record", "process"]),
    (r"\bpartners\b",["affiliates", "third parties", "advertisers", "vendors"]),
]


def paraphrase_clause(text, rng):
    """Apply one random lexical substitution."""
    pattern, options = PARAPHRASE_SUBS[rng.randint(len(PARAPHRASE_SUBS))]
    replacement = options[rng.randint(len(options))]
    return re.sub(pattern, replacement, text, count=1, flags=re.IGNORECASE)


def build_augmented_dataset(clean_df, n_paraphrase_per_high=2):
    """Combine original + hard negatives + synthetics + paraphrases."""
    rng = np.random.RandomState(SEED)
    records = clean_df.to_dict("records")

    # Add hard negatives
    for text, cat, risk in HARD_NEGATIVES:
        records.append({
            "clause_text":    text,
            "risk_level":     risk,
            "category":       cat,
            "category_label": CATEGORY_DISPLAY[cat],
            "topic":          CATEGORY_DISPLAY[cat],
            "case_description": "",
            "case_title":     "",
            "service_name":   "Example Service",
            "doc_type":       "privacy-policy",
        })

    # Add synthetic high-risk examples
    for text, cat, risk in SYNTHETIC_HIGH:
        records.append({
            "clause_text":    text,
            "risk_level":     risk,
            "category":       cat,
            "category_label": CATEGORY_DISPLAY[cat],
            "topic":          CATEGORY_DISPLAY[cat],
            "case_description": "",
            "case_title":     "",
            "service_name":   "Example Service",
            "doc_type":       "terms-of-service",
        })

    # Paraphrase augmentation for High/Critical
    high_rows = clean_df[clean_df["risk_level"].isin(["High", "Critical"])]
    for _, row in high_rows.iterrows():
        for _ in range(n_paraphrase_per_high):
            para = paraphrase_clause(row["clause_text"], rng)
            if para != row["clause_text"]:
                rec = row.to_dict()
                rec["clause_text"] = para
                records.append(rec)

    aug_df = pd.DataFrame(records)
    aug_df = aug_df.drop_duplicates(subset=["clause_text"]).reset_index(drop=True)
    return aug_df


aug_df = build_augmented_dataset(clean_df)

print(f"✅ Augmented dataset: {len(aug_df):,} examples")
print(f"   (was {len(clean_df):,} before augmentation)")
print("\n📊 Post-augmentation risk distribution:")
print(aug_df["risk_level"].value_counts())


# ===========================================================================
# 7. Multi-Task Instruction Dataset with Mistral Chat Template
# ===========================================================================

# ── User Impact templates ──────────────────────────────────────────────────────
USER_IMPACT_TEMPLATES = {
    "data_collection": {
        "Critical": "Your device, location, and behavioral data may be collected continuously without your knowledge.",
        "High":     "Significant personal data about you is being collected, potentially beyond what you expect.",
        "Medium":   "Standard data collection practices apply; review what specific data is being gathered.",
        "Low":      "Minimal data collection; only what is strictly necessary for the service.",
    },
    "data_sharing": {
        "Critical": "Your personal information, including sensitive data, may be sold or given to third parties.",
        "High":     "Your data may be shared with advertisers, partners, or other companies.",
        "Medium":   "Some data may be shared in limited circumstances; check with whom and for what purpose.",
        "Low":      "Your data is not shared with external parties for commercial purposes.",
    },
    "account_termination": {
        "Critical": "Your account and all data can be removed instantly without any notice or appeal process.",
        "High":     "Your account can be terminated by the company without prior warning.",
        "Medium":   "Account termination is possible under certain conditions; understand the circumstances.",
        "Low":      "You have clear rights and protections around account closure.",
    },
    "arbitration": {
        "Critical": "You lose your right to sue the company in court or join class action lawsuits.",
        "High":     "Legal disputes must go through arbitration, limiting your legal options.",
        "Medium":   "Dispute resolution follows specific procedures; understand your options before agreeing.",
        "Low":      "Fair dispute resolution processes are in place that protect your rights.",
    },
    "auto_renewal": {
        "Critical": "You may be charged automatically with difficult or impossible cancellation options.",
        "High":     "Your subscription renews automatically and you may be charged without explicit reminder.",
        "Medium":   "Auto-renewal applies; make sure you understand the cancellation process.",
        "Low":      "Clear billing terms with easy cancellation options are provided.",
    },
    "liability": {
        "Critical": "The company accepts virtually no responsibility for harms caused by its service.",
        "High":     "Your ability to seek compensation for damages is significantly limited.",
        "Medium":   "Standard liability limitations apply; check what you can and cannot claim.",
        "Low":      "Reasonable liability terms that do not disproportionately protect the company.",
    },
    "intellectual_property": {
        "Critical": "The company gains extensive rights over your content, potentially in perpetuity.",
        "High":     "Broad licensing rights over your content are claimed by the company.",
        "Medium":   "Some rights to your content are used by the service; check the scope.",
        "Low":      "You retain ownership of your content with limited service rights.",
    },
    "user_rights": {
        "Critical": "Fundamental user rights — including consent and data control — are being waived.",
        "High":     "Your rights as a user are significantly restricted by this clause.",
        "Medium":   "Standard user rights apply; some limitations may be present.",
        "Low":      "This clause actively protects or affirms your rights as a user.",
    },
    "general_terms": {
        "Critical": "This clause poses a critical risk to your rights and protections.",
        "High":     "This clause significantly limits your rights or exposes you to potential harm.",
        "Medium":   "This clause is standard practice but is worth understanding before agreeing.",
        "Low":      "This clause is user-friendly and reflects good practice.",
    },
}

EXPLANATION_TEMPLATES = {
    "Critical": [
        "This is a critical, deal-breaking clause. It fundamentally undermines user protections and should be carefully evaluated before you agree to these terms.",
        "This clause removes essential legal safeguards that users should normally be entitled to. Its implications are far-reaching and not immediately obvious.",
        "This is considered a blocker clause by privacy advocates: it strips away core user rights in a way that most people would not knowingly accept.",
    ],
    "High": [
        "This is a high-risk clause that grants the company broad powers over your data or account. Most users would not expect or consent to this if clearly explained.",
        "This clause represents a significant imbalance of power between the user and the service provider. Its implications deserve careful scrutiny.",
        "Privacy researchers and consumer advocates would flag this clause as harmful. The company is claiming rights that go well beyond operational necessity.",
    ],
    "Medium": [
        "This clause is common in many services but has implications worth understanding. It neither strongly protects nor harms users in isolation.",
        "This is a standard practice across many platforms. While not immediately harmful, being aware of what you are consenting to is always advisable.",
        "This clause describes a neutral or context-dependent practice. Its impact depends on how the company actually implements it.",
    ],
    "Low": [
        "This clause is user-friendly and reflects good privacy or terms practice. It actively protects or respects user rights.",
        "This is a positive clause. The company is committing to transparent or protective behavior that benefits the user.",
        "This clause aligns with best-practice standards for user protection and is rated favorably by privacy researchers.",
    ],
}


def generate_explanation(risk, category, case_desc, case_title, idx):
    """Generate a rich explanation using case data when available."""
    rng = np.random.RandomState(idx % 999)
    base_template = rng.choice(EXPLANATION_TEMPLATES[risk])

    # If a real case description exists, incorporate it
    if case_desc and len(case_desc) > 20:
        snippet = case_desc[:200].rstrip() + ("..." if len(case_desc) > 200 else "")
        return f"{snippet} {base_template}"
    elif case_title and len(case_title) > 5:
        return f"This relates to '{case_title}'. {base_template}"
    return base_template


# ── Mistral [INST] prompt builder ─────────────────────────────────────────────
SYSTEM_PREAMBLE = (
    "You are a legal AI assistant specialized in analyzing Terms of Service and Privacy Policy clauses. "
    "You identify risks, classify clauses, and explain legal language in plain English."
)

USER_INSTRUCTION = (
    "Analyze the following Terms and Conditions clause. "
    "Return a JSON object with exactly these fields: "
    "\"category\" (one of: Data Collection, Data Sharing, Account Termination, Arbitration & Disputes, "
    "Auto-Renewal & Billing, Liability & Warranty, Intellectual Property, User Rights, General Terms), "
    "\"risk_level\" (one of: Low, Medium, High, Critical), "
    "\"user_impact\" (one sentence describing the direct impact on the user), "
    "\"explanation\" (2-3 sentences explaining the clause in plain language)."
)


def build_mistral_prompt(row, idx):
    """Build a Mistral [INST] chat-format training example."""
    clause     = row["clause_text"]
    risk       = row["risk_level"]
    cat_slug   = row["category"]
    cat_label  = row["category_label"]
    case_desc  = str(row.get("case_description", ""))
    case_title = str(row.get("case_title", ""))

    user_impact = USER_IMPACT_TEMPLATES.get(cat_slug, USER_IMPACT_TEMPLATES["general_terms"])[risk]
    explanation = generate_explanation(risk, cat_slug, case_desc, case_title, idx)

    # Structured JSON output
    output_json = json.dumps({
        "category":    cat_label,
        "risk_level":  risk,
        "user_impact": user_impact,
        "explanation": explanation,
    }, indent=2)

    # Mistral chat template
    user_msg  = f"{SYSTEM_PREAMBLE}\n\n{USER_INSTRUCTION}\n\nClause:\n\"{clause}\""
    full_text = f"<s>[INST] {user_msg} [/INST] {output_json}</s>"

    return {
        "text":          full_text,
        "clause_text":   clause,
        "risk_level":    risk,
        "category":      cat_slug,
        "category_label": cat_label,
        "output_json":   output_json,
    }


print("⏳ Building instruction dataset...")
records = [build_mistral_prompt(row, idx) for idx, row in aug_df.iterrows()]
inst_df = pd.DataFrame(records)

print(f"✅ Instruction dataset: {len(inst_df):,} samples")
print("\n🔍 Sample training record:")
print(inst_df.iloc[0]["text"])

# Print dataset stats now that aug_df exists
print_dataset_stats(clean_df, label="After Cleaning & Segmentation")
print()
print_dataset_stats(aug_df, label="After Augmentation (Training Pool)")
print()

# ── Augmentation breakdown ────────────────────────────────────────────────────
orig_count  = len(clean_df)
hn_count    = len(HARD_NEGATIVES)
synth_count = len(SYNTHETIC_HIGH)
para_count  = len(aug_df) - orig_count - hn_count - synth_count
print("📦 Augmentation Breakdown:")
print(f"  Original (cleaned)   : {orig_count:>6,}")
print(f"  Hard negatives added : {hn_count:>6,}")
print(f"  Synthetic examples   : {synth_count:>6,}")
print(f"  Paraphrase variants  : {max(0, para_count):>6,}")
print(f"  {'─'*29}")
print(f"  Total training pool  : {len(aug_df):>6,}")

# ── Train / Validation split (stratified on risk_level) ──────────────────────
# Cap to 8,000 samples for feasible training time on a single P100
# (full 43K dataset would take ~90 hrs; 8K trains in ~60-90 min)
MAX_TRAIN_SAMPLES = 6_000
inst_df_sampled = (
    inst_df
    .groupby("risk_level", group_keys=False)
    .apply(lambda g: g.sample(
        min(len(g), int(MAX_TRAIN_SAMPLES * len(g) / len(inst_df))),
        random_state=SEED,
    ))
    .sample(frac=1, random_state=SEED)
    .reset_index(drop=True)
)
print(f"📉 Sampled {len(inst_df_sampled):,} stratified examples from {len(inst_df):,} total")

# No stratify on split — proportions already preserved by the groupby sampling above
train_df, val_df = train_test_split(
    inst_df_sampled,
    test_size=0.1,
    random_state=SEED,
)
train_df = train_df.reset_index(drop=True)
val_df   = val_df.reset_index(drop=True)

KEEP_COLS = ["text", "clause_text", "risk_level", "category", "category_label", "output_json"]
hf_train = HFDataset.from_pandas(train_df[KEEP_COLS])
hf_val   = HFDataset.from_pandas(val_df[KEEP_COLS])

dataset = DatasetDict({"train": hf_train, "validation": hf_val})

print(f"  Train split          : {len(train_df):>6,}")
print(f"  Validation split     : {len(val_df):>6,}")
print(f"\n📊 Train: {len(hf_train):,} | Validation: {len(hf_val):,}")
print(dataset)


# ===========================================================================
# 8. Load Mistral-7B with 4-bit Quantization
# ===========================================================================
print(f"⏳ Loading tokenizer from {MODEL_DIR} ...")
tokenizer = AutoTokenizer.from_pretrained(
    str(MODEL_DIR),
    trust_remote_code=True,
    padding_side="right",
    local_files_only=True,
)
if tokenizer.pad_token is None:
    tokenizer.pad_token    = tokenizer.eos_token
    tokenizer.pad_token_id = tokenizer.eos_token_id
print(f"✅ Tokenizer ready | vocab={tokenizer.vocab_size:,} | pad='{tokenizer.pad_token}'")

# ── Load model: 4-bit QLoRA on GPU, fp32 fallback on CPU ─────────────────────
if DEVICE == "cuda":
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    print("\n⏳ Loading Mistral-7B-Instruct-v0.1 in 4-bit NF4 from local disk...")
    print("   (sharded across 2 × pytorch_model-000XX.bin — ~14 GB total)")
    model = AutoModelForCausalLM.from_pretrained(
        str(MODEL_DIR),
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        local_files_only=True,
    )
else:
    bnb_config = None
    print("\n⚠️  No GPU detected — loading model in float32 on CPU (slow, for testing only).")
    print("   To use 4-bit QLoRA, enable a GPU accelerator in Kaggle Settings → Accelerator.")
    model = AutoModelForCausalLM.from_pretrained(
        str(MODEL_DIR),
        torch_dtype=torch.float32,
        device_map="cpu",
        trust_remote_code=True,
        local_files_only=True,
    )

model.config.use_cache      = False   # required for gradient checkpointing
model.config.pretraining_tp = 1

total = sum(p.numel() for p in model.parameters())
print(f"✅ Model loaded | Total params: {total/1e9:.2f}B")

if DEVICE == "cuda":
    alloc  = torch.cuda.memory_allocated() / 1e9
    reserv = torch.cuda.memory_reserved()  / 1e9
    print(f"   GPU memory — Allocated: {alloc:.2f} GB | Reserved: {reserv:.2f} GB")


# ===========================================================================
# 9. QLoRA Configuration
# ===========================================================================
if DEVICE == "cuda":
    model = prepare_model_for_kbit_training(
        model, use_gradient_checkpointing=True
    )
    model.config.use_cache = False  # must be False with gradient checkpointing

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    # Full attention + MLP coverage
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)

model = get_peft_model(model, lora_config)

trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
total     = sum(p.numel() for p in model.parameters())
print(f"✅ QLoRA applied")
print(f"   Trainable : {trainable:,} ({100*trainable/total:.3f}%)")
print(f"   Frozen    : {total-trainable:,}")
model.print_trainable_parameters()


# ===========================================================================
# 10. Training Configuration
# ===========================================================================
# ── Single T4 config (15.6 GB VRAM) ──────────────────────────────────────────
# gradient_checkpointing=True is required to fit 7B in 15.6 GB.
# Speed fix: MAX_SEQ_LEN=512 halves activation memory → faster steps.
# batch_size=1 + accum=16 keeps effective batch=16 while minimising peak VRAM.
training_args = TrainingArguments(
    output_dir=str(OUTPUT_DIR),

    num_train_epochs=3,
    per_device_train_batch_size=1,
    per_device_eval_batch_size=1,
    gradient_accumulation_steps=16,  # effective batch = 16

    learning_rate=1e-4,
    weight_decay=0.001,
    warmup_ratio=0.05,
    lr_scheduler_type="cosine",
    max_grad_norm=0.3,

    fp16=True,
    gradient_checkpointing=True,
    optim="paged_adamw_32bit",

    logging_steps=50,
    save_steps=500,
    save_total_limit=1,
    evaluation_strategy="no",
    load_best_model_at_end=False,
    report_to="none",

    group_by_length=False,
    dataloader_num_workers=0,
    seed=SEED,
)

eff_batch = training_args.per_device_train_batch_size * training_args.gradient_accumulation_steps
print(f"✅ Training config ready")
print(f"   Effective batch: {eff_batch} | LR: {training_args.learning_rate} | Epochs: {training_args.num_train_epochs}")
print(f"   Max seq length: {MAX_SEQ_LEN}")


# ===========================================================================
# 11. Model Training
# ===========================================================================
# Pre-tokenize to eliminate per-step tokenization overhead
def tokenize_fn(batch):
    out = tokenizer(
        batch["text"],
        truncation=True,
        max_length=MAX_SEQ_LEN,
        padding=False,
    )
    out["labels"] = out["input_ids"].copy()
    return out

print("⏳ Pre-tokenizing datasets (one-time cost)...")
hf_train_tok = hf_train.map(tokenize_fn, batched=True,
                             remove_columns=hf_train.column_names,
                             desc="Tokenizing train")
hf_val_tok   = hf_val.map(tokenize_fn, batched=True,
                           remove_columns=hf_val.column_names,
                           desc="Tokenizing val")
print(f"✅ Tokenized: {len(hf_train_tok):,} train | {len(hf_val_tok):,} val")

from transformers import DataCollatorForSeq2Seq
data_collator = DataCollatorForSeq2Seq(
    tokenizer, model=model, padding=True, pad_to_multiple_of=8
)

from transformers import Trainer
# Use base Trainer since dataset is already tokenized
trainer = Trainer(
    model=model,
    tokenizer=tokenizer,
    args=training_args,
    train_dataset=hf_train_tok,
    eval_dataset=hf_val_tok,
    data_collator=data_collator,
)

print(f"⏳ Training on {len(hf_train_tok):,} samples for {training_args.num_train_epochs} epochs...")
print("   (First epoch includes compilation overhead — subsequent epochs are faster)\n")

train_result = trainer.train()

print("\n" + "="*65)
print("✅ TRAINING COMPLETE")
print(f"   Train loss   : {train_result.training_loss:.4f}")
print(f"   Runtime      : {train_result.metrics.get('train_runtime', 0)/60:.1f} min")
print(f"   Samples/sec  : {train_result.metrics.get('train_samples_per_second', 0):.2f}")
print("="*65)

if DEVICE == "cuda":
    peak = torch.cuda.max_memory_allocated() / 1e9
    print(f"   Peak VRAM    : {peak:.2f} GB")


# ── Training & Validation Loss Plot ──────────────────────────────────────────
def plot_loss_curves(trainer, output_dir):
    """Parse trainer log history and plot train vs. validation loss."""
    log_history = trainer.state.log_history

    train_steps, train_loss = [], []
    val_steps,   val_loss   = [], []

    for entry in log_history:
        if "loss" in entry and "eval_loss" not in entry:
            train_steps.append(entry["step"])
            train_loss.append(entry["loss"])
        if "eval_loss" in entry:
            val_steps.append(entry["step"])
            val_loss.append(entry["eval_loss"])

    if not train_steps:
        print("⚠️  No log history found — skipping loss plot.")
        return

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(train_steps, train_loss, label="Train Loss",
            color="#3498db", linewidth=2, marker="o", markersize=3)
    if val_steps:
        ax.plot(val_steps, val_loss, label="Validation Loss",
                color="#e74c3c", linewidth=2, marker="s", markersize=4,
                linestyle="--")

    ax.set_xlabel("Training Step",  fontsize=11)
    ax.set_ylabel("Loss",           fontsize=11)
    ax.set_title("Training vs. Validation Loss", fontsize=13, fontweight="bold")
    ax.legend(fontsize=10)
    ax.grid(True, alpha=0.3)

    if train_loss:
        ax.annotate(f"Final train: {train_loss[-1]:.3f}",
                    xy=(train_steps[-1], train_loss[-1]),
                    xytext=(-60, 12), textcoords="offset points",
                    fontsize=9, color="#3498db",
                    arrowprops=dict(arrowstyle="->", color="#3498db"))
    if val_loss:
        ax.annotate(f"Final val: {val_loss[-1]:.3f}",
                    xy=(val_steps[-1], val_loss[-1]),
                    xytext=(10, -18), textcoords="offset points",
                    fontsize=9, color="#e74c3c",
                    arrowprops=dict(arrowstyle="->", color="#e74c3c"))

    plt.tight_layout()
    save_path = Path(output_dir) / "loss_curves.png"
    plt.savefig(save_path, dpi=130, bbox_inches="tight")
    plt.show()
    print(f"✅ Loss curve saved → {save_path}")

    print(f"\n{'Step':<8} {'Train Loss':<14} {'Val Loss':<12}")
    print("-" * 36)
    val_map = dict(zip(val_steps, val_loss))
    for step, tl in zip(train_steps, train_loss):
        vl = val_map.get(step, "")
        vl_str = f"{vl:.4f}" if vl != "" else "—"
        print(f"{step:<8} {tl:<14.4f} {vl_str}")


plot_loss_curves(trainer, OUTPUT_DIR)


# ===========================================================================
# 12. Save Model & Artifacts
# ===========================================================================
trainer.model.save_pretrained(str(OUTPUT_DIR))
tokenizer.save_pretrained(str(OUTPUT_DIR))

meta = {
    "base_model":      "mistral-ai/mistral — pytorch/7b-instruct-v0.1-hf/1",
    "base_model_path": str(MODEL_DIR),
    "lora_r":          lora_config.r,
    "lora_alpha":      lora_config.lora_alpha,
    "max_seq_length":  MAX_SEQ_LEN,
    "train_samples":   len(hf_train),
    "val_samples":     len(hf_val),
    "train_loss":      train_result.training_loss,
    "metrics":         train_result.metrics,
    "categories":      list(CATEGORY_DISPLAY.values()),
    "risk_levels":     ["Low", "Medium", "High", "Critical"],
}
with open(OUTPUT_DIR / "training_metadata.json", "w") as f:
    json.dump(meta, f, indent=2)

val_df.head(200).to_csv(OUTPUT_DIR / "val_sample.csv", index=False)

reload_snippet = (
    f"# To reload:\n"
    f"# base = AutoModelForCausalLM.from_pretrained('{MODEL_DIR}', quantization_config=bnb_config, device_map='auto')\n"
    f"# model = PeftModel.from_pretrained(base, '{OUTPUT_DIR}')\n"
)
print(reload_snippet)

files = sorted(OUTPUT_DIR.iterdir())
total_mb = sum(f.stat().st_size for f in files if f.is_file()) / 1e6
print(f"✅ Saved to {OUTPUT_DIR} ({total_mb:.1f} MB total)")
for f in files:
    size = f.stat().st_size / 1e6 if f.is_file() else 0
    print(f"   {f.name:<45} {size:>6.1f} MB")


# ===========================================================================
# 13. Structured Inference Demo
# ===========================================================================
del trainer
gc.collect()
if DEVICE == "cuda":
    torch.cuda.empty_cache()

model.eval()


def analyze_clause(clause_text, model, tokenizer, max_new_tokens=300):
    """Run inference with Mistral [INST] template. Returns raw string."""
    user_msg = f"{SYSTEM_PREAMBLE}\n\n{USER_INSTRUCTION}\n\nClause:\n\"{clause_text}\""
    prompt   = f"<s>[INST] {user_msg} [/INST]"

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=MAX_SEQ_LEN - max_new_tokens,
    ).to(DEVICE)

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            temperature=1.0,
            repetition_penalty=1.1,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id,
        )

    new_tokens = output_ids[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def parse_json_output(raw_output):
    """Robustly parse JSON from model output."""
    try:
        return json.loads(raw_output)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[^{}]*\}", raw_output, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    result = {}
    for field in ["category", "risk_level", "user_impact", "explanation"]:
        m = re.search(rf'"{field}"\s*:\s*"([^"]+)"', raw_output)
        if m:
            result[field] = m.group(1)
    return result if result else None


def print_analysis(clause, result_dict):
    """Pretty-print structured clause analysis."""
    risk = result_dict.get("risk_level", "?")
    risk_icons = {"Low": "🟢", "Medium": "🟡", "High": "🔴", "Critical": "🚨"}
    icon = risk_icons.get(risk, "❓")
    print(f"  📄 Clause    : {clause[:100]}{'...' if len(clause) > 100 else ''}")
    print(f"  📋 Category  : {result_dict.get('category', 'N/A')}")
    print(f"  {icon} Risk      : {risk}")
    print(f"  👤 Impact    : {result_dict.get('user_impact', 'N/A')}")
    print(f"  💬 Explanation: {result_dict.get('explanation', 'N/A')}")


TEST_CLAUSES = [
    ("We may share your personal information with third-party advertisers and marketing partners.",
     "data_sharing", "High"),
    ("We may terminate your account at any time without prior notice or explanation.",
     "account_termination", "High"),
    ("You retain full ownership of any content you upload to our platform.",
     "intellectual_property", "Low"),
    ("By using this service, you waive your right to participate in any class action lawsuit.",
     "arbitration", "Critical"),
    ("We collect your precise GPS location continuously, including when the app is running in the background.",
     "data_collection", "Critical"),
    ("We will notify you 30 days before making any changes to these terms.",
     "user_rights", "Low"),
    ("Your subscription will automatically renew at the current price unless cancelled 48 hours in advance.",
     "auto_renewal", "High"),
    ("We are not liable for any direct, indirect, or consequential damages from your use of the service.",
     "liability", "High"),
]

print("=" * 70)
print("🔍 STRUCTURED INFERENCE DEMO — ToS Analyzer v2.0")
print("=" * 70)

inference_results = []
for i, (clause, true_cat, true_risk) in enumerate(TEST_CLAUSES, 1):
    print(f"\n[Test {i}]")
    raw    = analyze_clause(clause, model, tokenizer)
    parsed = parse_json_output(raw)
    if parsed:
        print_analysis(clause, parsed)
        parsed["true_category"] = true_cat
        parsed["true_risk"]     = true_risk
        parsed["clause"]        = clause
        inference_results.append(parsed)
    else:
        print(f"  ⚠️  Could not parse output:\n  {raw[:200]}")
    print("-" * 70)


# ===========================================================================
# 14. Comprehensive Evaluation
# ===========================================================================
EVAL_SAMPLE_SIZE = min(150, len(hf_val))
val_sample       = hf_val.select(range(EVAL_SAMPLE_SIZE))

print(f"⏳ Evaluating on {EVAL_SAMPLE_SIZE} validation samples...")

y_risk_true, y_risk_pred = [], []
y_cat_true, y_cat_pred   = [], []
rouge_scores             = []
json_parse_successes     = 0
scorer_rouge = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=True)

for i, example in enumerate(val_sample):
    clause   = example["clause_text"]
    t_risk   = example["risk_level"]
    t_cat    = example["category"]
    ref_json = example["output_json"]

    try:
        raw    = analyze_clause(clause, model, tokenizer, max_new_tokens=256)
        parsed = parse_json_output(raw)
    except Exception:
        parsed = None

    if parsed:
        json_parse_successes += 1

        pred_risk = parsed.get("risk_level", "").strip()
        if pred_risk in RISK_ORDER:
            y_risk_true.append(t_risk)
            y_risk_pred.append(pred_risk)

        pred_cat_label = parsed.get("category", "")
        slug_map = {v: k for k, v in CATEGORY_DISPLAY.items()}
        pred_cat_slug = slug_map.get(pred_cat_label, "general_terms")
        y_cat_true.append(t_cat)
        y_cat_pred.append(pred_cat_slug)

        pred_expl = parsed.get("explanation", "")
        try:
            ref_parsed = json.loads(ref_json)
            ref_expl   = ref_parsed.get("explanation", "")
            if ref_expl and pred_expl:
                rouge_scores.append(
                    scorer_rouge.score(ref_expl, pred_expl)["rougeL"].fmeasure
                )
        except Exception:
            pass

    if (i + 1) % 30 == 0:
        print(f"  [{i+1}/{EVAL_SAMPLE_SIZE}] risk_preds={len(y_risk_pred)} | json_ok={json_parse_successes}")

print("\n" + "="*65)
print("📊 EVALUATION RESULTS")
print("="*65)

# ── Risk Level Metrics ────────────────────────────────────────────────────────
if y_risk_true:
    risk_acc      = accuracy_score(y_risk_true, y_risk_pred)
    risk_f1_macro = f1_score(y_risk_true, y_risk_pred, average="macro",    zero_division=0)
    risk_f1_wtd   = f1_score(y_risk_true, y_risk_pred, average="weighted", zero_division=0)

    print(f"\n🎯 RISK LEVEL CLASSIFICATION")
    print(f"   Accuracy         : {risk_acc:.3f} ({risk_acc*100:.1f}%)")
    print(f"   Macro F1         : {risk_f1_macro:.3f}")
    print(f"   Weighted F1      : {risk_f1_wtd:.3f}")
    print(f"   Evaluated on     : {len(y_risk_pred)} samples")
    print(f"\n{classification_report(y_risk_true, y_risk_pred, zero_division=0)}")

# ── Category Metrics ──────────────────────────────────────────────────────────
if y_cat_true:
    cat_acc = accuracy_score(y_cat_true, y_cat_pred)
    cat_f1  = f1_score(y_cat_true, y_cat_pred, average="macro", zero_division=0)
    print(f"\n🏷️  CATEGORY CLASSIFICATION")
    print(f"   Accuracy         : {cat_acc:.3f} ({cat_acc*100:.1f}%)")
    print(f"   Macro F1         : {cat_f1:.3f}")

# ── ROUGE & Parse Rate ────────────────────────────────────────────────────────
parse_rate = json_parse_successes / EVAL_SAMPLE_SIZE
print(f"\n📝 EXPLANATION QUALITY")
if rouge_scores:
    print(f"   ROUGE-L (mean)   : {np.mean(rouge_scores):.3f}")
    print(f"   ROUGE-L (median) : {np.median(rouge_scores):.3f}")
else:
    print("   ROUGE-L: N/A")
print(f"\n⚙️  STRUCTURAL COMPLIANCE")
print(f"   JSON parse rate  : {parse_rate:.3f} ({parse_rate*100:.1f}% of outputs)")
print("="*65)

# ── Confusion Matrix + Per-Class P/R/F1 ──────────────────────────────────────
if y_risk_true and len(set(y_risk_true)) > 1:
    risk_labels = [r for r in ["Low", "Medium", "High", "Critical"]
                   if r in set(y_risk_true + y_risk_pred)]
    cm = confusion_matrix(y_risk_true, y_risk_pred, labels=risk_labels)

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=risk_labels, yticklabels=risk_labels,
                ax=axes[0], linewidths=0.5)
    axes[0].set_xlabel("Predicted", fontweight="bold")
    axes[0].set_ylabel("True",      fontweight="bold")
    axes[0].set_title("Confusion Matrix (counts)", fontsize=12, fontweight="bold")

    cm_norm   = cm.astype(float)
    row_sums  = cm_norm.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    cm_norm   = cm_norm / row_sums
    sns.heatmap(cm_norm, annot=True, fmt=".2f", cmap="YlOrRd",
                xticklabels=risk_labels, yticklabels=risk_labels,
                ax=axes[1], linewidths=0.5, vmin=0, vmax=1)
    axes[1].set_xlabel("Predicted", fontweight="bold")
    axes[1].set_ylabel("True",      fontweight="bold")
    axes[1].set_title("Confusion Matrix (row-normalised recall)",
                      fontsize=12, fontweight="bold")

    plt.suptitle("Risk Level Classification — Confusion Matrices",
                 fontsize=14, fontweight="bold", y=1.02)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "confusion_matrix.png", dpi=130, bbox_inches="tight")
    plt.show()
    print("✅ Confusion matrices saved.")

    from sklearn.metrics import precision_recall_fscore_support
    prec, rec, f1, support = precision_recall_fscore_support(
        y_risk_true, y_risk_pred, labels=risk_labels, zero_division=0
    )
    print(f"\n{'─'*62}")
    print(f"{'Class':<12} {'Precision':>10} {'Recall':>10} {'F1':>10} {'Support':>10}")
    print(f"{'─'*62}")
    icons = {"Low": "🟢", "Medium": "🟡", "High": "🔴", "Critical": "🚨"}
    for lbl, p, r, f, s in zip(risk_labels, prec, rec, f1, support):
        icon = icons.get(lbl, "  ")
        print(f"{icon} {lbl:<10} {p:>10.3f} {r:>10.3f} {f:>10.3f} {s:>10}")
    print(f"{'─'*62}")
    macro_p = prec.mean()
    macro_r = rec.mean()
    macro_f = f1.mean()
    print(f"  {'Macro avg':<10} {macro_p:>10.3f} {macro_r:>10.3f} {macro_f:>10.3f}")
    print(f"{'─'*62}")

    if y_cat_true and len(set(y_cat_true)) > 1:
        cat_labels   = sorted(set(y_cat_true + y_cat_pred))
        cat_display  = [CATEGORY_DISPLAY.get(c, c) for c in cat_labels]
        cm_cat = confusion_matrix(y_cat_true, y_cat_pred, labels=cat_labels)
        fig, ax = plt.subplots(figsize=(11, 8))
        sns.heatmap(cm_cat, annot=True, fmt="d", cmap="Purples",
                    xticklabels=cat_display, yticklabels=cat_display,
                    ax=ax, linewidths=0.4)
        ax.set_xlabel("Predicted Category", fontweight="bold")
        ax.set_ylabel("True Category",      fontweight="bold")
        ax.set_title("Category Classification — Confusion Matrix",
                     fontsize=13, fontweight="bold")
        plt.xticks(rotation=35, ha="right", fontsize=8)
        plt.yticks(rotation=0,  fontsize=8)
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / "confusion_matrix_categories.png",
                    dpi=130, bbox_inches="tight")
        plt.show()
        print("✅ Category confusion matrix saved.")
else:
    print("⚠️  Not enough class variety in predictions to plot confusion matrix.")

# ── Save evaluation results ────────────────────────────────────────────────────
eval_results = {
    "risk_accuracy":         accuracy_score(y_risk_true, y_risk_pred) if y_risk_true else None,
    "risk_f1_macro":         f1_score(y_risk_true, y_risk_pred, average="macro", zero_division=0) if y_risk_true else None,
    "risk_f1_weighted":      f1_score(y_risk_true, y_risk_pred, average="weighted", zero_division=0) if y_risk_true else None,
    "category_accuracy":     accuracy_score(y_cat_true, y_cat_pred) if y_cat_true else None,
    "category_f1_macro":     f1_score(y_cat_true, y_cat_pred, average="macro", zero_division=0) if y_cat_true else None,
    "rougeL_mean":           float(np.mean(rouge_scores)) if rouge_scores else None,
    "rougeL_median":         float(np.median(rouge_scores)) if rouge_scores else None,
    "json_parse_rate":       parse_rate,
    "eval_sample_size":      EVAL_SAMPLE_SIZE,
    "valid_risk_predictions": len(y_risk_pred),
}

with open(OUTPUT_DIR / "eval_results.json", "w") as f:
    json.dump(eval_results, f, indent=2)

print("✅ Evaluation results saved to eval_results.json")
print(json.dumps({k: round(v, 4) if isinstance(v, float) else v
                  for k, v in eval_results.items()}, indent=2))