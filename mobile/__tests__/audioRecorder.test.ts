/// <reference types="node" />
import { AudioRecorder, wavHeader, peakLevel, toBase64, SILENCE_PEAK_THRESHOLD } from '../src/audioRecorder';

// The recorder's collaborators are native modules; only the logic under test
// (ordering, draining, WAV assembly, level detection) matters here.
jest.mock('whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter', () => ({
  AudioPcmStreamAdapter: class {},
}));
jest.mock('react-native-fs', () => ({ __esModule: true, default: { CachesDirectoryPath: '/cache' } }));

jest.setTimeout(30000); // base64 over a few MB in JS is slow, and slower still on a loaded machine

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

function makeFs(opts: { appendDelayMs?: () => number; failAppendAt?: number } = {}) {
  const files = new Map<string, Buffer>();
  let inFlight = 0;
  let maxInFlight = 0;
  let appendCalls = 0;
  const fs = {
    writeFile: async (p: string, data: string, enc: string) => {
      files.set(p, enc === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data));
    },
    appendFile: async (p: string, data: string, _enc: string) => {
      appendCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Delay BEFORE mutating, so if two appends ever overlapped, the one with
      // the shorter delay would land first -- reordering the audio.
      await delay(opts.appendDelayMs ? opts.appendDelayMs() : 0);
      inFlight -= 1;
      if (opts.failAppendAt === appendCalls) throw new Error('disk full');
      files.set(p, Buffer.concat([files.get(p) ?? Buffer.alloc(0), Buffer.from(data, 'base64')]));
    },
    read: async (p: string, length: number, position: number, _enc: string) =>
      files.get(p)!.subarray(position, position + length).toString('base64'),
    unlink: async (p: string) => {
      files.delete(p);
    },
    exists: async (p: string) => files.has(p),
  };
  return { fs, files, stats: () => ({ maxInFlight, appendCalls }) };
}

function makeAdapter() {
  let handler: ((c: { data: Uint8Array }) => void) | null = null;
  return {
    adapter: {
      initialize: async () => {},
      onData: (cb: (c: { data: Uint8Array }) => void) => {
        handler = cb;
      },
      start: async () => {},
      stop: async () => {},
      release: async () => {},
    },
    emit: (data: Uint8Array) => handler!({ data }),
  };
}

// A chunk whose bytes encode its own index, so any duplication, loss, or
// reordering shows up as a byte-for-byte mismatch.
function chunk(index: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 2) {
    out[i] = index & 0xff;
    out[i + 1] = (i / 2) & 0x7f; // keeps samples small and positive
  }
  return out;
}

const parseWav = (wav: Buffer) => ({
  riff: wav.toString('ascii', 0, 4),
  wave: wav.toString('ascii', 8, 12),
  fmt: wav.toString('ascii', 12, 16),
  riffSize: wav.readUInt32LE(4),
  audioFormat: wav.readUInt16LE(20),
  channels: wav.readUInt16LE(22),
  sampleRate: wav.readUInt32LE(24),
  byteRate: wav.readUInt32LE(28),
  blockAlign: wav.readUInt16LE(32),
  bitsPerSample: wav.readUInt16LE(34),
  data: wav.toString('ascii', 36, 40),
  dataSize: wav.readUInt32LE(40),
  pcm: wav.subarray(44),
});

describe('wavHeader', () => {
  it('is a canonical 16kHz mono 16-bit PCM header', () => {
    const h = parseWav(Buffer.concat([Buffer.from(wavHeader(1000)), Buffer.alloc(1000)]));
    expect(h).toMatchObject({
      riff: 'RIFF', wave: 'WAVE', fmt: 'fmt ', data: 'data',
      riffSize: 1036, audioFormat: 1, channels: 1, sampleRate: 16000,
      byteRate: 32000, blockAlign: 2, bitsPerSample: 16, dataSize: 1000,
    });
  });
});

describe('peakLevel', () => {
  it('is 0 for silence, near 1 for full scale, and exact for a known sample', () => {
    expect(peakLevel(new Uint8Array(640))).toBe(0);
    const loud = new Uint8Array(4);
    new DataView(loud.buffer).setInt16(2, -32768, true);
    expect(peakLevel(loud)).toBe(1);
    const known = new Uint8Array(4);
    new DataView(known.buffer).setInt16(0, 1638, true); // ~0.05
    expect(peakLevel(known)).toBeCloseTo(0.05, 3);
    expect(peakLevel(new Uint8Array(3))).toBe(0); // odd trailing byte is ignored, not a crash
  });

  it('separates a dead microphone from real room noise', () => {
    const noise = new Uint8Array(4);
    new DataView(noise.buffer).setInt16(0, 300, true); // quiet room
    expect(peakLevel(noise)).toBeGreaterThan(SILENCE_PEAK_THRESHOLD);
    expect(peakLevel(new Uint8Array(640))).toBeLessThan(SILENCE_PEAK_THRESHOLD);
  });
});

describe('AudioRecorder', () => {
  async function record(chunks: Uint8Array[], fsOpts = {}, emitBeforeStop = 0) {
    const { fs, files, stats } = makeFs(fsOpts);
    const { adapter, emit } = makeAdapter();
    const rec = new AudioRecorder(fs as never, adapter as never, '/cache');
    await rec.start();
    chunks.forEach(emit);
    // Chunks emitted right before stop() are still in flight when it's called.
    for (let i = 0; i < emitBeforeStop; i++) emit(chunk(9000 + i, 320));
    const uri = await rec.stop();
    return { rec, files, stats, uri, path: uri.replace('file://', '') };
  }

  it('writes every chunk exactly once, in order, even when disk writes are slow and uneven', async () => {
    const chunks = Array.from({ length: 150 }, (_, i) => chunk(i, 320));
    const { files, stats, path } = await record(chunks, { appendDelayMs: () => Math.random() * 6 });
    const wav = parseWav(files.get(path)!);
    expect(Buffer.compare(wav.pcm, Buffer.concat(chunks))).toBe(0);
    expect(wav.dataSize).toBe(150 * 320);
    expect(wav.riffSize).toBe(36 + 150 * 320);
    expect(stats().maxInFlight).toBe(1); // appends never overlap -- the source of duplication/reordering
  });

  it('drains writes still in flight when stop() is called (the final dosage must not be lost)', async () => {
    const chunks = Array.from({ length: 20 }, (_, i) => chunk(i, 320));
    const tail = Array.from({ length: 5 }, (_, i) => chunk(9000 + i, 320));
    const { files, path } = await record(chunks, { appendDelayMs: () => 4 }, 5);
    const wav = parseWav(files.get(path)!);
    expect(Buffer.compare(wav.pcm, Buffer.concat([...chunks, ...tail]))).toBe(0);
  });

  it('streams a multi-megabyte recording across slice boundaries without corruption', async () => {
    const chunks = Array.from({ length: 200 }, (_, i) => chunk(i, 12_800)); // 2.56MB -> 3 slices
    const { files, path } = await record(chunks);
    const wav = parseWav(files.get(path)!);
    expect(wav.dataSize).toBe(2_560_000);
    expect(Buffer.compare(wav.pcm, Buffer.concat(chunks))).toBe(0);
  });

  it('removes the intermediate .pcm file and returns a file:// URI to the .wav', async () => {
    const { files, uri } = await record([chunk(1, 320)]);
    expect(uri).toMatch(/^file:\/\/\/cache\/consultation_\d+\.wav$/);
    expect([...files.keys()].some(p => p.endsWith('.pcm'))).toBe(false);
  });

  it('surfaces a write failure at stop() instead of returning a silently truncated file', async () => {
    const { fs } = makeFs({ failAppendAt: 3 });
    const { adapter, emit } = makeAdapter();
    const rec = new AudioRecorder(fs as never, adapter as never, '/cache');
    await rec.start();
    for (let i = 0; i < 6; i++) emit(chunk(i, 320));
    await expect(rec.stop()).rejects.toThrow('disk full');
  });

  it('tracks input level so a dead microphone can be detected', async () => {
    const { rec } = await record([new Uint8Array(640), new Uint8Array(640)]);
    expect(rec.peakSoFar).toBeLessThan(SILENCE_PEAK_THRESHOLD);

    const live = await record([chunk(200, 640)]);
    expect(live.rec.peakSoFar).toBeGreaterThan(SILENCE_PEAK_THRESHOLD);
    expect(live.rec.takeRecentPeak()).toBeGreaterThan(0);
    expect(live.rec.takeRecentPeak()).toBe(0); // reading resets the meter window
  });

  it('produces a WAV that an independent decoder accepts (dump for cross-check)', async () => {
    // A real speech-like signal: 2s of a 440Hz tone, 16kHz mono int16.
    const samples = new Int16Array(32000).map((_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 16000)));
    const pcm = new Uint8Array(samples.buffer);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < pcm.length; i += 3200) chunks.push(pcm.slice(i, i + 3200));
    const { files, path } = await record(chunks);
    if (process.env.WAV_DUMP_PATH) require('fs').writeFileSync(process.env.WAV_DUMP_PATH, files.get(path)!);
    expect(parseWav(files.get(path)!).dataSize).toBe(64000);
  });
});

describe('toBase64', () => {
  it('round-trips arbitrary bytes, including large buffers', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) & 0xff);
    expect(Buffer.compare(Buffer.from(toBase64(bytes), 'base64'), Buffer.from(bytes))).toBe(0);
  });
});
