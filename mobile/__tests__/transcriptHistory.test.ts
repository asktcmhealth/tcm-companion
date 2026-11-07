import { addTranscript, clearTranscripts, deleteTranscript, loadTranscripts, MAX_ENTRIES } from '../src/transcriptHistory';
import { DEFAULT_ASR_SETTINGS, loadAsrSettings, saveAsrSettings, whisperOptions } from '../src/asrSettings';

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { DocumentDirectoryPath: '/docs' },
}));

const NOW = new Date(Date.UTC(2026, 10, 7, 12, 0, 0));
const day = 24 * 60 * 60 * 1000;

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

describe('transcript history', () => {
  it('keeps transcripts newest first and round-trips them', async () => {
    const { fs } = memoryFs();
    await addTranscript('第一段', 'zh', 12, 30, fs as never, new Date(NOW.getTime() - 1000));
    const list = await addTranscript('第二段', 'zh', 9, 30, fs as never, NOW);
    expect(list.map(e => e.text)).toEqual(['第二段', '第一段']);
    expect((await loadTranscripts(30, fs as never, NOW.getTime()))[0].seconds).toBe(9);
  });

  it('ignores empty transcripts', async () => {
    const { fs, files } = memoryFs();
    const list = await addTranscript('   ', 'zh', 3, 30, fs as never, NOW);
    expect(list).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('drops entries older than the retention window and removes them from disk', async () => {
    const { fs, files } = memoryFs();
    await addTranscript('旧的', 'zh', 5, 30, fs as never, new Date(NOW.getTime() - 31 * day));
    const list = await loadTranscripts(30, fs as never, NOW.getTime());
    expect(list).toEqual([]);
    expect(files.size).toBe(0);
  });

  it('keeps entries inside the window when the window is widened to 90 days', async () => {
    const { fs } = memoryFs();
    await addTranscript('旧的', 'zh', 5, 90, fs as never, new Date(NOW.getTime() - 40 * day));
    expect(await loadTranscripts(90, fs as never, NOW.getTime())).toHaveLength(1);
  });

  it('caps the list and drops the oldest first', async () => {
    const { fs } = memoryFs();
    let list = [] as Awaited<ReturnType<typeof addTranscript>>;
    for (let i = 0; i < MAX_ENTRIES + 3; i++) {
      list = await addTranscript(`录音${i}`, 'zh', 1, 30, fs as never, new Date(NOW.getTime() + i * 1000));
    }
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0].text).toBe(`录音${MAX_ENTRIES + 2}`);
    expect(list.some(e => e.text === '录音0')).toBe(false);
  });

  it('deletes one entry, and clears the file when none are left', async () => {
    const { fs, files } = memoryFs();
    await addTranscript('甲', 'zh', 1, 30, fs as never, new Date(NOW.getTime() - 1000));
    const two = await addTranscript('乙', 'zh', 1, 30, fs as never, NOW);
    const after = await deleteTranscript(two[0].id, fs as never);
    expect(after.map(e => e.text)).toEqual(['甲']);
    await clearTranscripts(fs as never);
    expect(files.size).toBe(0);
  });

  it('survives a corrupt file', async () => {
    const { fs, files } = memoryFs();
    files.set('/docs/transcripts.json', '{not json');
    expect(await loadTranscripts(30, fs as never, NOW.getTime())).toEqual([]);
  });
});

describe('speech settings', () => {
  it('defaults to Chinese with automatic threads', async () => {
    const { fs } = memoryFs();
    expect(await loadAsrSettings(fs as never)).toEqual(DEFAULT_ASR_SETTINGS);
    expect(whisperOptions(DEFAULT_ASR_SETTINGS)).toEqual({ language: 'zh' });
  });

  it('round-trips a choice and passes threads only when set', async () => {
    const { fs } = memoryFs();
    await saveAsrSettings({ language: 'en', threads: 6 }, fs as never);
    const loaded = await loadAsrSettings(fs as never);
    expect(loaded).toEqual({ language: 'en', threads: 6 });
    expect(whisperOptions(loaded)).toEqual({ language: 'en', maxThreads: 6 });
  });

  it('falls back to defaults for unknown values', async () => {
    const { fs, files } = memoryFs();
    files.set('/docs/asr_settings.json', JSON.stringify({ language: 'fr', threads: 99 }));
    expect(await loadAsrSettings(fs as never)).toEqual(DEFAULT_ASR_SETTINGS);
  });
});

describe('what the history writes to disk', () => {
  it('stores the redacted transcript, never the identifiers', async () => {
    const { fs, files } = memoryFs();
    await addTranscript('hello today patient is julie low, NRIC是S987643G,电话81234567', 'en', 5, 30, fs as never, NOW);
    const onDisk = files.get('/docs/transcripts.json') as string;
    expect(onDisk).not.toMatch(/julie|low|S987643G|81234567/i);
    expect(onDisk).toContain('[NAME]');
  });

  it('treats a saved "auto" language from an older build as Mandarin', async () => {
    const { fs, files } = memoryFs();
    files.set('/docs/asr_settings.json', JSON.stringify({ language: 'auto', threads: 4 }));
    expect(await loadAsrSettings(fs as never)).toEqual({ language: 'zh', threads: 4 });
  });
});
