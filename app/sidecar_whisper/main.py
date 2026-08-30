"""
Whisper transcription sidecar -- second, separate sidecar from the text-
processing one (correction/extraction/dosage/de-ID). Kept separate rather
than merged into one binary so each stays independently buildable and a
change to one doesn't risk breaking the other (already tested/working) one.

Uses faster-whisper (CTranslate2, int8, CPU) rather than openai-whisper,
switched after openai-whisper's FP32-on-CPU large-v3 pushed this 8GB-RAM
dev machine's free memory down to ~230MB during a real run, which crashed
the sidecar with STATUS_ACCESS_VIOLATION and took Claude Desktop down with
it -- reproduced, not a one-off. faster-whisper's int8 quantization kept
peak RSS around 3GB and system free RAM never dropped below ~1.8GB across
repeated runs, while being ~5-7x faster on CPU.

beam_size=1 (greedy) rather than faster-whisper's default beam_size=5:
matches openai-whisper's own actual default behavior (openai-whisper's
transcribe() defaults to beam_size=None, i.e. greedy decoding at
temperature 0, NOT beam search) and empirically recovered a herb
(script 2's 瓜蒌) that beam_size=5 missed, while also being ~40% faster.

Deliberately NOT using an initial_prompt (e.g. a herb-vocabulary hint) --
tested and it fixed one herb on one recording but caused a different
recording to hallucinate an entire fabricated paragraph mid-transcript
(the whole prescription section replaced by unrelated garbage text, 0
herbs extracted, 5x slower) -- a known Whisper failure mode where a long
prompt + greedy decoding can spiral into a hallucination loop partway
through audio. A visibly missing herb (physician notices the draft is
incomplete) is a far safer failure than an invisible fabricated
transcript, so this trade was rejected even though it "worked" once.

Model weights are NOT bundled into this executable -- they download to
the standard Hugging Face cache (~/.cache/huggingface) on first run. This
is a one-time download of the model TO the device, not sending patient
audio FROM the device -- doesn't conflict with the "audio never leaves
the device" architecture principle.

Usage:
    main.py <audio_file>

Outputs the raw transcript as plain text to stdout (not JSON -- the
downstream processing sidecar takes plain transcript text as input, same
contract as when this session's benchmark scripts and Tauri's text
processing sidecar were tested against saved transcript .txt files).
"""

import sys
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Windows without Developer Mode/admin can't create the symlinks
# huggingface_hub's cache uses by default -- falls back to copying files
# instead (needs more disk, not privilege).
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")


def main():
    if len(sys.argv) < 2:
        print("Usage: main.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    print("Loading Whisper large-v3 (faster-whisper, int8)...", file=sys.stderr)
    from faster_whisper import WhisperModel
    model = WhisperModel("large-v3", device="cpu", compute_type="int8")

    print(f"Transcribing: {audio_path}", file=sys.stderr)
    segments, _info = model.transcribe(audio_path, language="zh", task="transcribe", beam_size=1)
    text = "".join(segment.text for segment in segments)

    print(text)


if __name__ == "__main__":
    main()
