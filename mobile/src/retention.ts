import RNFS from 'react-native-fs';

// Audio retention (plan-review.md: delete_on_sign | 30_days | 90_days). There
// is no sign-off step in the app yet, so only the day-based options exist; the
// default is 30 days. Recordings are the app's own consultation_*.wav/.pcm
// files in its cache folder -- nothing else is ever touched.

export const RETENTION_OPTIONS = [30, 90] as const;
export const DEFAULT_RETENTION_DAYS = 30;

type Fs = Pick<typeof RNFS, 'readDir' | 'unlink' | 'exists' | 'readFile' | 'writeFile'>;

const settingsPath = () => `${RNFS.DocumentDirectoryPath}/settings.json`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECORDING_FILE = /^consultation_.*\.(wav|pcm)$/;

export async function loadRetentionDays(fs: Fs = RNFS): Promise<number> {
  try {
    if (!(await fs.exists(settingsPath()))) return DEFAULT_RETENTION_DAYS;
    const days = JSON.parse(await fs.readFile(settingsPath(), 'utf8'))?.retentionDays;
    return (RETENTION_OPTIONS as readonly number[]).includes(days) ? days : DEFAULT_RETENTION_DAYS;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

export async function saveRetentionDays(days: number, fs: Fs = RNFS): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify({ retentionDays: days }), 'utf8');
}

/** Deletes this app's recordings older than `days`. Returns how many were removed. */
export async function purgeOldRecordings(
  days: number,
  fs: Fs = RNFS,
  dir: string = RNFS.CachesDirectoryPath,
  now: number = Date.now(),
): Promise<number> {
  let removed = 0;
  try {
    for (const file of await fs.readDir(dir)) {
      if (!file.isFile() || !RECORDING_FILE.test(file.name)) continue;
      const modified = file.mtime ? file.mtime.getTime() : now; // unknown age: keep
      if (now - modified > days * DAY_MS) {
        await fs.unlink(file.path).then(() => removed++, () => {});
      }
    }
  } catch {
    // Housekeeping must never get in the way of recording.
  }
  return removed;
}
