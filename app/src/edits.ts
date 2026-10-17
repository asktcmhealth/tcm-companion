// The physician's corrections to what the engine produced (mirrors
// mobile/src/herbEdits.ts). Kept apart from the engine output so a correction
// can always be undone and the original is never lost. Only choices the
// physician makes themselves change an entry: keep the heard term, use the
// near-tied alternative the engine already showed, or retype a dose. There is
// no free-text herb entry, so nothing outside the herb database can get in.
//
// The sidecar supplies what is needed to re-check a changed entry without the
// herb database: `dose_range` for each herb and, for flagged entries, a
// ready-to-use `alternative`. A sidecar built before those fields existed
// simply offers no corrections.

export interface HerbAlternative {
  name: string;
  dosage_warning: boolean;
  dosage_check_message: string;
  high_risk: boolean;
  dose_range: [number, number];
}

export interface HerbEntry {
  name: string;
  dosage: number;
  unit: string;
  db_confirmed: boolean;
  dosage_warning: boolean;
  dosage_check_message: string;
  high_risk: boolean;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
  dose_range?: [number, number];
  alternative?: HerbAlternative;
}

export interface AcupointEntry {
  name: string;
  code: string;
  meridian: string;
  laterality: string | null;
  db_confirmed: boolean;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
  alternative?: { name: string; code: string; meridian: string };
}

export interface HerbEdit {
  swap?: boolean;
  resolved?: boolean;
  dosage?: number;
}

export interface PointEdit {
  swap?: boolean;
  resolved?: boolean;
}

export type EffectiveHerb = HerbEntry & {
  edited: boolean;
  confirmed: boolean;
  originalName: string;
  originalDosage: number;
  canEditDose: boolean;
};

export type EffectivePoint = AcupointEntry & { edited: boolean; confirmed: boolean; originalName: string };

export const MAX_DOSE_GRAMS = 1000;

/** Parses typed grams: a positive number, optionally with decimals. null if unusable. */
export function parseDose(text: string): number | null {
  const trimmed = text.trim().replace(/\s*[gG克]$/, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const grams = Number(trimmed);
  return grams > 0 && grams <= MAX_DOSE_GRAMS ? grams : null;
}

export function applyHerbEdit(orig: HerbEntry, edit: HerbEdit | undefined): EffectiveHerb {
  const alt = edit?.swap ? orig.alternative : undefined;
  const dosage = edit?.dosage ?? orig.dosage;
  const doseChanged = dosage !== orig.dosage;
  const changed = !!alt || doseChanged;
  const range = alt ? alt.dose_range : orig.dose_range;
  const base = {
    originalName: orig.name,
    originalDosage: orig.dosage,
    canEditDose: !!orig.dose_range, // without a range a new dose could not be re-checked
  };
  if (!changed && !edit?.resolved) return { ...orig, edited: false, confirmed: false, ...base };

  const name = alt ? alt.name : orig.name;
  const highRisk = alt ? alt.high_risk : orig.high_risk;
  let warning = alt ? alt.dosage_warning : orig.dosage_warning;
  let message = alt ? alt.dosage_check_message : orig.dosage_check_message;
  if (doseChanged && range) {
    const [lo, hi] = range;
    warning = dosage < lo || dosage > hi;
    const severity = highRisk && warning ? "HIGH-RISK HERB — " : "";
    message = warning
      ? `${severity}${name} ${dosage}g is OUTSIDE typical range ${lo}-${hi}g — requires physician confirmation before save`
      : `${name} ${dosage}g within typical range ${lo}-${hi}g${highRisk ? " -- HIGH-RISK HERB, review regardless of dose" : ""}`;
  }
  const settled = !!alt || !!edit?.resolved;
  return {
    ...orig,
    name,
    dosage,
    dosage_warning: warning,
    dosage_check_message: message,
    high_risk: highRisk,
    ambiguous: !!orig.ambiguous && !settled,
    ambiguous_with: alt ? null : orig.ambiguous_with,
    dose_range: range,
    edited: changed,
    confirmed: !!orig.ambiguous && settled,
    ...base,
  };
}

export function applyPointEdit(orig: AcupointEntry, edit: PointEdit | undefined): EffectivePoint {
  const alt = edit?.swap ? orig.alternative : undefined;
  if (!alt && !edit?.resolved) return { ...orig, edited: false, confirmed: false, originalName: orig.name };
  return {
    ...orig,
    name: alt ? alt.name : orig.name,
    code: alt ? alt.code : orig.code,
    meridian: alt ? alt.meridian : orig.meridian,
    ambiguous: false,
    ambiguous_with: alt ? null : orig.ambiguous_with,
    edited: !!alt,
    confirmed: !!orig.ambiguous,
    originalName: orig.name,
  };
}
