import { DEFAULT_RETENTION_DAYS, loadRetentionDays, purgeOldRecordings, saveRetentionDays } from '../src/retention';

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { DocumentDirectoryPath: '/docs', CachesDirectoryPath: '/cache' },
}));

const NOW = Date.UTC(2026, 9, 5);
const day = 24 * 60 * 60 * 1000;
const file = (name: string, ageDays: number | null, isFile = true) => ({
  name,
  path: `/cache/${name}`,
  isFile: () => isFile,
  mtime: ageDays === null ? undefined : new Date(NOW - ageDays * day),
});

function fakeFs(entries: ReturnType<typeof file>[]) {
  return {
    readDir: jest.fn().mockResolvedValue(entries),
    unlink: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn().mockResolvedValue(undefined),
  };
}

describe('purgeOldRecordings', () => {
  it('deletes only our own recordings older than the limit', async () => {
    const fs = fakeFs([
      file('consultation_old.wav', 31),
      file('consultation_old.pcm', 45),
      file('consultation_recent.wav', 29),
      file('whisper-model.bin', 400), // not ours: never touched
      file('consultation_dir.wav', 99, false),
    ]);
    expect(await purgeOldRecordings(30, fs as any, '/cache', NOW)).toBe(2);
    expect(fs.unlink.mock.calls.map(c => c[0]).sort()).toEqual(['/cache/consultation_old.pcm', '/cache/consultation_old.wav']);
  });

  it('honours a longer window', async () => {
    const fs = fakeFs([file('consultation_a.wav', 60), file('consultation_b.wav', 100)]);
    expect(await purgeOldRecordings(90, fs as any, '/cache', NOW)).toBe(1);
  });

  it('keeps a file whose age is unknown', async () => {
    const fs = fakeFs([file('consultation_x.wav', null)]);
    expect(await purgeOldRecordings(30, fs as any, '/cache', NOW)).toBe(0);
  });

  it('never throws, even if listing or deleting fails', async () => {
    const fs = fakeFs([file('consultation_a.wav', 99)]);
    fs.unlink.mockRejectedValue(new Error('busy'));
    expect(await purgeOldRecordings(30, fs as any, '/cache', NOW)).toBe(0);
    fs.readDir.mockRejectedValue(new Error('gone'));
    await expect(purgeOldRecordings(30, fs as any, '/cache', NOW)).resolves.toBe(0);
  });
});

describe('retention setting', () => {
  it('defaults to 30 days and rejects unknown values', async () => {
    const fs = fakeFs([]);
    fs.exists.mockResolvedValue(false);
    expect(await loadRetentionDays(fs as any)).toBe(DEFAULT_RETENTION_DAYS);
    fs.exists.mockResolvedValue(true);
    fs.readFile.mockResolvedValue('{"retentionDays":7}');
    expect(await loadRetentionDays(fs as any)).toBe(30);
    fs.readFile.mockResolvedValue('{"retentionDays":90}');
    expect(await loadRetentionDays(fs as any)).toBe(90);
    fs.readFile.mockResolvedValue('garbage');
    expect(await loadRetentionDays(fs as any)).toBe(30);
  });

  it('persists the choice', async () => {
    const fs = fakeFs([]);
    await saveRetentionDays(90, fs as any);
    expect(fs.writeFile).toHaveBeenCalledWith('/docs/settings.json', '{"retentionDays":90}', 'utf8');
  });
});
