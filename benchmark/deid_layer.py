"""
De-identification layer -- strips PII from a consultation transcript before it
is allowed to reach the private LLM server for note structuring.

Addresses Critical Gap #1 in plan-review.md: "De-ID layer not designed --
NRIC/name in LLM API call = PDPA breach." This is a hard PDPA/legal
requirement (see CLAUDE.md's "PDPA/data residency" constraint), not optional
polish -- no PII may reach the LLM API.

Two-part hybrid design, based on testing (see benchmark output):
  - NRIC and phone numbers are STRUCTURED and deterministic -> regex, and
    regex alone is reliable for these. A Chinese NER model (ckiplab NER,
    tested empirically) did NOT catch the NRIC test case at all, so regex
    is mandatory for these fields, not just convenient.
  - Personal names are UNSTRUCTURED (no capitalization cue like English) and
    genuinely require NER -- a fixed surname-list/regex heuristic would have
    unacceptable false-negative and false-positive rates for a PDPA-facing
    control. Uses `ckiplab/bert-base-chinese-ner` (transformers pipeline,
    already validated as loadable in this environment; runs fully locally,
    no cloud call, consistent with the local-only architecture).

IMPORTANT CAVEATS BEFORE THIS GATES A REAL API CALL:
  - This has been tested on a small number of synthetic (fake) examples only.
    It has NOT been validated against real consultation transcripts, code-
    switched Mandarin/English name mentions, or edge cases (nicknames,
    titles, family member references, patient referring to the physician
    by name, etc).
  - False negatives (missed PII) are the dangerous failure mode here -- this
    needs a "block and flag for manual redaction" fallback, not silent pass-
    through, before it gates a real API call. Currently it just redacts what
    it finds; it does not know what it might have missed.
  - Singapore-specific regexes only (NRIC format, local phone numbers).
    Malaysia (NPRA) expansion, if that market is pursued, needs its own
    patterns (NPRA/MyKad format differs from NRIC).
"""

import re

# Common Chinese surnames (covers the large majority of the population by
# frequency). Used as a SECOND, independent name-detection signal alongside
# NER -- added after empirically confirming NER alone is not reliable enough:
# on the realistic sentence "今天来的病人叫张三，NRIC是..." embedded in a full
# consultation paragraph, ckiplab NER deterministically missed '张三' entirely
# (reproduced twice), despite catching it fine in a short isolated sentence.
# For a PDPA-facing control, "sometimes misses the whole name" is a hard
# blocker -- redundancy here is load-bearing, not defensive overengineering.
_COMMON_SURNAMES = (
    "王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈"
    "曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔"
    "康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文"
)

# Scoped to name-introduction contexts ONLY -- a blind scan for
# "surname + 1-2 chars" anywhere in the text would false-positive on herb
# names that start with a common-surname character (陈皮, 白术, 白芍, 林... all
# share a character with a real surname). Only fires right after a phrase
# that actually introduces a person's name.
#
# The lookahead originally required punctuation/whitespace/end-of-string
# immediately after the name. Confirmed on a real recording this misses
# names followed directly by Latin text with no separator at all (raw ASR
# output: "...叫张三NRIC是..." -- no comma, no space between 张三 and NRIC,
# since Whisper doesn't insert punctuation at script transitions). The name
# was invisible to this detector AND missed by the Chinese NER model in the
# same run, so it passed through completely unredacted -- a real PDPA
# regression, not a rounding error. A transition into non-CJK text (Latin
# letters, digits) is itself a natural word boundary and needs to count as
# one here, not just explicit punctuation/whitespace.
_NAME_CUE_RE = re.compile(
    rf"(?:叫|姓名[是为]?|姓|病人|患者)([{_COMMON_SURNAMES}][一-鿿]{{1,2}})(?=[^一-鿿]|$)"
)


def _dictionary_name_spans(text):
    spans = []
    for m in _NAME_CUE_RE.finditer(text):
        spans.append({"start": m.start(1), "end": m.end(1), "text": m.group(1)})
    return spans


# NOTE: Python's \b treats CJK characters as \w, so "是91234567" has NO
# word boundary between 是 and 9 -- \b-based patterns silently fail to match
# digit runs immediately following Chinese text (confirmed empirically: see
# module docstring / self-test). Use digit-specific lookaround instead of \b.
#
# Real NRIC is exactly 7 digits, but tolerating 6-8 here deliberately --
# confirmed on a real recording that Whisper transcribed 'S9876543Z' (7
# digits) as 'S987643G' (6 digits, one dropped, letter suffix also changed).
# A strict 7-digit match silently missed a real NRIC entirely. The pattern
# (letter, digit run, letter) is distinctive enough that a +/-1 digit
# tolerance won't meaningfully false-positive on ordinary text, and missing
# a real NRIC is a PDPA violation -- worse than an occasional over-redaction.
_NRIC_RE = re.compile(r"(?<![A-Za-z0-9])[STFGstfg]\d{6,8}[A-Za-z](?![A-Za-z0-9])")
# Singapore local numbers: optional +65/65 prefix, then 8 digits (often
# starting 6/8/9), optionally split with a space/dash after the first 4.
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?65[- ]?)?[689]\d{3}[- ]?\d{4}(?!\d)")
# Age -- not a direct identifier on its own, but requested explicitly as an
# additional reduction of residual re-identification risk (exact age narrows
# who a record could plausibly belong to, combined with other context).
# Covers the "NN岁" form (what every ASR engine tested this session actually
# produces -- confirmed empirically that spoken ages like 四十二岁 consistently
# get transcribed as "42岁", digit form, not Chinese numerals) plus the
# English code-switched form ("42 years old" / "42-year-old"), since
# consultations mix Mandarin and English throughout this project's audio.
_AGE_RE = re.compile(r"(?<!\d)\d{1,3}(?=\s*岁)|\d{1,3}(?=[\s-]*years?[\s-]*old)", re.IGNORECASE)

_ner_pipeline = None
_ner_pipeline_en = None


def _get_ner():
    global _ner_pipeline
    if _ner_pipeline is None:
        from transformers import pipeline
        _ner_pipeline = pipeline(
            "token-classification",
            model="ckiplab/bert-base-chinese-ner",
            aggregation_strategy="simple",
        )
    return _ner_pipeline


def _get_ner_en():
    """English NER, separate model from the Chinese one -- confirmed
    empirically that ckiplab's Chinese NER completely misses English names
    ('John Tan', 'Mary Lim' both passed through unredacted in testing).
    Consultations mix Mandarin and English throughout (per brainstorm-
    analysis.md and every transcript this session), so a Chinese-only name
    detector leaves a real PDPA gap for any English-spoken patient name.
    Runs on the same text as the Chinese model regardless of the language
    mix -- simpler and safer than trying to detect language first and pick
    one model, and each model naturally finds little in the other's script."""
    global _ner_pipeline_en
    if _ner_pipeline_en is None:
        from transformers import pipeline
        _ner_pipeline_en = pipeline(
            "token-classification",
            model="dslim/bert-base-NER",
            aggregation_strategy="simple",
        )
    return _ner_pipeline_en


def _script_fraction(s, is_target_script):
    chars = [c for c in s if c.isalpha()]
    if not chars:
        return 0.0
    return sum(1 for c in chars if is_target_script(c)) / len(chars)


def _is_cjk(c):
    return "一" <= c <= "鿿"


def _is_latin(c):
    return c.isascii() and c.isalpha()


def _merge_adjacent_spans(entities, text, person_label="PERSON", require_script=None):
    """NER models sometimes split one name across adjacent PERSON spans
    (e.g. '陈美' + '玲' for '陈美玲', or 'John' + 'Tan'). Merge spans that are
    PERSON and touch or are separated only by whitespace.

    require_script: if given, drop any merged span whose matched text is NOT
    mostly that script. Added after confirming empirically that the Chinese
    NER model, given English word-pieces its tokenizer wasn't built for,
    confidently (99.99%) mistags them as PERSON -- e.g. 'shoulder pain' got
    split into 'shoulder pa' + '##in' and both tagged PERSON. Confidence
    thresholding doesn't help since the false positive is high-confidence;
    the model simply has no calibrated "this is out of my training
    distribution" signal. Scoping each model to its own script is a
    structural fix, not a threshold tweak."""
    persons = [e for e in entities if e["entity_group"] == person_label]
    persons.sort(key=lambda e: e["start"])
    merged = []
    for e in persons:
        if merged and e["start"] - merged[-1]["end"] <= 1:
            merged[-1]["end"] = e["end"]
        else:
            merged.append({"start": e["start"], "end": e["end"]})
    for m in merged:
        m["text"] = text[m["start"]:m["end"]]

    if require_script is not None:
        merged = [m for m in merged if _script_fraction(m["text"], require_script) >= 0.6]

    return merged


def deidentify(text):
    """Returns (redacted_text, report) where report lists every redaction
    made, for audit logging -- required so a human can verify what was
    stripped, not just trust it silently.

    All detectors run against the ORIGINAL, untouched text and every span
    is collected before any redaction is applied. Earlier versions redacted
    NRIC/phone/age first and ran NER on the partially-redacted result --
    confirmed empirically that this corrupts NER: a placeholder like
    '[AGE_REDACTED]' spliced into the middle of a sentence produces
    unnatural text that confused the English NER model into mistagging
    adjacent words as a person name ('he is [' was flagged as NAME in
    testing). Detecting everything against clean text, then applying all
    redactions in one final pass, avoids that class of bug entirely."""
    spans = []  # list of {start, end, type, text}, all against original `text`

    for m in _NRIC_RE.finditer(text):
        spans.append({"start": m.start(), "end": m.end(), "type": "NRIC", "text": m.group(0)})
    for m in _PHONE_RE.finditer(text):
        spans.append({"start": m.start(), "end": m.end(), "type": "PHONE", "text": m.group(0)})
    for m in _AGE_RE.finditer(text):
        spans.append({"start": m.start(), "end": m.end(), "type": "AGE", "text": m.group(0)})

    # Names: three independent signals, unioned. Chinese NER catches names
    # outside the common-surname list; the dictionary/cue check catches names
    # Chinese NER misses; English NER catches names spoken in English, which
    # the Chinese model completely misses (confirmed empirically: 'John Tan'
    # and 'Mary Lim' both passed through unredacted -- consultations mix
    # Mandarin and English throughout, so an English-only gap is a real PDPA
    # hole, not a hypothetical one).
    ner = _get_ner()
    ner_persons = _merge_adjacent_spans(ner(text), text, person_label="PERSON", require_script=_is_cjk)
    ner_en = _get_ner_en()
    ner_persons_en = _merge_adjacent_spans(ner_en(text), text, person_label="PER", require_script=_is_latin)
    dict_persons = _dictionary_name_spans(text)

    for p in ner_persons + ner_persons_en + dict_persons:
        spans.append({"start": p["start"], "end": p["end"], "type": "NAME", "text": text[p["start"]:p["end"]]})

    # Resolve overlaps across ALL span types together (not just within
    # names) -- earliest start wins, then longest span on a tie.
    spans.sort(key=lambda s: (s["start"], -(s["end"] - s["start"])))
    resolved = []
    for s in spans:
        if resolved and s["start"] < resolved[-1]["end"]:
            continue  # overlaps a higher-priority (earlier/longer) span already kept
        resolved.append(s)

    report = [{"type": s["type"], "text": s["text"]} for s in resolved]

    # Build the redacted text in one pass, back-to-front so offsets stay valid.
    placeholder = {"NRIC": "[NRIC_REDACTED]", "PHONE": "[PHONE_REDACTED]", "AGE": "[AGE_REDACTED]", "NAME": "[NAME_REDACTED]"}
    for s in sorted(resolved, key=lambda x: -x["start"]):
        text = text[:s["start"]] + placeholder[s["type"]] + text[s["end"]:]

    return text, report


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # Synthetic test cases only -- fabricated names/IDs, never real PII.
    tests = [
        "今天来的病人叫陈美玲，身份证号是S1234567A，电话是91234567。",
        "病人王建国，NRIC T0011223B，联系电话 +65 8123 4567，主诉是肩膀痛。",
        "她的主诉是最近两个星期持续感到疲乏，睡眠质量也不好。",  # no PII -- should pass through unchanged
        "医生林大卫为病人看诊，病人姓名李小龙，电话91112222。",
    ]

    for t in tests:
        redacted, report = deidentify(t)
        print(f"ORIGINAL:  {t}")
        print(f"REDACTED:  {redacted}")
        print(f"CAUGHT:    {report}")
        print()
