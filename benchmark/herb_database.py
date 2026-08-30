"""
STARTER herb database -- DRAFT, NOT VERIFIED. ~130 commonly-prescribed herbs.
--------------------------------------------------------------------------
This is a technical prototype covering the "workhorse" herbs used in most
routine TCM practice -- it is NOT the full ~300-600 herb pharmacopoeia, and
it is NOT a substitute for TODO #5 in plan-review.md ("Evaluate and license
TCM herb database (names zh-CN/zh-TW/pinyin/Latin + dosages)").

Before ANY of this feeds a real prescription in the product:
  - every name/pinyin/range must be checked against a licensed herb DB
    (commercial or 中国药典-sourced) and the current pharmacopoeia edition
  - every entry needs physician sign-off (Elynda / Julie)
  - deliberately EXCLUDED here: rare/highly-toxic substances (马钱子, 砒霜,
    朱砂, 雄黄, raw/unprocessed aconite, etc.) -- guessing at dosing for
    these carries outsized risk; they must be added later with explicit
    pharmacist verification, not inferred from general training knowledge.

Structure: name -> {pinyin, category, dose_g: (min, max), high_risk: bool}
"high_risk" = narrow therapeutic window / toxicity concern / mandatory special
processing (e.g. 先煎 pre-decoction) -- these need extra UI emphasis, not just
a range check.

Categories follow standard 中药学 textbook classification, to make future
physician review easier (spot-check one category at a time).
"""

HERB_DATABASE = {
    # 解表药 Exterior-releasing
    "麻黄":   {"pinyin": "ma2 huang2",   "category": "解表药", "dose_g": (2, 10),  "high_risk": True},  # cardiac/BP caution
    "桂枝":   {"pinyin": "gui4 zhi1",    "category": "解表药", "dose_g": (3, 10),  "high_risk": False},
    "紫苏叶": {"pinyin": "zi3 su1 ye4",  "category": "解表药", "dose_g": (5, 10),  "high_risk": False},
    "生姜":   {"pinyin": "sheng1 jiang1","category": "解表药", "dose_g": (3, 10),  "high_risk": False},
    "荆芥":   {"pinyin": "jing1 jie4",   "category": "解表药", "dose_g": (5, 10),  "high_risk": False},
    "防风":   {"pinyin": "fang2 feng1",  "category": "解表药", "dose_g": (5, 10),  "high_risk": False},
    "羌活":   {"pinyin": "qiang1 huo2",  "category": "解表药", "dose_g": (3, 10),  "high_risk": False},
    "白芷":   {"pinyin": "bai2 zhi3",    "category": "解表药", "dose_g": (3, 10),  "high_risk": False},
    "细辛":   {"pinyin": "xi4 xin1",     "category": "解表药", "dose_g": (1, 3),   "high_risk": True},  # narrow dose, classic caution
    "薄荷":   {"pinyin": "bo4 he2",      "category": "解表药", "dose_g": (3, 6),   "high_risk": False},
    "菊花":   {"pinyin": "ju2 hua1",     "category": "解表药", "dose_g": (5, 10),  "high_risk": False},
    "桑叶":   {"pinyin": "sang1 ye4",    "category": "解表药", "dose_g": (5, 10),  "high_risk": False},
    "柴胡":   {"pinyin": "chai2 hu2",    "category": "解表药", "dose_g": (3, 10),  "high_risk": False},
    "葛根":   {"pinyin": "ge2 gen1",     "category": "解表药", "dose_g": (10, 15), "high_risk": False},

    # 清热药 Heat-clearing
    "石膏":   {"pinyin": "shi2 gao1",    "category": "清热药", "dose_g": (15, 60), "high_risk": False},
    "知母":   {"pinyin": "zhi1 mu3",     "category": "清热药", "dose_g": (6, 12),  "high_risk": False},
    "栀子":   {"pinyin": "zhi1 zi3",     "category": "清热药", "dose_g": (6, 10),  "high_risk": False},
    "黄芩":   {"pinyin": "huang2 qin2",  "category": "清热药", "dose_g": (3, 10),  "high_risk": False},
    "黄连":   {"pinyin": "huang2 lian2", "category": "清热药", "dose_g": (2, 5),   "high_risk": False},
    "黄柏":   {"pinyin": "huang2 bo4",   "category": "清热药", "dose_g": (3, 10),  "high_risk": False},
    "金银花": {"pinyin": "jin1 yin2 hua1", "category": "清热药", "dose_g": (6, 15), "high_risk": False},
    "连翘":   {"pinyin": "lian2 qiao4",  "category": "清热药", "dose_g": (6, 15),  "high_risk": False},
    "板蓝根": {"pinyin": "ban3 lan2 gen1", "category": "清热药", "dose_g": (9, 15), "high_risk": False},
    "蒲公英": {"pinyin": "pu2 gong1 ying1", "category": "清热药", "dose_g": (10, 15), "high_risk": False},
    "鱼腥草": {"pinyin": "yu2 xing1 cao3", "category": "清热药", "dose_g": (15, 25), "high_risk": False},
    "牡丹皮": {"pinyin": "mu3 dan1 pi2", "category": "清热药", "dose_g": (6, 10),  "high_risk": False},
    "赤芍":   {"pinyin": "chi4 shao2",   "category": "清热药", "dose_g": (6, 12),  "high_risk": False},
    "紫花地丁": {"pinyin": "zi3 hua1 di4 ding1", "category": "清热药", "dose_g": (15, 30), "high_risk": False},
    "生地黄": {"pinyin": "sheng1 di4 huang2", "category": "清热药", "dose_g": (10, 15), "high_risk": False},

    # 泻下药 Purgatives
    "大黄":   {"pinyin": "da4 huang2",   "category": "泻下药", "dose_g": (3, 10),  "high_risk": True},  # dose-dependent effect, caution in pregnancy
    "芒硝":   {"pinyin": "mang2 xiao1",  "category": "泻下药", "dose_g": (6, 12),  "high_risk": True},

    # 祛风湿药 Wind-damp-dispelling
    "独活":   {"pinyin": "du2 huo2",     "category": "祛风湿药", "dose_g": (3, 10), "high_risk": False},
    "桑寄生": {"pinyin": "sang1 ji4 sheng1", "category": "祛风湿药", "dose_g": (9, 30), "high_risk": False},
    "秦艽":   {"pinyin": "qin2 jiao1",   "category": "祛风湿药", "dose_g": (3, 10),  "high_risk": False},
    "威灵仙": {"pinyin": "wei1 ling2 xian1", "category": "祛风湿药", "dose_g": (6, 10), "high_risk": False},

    # 化湿药 Damp-transforming
    "苍术":   {"pinyin": "cang1 zhu2",   "category": "化湿药", "dose_g": (3, 10),  "high_risk": False},
    "厚朴":   {"pinyin": "hou4 po4",     "category": "化湿药", "dose_g": (3, 10),  "high_risk": False},
    "藿香":   {"pinyin": "huo4 xiang1",  "category": "化湿药", "dose_g": (3, 10),  "high_risk": False},
    "砂仁":   {"pinyin": "sha1 ren2",    "category": "化湿药", "dose_g": (3, 6),   "high_risk": False},
    "白豆蔻": {"pinyin": "bai2 dou4 kou4", "category": "化湿药", "dose_g": (3, 6), "high_risk": False},

    # 利水渗湿药 Water-draining/damp-percolating
    "茯苓":   {"pinyin": "fu2 ling2",    "category": "利水渗湿药", "dose_g": (9, 30), "high_risk": False},
    "薏苡仁": {"pinyin": "yi4 yi3 ren2", "category": "利水渗湿药", "dose_g": (9, 30), "high_risk": False},
    "泽泻":   {"pinyin": "ze2 xie4",     "category": "利水渗湿药", "dose_g": (6, 10), "high_risk": False},
    "车前子": {"pinyin": "che1 qian2 zi3", "category": "利水渗湿药", "dose_g": (9, 15), "high_risk": False},
    "猪苓":   {"pinyin": "zhu1 ling2",   "category": "利水渗湿药", "dose_g": (6, 12), "high_risk": False},
    "滑石":   {"pinyin": "hua2 shi2",    "category": "利水渗湿药", "dose_g": (10, 20), "high_risk": False},
    "茵陈":   {"pinyin": "yin1 chen2",   "category": "利水渗湿药", "dose_g": (6, 15), "high_risk": False},

    # 温里药 Interior-warming
    "附子":   {"pinyin": "fu4 zi3",      "category": "温里药", "dose_g": (3, 15),  "high_risk": True},  # 先煎 required, narrow therapeutic window
    "制附子": {"pinyin": "zhi4 fu4 zi3", "category": "温里药", "dose_g": (3, 15),  "high_risk": True},
    "干姜":   {"pinyin": "gan1 jiang1",  "category": "温里药", "dose_g": (3, 10),  "high_risk": False},
    "肉桂":   {"pinyin": "rou4 gui4",    "category": "温里药", "dose_g": (1, 5),   "high_risk": False},
    "吴茱萸": {"pinyin": "wu2 zhu1 yu2", "category": "温里药", "dose_g": (2, 5),   "high_risk": False},
    "小茴香": {"pinyin": "xiao3 hui2 xiang1", "category": "温里药", "dose_g": (3, 6), "high_risk": False},

    # 理气药 Qi-regulating
    "陈皮":   {"pinyin": "chen2 pi2",    "category": "理气药", "dose_g": (3, 10),  "high_risk": False},
    "枳壳":   {"pinyin": "zhi3 qiao4",   "category": "理气药", "dose_g": (3, 10),  "high_risk": False},
    "枳实":   {"pinyin": "zhi3 shi2",    "category": "理气药", "dose_g": (3, 10),  "high_risk": False},
    "木香":   {"pinyin": "mu4 xiang1",   "category": "理气药", "dose_g": (3, 6),   "high_risk": False},
    "香附":   {"pinyin": "xiang1 fu4",   "category": "理气药", "dose_g": (6, 10),  "high_risk": False},
    "郁金":   {"pinyin": "yu4 jin1",     "category": "理气药", "dose_g": (3, 10),  "high_risk": False},

    # 消食药 Digestion-promoting
    "山楂":   {"pinyin": "shan1 zha1",   "category": "消食药", "dose_g": (9, 12),  "high_risk": False},
    "神曲":   {"pinyin": "shen2 qu1",    "category": "消食药", "dose_g": (6, 15),  "high_risk": False},
    "麦芽":   {"pinyin": "mai4 ya2",     "category": "消食药", "dose_g": (10, 15), "high_risk": False},
    "鸡内金": {"pinyin": "ji1 nei4 jin1", "category": "消食药", "dose_g": (3, 10), "high_risk": False},

    # 止血药 Hemostatic
    "三七":   {"pinyin": "san1 qi1",     "category": "止血药", "dose_g": (3, 9),   "high_risk": False},
    "白及":   {"pinyin": "bai2 ji2",     "category": "止血药", "dose_g": (6, 15),  "high_risk": False},

    # 活血化瘀药 Blood-activating / stasis-resolving
    "川芎":   {"pinyin": "chuan1 xiong1", "category": "活血化瘀药", "dose_g": (3, 10), "high_risk": False},
    "丹参":   {"pinyin": "dan1 shen1",   "category": "活血化瘀药", "dose_g": (10, 15), "high_risk": False},
    "红花":   {"pinyin": "hong2 hua1",   "category": "活血化瘀药", "dose_g": (3, 10), "high_risk": False},
    "桃仁":   {"pinyin": "tao2 ren2",    "category": "活血化瘀药", "dose_g": (6, 10), "high_risk": False},
    "延胡索": {"pinyin": "yan2 hu2 suo3", "category": "活血化瘀药", "dose_g": (3, 15), "high_risk": False},
    "益母草": {"pinyin": "yi4 mu3 cao3", "category": "活血化瘀药", "dose_g": (10, 30), "high_risk": False},
    "牛膝":   {"pinyin": "niu2 xi1",     "category": "活血化瘀药", "dose_g": (6, 15), "high_risk": False},
    "泽兰":   {"pinyin": "ze2 lan2",     "category": "活血化瘀药", "dose_g": (6, 12), "high_risk": False},

    # 化痰止咳平喘药 Phlegm-transforming / cough-suppressing
    "半夏":   {"pinyin": "ban4 xia4",    "category": "化痰止咳平喘药", "dose_g": (3, 10), "high_risk": True},  # raw toxic, must use processed (制/法/姜半夏)
    "川贝母": {"pinyin": "chuan1 bei4 mu3", "category": "化痰止咳平喘药", "dose_g": (3, 10), "high_risk": False},
    "浙贝母": {"pinyin": "zhe4 bei4 mu3", "category": "化痰止咳平喘药", "dose_g": (5, 10), "high_risk": False},
    "桔梗":   {"pinyin": "jie2 geng3",   "category": "化痰止咳平喘药", "dose_g": (3, 10), "high_risk": False},
    "杏仁":   {"pinyin": "xing4 ren2",   "category": "化痰止咳平喘药", "dose_g": (5, 10), "high_risk": True},  # amygdalin content, dose caution
    "紫苏子": {"pinyin": "zi3 su1 zi3",  "category": "化痰止咳平喘药", "dose_g": (3, 10), "high_risk": False},
    "瓜蒌":   {"pinyin": "gua1 lou2",    "category": "化痰止咳平喘药", "dose_g": (10, 20), "high_risk": False},

    # 安神药 Spirit-calming
    "酸枣仁": {"pinyin": "suan1 zao3 ren2", "category": "安神药", "dose_g": (10, 15), "high_risk": False},
    "柏子仁": {"pinyin": "bai3 zi3 ren2", "category": "安神药", "dose_g": (6, 15), "high_risk": False},
    "远志":   {"pinyin": "yuan3 zhi4",   "category": "安神药", "dose_g": (3, 10),  "high_risk": False},
    "合欢皮": {"pinyin": "he2 huan1 pi2", "category": "安神药", "dose_g": (6, 12), "high_risk": False},
    "龙骨":   {"pinyin": "long2 gu3",    "category": "安神药", "dose_g": (15, 30), "high_risk": False},
    "牡蛎":   {"pinyin": "mu3 li4",      "category": "安神药", "dose_g": (15, 30), "high_risk": False},

    # 平肝息风药 Liver-calming / wind-extinguishing
    "天麻":   {"pinyin": "tian1 ma2",    "category": "平肝息风药", "dose_g": (3, 10), "high_risk": False},
    "钩藤":   {"pinyin": "gou1 teng2",   "category": "平肝息风药", "dose_g": (10, 15), "high_risk": False},  # 后下 typically
    "石决明": {"pinyin": "shi2 jue2 ming2", "category": "平肝息风药", "dose_g": (10, 30), "high_risk": False},

    # 开窍药 Orifice-opening
    "石菖蒲": {"pinyin": "shi2 chang1 pu2", "category": "开窍药", "dose_g": (3, 10), "high_risk": False},

    # 补虚药 Tonifying
    "人参":   {"pinyin": "ren2 shen1",   "category": "补虚药", "dose_g": (3, 10),  "high_risk": False},
    "西洋参": {"pinyin": "xi1 yang2 shen1", "category": "补虚药", "dose_g": (3, 6), "high_risk": False},
    "党参":   {"pinyin": "dang3 shen1",  "category": "补虚药", "dose_g": (9, 30),  "high_risk": False},
    "太子参": {"pinyin": "tai4 zi3 shen1", "category": "补虚药", "dose_g": (9, 30), "high_risk": False},
    "黄芪":   {"pinyin": "huang2 qi2",   "category": "补虚药", "dose_g": (9, 30),  "high_risk": False},
    "白术":   {"pinyin": "bai2 zhu2",    "category": "补虚药", "dose_g": (6, 15),  "high_risk": False},
    "山药":   {"pinyin": "shan1 yao4",   "category": "补虚药", "dose_g": (15, 30), "high_risk": False},
    "甘草":   {"pinyin": "gan1 cao3",    "category": "补虚药", "dose_g": (2, 10),  "high_risk": False},
    "炙甘草": {"pinyin": "zhi4 gan1 cao3", "category": "补虚药", "dose_g": (2, 10), "high_risk": False},
    "大枣":   {"pinyin": "da4 zao3",     "category": "补虚药", "dose_g": (6, 15),  "high_risk": False},
    "当归":   {"pinyin": "dang1 gui1",   "category": "补虚药", "dose_g": (6, 15),  "high_risk": False},
    "熟地黄": {"pinyin": "shu2 di4 huang2", "category": "补虚药", "dose_g": (9, 30), "high_risk": False},
    "白芍":   {"pinyin": "bai2 shao2",   "category": "补虚药", "dose_g": (6, 15),  "high_risk": False},
    "何首乌": {"pinyin": "he2 shou3 wu1", "category": "补虚药", "dose_g": (6, 12), "high_risk": True},  # hepatotoxicity concern (制首乌 vs 生首乌 distinction matters)
    "阿胶":   {"pinyin": "e1 jiao1",     "category": "补虚药", "dose_g": (3, 9),   "high_risk": False},  # 烊化 (dissolved separately)
    "北沙参": {"pinyin": "bei3 sha1 shen1", "category": "补虚药", "dose_g": (5, 12), "high_risk": False},
    "南沙参": {"pinyin": "nan2 sha1 shen1", "category": "补虚药", "dose_g": (9, 15), "high_risk": False},
    "麦冬":   {"pinyin": "mai4 dong1",   "category": "补虚药", "dose_g": (6, 12),  "high_risk": False},
    "天冬":   {"pinyin": "tian1 men2 dong1", "category": "补虚药", "dose_g": (6, 12), "high_risk": False},
    "百合":   {"pinyin": "bai3 he2",     "category": "补虚药", "dose_g": (6, 12),  "high_risk": False},
    "枸杞子": {"pinyin": "gou3 qi3 zi3", "category": "补虚药", "dose_g": (6, 12),  "high_risk": False},
    "女贞子": {"pinyin": "nu:3 zhen1 zi3", "category": "补虚药", "dose_g": (6, 12), "high_risk": False},
    "墨旱莲": {"pinyin": "mo4 han4 lian2", "category": "补虚药", "dose_g": (6, 12), "high_risk": False},
    "山茱萸": {"pinyin": "shan1 zhu1 yu2", "category": "补虚药", "dose_g": (6, 12), "high_risk": False},
    "杜仲":   {"pinyin": "du4 zhong4",   "category": "补虚药", "dose_g": (6, 15),  "high_risk": False},
    "菟丝子": {"pinyin": "tu4 si1 zi3",  "category": "补虚药", "dose_g": (6, 12),  "high_risk": False},
    "五味子": {"pinyin": "wu3 wei4 zi3", "category": "补虚药", "dose_g": (2, 6),   "high_risk": False},
    "淫羊藿": {"pinyin": "yin2 yang2 huo4", "category": "补虚药", "dose_g": (6, 10), "high_risk": False},
    "鹿角胶": {"pinyin": "lu4 jiao3 jiao1", "category": "补虚药", "dose_g": (3, 9), "high_risk": False},
    "肉苁蓉": {"pinyin": "rou4 cong1 rong2", "category": "补虚药", "dose_g": (6, 10), "high_risk": False},
    "巴戟天": {"pinyin": "ba1 ji3 tian1", "category": "补虚药", "dose_g": (3, 10), "high_risk": False},

    # 收涩药 Astringent
    "山茱萸2": {"pinyin": "(dup, see 补虚药)", "category": "收涩药", "dose_g": (6, 12), "high_risk": False},
    "五倍子": {"pinyin": "wu3 bei4 zi3", "category": "收涩药", "dose_g": (3, 9),   "high_risk": False},
    "芡实":   {"pinyin": "qian4 shi2",   "category": "收涩药", "dose_g": (9, 15),  "high_risk": False},
    "莲子":   {"pinyin": "lian2 zi3",    "category": "收涩药", "dose_g": (6, 15),  "high_risk": False},

    # 平喘/其他 misc common workhorse herbs used across formulas
    "茯神":   {"pinyin": "fu2 shen2",    "category": "安神药", "dose_g": (9, 15),  "high_risk": False},
    "首乌藤": {"pinyin": "shou3 wu1 teng2", "category": "安神药", "dose_g": (9, 30), "high_risk": False},
}

# Cleanup: remove the accidental duplicate-key placeholder above.
HERB_DATABASE.pop("山茱萸2", None)


def lookup(herb_name):
    return HERB_DATABASE.get(herb_name)


def all_names():
    return list(HERB_DATABASE.keys())


def hotword_string():
    """Space-joined vocabulary string for ASR hotword biasing."""
    return " ".join(HERB_DATABASE.keys())
