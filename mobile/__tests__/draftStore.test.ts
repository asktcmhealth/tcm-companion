import { clearDraft, loadDraft, saveDraft, type DraftState } from '../src/draftStore';

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { DocumentDirectoryPath: '/docs' },
}));

const NOW = new Date(Date.UTC(2026, 9, 25, 12, 0, 0));
const day = 24 * 60 * 60 * 1000;

const state: DraftState = {
  herbs: [{ name: '柴胡', dosage: 10, unit: 'g', dbConfirmed: true, dosageWarning: false, dosageCheckMessage: '', highRisk: false, ambiguous: false }],
  points: [],
  prescriptionSectionFound: true,
  confirmed: [0],
  herbEdits: { 0: { dosage: 12 } },
  pointEdits: {},
  review: { signature: 's', time: '14:32' },
};

function memoryFs() {
  const files = new Map<string, string>();
  return {
    files,
    fs: {
      writeFile: jest.fn(async (p: string, d: string) => void files.set(p, d)),
      readFile: jest.fn(async (p: string) => {
        if (!files.has(p)) throw new Error('ENOENT');
        return files.get(p) as string;
      }),
      exists: jest.fn(async (p: string) => files.has(p)),
      unlink: jest.fn(async (p: string) => void files.delete(p)),
    },
  };
}

describe('draft store', () => {
  it('round-trips the work in progress', async () => {
    const { fs } = memoryFs();
    await saveDraft(state, fs as never, NOW);
    expect(await loadDraft(30, fs as never, NOW.getTime())).toMatchObject({ ...state, savedAt: NOW.toISOString() });
  });

  it('never stores the transcript or anything beyond the draft fields', async () => {
    const { fs, files } = memoryFs();
    await saveDraft({ ...state, transcript: '张三 NRIC S1234567D', audio: '/cache/consultation_1.wav' } as never, fs as never, NOW);
    const raw = [...files.values()][0];
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ['confirmed', 'herbEdits', 'herbs', 'pointEdits', 'points', 'prescriptionSectionFound', 'review', 'savedAt', 'version'],
    );
    expect(raw).not.toContain('S1234567D');
    expect(raw).not.toContain('consultation_1.wav');
  });

  it('returns null when there is no draft', async () => {
    const { fs } = memoryFs();
    expect(await loadDraft(30, fs as never, NOW.getTime())).toBeNull();
  });

  it('deletes and ignores a draft older than the retention window', async () => {
    const { fs, files } = memoryFs();
    await saveDraft(state, fs as never, new Date(NOW.getTime() - 31 * day));
    expect(await loadDraft(30, fs as never, NOW.getTime())).toBeNull();
    expect(files.size).toBe(0);
    await saveDraft(state, fs as never, new Date(NOW.getTime() - 31 * day));
    expect(await loadDraft(90, fs as never, NOW.getTime())).not.toBeNull();
  });

  it('deletes a corrupt or unknown-version draft instead of crashing', async () => {
    const { fs, files } = memoryFs();
    files.set('/docs/draft.json', 'not json');
    expect(await loadDraft(30, fs as never, NOW.getTime())).toBeNull();
    expect(files.size).toBe(0);
    files.set('/docs/draft.json', JSON.stringify({ version: 2, savedAt: NOW.toISOString(), herbs: [], points: [] }));
    expect(await loadDraft(30, fs as never, NOW.getTime())).toBeNull();
    expect(files.size).toBe(0);
  });

  it('clearDraft removes it and is harmless when absent', async () => {
    const { fs, files } = memoryFs();
    await saveDraft(state, fs as never, NOW);
    await clearDraft(fs as never);
    expect(files.size).toBe(0);
    await expect(clearDraft(fs as never)).resolves.toBeUndefined();
  });
});
