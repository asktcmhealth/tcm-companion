"""
MVP nucleus: audio -> transcribe -> correct (scoped) -> de-identify -> extract
prescription -> validate dosages -> structured draft.

This is a LOCAL PROTOTYPE of Feature 1's core loop (plan-review.md), stitching
together everything built and hardened during this benchmarking session:
  - run_benchmark.py       (Whisper transcription -- chosen over Paraformer/
                             SenseVoice/Fun-ASR-Nano/Qwen3-ASR: see session
                             notes -- best combination of herb-name-error
                             recoverability + dosage-number reliability)
  - correct_herbs.py       (prescription-scoped pinyin correction; hardened
                             against false-positive corruption of non-
                             prescription text and herb-vs-herb confusion)
  - herb_database.py       (~130-herb starter DB, DRAFT/unverified)
  - dosage_ranges.py       (range validation against herb_database.py)
  - deid_layer.py          (NRIC/phone regex + NER person-name redaction)

NOT implemented here (needs real infra / is out of scope for a local script):
  - Note-structuring LLM step (private SG-region server) -- this pipeline
    stops at a structured prescription draft; it does not call an LLM to
    populate chief_complaint/systems_review/etc.
  - Speaker diarisation (pyannote.audio) -- never actually tested this
    session, only assumed in the architecture doc.
  - PIN-gated physician sign-off UI -- this is a CLI script, not the app.

Every output field this produces is a DRAFT requiring physician review,
consistent with plan-review.md's schema (source: asr | manual, db_confirmed,
dosage_warning). Nothing here should be treated as final without that review.

Usage:
    python pipeline.py <audio_file>
"""

import sys
import os
import re
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from herb_database import HERB_DATABASE, all_names as herb_db_names
from acupoint_database import ACUPOINT_DATABASE
from correct_herbs import correct_prescription_only, find_prescription_spans, correct_acupuncture_only, find_acupuncture_spans
from dosage_ranges import check_dosage
from deid_layer import deidentify


def transcribe_whisper(audio_path):
    import whisper
    print("Loading Whisper large-v3...")
    model = whisper.load_model("large-v3")
    print(f"Transcribing: {audio_path}")
    result = model.transcribe(audio_path, language="zh", task="transcribe", verbose=False)
    return result["text"]


_DOSAGE_PATTERN = re.compile(r"(\d+)\s*[gG]")


def extract_prescription(text):
    """Extract (herb, dosage_g, db_confirmed) tuples from corrected
    prescription-section text. This is a starter heuristic: it looks for a
    known herb name immediately followed by a dosage number. It does NOT
    replace the real product's herb-DB-autocomplete UI (plan-review.md:
    'Prescription/herb: Herb DB autocomplete only -- NO LLM') -- this is for
    prototyping the extraction+validation concept, not for auto-writing a
    real prescription."""
    entries = []
    spans = find_prescription_spans(text)
    for start, end in spans:
        segment = text[start:end]
        claimed = [False] * len(segment)
        # Longest herb names first, so e.g. '制附子' claims its span before
        # '附子' (a substring of it) gets a chance to also match there and
        # produce a duplicate entry for the same herb mention.
        for herb in sorted(HERB_DATABASE.keys(), key=len, reverse=True):
            for m in re.finditer(re.escape(herb), segment):
                if any(claimed[m.start():m.end()]):
                    continue
                # Take the NEAREST dosage number, and REJECT the candidate
                # outright if that nearest number is already claimed by
                # another herb -- do not fall through to a later, unclaimed
                # number. Confirmed on real audio this matters: Whisper
                # hallucinated filler text ('退肌') between '桑寄生' and its
                # real '20g' dosage, and that filler happened to spell out
                # '干姜' (a real herb). An earlier version of this fix let
                # 干姜 fall through to the NEXT unclaimed number instead of
                # rejecting it -- which stole 川芎's dosage, which then stole
                # 红花's, which stole 桃仁's: one phantom match cascaded into
                # a chain of silently wrong (but in-range, unflagged)
                # dosages, worse than the single obviously-wrong entry it
                # replaced. A missed herb is a safe, visible blank; a
                # cascade of shifted dosages is invisible and dangerous --
                # reject-on-conflict is the only sound behavior here.
                after = segment[m.end():m.end() + 15]
                dose_m = _DOSAGE_PATTERN.search(after)
                if dose_m:
                    dose_start = m.end() + dose_m.start()
                    dose_end = m.end() + dose_m.end()
                    if any(claimed[dose_start:dose_end]):
                        continue
                    for i in range(m.start(), m.end()):
                        claimed[i] = True
                    for i in range(dose_start, dose_end):
                        claimed[i] = True
                    entries.append({
                        "name": herb,
                        "dosage": int(dose_m.group(1)),
                        "unit": "g",
                        "db_confirmed": True,  # matched against HERB_DATABASE
                        "source_span": (start + m.start(), start + dose_end),
                    })
    entries.sort(key=lambda e: e["source_span"][0])
    return entries


# 双侧/两侧 = bilateral, 左 = left, 右 = right -- checked immediately after a
# matched acupoint name, same "look a few characters ahead" pattern as
# herb dosage extraction. UNTESTED against real acupuncture audio (see
# correct_herbs.py's find_acupuncture_spans docstring for the same caveat).
_LATERALITY_PATTERN = re.compile(r"(双侧|两侧|左侧|右侧|左|右)")


def extract_acupuncture(text):
    """Extract acupoint entries from corrected acupuncture-section text.
    Same structural pattern as extract_prescription (longest-name-first,
    claimed-span tracking to avoid substring double-counting), but no
    dosage number to anchor on -- acupoints are just names in a list, so
    this is less validated than the herb path. See
    correct_herbs.py:find_acupuncture_spans for the full caveat."""
    entries = []
    spans = find_acupuncture_spans(text)
    for start, end in spans:
        segment = text[start:end]
        claimed = [False] * len(segment)
        for point in sorted(ACUPOINT_DATABASE.keys(), key=len, reverse=True):
            for m in re.finditer(re.escape(point), segment):
                if any(claimed[m.start():m.end()]):
                    continue
                for i in range(m.start(), m.end()):
                    claimed[i] = True
                after = segment[m.end():m.end() + 6]
                lat_m = _LATERALITY_PATTERN.match(after)
                entries.append({
                    "name": point,
                    "code": ACUPOINT_DATABASE[point]["code"],
                    "meridian": ACUPOINT_DATABASE[point]["meridian"],
                    "laterality": lat_m.group(0) if lat_m else None,
                    "db_confirmed": True,  # matched against ACUPOINT_DATABASE
                    "source_span": (start + m.start(), start + m.end()),
                })
    entries.sort(key=lambda e: e["source_span"][0])
    return entries


_NOTE_EXCLUDE_TRIGGERS = ["针灸处方", "处方", "取穴", "选穴"]  # longest first: "针灸处方" ends with "处方"


def build_consultation_note(corrected_text):
    """The physician's conversation with the patient -- symptoms, history,
    exam findings -- with the treatment dictation (prescription/acupuncture)
    excluded, since that's already shown separately as a structured,
    validated card and repeating it verbatim in the note just blurs the
    'note = what was said, treatment = what to give' split the note exists
    to preserve.

    Spans are found fresh on `corrected_text` (not reused from the earlier
    correction step) because correction can change a span's length, which
    would silently misalign any span position computed on an earlier-stage
    text. Exclusion happens BEFORE de-identification specifically so the
    exclusion offsets never have to be tracked through a length-changing
    redaction pass (redacted PII spans are a different length than the
    original text) -- de-identify only what's left, after the cut."""
    spans = sorted(find_prescription_spans(corrected_text) + find_acupuncture_spans(corrected_text))
    merged = []
    for start, end in spans:
        # Also swallow an exact trigger phrase immediately preceding the
        # span, so the note doesn't end with a dangling "处方"/"取穴" that
        # announces a list which then isn't there. Only handles the exact
        # (non-garbled) trigger text -- an ASR-garbled trigger (e.g. "除方"
        # for "处方") is left in place, a minor cosmetic gap, not a data leak.
        for trigger in _NOTE_EXCLUDE_TRIGGERS:
            if corrected_text[max(0, start - len(trigger)):start] == trigger:
                start -= len(trigger)
                break
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    parts = []
    last = 0
    for start, end in merged:
        parts.append(corrected_text[last:start])
        last = end
    parts.append(corrected_text[last:])
    conversation_only = "".join(parts)

    note_text, _ = deidentify(conversation_only)
    return note_text


def build_note_draft(audio_path, raw_transcript, corrected_transcript, herbs, deid_report):
    for h in herbs:
        status, msg, high_risk = check_dosage(h["name"], h["dosage"])
        h["dosage_warning"] = (status != "ok")
        h["dosage_check_message"] = msg
        h["high_risk"] = high_risk
        del h["source_span"]

    draft = {
        "schema_version": "1.1-prototype",
        "audio_file": os.path.basename(audio_path),
        "status": "draft",
        "fields": {
            "prescription": {
                "herbs": herbs,
                "formula_base": None,   # not extracted -- needs LLM structuring step
                "modifications": None,
            },
            # Everything below is intentionally NOT populated: these fields
            # need the note-structuring LLM (private server), not built here.
            "chief_complaint": {"value": None, "source": "not_implemented"},
            "systems_review": {"value": None, "source": "not_implemented"},
            "tongue": {"value": None, "source": "not_implemented"},
            "pulse": {"value": None, "source": "not_implemented"},
            "pattern_identification": {"value": None, "source": "manual_only"},
            "treatment_principle": {"value": None, "source": "manual_only"},
        },
        "deid_report": deid_report,
        "physician_attestation": {"pin_verified": False},
        "_prototype_note": "Every field above needs physician review before it "
                            "means anything -- this script does not attempt "
                            "diagnosis, pattern ID, or treatment suggestion, "
                            "consistent with plan-review.md's SaMD-avoidance design.",
    }
    return draft


def main():
    if len(sys.argv) < 2:
        print("Usage: python pipeline.py <audio_file>")
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File not found: {audio_path}")
        sys.exit(1)

    print("\n[1/5] Transcribing (Whisper large-v3)...")
    raw_transcript = transcribe_whisper(audio_path)
    with open(audio_path.rsplit(".", 1)[0] + "_transcript.txt", "w", encoding="utf-8") as f:
        f.write(raw_transcript)

    print("[2/5] Correcting herb names (prescription-scoped, hardened)...")
    corrected_transcript, edits, spans = correct_prescription_only(raw_transcript)
    print(f"       {len(edits)} correction(s) applied across {len(spans)} prescription span(s)")

    print("[3/5] Extracting prescription (herb + dosage)...")
    herbs = extract_prescription(corrected_transcript)
    print(f"       {len(herbs)} herb entries extracted")

    print("[4/5] Validating dosages against range table...")
    # (validation happens inside build_note_draft, counted here for the log)
    warn_count = sum(1 for h in herbs if check_dosage(h["name"], h["dosage"])[0] != "ok")
    print(f"       {warn_count}/{len(herbs)} flagged out-of-range")

    print("[5/5] De-identifying transcript (before this would reach an LLM)...")
    deid_text, deid_report = deidentify(corrected_transcript)
    print(f"       {len(deid_report)} PII item(s) redacted")

    draft = build_note_draft(audio_path, raw_transcript, corrected_transcript, herbs, deid_report)

    out_path = audio_path.rsplit(".", 1)[0] + "_note_draft.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(draft, f, ensure_ascii=False, indent=2)

    print(f"\nDraft note written to: {out_path}")
    print("\n--- PRESCRIPTION DRAFT (requires physician review) ---")
    for h in draft["fields"]["prescription"]["herbs"]:
        flag = " ⚠ OUT OF RANGE" if h["dosage_warning"] else ""
        print(f"  {h['name']} {h['dosage']}{h['unit']}{flag}")


if __name__ == "__main__":
    main()
