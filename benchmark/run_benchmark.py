"""
Whisper ASR Benchmark for TCM Consultation Audio
-------------------------------------------------
Usage:
    python run_benchmark.py <audio_file>

Example:
    python run_benchmark.py my_recording.mp3

If no file is provided, it will prompt you to enter the path.
"""

import sys
import os
import json
import re
from datetime import datetime

# Windows consoles default to a codepage (e.g. cp1252) that can't encode Chinese
# characters, which crashes any print() of TCM text. Force UTF-8 on stdout/stderr.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Dependency check ──────────────────────────────────────────────────────────

def check_and_install(package, import_name=None):
    import_name = import_name or package
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing {package}...")
        os.system(f"pip install {package} -q")

check_and_install("openai-whisper", "whisper")
check_and_install("jiwer")          # Word Error Rate calculation

import whisper
import jiwer

# ── TCM Reference Lists ───────────────────────────────────────────────────────

HERB_NAMES = [
    # Common herbs — simplified Chinese
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "炙甘草", "薏苡仁", "砂仁", "制附子", "附子", "肉桂", "熟地黄",
    "生地黄", "山茱萸", "杜仲", "牛膝", "独活", "桑寄生", "川芎", "红花",
    "桃仁", "延胡索", "黄连", "黄芩", "黄柏", "大黄", "麻黄", "桂枝",
    "白芷", "防风", "荆芥", "薄荷", "菊花", "桑叶", "连翘", "金银花",
    "蒲公英", "紫花地丁", "鱼腥草", "板蓝根", "丹参", "赤芍", "三七",
    "益母草", "香附", "郁金", "木香", "枳壳", "枳实", "厚朴", "苍术",
    "泽泻", "车前子", "猪苓", "木通", "通草", "滑石", "熟附子", "干姜",
    "生姜", "吴茱萸", "小茴香", "良姜", "人参", "西洋参", "太子参",
    "白扁豆", "山药", "莲子", "芡实", "大枣", "龙眼肉", "酸枣仁",
    "柏子仁", "远志", "石菖蒲", "茯神", "合欢皮", "首乌藤", "麦冬",
    "天冬", "沙参", "玉竹", "百合", "枸杞子", "女贞子", "墨旱莲",
    "龟甲", "鳖甲", "牡蛎", "龙骨", "磁石", "代赭石", "天麻", "钩藤",
    "僵蚕", "全蝎", "蜈蚣", "地龙", "水蛭", "穿山甲", "皂角刺",
]

PULSE_TERMS = [
    "弦脉", "滑脉", "数脉", "迟脉", "沉脉", "浮脉", "细脉", "洪脉",
    "紧脉", "缓脉", "虚脉", "实脉", "涩脉", "濡脉", "弱脉",
    "弦细", "弦滑", "滑数", "沉细", "沉迟", "浮数", "弦涩",
    "左关", "右关", "寸关尺", "两尺", "左寸", "右寸",
    "浮中沉", "有力", "无力",
]

TONGUE_TERMS = [
    "舌质", "舌苔", "苔白", "苔黄", "苔腻", "苔薄", "苔厚",
    "舌红", "舌淡", "舌暗", "舌胖", "齿痕", "裂纹", "瘀斑", "瘀点",
    "白腻", "黄腻", "薄白", "薄黄", "剥苔", "无苔", "花剥苔",
]

PATTERN_TERMS = [
    "肝郁气滞", "脾虚湿盛", "肾阳虚", "肾阴虚", "气血两虚",
    "血瘀", "痰湿", "阴虚火旺", "气虚", "血虚", "阳虚", "阴虚",
    "寒湿", "湿热", "风寒", "风热", "痰热", "肝火", "心火",
    "脾胃虚弱", "肺气虚", "心脾两虚", "肝肾阴虚", "脾肾阳虚",
    "寒湿痹阻", "气滞血瘀",
]

# ── Ground Truth (from simulation_script.txt) ─────────────────────────────────
# If you recorded the simulation script, these are the herbs that SHOULD appear.
# The benchmark will check if Whisper got them right.

SIMULATION_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]

# ── Core Functions ────────────────────────────────────────────────────────────

def transcribe(audio_path, model_size="large-v3"):
    print(f"\nLoading Whisper {model_size}...")
    print("(First run downloads ~3GB — this is a one-time download)\n")
    model = whisper.load_model(model_size)

    print(f"Transcribing: {audio_path}")
    print("This may take 2–8 minutes depending on your machine...\n")
    # Whisper's initial_prompt only keeps the last ~224 tokens as context, so put
    # the actual herb/term vocabulary last — it's what needs to survive truncation.
    prompt_terms = ", ".join(SIMULATION_HERBS + PULSE_TERMS + TONGUE_TERMS + PATTERN_TERMS)
    result = model.transcribe(
        audio_path,
        language="zh",           # Primary: Mandarin
        task="transcribe",
        verbose=False,
        word_timestamps=True,
        initial_prompt=(
            "这是一段中医门诊录音，包含以下中药名称和中医术语：" + prompt_terms
        )
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

def build_report(result, audio_path, is_simulation=False):
    transcript = result["text"]
    segments   = result.get("segments", [])

    lines = []
    lines.append("=" * 65)
    lines.append("  WHISPER TCM BENCHMARK REPORT")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append(f"  Audio file: {os.path.basename(audio_path)}")
    lines.append(f"  Model: Whisper large-v3")
    lines.append("=" * 65)

    # ── Full transcript ──
    lines.append("\n── FULL TRANSCRIPT ──────────────────────────────────────────\n")
    lines.append(transcript)

    # ── Herb name check ──
    herb_list = SIMULATION_HERBS if is_simulation else HERB_NAMES
    found_herbs, missing_herbs = find_terms(transcript, herb_list)

    lines.append("\n── HERB NAME CHECK ──────────────────────────────────────────")
    if is_simulation:
        total   = len(SIMULATION_HERBS)
        correct = len(found_herbs)
        pct     = round(correct / total * 100, 1) if total else 0
        verdict = "PASS ✓" if pct >= 95 else ("BORDERLINE ⚠" if pct >= 85 else "FAIL ✗")
        lines.append(f"\nAccuracy: {correct}/{total} herbs recognised = {pct}%  [{verdict}]")
        lines.append(f"\nTarget: >95%  (hard requirement — physician confirmed zero tolerance for errors)")
        lines.append(f"\nFound ({correct}):  " + "  ".join(found_herbs))
        if missing_herbs:
            lines.append(f"Missed ({len(missing_herbs)}):  " + "  ".join(missing_herbs))
            lines.append("\n⚠ MISSED HERBS — check transcript above for what Whisper wrote instead.")
    else:
        lines.append(f"\nHerbs detected in transcript: {len(found_herbs)}")
        lines.append("  " + "  ".join(found_herbs) if found_herbs else "  (none)")
        lines.append(f"\nKnown herbs NOT found: {len(missing_herbs)}")
        if missing_herbs:
            lines.append("  " + "  ".join(missing_herbs[:20]))

    # ── Pulse & tongue terms ──
    found_pulse,  _ = find_terms(transcript, PULSE_TERMS)
    found_tongue, _ = find_terms(transcript, TONGUE_TERMS)
    found_pattern,_ = find_terms(transcript, PATTERN_TERMS)

    lines.append("\n── CLINICAL TERM DETECTION ──────────────────────────────────")
    lines.append(f"Pulse terms found:   {len(found_pulse)}  →  " + "  ".join(found_pulse[:10]))
    lines.append(f"Tongue terms found:  {len(found_tongue)}  →  " + "  ".join(found_tongue[:10]))
    lines.append(f"Pattern terms found: {len(found_pattern)}  →  " + "  ".join(found_pattern[:8]))

    # ── Segment timing ──
    lines.append("\n── SEGMENT TIMING (first 10 segments) ──────────────────────")
    for seg in segments[:10]:
        start = f"{seg['start']:.1f}s"
        end   = f"{seg['end']:.1f}s"
        text  = seg['text'].strip()
        lines.append(f"  [{start} → {end}]  {text}")
    if len(segments) > 10:
        lines.append(f"  ... and {len(segments)-10} more segments")

    # ── Assessment ──
    lines.append("\n── OVERALL ASSESSMENT ───────────────────────────────────────")
    if is_simulation:
        pct_num = float(pct)
        if pct_num >= 95:
            lines.append("""
RESULT: PASS — Whisper large-v3 meets the herb accuracy threshold.
The transcription-first architecture is viable.
Next step: test with a real consultation recording (with consent).
""")
        elif pct_num >= 85:
            lines.append("""
RESULT: BORDERLINE — Accuracy is close but below the 95% threshold.
Options to explore:
  1. Add a TCM-specific vocabulary hint to the Whisper prompt
  2. Test with a different model (medium, or Azure/Alibaba ASR)
  3. Add a post-processing herb-name correction layer (dictionary lookup)
Share this report for further analysis.
""")
        else:
            lines.append("""
RESULT: FAIL — Herb accuracy is below acceptable threshold.
The transcription-first approach needs rethinking.
Options:
  1. Try Azure Cognitive Services (zh-CN) or Alibaba Cloud ASR — may handle
     TCM vocabulary better than Whisper out of the box
  2. Fine-tune Whisper on TCM audio data (longer-term)
  3. Change MVP: physician uses structured dictation (shorter, cleaner audio)
     rather than full consultation recording
Share this report for further analysis.
""")
    else:
        lines.append("""
No ground truth provided — cannot calculate accuracy automatically.
To assess quality, review the FULL TRANSCRIPT above and:
  1. Check each herb name: was it transcribed correctly?
  2. Check pulse/tongue terms: any misses or substitutions?
  3. Note any sections where the transcript looks wrong.
Share this report for analysis.
""")

    lines.append("=" * 65)
    return "\n".join(lines)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Get audio file path
    if len(sys.argv) > 1:
        audio_path = sys.argv[1]
    else:
        print("\nWhisper TCM Benchmark")
        print("─────────────────────")
        audio_path = input("Enter path to your audio file (MP3 or WAV): ").strip().strip('"')

    if not os.path.exists(audio_path):
        print(f"\nError: File not found: {audio_path}")
        print("Please check the path and try again.")
        sys.exit(1)

    # Detect if this is the simulation recording
    if len(sys.argv) > 2:
        is_simulation = sys.argv[2].strip().lower() == 'y'
    else:
        is_simulation = input(
            "\nIs this the simulation script recording? (y/n): "
        ).strip().lower() == 'y'

    # Run transcription
    result = transcribe(audio_path)

    # Build report
    report = build_report(result, audio_path, is_simulation)

    # Save report and transcript BEFORE printing, so a console encoding failure
    # can't lose the results.
    report_path = audio_path.rsplit(".", 1)[0] + "_benchmark_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)

    transcript_path = audio_path.rsplit(".", 1)[0] + "_transcript.txt"
    with open(transcript_path, "w", encoding="utf-8") as f:
        f.write(result["text"])

    # Print report
    print("\n" + report)

    print(f"\nReport saved to:     {report_path}")
    print(f"Transcript saved to: {transcript_path}")
    print("\nShare the report file for further analysis.")

if __name__ == "__main__":
    main()
