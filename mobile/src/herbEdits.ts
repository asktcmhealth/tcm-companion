import { ACUPOINT_DATABASE } from './acupointDatabase';
import { HERB_DATABASE } from './herbDatabase';
import { checkDosage } from './dosageRanges';
import type { AcupointEntry, HerbEntry } from './pipeline';

// The physician's corrections, kept apart from what the speech engine produced
// so they can always be undone and the original is never lost. Only choices
// the physician makes themselves change an entry: keep the heard term, use the
// near-tied alternative the engine already showed, or retype a dose. There is
// no free-text herb entry, so nothing outside the herb database can get in.

export interface HerbEdit {
  swap?: boolean; // use the runner-up herb instead of the heard one
  resolved?: boolean; // the physician confirmed the heard herb
  dosage?: number; // retyped dose, grams
}

export interface PointEdit {
  swap?: boolean;
  resolved?: boolean;
}

export type EffectiveHerb = HerbEntry & {
  edited: boolean; // swapped herb or changed dose
  confirmed: boolean; // physician settled an uncertain match (kept or swapped)
  originalName: string;
  originalDosage: number;
};

export type EffectivePoint = AcupointEntry & { edited: boolean; confirmed: boolean; originalName: string };

export const MAX_DOSE_GRAMS = 1000;

/** Parses typed grams: a positive number, optionally with decimals. null if unusable. */
export function parseDose(text: string): number | null {
  const trimmed = text.trim().replace(/\s*[gG克]$/, '');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const grams = Number(trimmed);
  return grams > 0 && grams <= MAX_DOSE_GRAMS ? grams : null;
}

export function applyHerbEdit(orig: HerbEntry, edit: HerbEdit | undefined): EffectiveHerb {
  const canSwap = !!edit?.swap && !!orig.ambiguousWith && orig.ambiguousWith in HERB_DATABASE;
  const name = canSwap ? (orig.ambiguousWith as string) : orig.name;
  const dosage = edit?.dosage ?? orig.dosage;
  const changed = canSwap || dosage !== orig.dosage;
  const base = { originalName: orig.name, originalDosage: orig.dosage };
  if (!changed && !edit?.resolved) return { ...orig, edited: false, confirmed: false, ...base };

  const check = checkDosage(name, dosage);
  const settled = canSwap || !!edit?.resolved;
  return {
    ...orig,
    name,
    dosage,
    dosageWarning: check.status !== 'ok',
    dosageCheckMessage: check.message,
    highRisk: check.highRisk,
    ambiguous: orig.ambiguous && !settled,
    ambiguousWith: canSwap ? undefined : orig.ambiguousWith,
    edited: changed,
    confirmed: orig.ambiguous && settled,
    ...base,
  };
}

export function applyPointEdit(orig: AcupointEntry, edit: PointEdit | undefined): EffectivePoint {
  const canSwap = !!edit?.swap && !!orig.ambiguousWith && orig.ambiguousWith in ACUPOINT_DATABASE;
  if (!canSwap && !edit?.resolved) return { ...orig, edited: false, confirmed: false, originalName: orig.name };
  const alt = canSwap ? ACUPOINT_DATABASE[orig.ambiguousWith as string] : null;
  return {
    ...orig,
    name: canSwap ? (orig.ambiguousWith as string) : orig.name,
    code: alt ? alt.code : orig.code,
    meridian: alt ? alt.meridian : orig.meridian,
    ambiguous: false,
    ambiguousWith: canSwap ? undefined : orig.ambiguousWith,
    edited: canSwap,
    confirmed: orig.ambiguous,
    originalName: orig.name,
  };
}
