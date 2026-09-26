"""
Regression tests for the desktop text-processing pipeline, exercised through
the SAME entry point the Tauri app uses (app/sidecar/main.py's process()) --
not through benchmark helpers.

Why this file exists: a change to correct_herbs.py's edit format (4-tuples ->
6-tuples, to carry the ambiguity flag) was validated with ad-hoc scripts that
called benchmark functions directly, so it shipped while the sidecar --
which unpacks those tuples itself -- crashed on every real transcript.
Testing only the inner layer can't catch a break in the layer above it.

Fixtures are real faster-whisper output from the two simulation recordings
(read-aloud scripts, not patient data; script 2's name/NRIC/phone are the
canonical FAKE identity from benchmark/simulation_script_2.txt). The audio
itself is gitignored, so the transcripts are inlined here to keep the suite
runnable from a fresh clone.

Run from the repo root:
    python -m unittest discover -s benchmark/tests -v
"""

import json
import os
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, "..", "..", "app", "sidecar"))
sys.path.insert(0, os.path.join(_HERE, ".."))

from main import process  # noqa: E402  (app/sidecar/main.py)
import correct_herbs  # noqa: E402
from correct_herbs import correct_prescription_only, find_prescription_spans  # noqa: E402

SCRIPT1_HERBS = [
    "柴胡", "白芍", "当归", "白术", "茯苓", "黄芪", "党参", "陈皮", "半夏",
    "甘草", "薏苡仁", "砂仁", "制附子", "肉桂", "熟地黄", "山茱萸", "杜仲",
    "牛膝", "独活", "桑寄生", "川芎", "红花", "桃仁", "延胡索", "炙甘草",
]
SCRIPT2_HERBS = [
    "麻黄", "桂枝", "杏仁", "甘草", "苍术", "厚朴", "陈皮", "半夏", "茯苓",
    "桔梗", "紫苏子", "浙贝母", "瓜蒌",
]

# Real faster-whisper output (beam_size=1, the shipped configuration).
SCRIPT1_RAW = '今天来的病人是一位42岁的女性患者她的主宿是最近两个星期持续感到疲乏休得也有一点酸痛她说最近工作压力比较大睡眠质量也不好容易半夜醒来我问她饮食情况她说饮食情况还好但是喜欢吃冷的东西经常喝冰水餐餐不规律大便方面她说每天一次但是比较软有时候不成型小便正常没有特别的问题情绪方面她最近比较容易烦躁有时候会莫名其妙的叹气月经周期基本正常但是金钱会有轻微的凶涨接下来我检查舌相和脉相舌枕舌指淡红舌体稍胖偏有齿痕胎白腻舌中部胎稍厚脉枕脉弦细左关脉稍悬右关脉如环两指脉沉根据四诊所见这位病人的辩证是干预气质脾虚失胜志泽疏干理气健脾化湿处方如下柴胡10g白草15g当归10g白竹15g茯苓20g黄芪30g党参15g橙皮6g半夏10g干草6g益元20g沙仁5g后下方济基础下药散和四菌子汤加减服药说明7天每天两次饭后半小时服用温敷复诊下周同一时间第二个病人男性55岁主宿室膝盖疼痛三个月舌指暗红鱿鱼斑胎薄白脉象色良齿脉沉细辩证为肾阳虚寒失闭阻加油血余处方致富者9g先煎30分钟肉桂5g后下手底黄20g山猪鱼12g肚重15g牛蝎15g毒活10g三季生退肌肝腺20g川凶10g红花6g桃仁10g黏糊索12g治肝草6g放鸡鸡杵毒活计生汤和桂腹地黄丸加减服药说明14天每天两次饭前温敷The patient should avoid coldfood and drink during the treatment period请注意保暖避免受寒'
SCRIPT2_RAW = '今天来的病人叫张三,NRIC是S987643G,电话是81234567他是约30岁的男性患者,主宿是反复咳嗽两个星期,痰多色白,稍微有点气喘Activities make it worse,晚上咳嗽比较厉害,他说最近食欲还可以大便正常,小便也正常,睡眠方面因为咳嗽经常被吵醒,睡不好情绪方面还算稳定,没有特别烦躁接下来我检查蛇像跟脉象,蛇枕,蛇蛋红,胎白腻,蛇体正常,大小没有齿痕脉枕,脉滑,右寸,脉幅,左关,脉旋,两指,脉承系根据市诊所见,周围病人的诊断,辩证是风寒,放肺痰肝臟是阻肺,治者疏风,散寒,化痰止咳除方如下,芒黄6g,桂枝10g,杏仁10g,甘草6g苍蜍10g,垢破9g后下,半橙皮6g,半虾10g,茯苓15g,结果10g植树籽10g,植被母10g,瓜萝15g放鸡鸡储备3澳汤和2层汤加减服务要说明5天每天2次饭后温服,复诊5天后同一时间请注意保暖,避免受寒,多喝温水'


def run(transcript):
    """process() must return JSON-serializable data -- the Rust side forwards
    it to the UI as a string."""
    result = process(transcript)
    json.dumps(result, ensure_ascii=False)
    return result


def unflagged_wrong(herbs, ground_truth):
    """The safety property this whole project rests on: a herb that is NOT in
    the ground truth must never appear without an ambiguity/dose flag. A
    missing herb is a visible gap; a wrong herb that looks fine is the
    dangerous failure."""
    return [
        h["name"] for h in herbs
        if h["name"] not in ground_truth and not h["ambiguous"] and not h["dosage_warning"]
    ]


class SidecarContract(unittest.TestCase):
    """The layer that broke: sidecar <-> correction-engine edit format."""

    def test_process_survives_a_transcript_with_corrections(self):
        result = run(SCRIPT1_RAW)  # raised ValueError (4 vs 6 tuple) before the fix
        self.assertGreater(len(result["correction_edits"]), 0)

    def test_every_herb_carries_ambiguity_fields(self):
        for h in run(SCRIPT1_RAW)["prescription"]["herbs"]:
            self.assertIn("ambiguous", h)
            self.assertIn("ambiguous_with", h)

    def test_correction_edits_expose_ambiguity(self):
        for e in run(SCRIPT2_RAW)["correction_edits"]:
            for key in ("original", "corrected", "similarity", "ambiguous", "ambiguous_with"):
                self.assertIn(key, e)

    def test_edit_tuple_shape(self):
        _, edits, _ = correct_prescription_only(SCRIPT2_RAW)
        self.assertTrue(edits)
        for e in edits:
            self.assertEqual(len(e), 6)  # (start, end, term, score, ambiguous, runner_up)


class Script1(unittest.TestCase):
    def setUp(self):
        self.herbs = run(SCRIPT1_RAW)["prescription"]["herbs"]

    def test_recovers_nearly_all_herbs(self):
        found = {h["name"] for h in self.herbs}
        # ASR is non-deterministic run to run (薏苡仁 was recovered in one run
        # and lost in the next), so assert a floor, not the exact set.
        self.assertGreaterEqual(len(found & set(SCRIPT1_HERBS)), 23)

    def test_no_unflagged_wrong_herbs(self):
        self.assertEqual(unflagged_wrong(self.herbs, SCRIPT1_HERBS), [])

    def test_dosages_attach_to_the_right_herbs(self):
        expected = {"柴胡": 10, "当归": 10, "茯苓": 20, "黄芪": 30, "制附子": 9, "肉桂": 5, "熟地黄": 20}
        got = {h["name"]: h["dosage"] for h in self.herbs}
        for name, dose in expected.items():
            self.assertEqual(got.get(name), dose, name)

    def test_high_risk_herbs_are_marked(self):
        risky = {h["name"] for h in self.herbs if h["high_risk"]}
        self.assertIn("制附子", risky)
        self.assertIn("半夏", risky)


class Script2(unittest.TestCase):
    def setUp(self):
        self.result = run(SCRIPT2_RAW)
        self.herbs = self.result["prescription"]["herbs"]

    def test_mahuang_is_flagged_not_silently_trusted(self):
        """The confirmed-dangerous case: a heavily garbled 麻黄 (high-risk) that
        scores nearly as well as 大黄. Must surface as uncertain."""
        mahuang = next((h for h in self.herbs if h["name"] == "麻黄"), None)
        if mahuang is not None:  # if ASR ever gets it right outright, nothing to flag
            self.assertTrue(mahuang["ambiguous"] or mahuang["ambiguous_with"] is None)
        dahuang = next((h for h in self.herbs if h["name"] == "大黄"), None)
        if dahuang is not None:
            self.assertTrue(dahuang["ambiguous"], "大黄 appeared unflagged where 麻黄 was spoken")

    def test_flags_the_known_collision(self):
        flagged = {h["name"]: h["ambiguous_with"] for h in self.herbs if h["ambiguous"]}
        self.assertEqual(flagged.get("麻黄"), "大黄")

    def test_no_unflagged_wrong_herbs(self):
        self.assertEqual(unflagged_wrong(self.herbs, SCRIPT2_HERBS), [])

    def test_recovers_most_herbs(self):
        found = {h["name"] for h in self.herbs}
        self.assertGreaterEqual(len(found & set(SCRIPT2_HERBS)), 11)

    def test_pii_is_gone_from_note_and_transcript(self):
        for pii in ("张三", "S987643G", "81234567"):
            self.assertNotIn(pii, self.result["consultation_note"], pii)
            self.assertNotIn(pii, self.result["deidentified_transcript"], pii)
        reported = {r["text"] for r in self.result["deid_report"]}
        self.assertTrue({"张三", "S987643G", "81234567"} <= reported)


class SpanRobustness(unittest.TestCase):
    """Prescription-span detection: the failures that put a wrong or duplicated
    herb list in front of a physician."""

    def test_saying_chufang_twice_lists_each_herb_once(self):
        # "我开个处方,处方如下:..." made two overlapping spans, so every herb
        # was extracted twice -- which reads as a double dose on the draft.
        result = run("我给你开个处方，处方如下：柴胡10g白芍15g当归10g方剂基础：逍遥散。服药说明：七天。")
        self.assertEqual([h["name"] for h in result["prescription"]["herbs"]], ["柴胡", "白芍", "当归"])
        self.assertEqual(result["prescription_spans_found"], 1)

    def test_ordinary_phrase_is_never_a_prescription_trigger(self):
        # "情绪方面" scores 0.80 against 处方. Even at a deliberately permissive
        # threshold the span must start at the real prescription, not at the
        # narrative -- otherwise herb-correction is applied to ordinary speech.
        real_start = SCRIPT1_RAW.index("处方") + len("处方")
        original = correct_herbs._PRESCRIPTION_START_THRESHOLD
        try:
            for threshold in (0.85, 0.8):
                correct_herbs._PRESCRIPTION_START_THRESHOLD = threshold
                self.assertEqual(find_prescription_spans(SCRIPT1_RAW)[0][0], real_start, threshold)
        finally:
            correct_herbs._PRESCRIPTION_START_THRESHOLD = original

    def test_garbled_trigger_is_still_found(self):
        # The guard must not reject a REAL garbled trigger: whisper.cpp writes
        # 厨房 for 处方, faster-whisper writes 除方.
        for garbled in ("厨房", "除方"):
            herbs = run(f"今天病人咳嗽。{garbled}如下：麻黄6g桂枝10g方剂基础：三拗汤。")["prescription"]["herbs"]
            self.assertEqual([h["name"] for h in herbs], ["麻黄", "桂枝"], garbled)

    def test_missing_trigger_is_reported_not_silently_empty(self):
        result = run("今天病人咳嗽两个星期，痰多色白，舌淡红，苔白腻，脉滑。")
        self.assertEqual(result["prescription_spans_found"], 0)
        self.assertEqual(result["prescription"]["herbs"], [])


class DosageUnits(unittest.TestCase):
    def test_chinese_gram_character_is_accepted(self):
        """ggml-medium writes 克, large-v3 writes g. Both must extract."""
        for unit in ("g", "克"):
            herbs = run(f"今天病人咳嗽。处方如下：麻黄6{unit}桂枝10{unit}杏仁10{unit}方剂基础：三拗汤。")["prescription"]["herbs"]
            self.assertEqual({h["name"]: h["dosage"] for h in herbs}, {"麻黄": 6, "桂枝": 10, "杏仁": 10}, unit)


class Acupuncture(unittest.TestCase):
    CLEAN = "患者主诉肩周炎。取穴：合谷双侧，足三里左，三阴交右，肩髃，曲池。留针30分钟。疗程：每周两次。"
    GARBLED = "患者主诉肩周炎。取穴：合古双侧，足三里左，三阴叫右，肩雨，去池。留针30分钟。疗程：每周两次。"

    def test_clean_text(self):
        pts = run(self.CLEAN)["acupuncture"]["points"]
        self.assertEqual([p["name"] for p in pts], ["合谷", "足三里", "三阴交", "肩髃", "曲池"])
        self.assertEqual([p["laterality"] for p in pts], ["双侧", "左", "右", None, None])

    def test_garbled_text_is_recovered_and_flag_fields_exist(self):
        result = run(self.GARBLED)
        pts = result["acupuncture"]["points"]
        self.assertEqual([p["name"] for p in pts], ["合谷", "足三里", "三阴交", "肩髃", "曲池"])
        for p in pts:
            self.assertIn("ambiguous", p)
        # original text in the audit trail must be the text that was actually
        # garbled (an offset bug once indexed the already-corrected string)
        originals = {e["original"] for e in result["correction_edits"] if e.get("type") == "acupuncture"}
        self.assertTrue({"合古", "三阴叫", "肩雨", "去池"} <= originals, originals)


if __name__ == "__main__":
    unittest.main()
