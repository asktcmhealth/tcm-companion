// Interface language only -- NOT the transcription language, which stays
// hardcoded to Chinese in the sidecar regardless (see sidecar_whisper/main.py)
// since consultations are conducted in Chinese either way. This toggle is
// purely about which language the app's own chrome (buttons, labels,
// status text) is written in, for physicians who'd rather read a Chinese
// interface.
//
// Scope note: backend-generated clinical strings (dosage warning messages
// from dosage_ranges.py, PII type labels like NAME/NRIC) are NOT translated
// here -- that would mean touching the Python pipeline too. This covers the
// static frontend chrome only; herb/acupoint names are already Chinese
// since they're TCM terms.

export type Lang = "en" | "zh";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    app_name: "TCM Consultation Scribe",
    patient_word: "Patient",
    headline: "Never wait between patients again.",
    subline: "Recording, transcribing, and note-writing all happen in the background — so paperwork doesn't slow down your day.",
    local_badge: "Runs fully offline",
    lang_toggle: "中文",

    step1_title: "Add a consultation",
    step1_subtext: "Each one queues in the background — start the next patient right away without waiting.",
    tab_record: "Record audio",
    tab_audio: "Choose file",
    tab_text: "Paste transcript",
    record_panel_desc: "Uses this device's microphone. Recording is instant — only the transcription that follows runs in the background queue.",
    record_hint_idle: "Tap to start recording",
    record_hint_active: "Recording — tap to stop",
    audio_panel_desc: "First use loads the speech recognition model, so that run is slower — every run after is quicker.",
    pick_audio_button: "Choose audio file…",
    text_panel_desc: "Skips transcription — runs correction, extraction, validation, and de-identification directly on the pasted text.",
    transcript_placeholder: "Paste a raw ASR transcript here...",
    transcript_aria_label: "Raw transcript text",
    run_button: "Queue pasted text",

    step2_title: "Patients",
    step2_subtext: "Select a completed one below to view its results.",
    patient_list_empty: "No consultations yet — record or add one above.",

    status_queued: "Queued",
    status_transcribing: "Transcribing",
    status_processing: "Processing",
    status_done: "Done",
    status_error: "Error",

    results_note_title: "Consultation note",
    results_note_desc: "The consultation portion of the transcript, PII removed — not an AI summary, zero risk of invented content. Treatment (prescription/acupuncture) is intentionally excluded here and shown separately below.",
    results_prescription_title: "Prescription draft",
    results_prescription_desc: "Requires physician review before sign-off.",
    results_acupuncture_title: "Acupuncture treatment",
    results_acupuncture_desc: "Requires physician review. Untested against real acupuncture audio as of this build — validate carefully before trusting.",
    results_deid_title: "De-identification report",
    results_deid_desc: "PII found and stripped from the consultation note above.",
    raw_json_summary: "Raw JSON output",

    empty_no_result: "No result yet.",
    empty_no_herbs: "No herbs extracted.",
    empty_no_acupoints: "No acupoints extracted.",
    empty_no_pii: "No PII detected.",
    empty_note: "(empty)",
    empty_no_prescription: "No prescription section was detected. Say “处方” before reading out the herbs so the app knows where the prescription starts.",

    badge_high_risk: "High-risk herb",
    badge_verify: "Verify",
    verify_note: "Uncertain match — the audio could also be “{alt}”. Please confirm which is correct.",
    review_banner: "Check before sign-off:",
    review_part_verify: "{n} uncertain match(es)",
    review_part_range: "{n} outside typical dose",
    review_part_risk: "{n} high-risk herb(s)",

    job_queued_msg: "Waiting in the queue — results will appear here when this patient is done.",
    job_active_msg: "Working on this patient now — results will appear here.",
    retry_button: "Retry",

    phrase_transcribing_1: "Listening closely…",
    phrase_transcribing_2: "Catching every word…",
    phrase_transcribing_3: "Turning speech into text…",
    phrase_transcribing_4: "Working through the recording…",
    phrase_transcribing_5: "Almost got it all down…",
    phrase_processing_1: "Double-checking herb names…",
    phrase_processing_2: "Cross-referencing the formulary…",
    phrase_processing_3: "Scrubbing out anything private…",
    phrase_processing_4: "Tidying up the note…",
    phrase_processing_5: "Making sure nothing's missed…",

    summary_done: "Done — {herbs} herb(s), {acupoints} acupoint(s), {pii} PII item(s) redacted.",
    error_prefix: "Error: ",
    error_paste_first: "Paste a transcript first.",
    error_save_recording: "Failed to save recording: ",
    error_mic_access: "Couldn't access the microphone: ",
  },
  zh: {
    app_name: "TCM Consultation Scribe",
    patient_word: "病人",
    headline: "看诊之间，不再等待。",
    subline: "录音、转写、记录都在后台完成——文书工作不再拖慢你的一天。",
    local_badge: "完全离线运行",
    lang_toggle: "EN",

    step1_title: "新增问诊",
    step1_subtext: "每一段都会在后台排队处理——无需等待，立即开始下一位病人。",
    tab_record: "录音",
    tab_audio: "选择文件",
    tab_text: "粘贴文字记录",
    record_panel_desc: "使用本机麦克风。录音即时完成——之后的转写会在后台排队处理。",
    record_hint_idle: "点击开始录音",
    record_hint_active: "录音中——点击停止",
    audio_panel_desc: "首次使用需要加载语音识别模型，速度较慢——之后每次都会更快。",
    pick_audio_button: "选择音频文件…",
    text_panel_desc: "跳过语音转写，直接对粘贴的文字进行校正、提取、核对与去标识化处理。",
    transcript_placeholder: "在此粘贴语音识别的原始文字记录…",
    transcript_aria_label: "原始文字记录",
    run_button: "加入处理队列",

    step2_title: "病人列表",
    step2_subtext: "点击下方已完成项目查看结果。",
    patient_list_empty: "尚无问诊记录——请在上方录音或添加。",

    status_queued: "排队中",
    status_transcribing: "转写中",
    status_processing: "处理中",
    status_done: "已完成",
    status_error: "错误",

    results_note_title: "问诊记录",
    results_note_desc: "问诊对话部分的文字记录，已移除个人信息——并非AI摘要，不存在编造内容的风险。治疗方案（处方／针灸）特意从此处排除，另于下方单独显示。",
    results_prescription_title: "处方草案",
    results_prescription_desc: "签署前须经医师核实。",
    results_acupuncture_title: "针灸治疗",
    results_acupuncture_desc: "须经医师核实。此版本尚未经真实针灸录音测试——使用前请仔细核对。",
    results_deid_title: "去标识化报告",
    results_deid_desc: "以上问诊记录中已检测并移除的个人信息。",
    raw_json_summary: "原始 JSON 数据",

    empty_no_result: "暂无结果。",
    empty_no_herbs: "未提取到药材。",
    empty_no_acupoints: "未提取到穴位。",
    empty_no_pii: "未检测到个人信息。",
    empty_note: "（空）",
    empty_no_prescription: "未检测到处方部分。读药材之前请先说“处方”，应用才能知道处方从哪里开始。",

    badge_high_risk: "高风险药材",
    badge_verify: "请核对",
    verify_note: "识别存疑——录音也可能是“{alt}”。请确认哪一个正确。",
    review_banner: "签署前请核对：",
    review_part_verify: "{n} 项识别存疑",
    review_part_range: "{n} 项超出常规剂量",
    review_part_risk: "{n} 味高风险药材",

    job_queued_msg: "正在排队——该病人处理完成后，结果会显示在此处。",
    job_active_msg: "正在处理该病人——结果会显示在此处。",
    retry_button: "重试",

    phrase_transcribing_1: "正在仔细聆听…",
    phrase_transcribing_2: "不放过每一个字…",
    phrase_transcribing_3: "将语音转成文字…",
    phrase_transcribing_4: "正在处理录音…",
    phrase_transcribing_5: "快整理完了…",
    phrase_processing_1: "核对药材名称中…",
    phrase_processing_2: "对照方剂数据库…",
    phrase_processing_3: "清除个人信息中…",
    phrase_processing_4: "整理记录中…",
    phrase_processing_5: "确认没有遗漏…",

    summary_done: "已完成——药材 {herbs} 味，穴位 {acupoints} 个，已处理个人信息 {pii} 项。",
    error_prefix: "错误：",
    error_paste_first: "请先粘贴文字记录。",
    error_save_recording: "录音保存失败：",
    error_mic_access: "无法访问麦克风：",
  },
};

const STORAGE_KEY = "tcm-lang";
let currentLang: Lang = (localStorage.getItem(STORAGE_KEY) as Lang) === "zh" ? "zh" : "en";

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang) {
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
}

export function t(key: string): string {
  return STRINGS[currentLang][key] ?? STRINGS.en[key] ?? key;
}

export function stagePhrases(stageKey: "transcribing" | "processing"): string[] {
  return [1, 2, 3, 4, 5].map((n) => t(`phrase_${stageKey}_${n}`));
}
