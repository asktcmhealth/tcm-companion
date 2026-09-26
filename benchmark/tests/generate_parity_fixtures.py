"""
Generates mobile/__tests__/fixtures/parity.json: the Python engine's output on
a set of transcripts, which the mobile TypeScript port must reproduce exactly
(mobile/__tests__/parity.test.ts).

The mobile engine is a hand-port of correct_herbs.py + pipeline.py. A port is
only as trustworthy as a test that runs BOTH on identical input -- otherwise a
fix landing in one implementation silently leaves the other behind (that's how
the ambiguity check existed on mobile but not desktop for a while).

Run from the repo root whenever the Python engine's behavior changes on purpose:
    python benchmark/tests/generate_parity_fixtures.py
then `npx jest __tests__/parity.test.ts` in mobile/ shows what the port must catch up on.

Both engines use identical scoring (toneless pinyin) and the same trigger
threshold (0.85), so any difference this surfaces is genuine drift.
"""

import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from correct_herbs import correct_prescription_only, correct_acupuncture_only  # noqa: E402
from pipeline import extract_prescription, extract_acupuncture  # noqa: E402
import correct_herbs as ch  # noqa: E402
from herb_database import HERB_DATABASE  # noqa: E402
from acupoint_database import ACUPOINT_DATABASE  # noqa: E402

FIXTURES = {
    "script1_faster_whisper": '今天来的病人是一位42岁的女性患者她的主宿是最近两个星期持续感到疲乏休得也有一点酸痛她说最近工作压力比较大睡眠质量也不好容易半夜醒来我问她饮食情况她说饮食情况还好但是喜欢吃冷的东西经常喝冰水餐餐不规律大便方面她说每天一次但是比较软有时候不成型小便正常没有特别的问题情绪方面她最近比较容易烦躁有时候会莫名其妙的叹气月经周期基本正常但是金钱会有轻微的凶涨接下来我检查舌相和脉相舌枕舌指淡红舌体稍胖偏有齿痕胎白腻舌中部胎稍厚脉枕脉弦细左关脉稍悬右关脉如环两指脉沉根据四诊所见这位病人的辩证是干预气质脾虚失胜志泽疏干理气健脾化湿处方如下柴胡10g白草15g当归10g白竹15g茯苓20g黄芪30g党参15g橙皮6g半夏10g干草6g益元20g沙仁5g后下方济基础下药散和四菌子汤加减服药说明7天每天两次饭后半小时服用温敷复诊下周同一时间第二个病人男性55岁主宿室膝盖疼痛三个月舌指暗红鱿鱼斑胎薄白脉象色良齿脉沉细辩证为肾阳虚寒失闭阻加油血余处方致富者9g先煎30分钟肉桂5g后下手底黄20g山猪鱼12g肚重15g牛蝎15g毒活10g三季生退肌肝腺20g川凶10g红花6g桃仁10g黏糊索12g治肝草6g放鸡鸡杵毒活计生汤和桂腹地黄丸加减服药说明14天每天两次饭前温敷The patient should avoid coldfood and drink during the treatment period请注意保暖避免受寒',
    "script2_faster_whisper": '今天来的病人叫张三,NRIC是S987643G,电话是81234567他是约30岁的男性患者,主宿是反复咳嗽两个星期,痰多色白,稍微有点气喘Activities make it worse,晚上咳嗽比较厉害,他说最近食欲还可以大便正常,小便也正常,睡眠方面因为咳嗽经常被吵醒,睡不好情绪方面还算稳定,没有特别烦躁接下来我检查蛇像跟脉象,蛇枕,蛇蛋红,胎白腻,蛇体正常,大小没有齿痕脉枕,脉滑,右寸,脉幅,左关,脉旋,两指,脉承系根据市诊所见,周围病人的诊断,辩证是风寒,放肺痰肝臟是阻肺,治者疏风,散寒,化痰止咳除方如下,芒黄6g,桂枝10g,杏仁10g,甘草6g苍蜍10g,垢破9g后下,半橙皮6g,半虾10g,茯苓15g,结果10g植树籽10g,植被母10g,瓜萝15g放鸡鸡储备3澳汤和2层汤加减服务要说明5天每天2次饭后温服,复诊5天后同一时间请注意保暖,避免受寒,多喝温水',
    # Real ggml-medium-q5_0 output from the emulator (writes 克, and "厨房" for 处方).
    "script1_medium_whisper_cpp": '今天来的病人是一位42岁的女性患者,她的主宿室最近两个星期持续感到疲乏,胸口也有点酸痛。她说最近工作压力比较大,睡眠质量也不好,容易半夜醒来。我问她饮食情况,她说胃口还可以,但是喜欢吃冷的东西,经常喝冰水,三餐不规律。大便方面,她说每天一次,但是比较软,有时候不成型,小便正常,没有特别的问题。情绪方面,她最近比较容易烦躁,有时候会莫名其妙的叹气,月经周期基本正常,但是金钱会有轻微的胸胀。接下来我检查舌象和脉象。舌疹,舌指淡红,舌体稍胖,边游齿痕,胎白腻,舌中部胎稍厚。脉疹,脉弦细,左关脉稍旋,右关脉如缓,两指脉沉。根据四诊所见,这位病人的辨证是肝育器致皮须失胜,质责书肝理器、腱皮化湿,厨房如下。财糊10克,白草15克,当归10克,白竹15克,福林20克,黄芪30克,党参15克,陈皮6克,半夏10克,甘草6克,艺人20克,杀人5克后下。方剂基础,下药散和四菌子,汤加减。服药说明7天每天2次,饭后半小时服用。温服复诊,下周同一时间。第二个病人,男性55岁,主宿室膝盖疼痛3个月,舌指暗红,友语般胎薄白,脉象色,量尺脉沉细。辨证为,肾阳虚,含湿病组,加油血瘀。厨房,致腹者9克,先煎30分钟,肉桂5克后下,手地黄20克,山椒鱼12克,肚胖15克,牛蜥15克,毒活10克,三寄生20克,春胸10克,红花6克,桃仁10克,盐胡萎12克,制甘草6克。方剂基础,毒活寄生汤和贵父地黄碗加减。服药说明,14天每天2次,饭前温服。患者应该避免冷却,食物和饮料在治疗期间。请注意保暖,避免受寒。',
    "clean_script1": '处方如下：柴胡10g白芍15g当归10g白术15g茯苓20g黄芪30g党参15g陈皮6g半夏10g甘草6g薏苡仁20g砂仁5g后下方剂基础：逍遥散合四君子汤加减。服药说明：七天。处方：制附子9g先煎30分钟肉桂5g后下熟地黄20g山茱萸12g杜仲15g牛膝15g独活10g桑寄生20g川芎10g红花6g桃仁10g延胡索12g炙甘草6g方剂基础：独活寄生汤加减。服药说明：十四天。',
    "clean_script2": '处方如下：麻黄6g桂枝10g杏仁10g甘草6g苍术10g厚朴9g后下陈皮6g半夏10g茯苓15g桔梗10g紫苏子10g浙贝母10g瓜蒌15g方剂基础：三拗汤合二陈汤加减。服药说明：五天。',
    "clean_gram_character": '处方如下：麻黄6克桂枝10克杏仁10克方剂基础：三拗汤。',
    "acupuncture_clean": '患者主诉肩周炎。取穴：合谷双侧，足三里左，三阴交右，肩髃，曲池。留针30分钟。疗程：每周两次。',
    "acupuncture_garbled": '患者主诉肩周炎。取穴：合古双侧，足三里左，三阴叫右，肩雨，去池。留针30分钟。疗程：每周两次。',
    "double_trigger": '我给你开个处方，处方如下：柴胡10g白芍15g当归10g方剂基础：逍遥散。服药说明：七天。',
    "narrative_sounds_like_trigger": '情绪方面她最近比较容易烦躁有时候会莫名其妙的叹气月经周期基本正常处方如下：柴胡10g白芍15g方剂基础：逍遥散。',
    "no_prescription_trigger": '今天病人咳嗽两个星期，痰多色白，舌淡红，苔白腻，脉滑。',
}


def run(text):
    rx_text, rx_edits, rx_spans = correct_prescription_only(text)
    herbs = extract_prescription(rx_text, rx_edits)
    acu_text, acu_edits, _ = correct_acupuncture_only(rx_text)
    points = extract_acupuncture(acu_text, acu_edits)
    return {
        "input": text,
        "prescriptionSectionFound": len(rx_spans) > 0,
        "herbs": [
            {"name": h["name"], "dosage": h["dosage"], "ambiguous": h["ambiguous"], "ambiguousWith": h["ambiguous_with"]}
            for h in herbs
        ],
        "points": [
            {"name": p["name"], "laterality": p["laterality"], "ambiguous": p["ambiguous"], "ambiguousWith": p["ambiguous_with"]}
            for p in points
        ],
    }


def pinyin_fixtures(transcripts):
    """Vocabulary readings (must match exactly) and every 1-5 character window
    over the Hanzi runs of the transcripts (the other side of each comparison)."""
    terms = list(HERB_DATABASE) + list(ACUPOINT_DATABASE) + ["处方", "取穴", "针灸处方", "选穴"]
    vocab = {t: ch.pinyin_str(t) for t in dict.fromkeys(terms)}
    windows = {}
    for text in transcripts:
        for m in re.finditer(r"[一-鿿]+", text):
            run = m.group(0)
            for n in range(1, 6):
                for i in range(len(run) - n + 1):
                    windows.setdefault(run[i:i + n], ch.pinyin_str(run[i:i + n]))
    return {"vocab": vocab, "windows": windows}


def database_fixtures():
    return {
        "herbs": {
            n: {"pinyin": i["pinyin"], "category": i["category"], "doseMin": i["dose_g"][0],
                "doseMax": i["dose_g"][1], "highRisk": i["high_risk"]}
            for n, i in HERB_DATABASE.items()
        },
        "acupoints": {
            n: {"pinyin": i["pinyin"], "code": i["code"], "meridian": i["meridian"]}
            for n, i in ACUPOINT_DATABASE.items()
        },
    }


def write(name, data):
    dest = os.path.normpath(os.path.join(HERE, "..", "..", "mobile", "__tests__", "fixtures", name))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return dest


if __name__ == "__main__":
    out = {name: run(text) for name, text in FIXTURES.items()}
    write("parity.json", out)
    write("pinyin.json", pinyin_fixtures(FIXTURES.values()))
    write("databases.json", database_fixtures())
    for name, r in out.items():
        flagged = [h["name"] for h in r["herbs"] if h["ambiguous"]]
        print(f"{name:32s} herbs={len(r['herbs']):2d} points={len(r['points'])} section={r['prescriptionSectionFound']} flagged={flagged}")
    print("wrote parity.json, pinyin.json, databases.json")
