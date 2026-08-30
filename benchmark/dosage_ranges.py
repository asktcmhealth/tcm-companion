"""
Dosage-range validation -- thin wrapper over herb_database.py's dose_g field.

Previously this file held its own 25-herb range table; that duplicated
herb_database.py and risked the two drifting apart (they briefly did, until
this refactor). herb_database.py is now the single source of truth for
herb name / pinyin / category / dosage range / high-risk flag.

See herb_database.py's docstring for the full caveats -- this is still a
DRAFT covering ~130 workhorse herbs, not the licensed/verified ~300-herb
pharmacopoeia table required by plan-review.md TODO #2 or #5.

Range = (min_grams, max_grams). Unit conversions (钱/qian) are NOT handled
here -- schema tracks unit separately (plan-review.md "unit": "g | qian");
a real implementation must convert before calling check_dosage.
"""

from herb_database import HERB_DATABASE


def check_dosage(herb, grams):
    """Returns (status, message, high_risk).
    status in {"ok", "out_of_range", "unknown_herb"}

    high_risk is independent of status -- a herb like 麻黄 (cardiac/BP caution)
    or 杏仁 (amygdalin/cyanide content) should stay flagged for physician
    attention even when the dose is perfectly within normal range. Previously
    the high-risk flag only appeared in the out-of-range message, so a
    high-risk herb at a normal dose looked identical to any other herb --
    caught when 麻黄 and 杏仁 both showed as plain, unflagged entries in a
    real test run despite being marked high_risk in the database."""
    entry = HERB_DATABASE.get(herb)
    if entry is None:
        return "unknown_herb", f"{herb} not in herb database -- cannot validate, flag for manual entry", False

    lo, hi = entry["dose_g"]
    high_risk = entry["high_risk"]

    if lo <= grams <= hi:
        msg = f"{herb} {grams}g within typical range {lo}-{hi}g"
        if high_risk:
            msg += " -- HIGH-RISK HERB, review regardless of dose"
        return "ok", msg, high_risk

    severity = "HIGH-RISK HERB — " if high_risk else ""
    return "out_of_range", f"{severity}{herb} {grams}g is OUTSIDE typical range {lo}-{hi}g — requires physician confirmation before save", high_risk
