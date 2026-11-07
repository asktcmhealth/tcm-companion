import RNFS from 'react-native-fs';

// Recent transcripts, so the physician can go back to an earlier recording.
//
// This DOES write transcript text to the device (a transcript can contain a
// patient's name and details), unlike the draft (see draftStore.ts). That was
// chosen explicitly: the file lives in the app's private Documents folder,
// entries are deleted after the same retention window as recordings, each one
// can be deleted, and the whole list can be cleared. It never leaves the
// device. At most MAX_ENTRIES are kept; the oldest drop off first.

export const MAX_ENTRIES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TranscriptEntry {
  id: string;
  savedAt: string;
  text: string;
  language: string;
  seconds: number | null;
}

type Fs = Pick<typeof RNFS, 'writeFile' | 'readFile' | 'exists' | 'unlink'>;

const historyPath = () => `${RNFS.DocumentDirectoryPath}/transcripts.json`;

async function read(fs: Fs): Promise<TranscriptEntry[]> {
  try {
    if (!(await fs.exists(historyPath()))) return [];
    const data = JSON.parse(await fs.readFile(historyPath(), 'utf8'));
    if (data?.version !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries
      .filter((e: Partial<TranscriptEntry>) => typeof e?.id === 'string' && typeof e.text === 'string' && !Number.isNaN(Date.parse(e.savedAt ?? '')))
      .map((e: TranscriptEntry) => ({
        id: e.id,
        savedAt: e.savedAt,
        text: e.text,
        language: typeof e.language === 'string' ? e.language : 'zh',
        seconds: typeof e.seconds === 'number' ? e.seconds : null,
      }));
  } catch {
    return [];
  }
}

async function write(entries: TranscriptEntry[], fs: Fs): Promise<void> {
  if (entries.length === 0) {
    try {
      if (await fs.exists(historyPath())) await fs.unlink(historyPath());
    } catch {
      // already gone
    }
    return;
  }
  await fs.writeFile(historyPath(), JSON.stringify({ version: 1, entries }), 'utf8');
}

/** Entries newer than the retention window, newest first. Expired ones are removed from disk. */
export async function loadTranscripts(retentionDays: number, fs: Fs = RNFS, now: number = Date.now()): Promise<TranscriptEntry[]> {
  const all = await read(fs);
  const kept = all.filter(e => now - Date.parse(e.savedAt) <= retentionDays * DAY_MS);
  if (kept.length !== all.length) await write(kept, fs).catch(() => {});
  return kept.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

/** Adds one transcript (empty text is ignored) and returns the updated list, newest first. */
export async function addTranscript(
  text: string,
  language: string,
  seconds: number | null,
  retentionDays: number,
  fs: Fs = RNFS,
  now: Date = new Date(),
): Promise<TranscriptEntry[]> {
  const current = await loadTranscripts(retentionDays, fs, now.getTime());
  if (text.trim() === '') return current;
  const entry: TranscriptEntry = { id: `${now.getTime()}`, savedAt: now.toISOString(), text, language, seconds };
  const next = [entry, ...current.filter(e => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  await write(next, fs);
  return next;
}

export async function deleteTranscript(id: string, fs: Fs = RNFS): Promise<TranscriptEntry[]> {
  const next = (await read(fs)).filter(e => e.id !== id);
  await write(next, fs);
  return next.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function clearTranscripts(fs: Fs = RNFS): Promise<void> {
  await write([], fs);
}
