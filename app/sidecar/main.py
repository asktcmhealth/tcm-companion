"""
Sidecar entry point for the Tauri app: takes an already-transcribed text
(from Whisper or another ASR engine) and runs it through the text-processing
half of the pipeline -- correction, prescription extraction, dosage
validation, de-identification. Outputs a single JSON object to stdout.

Deliberately does NOT include Whisper/torch transcription here -- bundling
that with PyInstaller would produce a multi-GB executable and take a long
time to build on this machine. This proves the Tauri<->Python sidecar IPC
pattern works end-to-end with the lighter half of the pipeline; the
transcription step follows the identical externalBin pattern as a separate,
larger sidecar once there's a reason to pay that build cost.

Usage:
    main.py <path-to-transcript.txt>
    (or with no args, reads transcript text from stdin)

Outputs JSON to stdout, all diagnostic/progress messages to stderr (so
stdout stays clean JSON for the Rust side to parse).
"""

import sys
import os
import json

# benchmark/ has the actual pipeline logic; sidecar/ only adds the IPC framing.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "benchmark"))

from correct_herbs import correct_prescription_only, correct_acupuncture_only
from pipeline import extract_prescription, extract_acupuncture, build_consultation_note
from dosage_ranges import check_dosage
from deid_layer import deidentify


def process(transcript_text):
    corrected, edits, spans = correct_prescription_only(transcript_text)
    # `edits` is passed through so each herb carries its ambiguous/
    # ambiguous_with flag (see correct_herbs._AMBIGUITY_MARGIN) into the JSON
    # the UI renders -- without it the safety check runs but the physician
    # never sees it.
    herbs = extract_prescription(corrected, edits)
    for h in herbs:
        status, msg, high_risk = check_dosage(h["name"], h["dosage"])
        h["dosage_warning"] = (status != "ok")
        h["dosage_check_message"] = msg
        h["high_risk"] = high_risk
        del h["source_span"]

    # Acupuncture correction runs on top of the herb-corrected text (not the
    # original) so both treatment types benefit from whatever the other
    # already fixed nearby, then its own edits are appended to the same text.
    pre_acupuncture_text = corrected  # acu_edits' offsets index THIS text, not the corrected one
    corrected, acu_edits, acu_spans = correct_acupuncture_only(corrected)
    acupoints = extract_acupuncture(corrected, acu_edits)
    for a in acupoints:
        del a["source_span"]

    # Comprehensive de-id pass over the FULL corrected transcript -- this is
    # the audit-trail redaction report and covers PII anywhere in the
    # consultation, including (in the unlikely case it happens) inside the
    # treatment-reading portion that the note itself excludes below.
    deid_text, deid_report = deidentify(corrected)

    return {
        "schema_version": "1.1-prototype",
        "prescription_spans_found": len(spans),
        "acupuncture_spans_found": len(acu_spans),
        "correction_edits": [
            {
                "original": transcript_text[s:e], "corrected": term, "similarity": round(score, 2),
                "ambiguous": ambiguous, "ambiguous_with": runner_up,
            }
            for s, e, term, score, ambiguous, runner_up in edits
        ] + [
            {
                "original": pre_acupuncture_text[s:e], "corrected": term, "similarity": round(score, 2),
                "type": "acupuncture", "ambiguous": ambiguous, "ambiguous_with": runner_up,
            }
            for s, e, term, score, ambiguous, runner_up in acu_edits
        ],
        "prescription": {"herbs": herbs},
        "acupuncture": {"points": acupoints},
        "deid_report": deid_report,
        # First-class output, not buried -- the physician's core reminder of
        # what the patient actually said, distinct from any structured
        # extraction. Zero hallucination risk: this is the real transcript,
        # not an AI summary. Excludes the treatment dictation (prescription/
        # acupuncture) -- that's already shown as its own validated card, so
        # repeating it here would just blur the note/treatment split.
        "consultation_note": build_consultation_note(corrected),
        "deidentified_transcript": deid_text,  # kept for backward compat with earlier JSON consumers
    }


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], encoding="utf-8") as f:
            text = f.read()
    else:
        print("Reading transcript from stdin...", file=sys.stderr)
        text = sys.stdin.read()

    print("Processing...", file=sys.stderr)
    result = process(text)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
