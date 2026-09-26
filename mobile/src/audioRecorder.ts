// Simple full-recording capture -- NOT using whisper.rn's RealtimeTranscriber
// (VAD auto-slicing, live partial results). Deliberate: the desktop app
// transcribes the whole consultation as one file, giving Whisper full
// context, and that's what the accuracy benchmarking on the desktop side
// was actually validated against. Auto-slicing on silence could split a
// herb name or dosage number across a slice boundary -- an unvalidated risk
// not worth taking for a use case with zero tolerance for herb errors.
// This mirrors the desktop flow: record the whole thing, then transcribe
// once at the end.
//
// Why this doesn't use whisper.rn's WavFileWriter (found reading its source):
//  1. Its write queue has no mutex and is cleared only AFTER the await, so
//     overlapping chunk writes re-append data that's still queued -- audio
//     gets duplicated whenever a write outlasts the chunk interval.
//  2. finalize() reads the WHOLE file back as base64, copies it twice, and
//     rewrites it: several times the file size on the JS heap at the exact
//     moment the physician taps Stop (a 20-minute consultation is ~38MB of
//     WAV, so a spike on the order of 150-200MB).
// Instead: PCM is appended to a raw .pcm file through a strictly serial
// promise chain (ordered, no duplication, drained before finishing), and Stop
// streams it into the final .wav in 1MB slices behind a 44-byte header, so
// peak memory stays at a few MB regardless of recording length.

import { AudioPcmStreamAdapter } from 'whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter';
import RNFS from 'react-native-fs';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const SLICE_BYTES = 1024 * 1024;

// Normalized peak below which we treat the input as "nothing is being
// captured". ~0.003 is roughly -50 dBFS: real room noise sits far above it,
// a denied/blocked/muted microphone sits at or near zero. (On iOS, a denied
// microphone permission does NOT raise an error -- it just records silence.)
export const SILENCE_PEAK_THRESHOLD = 0.003;

type Fs = Pick<typeof RNFS, 'writeFile' | 'appendFile' | 'read' | 'unlink' | 'exists'>;
type Adapter = Pick<AudioPcmStreamAdapter, 'initialize' | 'onData' | 'start' | 'stop' | 'release'>;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
}

/** Canonical 44-byte PCM WAV header. */
export function wavHeader(pcmBytes: number): Uint8Array {
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + pcmBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, CHANNELS, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), true); // byte rate
  v.setUint16(32, CHANNELS * (BITS_PER_SAMPLE / 8), true); // block align
  v.setUint16(34, BITS_PER_SAMPLE, true);
  ascii(36, 'data');
  v.setUint32(40, pcmBytes, true);
  return new Uint8Array(buf);
}

/** Peak amplitude of 16-bit little-endian PCM, normalized to 0..1. */
export function peakLevel(pcm: Uint8Array): number {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength - (pcm.byteLength % 2));
  let peak = 0;
  for (let i = 0; i < view.byteLength; i += 2) {
    const s = Math.abs(view.getInt16(i, true));
    if (s > peak) peak = s;
  }
  return Math.min(1, peak / 32768);
}

export class AudioRecorder {
  private pcmPath = '';
  private wavPath = '';
  private pcmBytes = 0;
  private chain: Promise<void> = Promise.resolve();
  private writeError: unknown = null;
  private recentPeak = 0;
  private overallPeak = 0;

  constructor(
    private fs: Fs = RNFS,
    private adapter: Adapter = new AudioPcmStreamAdapter(),
    private dir: string = RNFS.CachesDirectoryPath,
  ) {}

  /** Loudest input since the last read (0..1) -- for the live level meter. Reading resets it. */
  takeRecentPeak(): number {
    const p = this.recentPeak;
    this.recentPeak = 0;
    return p;
  }

  /** Loudest input across the whole recording so far (0..1). */
  get peakSoFar(): number {
    return this.overallPeak;
  }

  async start(): Promise<void> {
    const stamp = Date.now();
    this.pcmPath = `${this.dir}/consultation_${stamp}.pcm`;
    this.wavPath = `${this.dir}/consultation_${stamp}.wav`;
    this.pcmBytes = 0;
    this.chain = Promise.resolve();
    this.writeError = null;
    this.recentPeak = 0;
    this.overallPeak = 0;

    await this.fs.writeFile(this.pcmPath, '', 'utf8');
    await this.adapter.initialize({ sampleRate: SAMPLE_RATE, channels: CHANNELS, bitsPerSample: BITS_PER_SAMPLE });
    this.adapter.onData(chunk => {
      const data = chunk.data;
      const p = peakLevel(data);
      if (p > this.recentPeak) this.recentPeak = p;
      if (p > this.overallPeak) this.overallPeak = p;
      // Strictly serial: each append starts only after the previous one has
      // finished, so chunks land in order and nothing is written twice.
      this.chain = this.chain.then(async () => {
        if (this.writeError) return;
        try {
          await this.fs.appendFile(this.pcmPath, toBase64(data), 'base64');
          this.pcmBytes += data.length;
        } catch (err) {
          this.writeError = err;
        }
      });
    });
    await this.adapter.start();
  }

  /** Stops recording and returns the local file:// path to the finished WAV. */
  async stop(): Promise<string> {
    await this.adapter.stop();
    await this.adapter.release();
    await this.chain; // drain every pending append BEFORE reading the size
    if (this.writeError) throw this.writeError;

    await this.fs.writeFile(this.wavPath, toBase64(wavHeader(this.pcmBytes)), 'base64');
    for (let offset = 0; offset < this.pcmBytes; offset += SLICE_BYTES) {
      const length = Math.min(SLICE_BYTES, this.pcmBytes - offset);
      const slice = await this.fs.read(this.pcmPath, length, offset, 'base64');
      await this.fs.appendFile(this.wavPath, slice, 'base64');
    }
    await this.fs.unlink(this.pcmPath).catch(() => {});
    return `file://${this.wavPath}`;
  }
}
