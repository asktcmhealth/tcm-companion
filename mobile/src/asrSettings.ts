import RNFS from 'react-native-fs';

// Speech-recognition settings the physician can change on the device.
//
// language: what the consultation is spoken in. Herb checking only works on
//   Chinese text, so 'zh' stays the default; 'en' and 'auto' exist so that
//   speech in English is transcribed as English instead of being forced into
//   Chinese characters.
// threads: CPU threads for Whisper. 0 = the library's own choice. Exposed so
//   a slow tablet can be tuned by comparing the "Transcribed in" times.

export const ASR_LANGUAGES = ['zh', 'en', 'auto'] as const;
export type AsrLanguage = (typeof ASR_LANGUAGES)[number];
export const THREAD_OPTIONS = [0, 2, 4, 6, 8] as const;

export interface AsrSettings {
  language: AsrLanguage;
  threads: number;
}

export const DEFAULT_ASR_SETTINGS: AsrSettings = { language: 'zh', threads: 0 };

type Fs = Pick<typeof RNFS, 'readFile' | 'writeFile' | 'exists'>;

const settingsPath = () => `${RNFS.DocumentDirectoryPath}/asr_settings.json`;

export async function loadAsrSettings(fs: Fs = RNFS): Promise<AsrSettings> {
  try {
    if (!(await fs.exists(settingsPath()))) return DEFAULT_ASR_SETTINGS;
    const data = JSON.parse(await fs.readFile(settingsPath(), 'utf8'));
    return {
      language: (ASR_LANGUAGES as readonly string[]).includes(data?.language) ? data.language : DEFAULT_ASR_SETTINGS.language,
      threads: (THREAD_OPTIONS as readonly number[]).includes(data?.threads) ? data.threads : DEFAULT_ASR_SETTINGS.threads,
    };
  } catch {
    return DEFAULT_ASR_SETTINGS;
  }
}

export async function saveAsrSettings(settings: AsrSettings, fs: Fs = RNFS): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify({ language: settings.language, threads: settings.threads }), 'utf8');
}

/** The options handed to whisper.rn's transcribe(). */
export function whisperOptions(settings: AsrSettings): { language: string; maxThreads?: number } {
  return settings.threads > 0 ? { language: settings.language, maxThreads: settings.threads } : { language: settings.language };
}
