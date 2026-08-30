"""
Single canonical scorer, applied identically to every saved transcript, so all
reported accuracy numbers come from the same code path (no more per-script
scoring bugs / inconsistent space-handling between engines).

Usage:
    python rescore_all.py
"""

import sys
import glob
import re
import os

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SIMULATION_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]

def normalize(text):
    # Strip all whitespace AND any <|...|> special tokens (SenseVoice emits these)
    text = re.sub(r"<\|[^|]*\|>", "", text)
    text = re.sub(r"\s+", "", text)
    return text

def score(path):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    text = normalize(raw)
    found = [h for h in SIMULATION_HERBS if h in text]
    missing = [h for h in SIMULATION_HERBS if h not in text]
    return len(found), found, missing, raw

def main():
    audio_dir = "audio recording"
    targets = [
        ("Whisper large-v3 (initial_prompt = herb list; overwrote the earlier no-prompt run)", "AUDIO-2026-08-06-22-25-47_transcript.txt"),
        ("Whisper + correction layer",                     "AUDIO-2026-08-06-22-25-47_transcript_corrected.txt"),
        ("Paraformer-zh + hotwords (raw)",                  "AUDIO-2026-08-06-22-25-47_funasr_transcript.txt"),
        ("Paraformer-zh + hotwords + correction layer",     "AUDIO-2026-08-06-22-25-47_funasr_transcript_nospace_corrected.txt"),
        ("SenseVoiceSmall + hotword",                       "AUDIO-2026-08-06-22-25-47_sensevoice_transcript.txt"),
        ("Fun-ASR-Nano + hotwords + VAD (fixed run)",       "AUDIO-2026-08-06-22-25-47_funasrnano_transcript.txt"),
    ]

    print("=" * 78)
    print("  CANONICAL RESCORE — all engines, same scoring code")
    print("=" * 78)
    for label, fname in targets:
        path = os.path.join(audio_dir, fname)
        if not os.path.exists(path):
            print(f"\n[MISSING FILE] {label}: {fname} not found")
            continue
        n, found, missing, raw = score(path)
        pct = round(n / 25 * 100, 1)
        print(f"\n{label}")
        print(f"  file: {fname}")
        print(f"  Accuracy: {n}/25 = {pct}%")
        print(f"  Found:    {'  '.join(found)}")
        print(f"  Missing:  {'  '.join(missing)}")

    print("\n" + "=" * 78)

if __name__ == "__main__":
    main()
