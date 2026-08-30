"""
FunASR (Paraformer, open-source, self-hosted) Benchmark for TCM Consultation Audio
-----------------------------------------------------------------------------------
Same accuracy test as run_benchmark.py (Whisper), but using FunASR's paraformer-zh
model with HOTWORD biasing -- a first-class vocabulary-boosting feature, unlike
Whisper's soft initial_prompt hint. Runs fully locally (MIT licensed, no cloud).

Usage:
    python run_funasr_benchmark.py <audio_file>
"""

import sys
import os
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from funasr import AutoModel

SIMULATION_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]

PULSE_TERMS = [
    "弦细", "左关脉", "右关脉", "濡缓", "两尺脉", "涩", "沉细",
]

TONGUE_TERMS = [
    "舌质淡红", "舌体稍胖", "齿痕", "苔白腻", "舌质暗红", "瘀斑", "苔薄白",
]

PATTERN_TERMS = [
    "肝郁气滞", "脾虚湿盛", "肾阳虚", "寒湿痹阻", "血瘀",
]

HOTWORDS = " ".join(SIMULATION_HERBS + PULSE_TERMS + TONGUE_TERMS + PATTERN_TERMS)


def transcribe(audio_path):
    print("Loading FunASR paraformer-zh (+ fsmn-vad)...")
    print("(First run downloads the model — smaller than Whisper large-v3)\n")
    model = AutoModel(
        model="paraformer-zh",
        vad_model="fsmn-vad",
        device="cpu",
        disable_update=True,
    )

    print(f"Transcribing: {audio_path}")
    print("Hotwords enabled:", len(SIMULATION_HERBS + PULSE_TERMS + TONGUE_TERMS + PATTERN_TERMS), "terms\n")
    result = model.generate(
        input=audio_path,
        hotword=HOTWORDS,
    )
    return result


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
        print("Usage: python run_funasr_benchmark.py <audio_file>")
        sys.exit(1)

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"Error: File not found: {audio_path}")
        sys.exit(1)

    result = transcribe(audio_path)
    # FunASR returns a list of dicts with a "text" key
    transcript = result[0]["text"] if isinstance(result, list) else result["text"]

    # paraformer-zh's output is space-segmented between characters/tokens, so
    # substring checks need the spaces stripped to match multi-character terms.
    scoring_text = transcript.replace(" ", "")
    found_herbs, missing_herbs = find_terms(scoring_text, SIMULATION_HERBS)
    total = len(SIMULATION_HERBS)
    correct = len(found_herbs)
    pct = round(correct / total * 100, 1)

    lines = []
    lines.append("=" * 65)
    lines.append("  FUNASR (PARAFORMER-ZH + HOTWORDS) TCM BENCHMARK REPORT")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"  Audio file: {os.path.basename(audio_path)}")
    lines.append("=" * 65)
    lines.append("\n── FULL TRANSCRIPT ──────────────────────────────────────────\n")
    lines.append(transcript)
    lines.append("\n── HERB NAME CHECK ──────────────────────────────────────────")
    lines.append(f"\nAccuracy: {correct}/{total} herbs recognised = {pct}%")
    lines.append(f"Target: >95%")
    lines.append(f"\nFound ({correct}):  " + "  ".join(found_herbs))
    if missing_herbs:
        lines.append(f"Missed ({len(missing_herbs)}):  " + "  ".join(missing_herbs))
    lines.append("=" * 65)

    report = "\n".join(lines)

    report_path = audio_path.rsplit(".", 1)[0] + "_funasr_benchmark_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    transcript_path = audio_path.rsplit(".", 1)[0] + "_funasr_transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(transcript)

    print(report)
    print(f"\nReport saved to:     {report_path}")
    print(f"Transcript saved to: {transcript_path}")


if __name__ == "__main__":
    main()
