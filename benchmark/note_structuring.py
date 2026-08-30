"""
Local note-structuring step -- proof that the "private LLM server" stage of
the architecture (plan-review.md: private SG-region server, Ollama/vLLM) is
technically feasible to run self-hosted, with no cloud call.

MODEL CAVEAT: uses Qwen2.5-0.5B-Instruct, chosen ONLY because this dev
machine has 8GB total RAM (confirmed empirically -- a 3B model silently
failed to load; 0.5B was needed to fit). This is NOT a stand-in for the
"Evaluate Shizhen / ZMT-M1 vs benchmark" TODO -- a 0.5B model is far too
weak for production note quality. This proves the PATTERN (local LLM, no
cloud, de-identified input) works end-to-end, not that this specific model
is good enough to ship.

HARD SCHEMA ENFORCEMENT (not just prompted -- enforced in code):
  - pattern_identification and treatment_principle are NEVER populated from
    LLM output, even if the model outputs something for them.
  - prescription/herbs is NEVER touched here at all -- comes only from
    pipeline.py's herb-DB-based extraction, never free-text LLM generation.
  - Only a fixed whitelist of schema keys can be written; anything else is
    discarded.

SOURCE-QUOTE VERIFICATION (added after finding the model fabricate specific
clinical findings that contradicted the source -- e.g. invented "constipation"
from a description of loose stool, invented "frequent urination" from
"normal", invented nausea that was never mentioned at all, with zero
indication of uncertainty in any case):

Every field the model outputs must include the exact transcript text it
claims to be based on. That claim is then MECHANICALLY checked against the
actual transcript (longest-common-substring coverage, not the model's own
say-so) -- if the "source quote" can't be substantiated in the real
transcript, the field is flagged unverified rather than trusted. This
catches invented content the way a human double-checking against the
recording would, but automatically and every time, not only when a reviewer
happens to notice. This does NOT eliminate the hallucination risk (a model
could in principle fabricate a quote that also happens to appear verbatim
in the transcript out of context) but it converts the specific failure
pattern observed in testing -- confident invention with zero fabricated
textual basis -- from invisible into flagged.
"""

import sys
import json
import re
import difflib

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

_ALLOWED_LLM_FIELDS = {
    "chief_complaint", "aggravating_factors", "subhealth", "tongue",
    "pulse_freetext", "mood", "sleep", "appetite", "bowel", "urine",
    "nausea", "energy", "diet", "stress",
}

_MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
_model = None
_tokenizer = None

# Minimum fraction of the claimed source_quote that must be found as a
# contiguous match in the real transcript for a field to be "verified".
# Below this, treat it as unsubstantiated regardless of how plausible it
# reads -- plausibility is exactly what made the earlier hallucinations
# dangerous in the first place.
_VERIFY_THRESHOLD = 0.7


def _load_model():
    global _model, _tokenizer
    if _model is None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        print(f"Loading local note-structuring model ({_MODEL_NAME})...", file=sys.stderr)
        _tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
        _model = AutoModelForCausalLM.from_pretrained(_MODEL_NAME, dtype=torch.bfloat16, device_map="cpu")
    return _model, _tokenizer


_PROMPT_TEMPLATE = """你是一个中医问诊记录整理助手。根据下面的问诊转录文字，提取以下信息，以JSON格式输出。

重要规则：
- 只根据转录文字中明确提到的内容填写，不要推测或诊断
- 每个字段必须包含 "value"（你的总结）和 "quote"（转录文字中支持这个总结的原文片段，必须是原文中实际出现的文字）
- 如果转录文字中没有提到某个字段，value 和 quote 都留空字符串
- 不要输出辨证（pattern_identification）或治则（treatment_principle）-- 这些必须由医生手动填写
- 不要输出药方内容 -- 药方由药材数据库单独处理

请输出这个JSON格式：
{{
  "chief_complaint": {{"value": "", "quote": ""}},
  "aggravating_factors": {{"value": "", "quote": ""}},
  "mood": {{"value": "", "quote": ""}}, "sleep": {{"value": "", "quote": ""}},
  "appetite": {{"value": "", "quote": ""}}, "bowel": {{"value": "", "quote": ""}},
  "urine": {{"value": "", "quote": ""}}, "nausea": {{"value": "", "quote": ""}},
  "energy": {{"value": "", "quote": ""}}, "diet": {{"value": "", "quote": ""}},
  "stress": {{"value": "", "quote": ""}},
  "tongue": {{"value": "", "quote": ""}},
  "pulse_freetext": {{"value": "", "quote": ""}}
}}

转录文字：
{transcript}

JSON输出："""


def _verify_quote(quote, transcript):
    """Returns (verified: bool, coverage: float). Checks the longest
    contiguous match between the claimed quote and the real transcript,
    as a fraction of the quote's own length -- not a fuzzy semantic
    similarity, a literal textual-grounding check."""
    if not quote:
        return False, 0.0
    matcher = difflib.SequenceMatcher(None, quote, transcript, autojunk=False)
    match = matcher.find_longest_match(0, len(quote), 0, len(transcript))
    coverage = match.size / len(quote) if quote else 0.0
    return coverage >= _VERIFY_THRESHOLD, coverage


def structure_note(transcript_deidentified):
    """Returns (fields_dict, raw_model_output, warnings). Each field in
    fields_dict is {"value": ..., "quote": ..., "verified": bool,
    "coverage": float}. Fields whose quote can't be substantiated in the
    real transcript are NOT dropped (still shown -- omitting them would
    hide the problem from the physician reviewer) but are marked
    verified=False so the UI can flag them distinctly."""
    model, tokenizer = _load_model()
    import torch

    transcript_window = transcript_deidentified[:1500]
    prompt = _PROMPT_TEMPLATE.format(transcript=transcript_window)
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt")

    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=600, do_sample=False)
    generated = tokenizer.decode(output_ids[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    warnings = []
    fields = {}

    json_match = re.search(r"\{.*\}", generated, re.DOTALL)
    if not json_match:
        warnings.append("Model did not return parseable JSON -- structuring failed, all fields empty")
        return fields, generated, warnings

    try:
        raw = json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        warnings.append(f"JSON parse error: {e} -- structuring failed, all fields empty")
        return fields, generated, warnings

    if not isinstance(raw, dict):
        warnings.append("Model output was valid JSON but not an object -- discarded")
        return fields, generated, warnings

    for key, entry in raw.items():
        if key not in _ALLOWED_LLM_FIELDS:
            warnings.append(f"BLOCKED: model attempted to write '{key}' -- not in allowed schema fields, discarded")
            continue

        if isinstance(entry, dict):
            value = entry.get("value", "")
            quote = entry.get("quote", "")
        else:
            # Model didn't follow the {value, quote} shape -- treat the bare
            # value as unverifiable rather than crash or silently trust it.
            value = entry
            quote = ""
            warnings.append(f"'{key}': model did not provide a quote -- cannot verify, flagging unverified")

        if not value:
            continue

        verified, coverage = _verify_quote(quote, transcript_window)
        fields[key] = {
            "value": value,
            "quote": quote,
            "verified": verified,
            "coverage": round(coverage, 2),
        }
        if not verified:
            warnings.append(
                f"UNVERIFIED '{key}': claimed quote {quote!r} not substantiated in transcript "
                f"(coverage={coverage:.0%}) -- value may be fabricated, needs physician verification against raw transcript"
            )

    for blocked_key in ("pattern_identification", "treatment_principle", "prescription", "herbs", "formula_base"):
        if blocked_key in raw:
            warnings.append(f"SAFETY: model attempted '{blocked_key}' (explicitly forbidden field) -- discarded")

    return fields, generated, warnings


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python note_structuring.py <deidentified_transcript.txt>")
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        text = f.read()

    fields, raw_output, warnings = structure_note(text)

    print("\n--- RAW MODEL OUTPUT ---")
    print(raw_output)
    print("\n--- PARSED FIELDS (schema-filtered, verification-checked) ---")
    print(json.dumps(fields, ensure_ascii=False, indent=2))
    if warnings:
        print("\n--- WARNINGS ---")
        for w in warnings:
            print(" ", w)
