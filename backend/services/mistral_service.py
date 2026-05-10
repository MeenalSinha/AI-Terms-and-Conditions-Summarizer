import os
import json
import re
import logging
import torch

logger = logging.getLogger(__name__)

# Lazy loaded globals
tokenizer = None
model = None
device = "cuda" if torch.cuda.is_available() else "cpu"

# Detect base model path from HuggingFace cache
MODEL_DIR = os.path.expanduser("~/.cache/huggingface/hub/models--mistralai--Mistral-7B-Instruct-v0.2/snapshots")
try:
    if os.path.exists(MODEL_DIR):
        snapshots = os.listdir(MODEL_DIR)
        if snapshots:
            MODEL_DIR = os.path.join(MODEL_DIR, snapshots[0])
except Exception as e:
    logger.warning(f"Failed to find HF snapshot: {e}")

LORA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../models/mistral-tosdr"))

MAX_SEQ_LEN = 512
_cuda_compatible = None  # None = not yet checked, True/False once detected


def _check_cuda_compatible() -> bool:
    """Check if the GPU supports the installed PyTorch CUDA build."""
    global _cuda_compatible
    if _cuda_compatible is not None:
        return _cuda_compatible
    if not torch.cuda.is_available():
        _cuda_compatible = False
        return False
    try:
        # Try a tiny CUDA op — will raise RuntimeError on incompatible GPU
        torch.zeros(1).cuda()
        _cuda_compatible = True
    except RuntimeError as e:
        logger.warning(f"GPU not usable with this PyTorch build: {e}")
        _cuda_compatible = False
    return _cuda_compatible


def load_model():
    global tokenizer, model, device

    if model is not None:
        return

    if not _check_cuda_compatible():
        raise RuntimeError(
            "Mistral-7B requires a CUDA-compatible GPU. "
            "Your RTX 5060 (sm_120) needs PyTorch nightly with CUDA 12.8 (cu128). "
            "Install with: pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/cu128"
        )

    logger.info(f"Loading Mistral tokenizer (device={device})...")
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import PeftModel
    except ImportError:
        logger.error("Required packages (transformers, peft) are not installed.")
        raise

    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_DIR if os.path.exists(MODEL_DIR) else "mistralai/Mistral-7B-Instruct-v0.2",
        trust_remote_code=True,
        padding_side="right"
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    logger.info("Loading base model in 4-bit NF4 quantization on GPU...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    base_model = AutoModelForCausalLM.from_pretrained(
        MODEL_DIR if os.path.exists(MODEL_DIR) else "mistralai/Mistral-7B-Instruct-v0.2",
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    logger.info(f"Loading LoRA adapters from: {LORA_DIR}")
    model = PeftModel.from_pretrained(base_model, LORA_DIR)
    model.eval()
    logger.info("Mistral model loaded successfully on GPU.")


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


def parse_json_output(raw_output: str) -> dict:
    """Parse raw model output into a structured dict."""
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


async def analyze_with_mistral(clauses: list[str], full_text: str) -> list[dict]:
    """Run clause-by-clause inference using the local fine-tuned Mistral model."""
    load_model()  # raises if GPU not compatible

    results = []
    logger.info(f"Analyzing {len(clauses)} clauses with local Mistral model on {device}...")

    for clause in clauses[:50]:
        user_msg = f"{SYSTEM_PREAMBLE}\n\n{USER_INSTRUCTION}\n\nClause:\n\"{clause}\""
        prompt = f"<s>[INST] {user_msg} [/INST]"

        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_SEQ_LEN - 300,
        ).to(device)

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=300,
                do_sample=False,
                temperature=1.0,
                repetition_penalty=1.1,
                eos_token_id=tokenizer.eos_token_id,
                pad_token_id=tokenizer.pad_token_id,
            )

        new_tokens = output_ids[0][inputs["input_ids"].shape[1]:]
        raw_output = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        parsed = parse_json_output(raw_output)

        if parsed and "risk_level" in parsed:
            results.append(parsed)
        else:
            results.append({})  # rule-based fallback will handle this

    return results
