// Interface language only -- NOT the transcription language, which stays
// hardcoded to Chinese (whisper `language: 'zh'`) since consultations are
// conducted in Chinese either way. Same idea and same key names as the
// desktop app's i18n.ts, so wording stays consistent between the two.
//
// Deliberately dependency-free (no i18n library): the app is meant to stay
// small, and this is ~40 strings. The default comes from the device locale;
// the header toggle overrides it for the session.

import { I18nManager } from 'react-native';

export type Lang = 'en' | 'zh';

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    app_name: 'TCM Consultation Scribe',
    subtitle: 'Transcribed on this phone — the audio never leaves the device.',
    offline_badge: 'Runs fully offline',
    lang_toggle: '中文',

    model_title: 'One-time setup',
    model_body: 'This app needs a speech model (about {mb} MB) so it can transcribe on your phone, with no internet needed afterwards. Wi-Fi is recommended.',
    model_download: 'Download speech model',
    model_downloading: 'Downloading speech model — {pct}%',
    model_loading: 'Loading speech model…',
    model_checking: 'Getting ready…',
    try_again: 'Try again',

    record: 'Record',
    stop: 'Stop',
    recording_hint: 'Recording — tap Stop when the consultation ends',
    idle_hint: 'Tap Record when the consultation begins',
    transcribing: 'Transcribing on this phone…',
    transcribing_hint: 'Keep the app open and the screen on until this finishes. Long recordings can take a few minutes.',
    elapsed: 'Elapsed {time}',

    result_prescription: 'Prescription draft',
    result_prescription_desc: 'Requires physician review before sign-off.',
    result_acupuncture: 'Acupuncture treatment',
    result_transcript: 'Transcript',
    show_transcript: 'Show transcript',
    hide_transcript: 'Hide transcript',
    empty_no_herbs: 'No herbs were extracted from this recording.',
    empty_no_prescription: 'No prescription section was detected. Say “处方” before reading out the herbs so the app knows where the prescription starts.',

    badge_high_risk: 'High-risk herb',
    badge_verify: 'Verify',
    verify_note: 'Uncertain match — the audio could also be “{alt}”. Please confirm which is correct.',
    review_banner: 'Check before sign-off:',
    review_part_verify: '{n} uncertain match(es)',
    review_part_range: '{n} outside typical dose',
    review_part_risk: '{n} high-risk herb(s)',

    dev_sample_pipeline: 'Run pipeline on sample text (dev)',
    dev_sample_audio: 'Transcribe sample audio file (dev)',
  },
  zh: {
    app_name: 'TCM Consultation Scribe',
    subtitle: '在本机完成转写——录音不会离开这台手机。',
    offline_badge: '完全离线运行',
    lang_toggle: 'EN',

    model_title: '首次设置',
    model_body: '本应用需要下载语音模型（约 {mb} MB），之后即可在手机上离线转写，无需联网。建议使用 Wi-Fi。',
    model_download: '下载语音模型',
    model_downloading: '正在下载语音模型——{pct}%',
    model_loading: '正在加载语音模型…',
    model_checking: '准备中…',
    try_again: '重试',

    record: '录音',
    stop: '停止',
    recording_hint: '录音中——问诊结束后点击“停止”',
    idle_hint: '问诊开始时点击“录音”',
    transcribing: '正在本机转写…',
    transcribing_hint: '转写完成前请保持应用打开且屏幕常亮。较长的录音可能需要几分钟。',
    elapsed: '已用时 {time}',

    result_prescription: '处方草案',
    result_prescription_desc: '签署前须经医师核实。',
    result_acupuncture: '针灸治疗',
    result_transcript: '文字记录',
    show_transcript: '显示文字记录',
    hide_transcript: '隐藏文字记录',
    empty_no_herbs: '这段录音中未提取到药材。',
    empty_no_prescription: '未检测到处方部分。读药材之前请先说“处方”，应用才能知道处方从哪里开始。',

    badge_high_risk: '高风险药材',
    badge_verify: '请核对',
    verify_note: '识别存疑——录音也可能是“{alt}”。请确认哪一个正确。',
    review_banner: '签署前请核对：',
    review_part_verify: '{n} 项识别存疑',
    review_part_range: '{n} 项超出常规剂量',
    review_part_risk: '{n} 味高风险药材',

    dev_sample_pipeline: '用示例文字运行流程（开发）',
    dev_sample_audio: '转写示例音频文件（开发）',
  },
};

export function defaultLang(): Lang {
  try {
    const id = I18nManager.getConstants().localeIdentifier ?? '';
    return id.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
