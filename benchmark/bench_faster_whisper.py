"""One-off comparison: faster-whisper (CTranslate2, int8, CPU) vs the
openai-whisper large-v3 currently used by app/sidecar_whisper/main.py.

This machine has only 8GB RAM total; openai-whisper large-v3 in FP32 on CPU
pushed free RAM down to ~230MB during a real run and crashed both the
sidecar (STATUS_ACCESS_VIOLATION) and, separately, Claude Desktop -- strong
evidence of genuine system-wide memory exhaustion, not a fluke. This script
checks whether faster-whisper's int8 quantization keeps peak memory well
clear of that cliff while still recovering the same herb names/dosages,
before touching the real sidecar.

Usage:
    python bench_faster_whisper.py <audio_file>
"""

import sys
import os
import time
import threading

sys.path.insert(0, os.path.dirname(__file__))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import psutil
from correct_herbs import correct_prescription_only
from pipeline import extract_prescription
from herb_database import all_names as herb_db_names


def _watch_peak_rss(proc, peak, stop_event):
    while not stop_event.is_set():
        try:
            peak[0] = max(peak[0], proc.memory_info().rss)
        except Exception:
            pass
        time.sleep(0.5)


def main():
    if len(sys.argv) < 2:
        print("Usage: python bench_faster_whisper.py <audio_file>")
        sys.exit(1)
    audio_path = sys.argv[1]
    compute_type = sys.argv[2] if len(sys.argv) > 2 else "int8"
    beam_size = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    use_vocab_prompt = len(sys.argv) > 4 and sys.argv[4] == "vocab_prompt"
    initial_prompt = "、".join(herb_db_names()) if use_vocab_prompt else None

    from faster_whisper import WhisperModel

    proc = psutil.Process(os.getpid())
    peak = [proc.memory_info().rss]
    stop_event = threading.Event()
    watcher = threading.Thread(target=_watch_peak_rss, args=(proc, peak, stop_event), daemon=True)
    watcher.start()

    print(f"System free RAM before load: {psutil.virtual_memory().available / 1e6:.0f} MB")

    t0 = time.time()
    model = WhisperModel("large-v3", device="cpu", compute_type=compute_type)
    t_load = time.time() - t0
    print(f"compute_type={compute_type}")
    print(f"Model loaded in {t_load:.1f}s. Peak RSS so far: {peak[0] / 1e6:.0f} MB. "
          f"System free RAM: {psutil.virtual_memory().available / 1e6:.0f} MB")

    print(f"beam_size={beam_size}, vocab_prompt={use_vocab_prompt} ({len(initial_prompt) if initial_prompt else 0} chars)")
    t0 = time.time()
    segments, info = model.transcribe(
        audio_path, language="zh", task="transcribe", beam_size=beam_size,
        initial_prompt=initial_prompt,
    )
    text = "".join(seg.text for seg in segments)
    t_transcribe = time.time() - t0

    stop_event.set()
    watcher.join(timeout=2)

    print(f"\nTranscribed in {t_transcribe:.1f}s. Peak RSS: {peak[0] / 1e6:.0f} MB. "
          f"System free RAM after: {psutil.virtual_memory().available / 1e6:.0f} MB")
    print(f"\n--- Raw transcript ({len(text)} chars) ---")
    print(text)

    corrected, edits, spans = correct_prescription_only(text)
    herbs = extract_prescription(corrected)
    print(f"\n--- Herb extraction: {len(herbs)} herb(s) found ---")
    for h in herbs:
        print(f"  {h['name']} {h['dosage']}{h['unit']}")

    out_path = audio_path.rsplit(".", 1)[0] + "_fasterwhisper_transcript.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"\nSaved transcript to: {out_path}")


if __name__ == "__main__":
    main()
