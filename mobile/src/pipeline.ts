// Port of benchmark/pipeline.py's extract_prescription/extract_acupuncture.
// Includes the dosage-theft-prevention fix (reject a candidate outright if
// its nearest dosage number is already claimed, rather than falling
// through to the next unclaimed one) -- that fix replaced a version that
// let a phantom herb match cascade into stealing several real herbs'
// dosages on real audio. Do not "simplify" this back to a fallback search.

import { HERB_DATABASE } from './herbDatabase';
import { ACUPOINT_DATABASE } from './acupointDatabase';
import { findPrescriptionSpans, findAcupunctureSpans, type Correction } from './correctHerbs';
import { checkDosage } from './dosageRanges';

// [gG克]: confirmed on real audio that model choice changes which unit
// whisper writes out, not just how well it transcribes herb names --
// mobile's ggml-medium-q5_0 writes the actual Chinese "克" (grams)
// character instead of the Latin "g" that ggml-small (and desktop's
// faster-whisper, which this pattern was ported from) always used. Without
// "克" here, a more-accurate transcript still extracts ZERO herbs, because
// every dosage number becomes invisible to this regex.
const DOSAGE_PATTERN = /(\d+)\s*[gG克]/;

export interface HerbEntry {
  name: string;
  dosage: number;
  unit: string;
  dbConfirmed: boolean;
  dosageWarning: boolean;
  dosageCheckMessage: string;
  highRisk: boolean;
  // True when the fuzzy correction that produced this herb name won over a
  // near-tied alternative (see AMBIGUITY_MARGIN in correctHerbs.ts) --
  // confirmed on real audio to catch cases where a different real herb,
  // not just noise, was the runner-up (including two high-risk mixups).
  // Matched to `edits` by name, so a herb prescribed twice in one visit
  // would share one flag between both entries -- an acceptable POC
  // limitation, not a silent-danger regression, since it never under-flags.
  ambiguous: boolean;
  ambiguousWith?: string;
}

// `edits` is optional so callers that only need extraction (no correction
// step, e.g. testing extractPrescription in isolation) aren't forced to
// thread it through; pass it whenever correctPrescriptionOnly() was used
// upstream so ambiguity flags survive into the final herb list.
export function extractPrescription(text: string, edits: Correction[] = []): HerbEntry[] {
  const ambiguousByName = new Map<string, Correction>();
  for (const edit of edits) {
    if (edit.ambiguous) ambiguousByName.set(edit.term, edit);
  }
  const entries: Array<{ name: string; dosage: number; sourceStart: number }> = [];
  const spans = findPrescriptionSpans(text);

  for (const [start, end] of spans) {
    const segment = text.slice(start, end);
    const claimed = new Array(segment.length).fill(false);
    const herbNames = Object.keys(HERB_DATABASE).sort((a, b) => b.length - a.length);

    for (const herb of herbNames) {
      let searchFrom = 0;
      for (;;) {
        const idx = segment.indexOf(herb, searchFrom);
        if (idx === -1) break;
        searchFrom = idx + 1;
        const mStart = idx;
        const mEnd = idx + herb.length;

        let herbClaimed = false;
        for (let i = mStart; i < mEnd; i++) {
          if (claimed[i]) {
            herbClaimed = true;
            break;
          }
        }
        if (herbClaimed) continue;

        const after = segment.slice(mEnd, mEnd + 15);
        const doseMatch = DOSAGE_PATTERN.exec(after);
        if (!doseMatch) continue;

        const doseStart = mEnd + doseMatch.index;
        const doseEnd = doseStart + doseMatch[0].length;

        let doseClaimed = false;
        for (let i = doseStart; i < doseEnd; i++) {
          if (claimed[i]) {
            doseClaimed = true;
            break;
          }
        }
        if (doseClaimed) continue;

        for (let i = mStart; i < mEnd; i++) claimed[i] = true;
        for (let i = doseStart; i < doseEnd; i++) claimed[i] = true;

        entries.push({ name: herb, dosage: parseInt(doseMatch[1], 10), sourceStart: start + mStart });
      }
    }
  }

  entries.sort((a, b) => a.sourceStart - b.sourceStart);

  return entries.map(({ name, dosage }) => {
    const check = checkDosage(name, dosage);
    const ambiguousEdit = ambiguousByName.get(name);
    return {
      name,
      dosage,
      unit: 'g',
      dbConfirmed: true,
      dosageWarning: check.status !== 'ok',
      dosageCheckMessage: check.message,
      highRisk: check.highRisk,
      ambiguous: !!ambiguousEdit,
      ambiguousWith: ambiguousEdit?.runnerUp,
    };
  });
}

const LATERALITY_PATTERN = /^(双侧|两侧|左侧|右侧|左|右)/;

export interface AcupointEntry {
  name: string;
  code: string;
  meridian: string;
  laterality: string | null;
  dbConfirmed: boolean;
  ambiguous: boolean;
  ambiguousWith?: string;
}

// `edits` mirrors extractPrescription's parameter -- pass the edits from
// correctAcupunctureOnly() upstream so ambiguity flags (see
// AMBIGUITY_MARGIN in correctHerbs.ts) survive into the final point list.
export function extractAcupuncture(text: string, edits: Correction[] = []): AcupointEntry[] {
  const ambiguousByName = new Map<string, Correction>();
  for (const edit of edits) {
    if (edit.ambiguous) ambiguousByName.set(edit.term, edit);
  }

  const entries: Array<AcupointEntry & { sourceStart: number }> = [];
  const spans = findAcupunctureSpans(text);

  for (const [start, end] of spans) {
    const segment = text.slice(start, end);
    const claimed = new Array(segment.length).fill(false);
    const pointNames = Object.keys(ACUPOINT_DATABASE).sort((a, b) => b.length - a.length);

    for (const point of pointNames) {
      let searchFrom = 0;
      for (;;) {
        const idx = segment.indexOf(point, searchFrom);
        if (idx === -1) break;
        searchFrom = idx + 1;
        const mStart = idx;
        const mEnd = idx + point.length;

        let pointClaimed = false;
        for (let i = mStart; i < mEnd; i++) {
          if (claimed[i]) {
            pointClaimed = true;
            break;
          }
        }
        if (pointClaimed) continue;
        for (let i = mStart; i < mEnd; i++) claimed[i] = true;

        const after = segment.slice(mEnd, mEnd + 6);
        const latMatch = LATERALITY_PATTERN.exec(after);
        const info = ACUPOINT_DATABASE[point];
        const ambiguousEdit = ambiguousByName.get(point);
        entries.push({
          name: point,
          code: info.code,
          meridian: info.meridian,
          laterality: latMatch ? latMatch[0] : null,
          dbConfirmed: true,
          ambiguous: !!ambiguousEdit,
          ambiguousWith: ambiguousEdit?.runnerUp,
          sourceStart: start + mStart,
        });
      }
    }
  }

  entries.sort((a, b) => a.sourceStart - b.sourceStart);
  return entries.map(({ sourceStart, ...rest }) => rest);
}
