// Simple full-recording capture -- NOT using whisper.rn's RealtimeTranscriber
// (VAD auto-slicing, live partial results). Deliberate: the desktop app
// transcribes the whole consultation as one file, giving Whisper full
// context, and that's what the accuracy benchmarking on the desktop side
// was actually validated against. Auto-slicing on silence could split a
// herb name or dosage number across a slice boundary -- an unvalidated risk
// not worth taking for a use case with zero tolerance for herb errors.
// This mirrors the desktop flow: record the whole thing, then transcribe
// once at the end.

import { AudioPcmStreamAdapter } from "whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter";
import RNFS from "react-native-fs";
import { WavFileWriter } from "whisper.rn/utils/WavFileWriter";

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export class AudioRecorder {
  private adapter = new AudioPcmStreamAdapter();
  private writer: WavFileWriter | null = null;
  private filePath = "";

  async start(): Promise<void> {
    this.filePath = `${RNFS.CachesDirectoryPath}/consultation_${Date.now()}.wav`;
    this.writer = new WavFileWriter(RNFS, this.filePath, {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
    });
    await this.writer.initialize();

    await this.adapter.initialize({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
    });
    this.adapter.onData((chunk) => {
      void this.writer?.appendAudioData(chunk.data);
    });
    await this.adapter.start();
  }

  /** Stops recording and returns the local file:// path to the finished WAV. */
  async stop(): Promise<string> {
    await this.adapter.stop();
    await this.adapter.release();
    await this.writer?.finalize();
    return `file://${this.filePath}`;
  }
}
