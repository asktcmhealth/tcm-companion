"""
Pinyin fuzzy-correction layer for Whisper TCM benchmark output.
-----------------------------------------------------------------------
Whisper gets the SOUND of TCM herb/pulse/tongue/pattern terms right far more
often than it gets the CHARACTERS right (homophone/near-homophone substitution:
e.g. 独活 -> 毒活, 川芎 -> 川凶, 陈皮 -> 橙皮). This script scans a transcript,
finds spans that are phonetically close to a known TCM term, and rewrites them
to the correct term -- a local, no-ML, no-cloud correction pass that runs
between Whisper and the note-structuring step.

Usage:
    python correct_herbs.py <transcript.txt>

Writes <transcript>_corrected.txt and prints a before/after accuracy report
scored against SIMULATION_HERBS (the ground truth for simulation_script.txt).
"""

import sys
import difflib
import functools
from pypinyin import lazy_pinyin
from herb_database import all_names as herb_db_names, HERB_DATABASE
from acupoint_database import ACUPOINT_DATABASE
import re as _re

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# pypinyin's default dictionary mis-reads some TCM-specific characters when they
# appear outside common phrases. Override known cases here as we find them.
PINYIN_OVERRIDES = {
    "芎": "xiong",  # 川芎 (chuan1 xiong1) -- default dict reads it as "qiong"
}

# Kept for this script's own benchmark scoring (main()) against
# simulation_script.txt's known ground truth -- NOT the correction vocabulary
# used by the pipeline (see CORRECTION_VOCAB below, which uses the full DB).
SIMULATION_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]

_CLINICAL_TERMS = [
    "弦细", "左关", "右关", "两尺", "濡缓", "沉细", "齿痕", "苔白腻", "苔薄白",
    "肝郁气滞", "脾虚湿盛", "肾阳虚", "寒湿痹阻", "血瘀",
    "逍遥散", "四君子汤", "独活寄生汤", "桂附地黄丸",
]

# Full correction vocabulary: the ~130-herb database (herb_database.py) plus
# common clinical terms/formula names. This is what the real pipeline uses --
# SIMULATION_HERBS above is scoped down to just the 25-herb test set.
CORRECTION_VOCAB = herb_db_names() + _CLINICAL_TERMS


def _canonical(pinyin_with_tones):
    """'shen1 shu1' -> 'shen shu'; 'nu:3' -> 'nv' (pypinyin spells u-umlaut 'v')."""
    return _re.sub(r"\d", "", pinyin_with_tones).replace("u:", "v")


# The vocabulary side of every comparison uses the databases' own pinyin, not a
# library's guess. pypinyin gets 11 of 184 vocabulary readings wrong -- 黄柏
# 'huang bai' (should be bo), 枳壳 'zhi ke' (qiao), 行间 'hang jian' (xing),
# 大椎 'da chui' (zhui), and every ...俞 acupoint 'yu' (shu) -- while the
# databases hold the reviewed TCM readings. (The mobile port's pinyin-pro is
# wrong on a DIFFERENT handful: 阿胶, 太子参, 膻中. Neither library is a safe
# source of truth for TCM terms; the database is.) Transcript windows still go
# through the library, where no canonical reading exists. Found by the
# cross-implementation parity test (mobile/__tests__/parity.test.ts).
_CANONICAL_PINYIN = {
    term: _canonical(info["pinyin"])
    for db in (HERB_DATABASE, ACUPOINT_DATABASE)
    for term, info in db.items()
}


@functools.lru_cache(maxsize=None)
def pinyin_str(text):
    """Converts to pinyin, preserving pypinyin's phrase-level heteronym
    disambiguation (e.g. 白术's 术 correctly reads 'zhu' in that phrase, but
    'shu' if looked up character-by-character -- confirmed empirically this
    exact confusion caused '白竹' to false-match '白芷' instead of '白术').
    Processes contiguous Chinese-character runs as one unit so pypinyin's
    phrase dictionary applies; non-Chinese runs (digits/letters) are handled
    per-character since lazy_pinyin does NOT preserve 1:1 alignment across
    mixed CJK+digit text (confirmed empirically -- digits get merged into
    unrelated tokens when mixed with Hanzi in one lazy_pinyin() call).

    Exact vocabulary terms short-circuit to the database's canonical reading
    (see _CANONICAL_PINYIN above)."""
    canonical = _CANONICAL_PINYIN.get(text)
    if canonical is not None:
        return canonical
    syllables = []
    i = 0
    while i < len(text):
        if '一' <= text[i] <= '鿿':
            j = i
            while j < len(text) and '一' <= text[j] <= '鿿':
                j += 1
            run = text[i:j]
            run_py = lazy_pinyin(run)
            for ch, syl in zip(run, run_py):
                syllables.append(PINYIN_OVERRIDES.get(ch, syl))
            i = j
        else:
            syllables.append(PINYIN_OVERRIDES.get(text[i], text[i]))
            i += 1
    return " ".join(syllables)

def similarity(a_py, b_py):
    return difflib.SequenceMatcher(None, a_py, b_py).ratio()

def _blocked_mask(transcript, block_phrases):
    blocked = [False] * len(transcript)
    for phrase in block_phrases or []:
        start = 0
        while True:
            idx = transcript.find(phrase, start)
            if idx == -1:
                break
            for i in range(idx, idx + len(phrase)):
                blocked[i] = True
            start = idx + 1
    return blocked

def _hanzi_runs(text):
    """Contiguous spans of pure Hanzi characters. Match windows must stay
    inside one run -- confirmed empirically that allowing a window to bleed
    across a Hanzi/digit boundary caused real corruption: a window for '薏苡仁'
    matched 'g益人' (including the PRECEDING herb's trailing dosage-unit 'g'),
    silently stealing that 'g' out of '甘草6g' and leaving '甘草6' with no
    unit -- which then made dosage extraction grab the WRONG number (the next
    herb's dosage) for 甘草. A silently wrong dosage is the worst failure mode
    this whole session was about avoiding."""
    runs = []
    i = 0
    n = len(text)
    while i < n:
        if '一' <= text[i] <= '鿿':
            j = i
            while j < n and '一' <= text[j] <= '鿿':
                j += 1
            runs.append((i, j))
            i = j
        else:
            i += 1
    return runs

def find_best_matches(transcript, vocab, threshold=0.75, block_phrases=None):
    """For each vocab term, find the best-matching span in the transcript.
    block_phrases: substrings (e.g. decoction-prep instructions) that must
    not be considered as candidate windows, so they can't win a false match
    against the herb vocabulary."""
    blocked = _blocked_mask(transcript, block_phrases)
    runs = _hanzi_runs(transcript)
    matches = []  # (score, start, end, term)
    # NOTE: short terms used to get a raised threshold here (2-char terms
    # crossing a fixed bar by chance more easily than long ones -- confirmed
    # empirically: 2-char '桂枝' false-matched an unrelated 'g炙' fragment).
    # Removed after confirming on a real recording that the penalty rejects
    # genuine short-herb matches too (麻黄 scored 82% against its actual
    # garbled occurrence, but needed 87% under the penalty, so a WORSE-
    # scoring but longer candidate -- 小茴香 at 78% -- won that text region
    # instead: a wrong herb substituted where a real one was missed, the
    # most dangerous class of error this whole module exists to prevent).
    # Confirmed separately that the original 'g炙'->桂枝 case is already
    # blocked by the Hanzi-run window restriction below (that window could
    # never be generated post-fix, independent of any threshold), so the
    # penalty's job is done elsewhere now and it was only causing harm.
    for term in vocab:
        term_py = pinyin_str(term)
        term_len = len(term)
        term_threshold = threshold
        best = (0.0, None, None)
        for wlen in (term_len - 1, term_len, term_len + 1):
            if wlen <= 0:
                continue
            for run_start, run_end in runs:
                if run_end - run_start < wlen:
                    continue
                for i in range(run_start, run_end - wlen + 1):
                    if any(blocked[i:i + wlen]):
                        continue
                    window = transcript[i:i + wlen]
                    score = similarity(term_py, pinyin_str(window))
                    if score > best[0]:
                        best = (score, i, i + wlen)
        score, start, end = best
        if score >= term_threshold and window_is_not_identity(transcript, start, end, term):
            matches.append((score, start, end, term))
    return matches

def window_is_not_identity(transcript, start, end, term):
    return start is not None

# If another vocab term scores within this much of the winner WHEN TESTED
# AGAINST THE WINNER'S OWN MATCHED WINDOW, treat the match as too close to
# call automatically -- surface it for physician review instead of silently
# picking a winner. Ported from the mobile app's correctHerbs.ts after live
# testing on real consultation audio there found two confirmed cases of a
# wrong-but-plausible herb winning outright with no signal anything was
# uncertain: 制附子 (high-risk) lost to 知母 (not high-risk) at 75% -- with
# 制附子 itself never reaching the acceptance threshold anywhere in the
# transcript, so it never appeared as a competing "candidate" by the naive
# approach of only comparing already-accepted matches; and 麻黄 (high-risk)
# lost to 大黄 (also high-risk, but a different herb) at 86%, with 麻黄
# scoring 76.2% when tested against that exact winning span -- a 9.5-point
# gap that an earlier, narrower 0.08 margin missed entirely. 0.12 was
# reached empirically after that miss, catching both confirmed real
# collisions with a small margin of headroom. This same fuzzy-matching
# algorithm is shared between mobile and desktop, so the underlying
# vulnerability was never desktop-specific -- it just hadn't shown up yet
# on the two real recordings desktop had been tested against. Mirrors the
# reject-on-conflict (not fallback-search) rule already applied to dosage-
# claiming in pipeline.py's extract_prescription.
_AMBIGUITY_MARGIN = 0.12


def _flag_ambiguous(segment, vocab, edits):
    """Tests every OTHER vocab term directly against the exact window text
    that won, rather than comparing to each term's own independently-best
    window elsewhere in the transcript -- that distinction is what makes
    this catch the confirmed real cases (see _AMBIGUITY_MARGIN above).
    Returns edits with two fields appended: (start, end, term, score,
    ambiguous, runner_up) -- runner_up is None when not ambiguous."""
    flagged = []
    for start, end, term, score in edits:
        window_py = pinyin_str(segment[start:end])
        runner_up = None
        runner_up_score = -1.0
        for other in vocab:
            if other == term:
                continue
            other_score = similarity(pinyin_str(other), window_py)
            if score - other_score <= _AMBIGUITY_MARGIN and other_score > runner_up_score:
                runner_up = other
                runner_up_score = other_score
        flagged.append((start, end, term, score, runner_up is not None, runner_up))
    return flagged

def apply_corrections(transcript, matches):
    """Apply highest-confidence, non-overlapping corrections to the transcript."""
    # Best matches first; on tied/close scores, prefer the LONGER span (e.g.
    # '炙甘草' over the '甘草' substring within it) -- confirmed empirically
    # that without this, a shorter term's perfect match could claim the span
    # first and block the more specific/correct longer term from applying.
    matches = sorted(matches, key=lambda m: (-m[0], -(m[2] - m[1])))
    used = [False] * len(transcript)
    edits = []  # (start, end, term)
    for score, start, end, term in matches:
        if any(used[start:end]):
            continue
        if transcript[start:end] == term:
            # Already correct -- claim the span so a lower-confidence match for
            # a DIFFERENT term can't later overwrite already-correct text.
            for i in range(start, end):
                used[i] = True
            continue
        edits.append((start, end, term, score))
        for i in range(start, end):
            used[i] = True
    edits.sort(key=lambda e: e[0])
    corrected = []
    last = 0
    for start, end, term, score in edits:
        corrected.append(transcript[last:start])
        corrected.append(term)
        last = end
    corrected.append(transcript[last:])
    return "".join(corrected), edits

def score_against(transcript, herb_list):
    found = [h for h in herb_list if h in transcript]
    return found

def correct_transcript(text, vocab=None):
    """Whole-transcript correction. UNSAFE at real vocabulary scale -- see
    module-level warning below. Kept only for the benchmark's own before/after
    measurement against the 25-herb SIMULATION_HERBS test set, where the risk
    was first caught. Do not use this for pipeline/production text; use
    correct_prescription_only() instead."""
    vocab = vocab if vocab is not None else CORRECTION_VOCAB
    matches = find_best_matches(text, vocab)
    return apply_corrections(text, matches)


import re

# Generic span-finding + correction engine, extracted from the original
# prescription-only implementation after acupuncture support needed the
# exact same machinery (fuzzy trigger-phrase matching, span scoping, prep-
# phrase masking) -- rather than duplicate it and risk re-introducing bugs
# already fixed once (Hanzi-run windowing, threshold tuning, span-conflict
# resolution), both treatment types now share one engine parameterized by
# trigger phrase, end-marker regex, vocabulary, and an optional content
# boundary (e.g. "last dosage pattern" for herbs).


def _find_fuzzy_section_starts(text, trigger, threshold=0.85):
    """Returns end-positions of spans phonetically close to `trigger`,
    beyond what an exact match already catches. High threshold deliberately
    -- these are short, common-sounding phrases, and a false trigger here
    scopes the corrector to the wrong part of the transcript (better to
    miss an occasional garbled trigger than invent a section that isn't
    there). Confirmed necessary empirically: Whisper transcribed 处方
    (chu3fang1) as 除方 (chu2fang1) on a real recording, one tone/vowel off,
    and an exact-match regex found nothing -- 13 herbs silently skipped."""
    target_py = pinyin_str(trigger)
    tlen = len(trigger)
    exact_re = re.compile(re.escape(trigger))
    exact_starts = {m.start() for m in exact_re.finditer(text)}
    hits = []
    for i in range(len(text) - tlen + 1):
        if i in exact_starts:
            continue
        window = text[i:i + tlen]
        if not any('一' <= c <= '鿿' for c in window):
            continue
        if similarity(target_py, pinyin_str(window)) >= threshold:
            hits.append(i + tlen)
    return hits


# Decoction-prep instructions are NOT herb names but can still win a
# phonetic match against the herb vocabulary (e.g. '后下'/add-later matched
# '藿香'; '先煎'/pre-decoct matched '干姜'). Mask these out so they can't
# compete for a span. Acupuncture has no direct equivalent yet (needling
# technique terms like 补法/泻法/留针 could plausibly cause the same class of
# false match against the acupoint vocabulary, but this is UNTESTED --
# there's no real acupuncture audio yet to confirm against).
_PREP_INSTRUCTIONS = ["先煎", "后下", "包煎", "另煎", "烊化", "冲服", "分钟"]


def find_treatment_spans(text, trigger, end_re, max_span_len=250, boundary_re=None, fuzzy_threshold=0.85):
    """Find (start, end) spans following a (possibly ASR-garbled) trigger
    phrase, so correction/extraction can be scoped to ONLY those spans
    instead of the whole free-flowing conversation.

    Why scoping matters at all: testing correction against the full ~130-
    herb database (not just a small test set) showed it corrupting ordinary
    sentences -- '病人'(patient) -> '杏仁'(apricot kernel), '脉象'(pulse
    presentation) -> '木香', '三个月'(three months) -> '桑叶', etc. A bigger
    vocabulary means more candidate phonetic matches against everyday words.
    This also matches the locked architecture: herbs (and now acupoints)
    are never meant to auto-populate from general transcript text, only
    from the treatment-reading portion.

    boundary_re: if given, trim the span to just past the LAST match of this
    pattern within the coarse span (e.g. the last "Ng" dosage for herbs) --
    more reliable than trusting the end-marker text survived ASR intact.
    Herbs have this (dosage numbers are structural); acupuncture currently
    does NOT (no numeric boundary in a plain point list) -- see
    find_acupuncture_spans for the caveat this leaves.

    This is a starter heuristic (regex section markers), not a robust
    parser. Validated iteratively against real herb-prescription audio this
    session; the acupuncture path is UNTESTED against real audio as of
    when it was written.
    """
    start_re = re.compile(re.escape(trigger))
    starts = [m.end() for m in start_re.finditer(text)]
    fuzzy_starts = _find_fuzzy_section_starts(text, trigger, fuzzy_threshold)
    if boundary_re:
        # A fuzzy-matched trigger only counts if the structural boundary (for
        # herbs: a dosage number) follows soon. A real garbled "处方" is
        # immediately followed by the herb list; an ordinary phrase that merely
        # SOUNDS like the trigger ("情绪方面" ~ "处方", 0.80) is not -- and
        # accepting it scopes herb-correction over consultation narrative.
        # Exact triggers are left alone (validated on real recordings).
        fuzzy_starts = [
            st for st in fuzzy_starts
            if boundary_re.search(text, st, min(len(text), st + _FUZZY_START_BOUNDARY_WINDOW))
        ]
    starts += fuzzy_starts

    spans = []
    for start in starts:
        end_match = end_re.search(text, start)
        coarse_end = min(end_match.start(), start + max_span_len) if end_match else min(len(text), start + max_span_len)
        if coarse_end <= start:
            continue

        if boundary_re:
            # The end-marker regex is itself vulnerable to ASR garbling (e.g.
            # '方剂基础' transcribed as '方寄基础' doesn't match '方剂基础'),
            # which let non-vocabulary text leak into the span. Trim to the
            # last structural boundary match instead when one is available.
            b_matches = list(boundary_re.finditer(text, start, coarse_end))
            end = b_matches[-1].end() if b_matches else coarse_end
        else:
            end = coarse_end

        if end > start:
            spans.append((start, end))
    return _merge_overlapping(spans)


# How far after a fuzzy-matched trigger the first structural boundary (dosage)
# may be. Real prescriptions put the first herb + dose within a few characters
# of "处方"; 40 leaves room for a short preamble without admitting narrative.
_FUZZY_START_BOUNDARY_WINDOW = 40


def _merge_overlapping(spans):
    """Union overlapping/touching spans. Two triggers close together -- a
    physician saying "我开个处方,处方如下:..." -- otherwise yield spans covering
    the same herbs, which then get extracted twice: every herb listed two (or,
    in the mobile port, four) times on the prescription draft, which reads as a
    double dose. Confirmed on exactly that utterance in both engines."""
    merged = []
    for s, e in sorted(spans):
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def correct_spans_only(text, spans, vocab, block_phrases=None):
    """Shared correction step for any set of (start, end) spans: only
    corrects text inside those spans, leaves everything else untouched.
    Returns (corrected_text, edits). If spans is empty, returns text
    unchanged with no edits -- caller should treat that as 'nothing found',
    not 'confirmed nothing there', and flag for manual review."""
    if not spans:
        return text, []

    all_edits = []
    corrected = text
    # Process spans back-to-front so earlier offsets stay valid across edits.
    for start, end in sorted(spans, key=lambda s: -s[0]):
        segment = corrected[start:end]
        matches = find_best_matches(segment, vocab, block_phrases=block_phrases)
        seg_corrected, edits = apply_corrections(segment, matches)
        edits = _flag_ambiguous(segment, vocab, edits)
        corrected = corrected[:start] + seg_corrected + corrected[end:]
        for s, e, term, score, ambiguous, runner_up in edits:
            all_edits.append((s + start, e + start, term, score, ambiguous, runner_up))

    return corrected, sorted(all_edits, key=lambda e: e[0])


_RX_PRESCRIPTION_END = re.compile(r"服[药要]说明|不要说明|方剂基础|方剂|放弃基础|放鸡鸡杵|独活济生汤|复诊")
_PRESCRIPTION_START_THRESHOLD = 0.85
# Must recognize the same unit spellings as pipeline.py's _DOSAGE_PATTERN, or a
# prescription span gets trimmed short (or not found) purely because of which
# unit the ASR model happened to write -- see the note there on 克.
_DOSAGE_BOUNDARY_RE = re.compile(r"\d+\s*[gG克]")


def find_prescription_spans(text, max_span_len=250):
    """Herb-prescription spans -- thin wrapper over find_treatment_spans."""
    return find_treatment_spans(
        text, "处方", _RX_PRESCRIPTION_END, max_span_len,
        boundary_re=_DOSAGE_BOUNDARY_RE, fuzzy_threshold=_PRESCRIPTION_START_THRESHOLD,
    )


def correct_prescription_only(text, vocab=None):
    """Safe entry point for pipeline use: only corrects herb names inside
    detected prescription spans, leaves everything else untouched. Returns
    (corrected_text, edits, spans_found), where each edit is
    (start, end, term, score, ambiguous, runner_up) -- see _AMBIGUITY_MARGIN.
    If spans_found is empty, no correction was applied at all -- caller
    should flag for manual review rather than assume the transcript has no
    herbs."""
    vocab = vocab if vocab is not None else herb_db_names()
    spans = find_prescription_spans(text)
    corrected, edits = correct_spans_only(text, spans, vocab, block_phrases=_PREP_INSTRUCTIONS)
    return corrected, edits, spans


# Acupuncture -- UNTESTED against real acupuncture audio as of when this was
# written (zero recordings with acupuncture content exist yet). Trigger
# phrases and end-markers below are reasonable guesses at how a physician
# would introduce/close an acupoint list in speech, not empirically
# validated the way the prescription markers were (those went through
# multiple rounds of real-recording testing before landing on this design).
# No numeric boundary_re equivalent to herbs' "last Ng dosage" exists --
# acupoint lists are typically just point names separated by pauses/commas,
# so the end boundary relies entirely on end_re or max_span_len, which is
# structurally weaker than the herb path's dosage-anchored trim.
_RX_ACUPUNCTURE_END = re.compile(r"留针|疗程|隔[天日]|服[药要]说明|复诊")
_ACUPUNCTURE_TRIGGERS = ["取穴", "针灸处方", "选穴"]
_ACUPUNCTURE_START_THRESHOLD = 0.85


def find_acupuncture_spans(text, max_span_len=150):
    spans = []
    for trigger in _ACUPUNCTURE_TRIGGERS:
        spans += find_treatment_spans(
            text, trigger, _RX_ACUPUNCTURE_END, max_span_len,
            boundary_re=None, fuzzy_threshold=_ACUPUNCTURE_START_THRESHOLD,
        )
    if not spans:
        return spans
    # Multiple trigger phrases can produce overlapping spans; merge them.
    spans.sort()
    merged = [spans[0]]
    for s, e in spans[1:]:
        if s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def correct_acupuncture_only(text, vocab=None):
    """Same pattern as correct_prescription_only, for acupoints. Kept as a
    separate named function (not just a different vocab argument) so
    callers and logs are explicit about which treatment type ran --
    acupuncture's span-detection is meaningfully less validated than
    prescription's (see find_acupuncture_spans docstring)."""
    from acupoint_database import all_names as acupoint_db_names
    vocab = vocab if vocab is not None else acupoint_db_names()
    spans = find_acupuncture_spans(text)
    corrected, edits = correct_spans_only(text, spans, vocab, block_phrases=None)
    return corrected, edits, spans

def main():
    if len(sys.argv) < 2:
        print("Usage: python correct_herbs.py <transcript.txt>")
        sys.exit(1)

    in_path = sys.argv[1]
    with open(in_path, "r", encoding="utf-8") as f:
        transcript = f.read()

    before = score_against(transcript, SIMULATION_HERBS)

    matches = find_best_matches(transcript, CORRECTION_VOCAB)
    corrected, edits = apply_corrections(transcript, matches)

    after = score_against(corrected, SIMULATION_HERBS)

    out_path = in_path.rsplit(".", 1)[0] + "_corrected.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(corrected)

    print("=" * 65)
    print("  HERB-NAME CORRECTION LAYER — RESULTS")
    print("=" * 65)
    print(f"\nBEFORE correction: {len(before)}/25 = {len(before)/25*100:.1f}%")
    print(f"AFTER  correction: {len(after)}/25 = {len(after)/25*100:.1f}%")

    still_missed = [h for h in SIMULATION_HERBS if h not in after]
    print(f"\nStill missing after correction ({len(still_missed)}): {'  '.join(still_missed) if still_missed else '(none)'}")

    print(f"\nEdits applied ({len(edits)}), sorted by position in transcript:")
    for start, end, term, score in sorted(edits, key=lambda e: e[0]):
        original = transcript[start:end]
        print(f"  '{original}' -> '{term}'  (similarity {score:.0%})")

    print(f"\nCorrected transcript saved to: {out_path}")
    print("=" * 65)

if __name__ == "__main__":
    main()
