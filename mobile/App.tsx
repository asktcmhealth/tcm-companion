/**
 * TCM Consultation Scribe -- mobile
 *
 * Record -> transcribe on this phone -> correct/extract the prescription (and
 * acupuncture) -> show a draft the physician must review. Everything here
 * mirrors what the desktop app does with the same shared rules: the
 * correction engine, herb database, dosage check, and the "verify" flag for
 * transcripts that are ambiguous between two real herbs.
 *
 * NOT ported yet (desktop has them): de-identification of the transcript,
 * the patient queue, and note structuring. Nothing here leaves the device, so
 * that gap doesn't yet breach PDPA, but de-identification must exist before
 * any transcript is sent to the relay/LLM in the next phase.
 *
 * @format
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { AudioRecorder, SILENCE_PEAK_THRESHOLD } from './src/audioRecorder';
import {
  debugSampleAudioPath,
  downloadModel,
  isModelDownloaded,
  MODEL_SIZE_MB,
  modelLocalPath,
} from './src/whisperModel';
import { runPipeline, type PipelineOutput } from './src/runPipeline';
import { defaultLang, translate, type Lang } from './src/i18n';
import { useTheme, type Theme } from './src/theme';
import { HerbList, PointList } from './src/Results';
import { logAutoTest, readAutoTestPlan, writeAutoTestResult, type AutoTestPlan } from './src/autoTest';

type Stage =
  | 'checking'
  | 'needs_model'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'recording'
  | 'transcribing';

// What "Try again" does after a failure: model problems redo setup; a failed
// recording/transcription just returns to the ready screen (the speech model
// is already loaded).
type Failure = { message: string; retry: 'setup' | 'ready' };

// Native-bridge rejections often come through as plain {code, message}
// objects rather than real Error instances, so String(err) collapses to
// "[object Object]", hiding the actual failure reason.
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === 'string') return anyErr.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

async function requestMicPermission(): Promise<boolean> {
  // iOS asks on first use of the microphone (NSMicrophoneUsageDescription);
  // there is no built-in JS API to pre-check it, which is why recording also
  // watches the input level and warns on silence.
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone access',
    message: 'Needed to record the consultation. Audio never leaves this device.',
    buttonPositive: 'Allow',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function formatClock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// Whole seconds elapsed while `active`, reset when it turns off.
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}

// Real garbled output from the recordings used to develop this app (a
// prescription with ambiguous, out-of-range, and high-risk entries, plus an
// acupuncture section), so the results screen can be exercised instantly in
// development without a 30-minute emulator transcription. Dev builds only.
const DEV_SAMPLE_TRANSCRIPT =
  '辨证为,肾阳虚,含湿病组,加油血瘀。厨房,致腹者9克,先煎30分钟,肉桂5克后下,手地黄20克,山椒鱼12克,肚胖15克,牛蜥15克,毒活10克,三寄生20克,春胸10克,红花6克,桃仁10克,盐胡萎12克,制甘草6克。方剂基础,毒活寄生汤和贵父地黄碗加减。服药说明,14天每天2次,饭前温服。另外取穴：合古双侧，足三里左，三阴叫右，肩雨，去池。留针30分钟。疗程：每周两次。';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}

function Screen(): React.JSX.Element {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [lang, setLang] = useState<Lang>(defaultLang);
  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const [stage, setStage] = useState<Stage>('checking');
  const [downloadFraction, setDownloadFraction] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [output, setOutput] = useState<PipelineOutput | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [level, setLevel] = useState(0);

  const whisperContextRef = useRef<WhisperContext | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const recordingSeconds = useElapsedSeconds(stage === 'recording');
  const transcribingSeconds = useElapsedSeconds(stage === 'transcribing');

  const fail = useCallback((err: unknown, retry: Failure['retry']) => {
    setFailure({ message: formatError(err), retry });
    setStage(retry === 'setup' ? 'checking' : 'ready');
  }, []);

  const loadModel = useCallback(async () => {
    setStage('loading');
    try {
      whisperContextRef.current = await initWhisper({ filePath: `file://${modelLocalPath()}` });
      setStage('ready');
    } catch (err) {
      fail(err, 'setup');
    }
  }, [fail]);

  // Model loading does NOT depend on mic permission -- file-based
  // transcription needs no microphone, and gating it behind a mic prompt once
  // silently blocked the whole app when the prompt was denied.
  const prepare = useCallback(async () => {
    setFailure(null);
    setStage('checking');
    try {
      if (await isModelDownloaded()) {
        await loadModel();
      } else {
        setStage('needs_model');
      }
    } catch (err) {
      fail(err, 'setup');
    }
  }, [fail, loadModel]);

  // CI end-to-end mode (see src/autoTest.ts): a plan file inside the app's own
  // sandbox replaces the normal setup with a scripted download -> transcribe run.
  const runAutoTest = useCallback(
    async (plan: AutoTestPlan) => {
      const startedAt = Date.now();
      const result: Record<string, unknown> = { startedAt: new Date(startedAt).toISOString() };
      const lap = () => {
        const t = Date.now();
        return () => Number(((Date.now() - t) / 1000).toFixed(1));
      };
      try {
        if (!(await isModelDownloaded())) {
          await logAutoTest(startedAt, 'downloading speech model');
          setStage('downloading');
          const seconds = lap();
          await downloadModel(setDownloadFraction);
          result.downloadSeconds = seconds();
          await logAutoTest(startedAt, `model downloaded in ${result.downloadSeconds}s`);
        }
        setStage('loading');
        await logAutoTest(startedAt, 'loading speech model');
        let seconds = lap();
        const context = await initWhisper({ filePath: `file://${modelLocalPath()}` });
        whisperContextRef.current = context;
        result.loadSeconds = seconds();

        setStage('transcribing');
        await logAutoTest(startedAt, 'transcribing');
        seconds = lap();
        const { promise } = context.transcribe(`file://${plan.audioPath}`, { language: 'zh' });
        const { result: text } = await promise;
        result.transcribeSeconds = seconds();
        await logAutoTest(startedAt, `transcribed in ${result.transcribeSeconds}s`);

        const out = runPipeline(text);
        setOutput(out);
        setStage('ready');
        Object.assign(result, {
          rawTranscript: text,
          prescriptionSectionFound: out.prescriptionSectionFound,
          herbs: out.herbs.map(h => ({
            name: h.name,
            dosage: h.dosage,
            highRisk: h.highRisk,
            dosageWarning: h.dosageWarning,
            ambiguous: h.ambiguous,
            ambiguousWith: h.ambiguousWith ?? null,
          })),
          points: out.points.map(p => ({ name: p.name, ambiguous: p.ambiguous })),
        });
      } catch (err) {
        result.error = formatError(err);
        setFailure({ message: formatError(err), retry: 'setup' });
        setStage('checking');
      }
      // Give the screen a moment to draw the result before CI screenshots it.
      await new Promise<void>(resolve => setTimeout(resolve, 2500));
      result.totalSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
      await writeAutoTestResult(result);
    },
    [],
  );

  useEffect(() => {
    void readAutoTestPlan().then(plan => (plan ? runAutoTest(plan) : prepare()));
    return () => {
      void whisperContextRef.current?.release();
      whisperContextRef.current = null;
    };
  }, [prepare, runAutoTest]);

  // The 539MB download is the user's decision (data plan, storage), never
  // something to start silently at launch.
  const handleDownload = useCallback(async () => {
    setFailure(null);
    setDownloadFraction(0);
    setStage('downloading');
    try {
      await downloadModel(setDownloadFraction);
      await loadModel();
    } catch (err) {
      setFailure({ message: formatError(err), retry: 'setup' });
      setStage('needs_model');
    }
  }, [loadModel]);

  // Live input level for the meter; polled so we don't re-render per audio chunk.
  useEffect(() => {
    if (stage !== 'recording') {
      setLevel(0);
      return;
    }
    const id = setInterval(() => setLevel(recorderRef.current?.takeRecentPeak() ?? 0), 120);
    return () => clearInterval(id);
  }, [stage]);

  const showSilenceWarning =
    stage === 'recording' && recordingSeconds >= 4 && (recorderRef.current?.peakSoFar ?? 1) < SILENCE_PEAK_THRESHOLD;

  const transcribe = useCallback(
    async (audioPath: string) => {
      setStage('transcribing');
      setFailure(null);
      setOutput(null);
      setShowTranscript(false);
      try {
        const whisperContext = whisperContextRef.current;
        if (!whisperContext) throw new Error('The speech model is not loaded yet.');
        const { promise } = whisperContext.transcribe(audioPath, { language: 'zh' });
        const { result } = await promise;
        setOutput(runPipeline(result));
        setStage('ready');
      } catch (err) {
        fail(err, 'ready');
      }
    },
    [fail],
  );

  const handleRecordPress = useCallback(async () => {
    if (stage === 'recording') {
      try {
        const recorder = recorderRef.current;
        if (!recorder) throw new Error('Recorder not initialized');
        const audioPath = await recorder.stop();
        await transcribe(audioPath);
      } catch (err) {
        fail(err, 'ready');
      }
      return;
    }

    if (stage !== 'ready') return;
    if (!(await requestMicPermission())) {
      setFailure({
        message: 'Microphone permission was denied. Enable it in system settings to record.',
        retry: 'ready',
      });
      return;
    }
    try {
      setFailure(null);
      setOutput(null);
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start();
      setStage('recording');
    } catch (err) {
      fail(err, 'ready');
    }
  }, [fail, stage, transcribe]);

  const isBusy = stage === 'checking' || stage === 'downloading' || stage === 'loading';
  const canRecord = stage === 'ready' || stage === 'recording';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={theme.bg === '#1c1e1a' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch language"
          onPress={() => setLang(l => (l === 'en' ? 'zh' : 'en'))}
          style={styles.langToggle}>
          <Text style={styles.langToggleText}>{t('lang_toggle')}</Text>
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">
          {t('app_name')}
        </Text>
        <Text style={styles.subtitle}>{t('subtitle')}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('offline_badge')}</Text>
        </View>

        {failure && (
          <View accessibilityRole="alert" style={styles.errorCard}>
            <Text style={styles.errorText}>{failure.message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => (failure.retry === 'setup' ? void prepare() : setFailure(null))}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('try_again')}</Text>
            </Pressable>
          </View>
        )}

        {isBusy && !failure && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.statusText}>
              {stage === 'downloading'
                ? t('model_downloading', { pct: Math.round(downloadFraction * 100) })
                : stage === 'loading'
                  ? t('model_loading')
                  : t('model_checking')}
            </Text>
            {stage === 'downloading' && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(downloadFraction * 100)}%` }]} />
              </View>
            )}
          </View>
        )}

        {stage === 'needs_model' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('model_title')}</Text>
            <Text style={styles.bodyText}>{t('model_body', { mb: MODEL_SIZE_MB })}</Text>
            <Pressable accessibilityRole="button" onPress={handleDownload} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('model_download')}</Text>
            </Pressable>
          </View>
        )}

        {(canRecord || stage === 'transcribing') && (
          <View style={styles.recordArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={stage === 'recording' ? t('stop') : t('record')}
              accessibilityState={{ disabled: stage === 'transcribing' }}
              onPress={handleRecordPress}
              disabled={stage === 'transcribing'}
              style={[
                styles.recordButton,
                stage === 'recording' && styles.recordButtonActive,
                stage === 'transcribing' && styles.recordButtonDisabled,
              ]}>
              <Text style={styles.recordButtonText}>
                {stage === 'recording' ? t('stop') : t('record')}
              </Text>
              {stage === 'recording' && <Text style={styles.recordTimer}>{formatClock(recordingSeconds)}</Text>}
            </Pressable>

            {stage === 'recording' && (
              <View style={styles.meterTrack} accessibilityLabel="Microphone level">
                <View style={[styles.meterFill, { width: `${Math.min(100, Math.round(level * 400))}%` }]} />
              </View>
            )}

            <Text style={styles.hint}>
              {stage === 'recording' ? t('recording_hint') : stage === 'transcribing' ? '' : t('idle_hint')}
            </Text>

            {showSilenceWarning && (
              <Text accessibilityRole="alert" style={styles.silenceWarning}>
                {lang === 'zh'
                  ? '听不到任何声音。请检查是否已允许本应用使用麦克风，且麦克风未被遮挡。'
                  : "We can't hear anything. Check that the microphone is allowed for this app and isn't covered."}
              </Text>
            )}
          </View>
        )}

        {stage === 'transcribing' && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.statusText}>{t('transcribing')}</Text>
            <Text style={styles.metaText}>{t('elapsed', { time: formatClock(transcribingSeconds) })}</Text>
            <Text style={styles.bodyText}>{t('transcribing_hint')}</Text>
          </View>
        )}

        {__DEV__ && stage === 'ready' && (
          <View style={styles.devRow}>
            <Pressable
              onPress={() => {
                setFailure(null);
                setShowTranscript(false);
                setOutput(runPipeline(DEV_SAMPLE_TRANSCRIPT));
              }}
              style={styles.devButton}>
              <Text style={styles.devButtonText}>{t('dev_sample_pipeline')}</Text>
            </Pressable>
            <Pressable onPress={() => void transcribe(`file://${debugSampleAudioPath()}`)} style={styles.devButton}>
              <Text style={styles.devButtonText}>{t('dev_sample_audio')}</Text>
            </Pressable>
          </View>
        )}

        {output && stage !== 'transcribing' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('result_prescription')}
              </Text>
              <Text style={styles.sectionNote}>{t('result_prescription_desc')}</Text>
              {output.herbs.length > 0 ? (
                <HerbList herbs={output.herbs} theme={theme} t={t} />
              ) : (
                <Text style={styles.emptyState}>
                  {output.prescriptionSectionFound ? t('empty_no_herbs') : t('empty_no_prescription')}
                </Text>
              )}
            </View>

            {output.points.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('result_acupuncture')}
                </Text>
                <Text style={styles.sectionNote}>{t('result_prescription_desc')}</Text>
                <PointList points={output.points} theme={theme} t={t} />
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => setShowTranscript(s => !s)}
              style={styles.linkButton}>
              <Text style={styles.linkButtonText}>
                {showTranscript ? t('hide_transcript') : t('show_transcript')}
              </Text>
            </Pressable>
            {showTranscript && (
              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>{t('result_transcript')}</Text>
                <Text selectable style={styles.transcriptText}>
                  {output.transcript}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 20, paddingBottom: 48 },
    langToggle: {
      alignSelf: 'flex-end',
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 14,
      minHeight: 32,
    },
    langToggleText: { color: c.inkMuted, fontSize: 13, fontWeight: '600' },
    title: { fontSize: 24, fontWeight: '700', color: c.accentStrong, marginTop: 8 },
    subtitle: { fontSize: 14, color: c.inkMuted, marginTop: 6, lineHeight: 20 },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: c.accentSoft,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 12,
      marginTop: 12,
      marginBottom: 20,
    },
    badgeText: { color: c.accent, fontSize: 12, fontWeight: '600' },
    card: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 18,
      gap: 10,
      marginBottom: 16,
    },
    cardTitle: { fontSize: 17, fontWeight: '700', color: c.ink },
    bodyText: { fontSize: 14, color: c.inkMuted, lineHeight: 20 },
    statusText: { fontSize: 15, color: c.ink, fontWeight: '600' },
    metaText: { fontSize: 13, color: c.inkMuted },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.cardSunken, overflow: 'hidden' },
    progressFill: { height: 6, backgroundColor: c.accent },
    errorCard: {
      backgroundColor: c.dangerBg,
      borderColor: c.danger,
      borderWidth: 1,
      borderRadius: 12,
      padding: 16,
      gap: 10,
      marginBottom: 16,
    },
    errorText: { color: c.danger, fontSize: 14, lineHeight: 20 },
    primaryButton: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
    },
    primaryButtonText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
    secondaryButton: {
      alignSelf: 'flex-start',
      borderColor: c.danger,
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
      minHeight: 40,
      justifyContent: 'center',
    },
    secondaryButtonText: { color: c.danger, fontWeight: '600' },
    recordArea: { alignItems: 'center', marginBottom: 16 },
    recordButton: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 8,
    },
    recordButtonActive: { backgroundColor: c.danger },
    recordButtonDisabled: { backgroundColor: c.disabled },
    recordButtonText: { color: c.onAccent, fontWeight: '700', fontSize: 17 },
    recordTimer: { color: c.onAccent, fontSize: 15, marginTop: 4, fontVariant: ['tabular-nums'] },
    meterTrack: { width: 180, height: 6, borderRadius: 3, backgroundColor: c.cardSunken, overflow: 'hidden', marginTop: 8 },
    meterFill: { height: 6, backgroundColor: c.accent },
    hint: { fontSize: 13, color: c.inkMuted, textAlign: 'center', marginTop: 10 },
    silenceWarning: {
      color: c.warnInk,
      backgroundColor: c.warnBg,
      borderColor: c.warnBorder,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      marginTop: 12,
      fontSize: 13,
      lineHeight: 18,
    },
    devRow: { gap: 8, marginBottom: 16 },
    devButton: { borderColor: c.borderStrong, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 10 },
    devButtonText: { color: c.inkMuted, fontSize: 13, textAlign: 'center' },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: c.ink },
    sectionNote: { fontSize: 13, color: c.inkMuted, marginTop: 2, marginBottom: 10 },
    emptyState: { fontSize: 14, color: c.inkMuted, fontStyle: 'italic', lineHeight: 20 },
    linkButton: { alignSelf: 'flex-start', paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
    linkButtonText: { color: c.accent, fontSize: 14, fontWeight: '600' },
    transcriptBox: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 14,
    },
    transcriptLabel: { fontSize: 12, fontWeight: '600', color: c.inkMuted, marginBottom: 8, textTransform: 'uppercase' },
    transcriptText: { fontSize: 14, color: c.ink, lineHeight: 21 },
  });
}

export default App;
