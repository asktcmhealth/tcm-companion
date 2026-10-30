// Keeps finished patients across an app restart (mirrors the idea of
// mobile/src/draftStore.ts), so an interrupted review is not lost.
//
// Deliberately stored, per patient: the generic label ("Patient 3 · 2:15 PM"),
// the extracted herbs/doses and acupoints, the dose ticks, the physician's
// corrections and the review stamp. Deliberately NOT stored: the transcript,
// the audio path, the consultation note, the de-identification report and the
// correction edits -- all of which can echo what was said in the room. Named
// fields only, so nothing else can reach storage by accident. Drafts follow
// the retention window (default 30 days, counted from when the result was
// produced) and can be cleared one by one.

import type { AcupointEntry, HerbEdit, HerbEntry, PointEdit } from "./edits";
import type { ReviewRecord } from "./review";

export const DRAFTS_KEY = "tcm-drafts-v1";

export interface DraftJob {
  id: string;
  label: string;
  createdAt: string; // ISO time the result was produced
  herbs: HerbEntry[];
  points: AcupointEntry[];
  prescriptionSectionFound: boolean;
  confirmed: number[];
  herbEdits: Record<number, HerbEdit>;
  pointEdits: Record<number, PointEdit>;
  review: ReviewRecord | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function serializeDrafts(jobs: DraftJob[]): string {
  return JSON.stringify({
    version: 1,
    jobs: jobs.map((j) => ({
      id: j.id,
      label: j.label,
      createdAt: j.createdAt,
      herbs: j.herbs,
      points: j.points,
      prescriptionSectionFound: j.prescriptionSectionFound,
      confirmed: j.confirmed,
      herbEdits: j.herbEdits,
      pointEdits: j.pointEdits,
      review: j.review,
    })),
  });
}

/** Saved drafts still inside the retention window; [] for anything missing or unreadable. */
export function parseDrafts(raw: string | null, retentionDays: number, now: number = Date.now()): DraftJob[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.jobs)) return [];
    const kept: DraftJob[] = [];
    for (const j of data.jobs) {
      const created = Date.parse(j?.createdAt ?? "");
      if (
        typeof j?.id !== "string" ||
        typeof j?.label !== "string" ||
        !Array.isArray(j.herbs) ||
        !Array.isArray(j.points) ||
        Number.isNaN(created) ||
        now - created > retentionDays * DAY_MS
      ) {
        continue;
      }
      kept.push({
        id: j.id,
        label: j.label,
        createdAt: j.createdAt,
        herbs: j.herbs,
        points: j.points,
        prescriptionSectionFound: !!j.prescriptionSectionFound,
        confirmed: Array.isArray(j.confirmed) ? j.confirmed.filter((n: unknown) => Number.isInteger(n)) : [],
        herbEdits: j.herbEdits ?? {},
        pointEdits: j.pointEdits ?? {},
        review: j.review ?? null,
      });
    }
    return kept;
  } catch {
    return [];
  }
}
