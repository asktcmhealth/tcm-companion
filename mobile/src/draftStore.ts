import RNFS from 'react-native-fs';
import type { HerbEdit, PointEdit } from './herbEdits';
import type { ReviewRecord } from './review';
import type { AcupointEntry, HerbEntry } from './pipeline';

// Keeps the physician's work-in-progress across an app restart or an
// interruption, so a half-checked prescription is not lost.
//
// Deliberately stored: the extracted herbs/doses and acupoints, the ticks, the
// corrections and the review stamp. Deliberately NOT stored: the transcript
// and the audio -- the draft is the least sensitive useful thing to keep.
// It is deleted after the same retention window as recordings (see
// retention.ts), can be cleared at any time, and lives in the app's own
// private Documents folder. One draft at a time: a new result replaces it.

export interface DraftState {
  herbs: HerbEntry[];
  points: AcupointEntry[];
  prescriptionSectionFound: boolean;
  confirmed: number[];
  herbEdits: Record<number, HerbEdit>;
  pointEdits: Record<number, PointEdit>;
  review: ReviewRecord | null;
}

interface StoredDraft extends DraftState {
  version: 1;
  savedAt: string;
}

type Fs = Pick<typeof RNFS, 'writeFile' | 'readFile' | 'exists' | 'unlink'>;

const draftPath = () => `${RNFS.DocumentDirectoryPath}/draft.json`;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveDraft(state: DraftState, fs: Fs = RNFS, now: Date = new Date()): Promise<void> {
  // Named fields only, so nothing else handed in by mistake (a transcript, a
  // file path) can ever be written to disk.
  const stored: StoredDraft = {
    version: 1,
    savedAt: now.toISOString(),
    herbs: state.herbs,
    points: state.points,
    prescriptionSectionFound: state.prescriptionSectionFound,
    confirmed: state.confirmed,
    herbEdits: state.herbEdits,
    pointEdits: state.pointEdits,
    review: state.review,
  };
  await fs.writeFile(draftPath(), JSON.stringify(stored), 'utf8');
}

export async function clearDraft(fs: Fs = RNFS): Promise<void> {
  try {
    if (await fs.exists(draftPath())) await fs.unlink(draftPath());
  } catch {
    // nothing to clear / already gone
  }
}

/**
 * The saved draft, or null if there is none, it is unreadable, or it is older
 * than the retention window (in which case it is deleted).
 */
export async function loadDraft(
  retentionDays: number,
  fs: Fs = RNFS,
  now: number = Date.now(),
): Promise<(DraftState & { savedAt: string }) | null> {
  try {
    if (!(await fs.exists(draftPath()))) return null;
    const data = JSON.parse(await fs.readFile(draftPath(), 'utf8')) as Partial<StoredDraft>;
    const savedMs = Date.parse(data.savedAt ?? '');
    if (data.version !== 1 || !Array.isArray(data.herbs) || !Array.isArray(data.points) || Number.isNaN(savedMs)) {
      await clearDraft(fs);
      return null;
    }
    if (now - savedMs > retentionDays * DAY_MS) {
      await clearDraft(fs);
      return null;
    }
    return {
      herbs: data.herbs,
      points: data.points,
      prescriptionSectionFound: !!data.prescriptionSectionFound,
      confirmed: Array.isArray(data.confirmed) ? data.confirmed.filter(n => Number.isInteger(n)) : [],
      herbEdits: data.herbEdits ?? {},
      pointEdits: data.pointEdits ?? {},
      review: data.review ?? null,
      savedAt: data.savedAt as string,
    };
  } catch {
    await clearDraft(fs);
    return null;
  }
}
