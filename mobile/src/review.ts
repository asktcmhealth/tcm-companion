import type { EffectiveHerb, EffectivePoint } from './herbEdits';

// "Reviewed" is the physician's own statement that they checked every entry
// against the recording. The app never judges the prescription; it only refuses
// to let that statement be made while something is still unchecked or
// unresolved, and withdraws it the moment anything changes afterwards.
//
// An out-of-range dose does not block separately: the "dose checked" tick is
// the deliberate confirmation of the dose as shown, warning included.

export interface ReviewStatus {
  ready: boolean;
  nothingToReview: boolean;
  uncheckedDoses: number;
  unresolved: number; // uncertain matches (herbs + points) not yet kept/swapped
}

export function reviewStatus(
  herbs: EffectiveHerb[],
  points: EffectivePoint[],
  confirmed: ReadonlySet<number>,
): ReviewStatus {
  const uncheckedDoses = herbs.filter((_, i) => !confirmed.has(i)).length;
  const unresolved = herbs.filter(h => h.ambiguous).length + points.filter(p => p.ambiguous).length;
  const nothingToReview = herbs.length === 0 && points.length === 0;
  return {
    ready: !nothingToReview && uncheckedDoses === 0 && unresolved === 0,
    nothingToReview,
    uncheckedDoses,
    unresolved,
  };
}

/** Changes whenever anything the physician reviewed changes (herb, dose, point, tick). */
export function reviewSignature(
  herbs: EffectiveHerb[],
  points: EffectivePoint[],
  confirmed: ReadonlySet<number>,
): string {
  return JSON.stringify([
    herbs.map(h => [h.name, h.dosage]),
    points.map(p => [p.name, p.laterality]),
    [...confirmed].sort((a, b) => a - b),
  ]);
}

export interface ReviewRecord {
  signature: string;
  time: string;
}

/** The review still stands only if nothing changed since and everything is still settled. */
export function activeReview(
  record: ReviewRecord | null,
  status: ReviewStatus,
  signature: string,
): ReviewRecord | null {
  return record && status.ready && record.signature === signature ? record : null;
}

export function clockTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
