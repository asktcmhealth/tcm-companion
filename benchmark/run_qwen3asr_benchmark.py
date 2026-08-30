"""
Qwen3-ASR (Alibaba Qwen team, Jan 2026, open-source) Benchmark for TCM audio.
Uses the documented `context` parameter (verified via inspect.signature, not
just docs) for vocabulary biasing -- Qwen3-ASR's equivalent of hotwords.

Usage:
    python run_qwen3asr_benchmark.py <audio_file>
"""

import sys
import os
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import torch
from qwen_asr import Qwen3ASRModel

SIMULATION_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]
PULSE_TERMS = ["弦细", "左关脉", "右关脉", "濡缓", "两尺脉", "涩", "沉细"]
TONGUE_TERMS = ["舌质淡红", "舌体稍胖", "齿痕", "苔白腻", "舌质暗红", "瘀斑", "苔薄白"]
PATTERN_TERMS = ["肝郁气滞", "脾虚湿盛", "肾阳虚", "寒湿痹阻", "血瘀"]
CONTEXT = "、".join(SIMULATION_HERBS + PULSE_TERMS + TONGUE_TERMS + PATTERN_TERMS)


def transcribe(audio_path):
    print("Loading Qwen3-ASR-0.6B (CPU, float32)...")
    model = Qwen3ASRModel.from_pretrained(
        "Qwen/Qwen3-ASR-0.6B",
        dtype=torch.float32,
        device_map="cpu",
        max_new_tokens=1024,
    )
    print(f"Transcribing: {audio_path}")
    results = model.transcribe(
        audio=audio_path,
        context=CONTEXT,
        language="Chinese",
    )
    return results[0].text


def find_terms(text, term_list):
    found, missing = [], []
    for term in term_list:
        if term in text:
            found.append(term)
        else:
            missing.append(term)
    return found, missing


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_qwen3asr_benchmark.py <audio_file>")
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File not found: {audio_path}")
        sys.exit(1)

    transcript = transcribe(audio_path)
    scoring_text = transcript.replace(" ", "")

    found_herbs, missing_herbs = find_terms(scoring_text, SIMULATION_HERBS)
    total = len(SIMULATION_HERBS)
    correct = len(found_herbs)
    pct = round(correct / total * 100, 1)

    lines = []
    lines.append("=" * 65)
    lines.append("  QWEN3-ASR-0.6B (+ context biasing) TCM BENCHMARK REPORT")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"  Audio file: {os.path.basename(audio_path)}")
    lines.append("=" * 65)
    lines.append("\n── FULL TRANSCRIPT ──────────────────────────────────────────\n")
    lines.append(transcript)
    lines.append("\n── HERB NAME CHECK ──────────────────────────────────────────")
    lines.append(f"\nAccuracy: {correct}/{total} herbs recognised = {pct}%")
    lines.append(f"\nFound ({correct}):  " + "  ".join(found_herbs))
    if missing_herbs:
        lines.append(f"Missed ({len(missing_herbs)}):  " + "  ".join(missing_herbs))
    lines.append("=" * 65)
    report = "\n".join(lines)

    report_path = audio_path.rsplit(".", 1)[0] + "_qwen3asr_benchmark_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    transcript_path = audio_path.rsplit(".", 1)[0] + "_qwen3asr_transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(transcript)

    print(report)
    print(f"\nReport saved to:     {report_path}")


if __name__ == "__main__":
    main()
