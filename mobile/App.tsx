/**
 * TCM Consultation Scribe -- mobile (proof-of-concept)
 *
 * v1 scope: record -> on-device transcribe -> show raw text. Deliberately
 * NOT porting the desktop app's correction/extraction/dosage-validation/
 * de-identification pipeline yet -- this first pass exists to prove the
 * riskiest, most novel part (on-device Whisper via whisper.rn on a real
 * phone) actually works before investing in porting the rest. See
 * src/whisperModel.ts for why the model choice here is a placeholder, not
 * a benchmarked decision.
 *
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { AudioRecorder } from './src/audioRecorder';
import { downloadModel, isModelDownloaded, modelLocalPath } from './src/whisperModel';
import { toSimplified } from './src/textNormalize';
import { correctPrescriptionOnly } from './src/correctHerbs';
import { extractPrescription, type HerbEntry } from './src/pipeline';

type Stage = 'preparing' | 'downloading_model' | 'ready' | 'recording' | 'transcribing' | 'error';

// Where accuracy-test audio gets pushed for the "Transcribe sample file"
// debug path below. Not part of the real UI flow -- mic recording in an
// emulator has no real consultation to capture, so this is how the actual
// real audio recordings from the desktop benchmarking get tested here
// instead.
//
// Lives in app-private storage (same directory as the downloaded model),
// NOT /sdcard/Download -- confirmed empirically that a WAV file pushed to
// shared storage made whisper.rn's native transcribe() fail with "Invalid
// WAV file" even though the file's content and extension were both
// correct. Root cause: Android's scoped storage (enforced since Android
// 10, and this app targets API 35) blocks a raw filesystem path into
// another app's shared storage from whisper.cpp's native fopen()-style
// file read -- react-native-fs's own APIs go through a content-resolver
// path that handles this, but whisper.rn's transcribe() takes a bare path
// and doesn't. App-private storage has no such restriction.
const SAMPLE_AUDIO_PATH = `file://${modelLocalPath().replace(/[^/]+$/, 'tcm_test_audio.wav')}`;

// Native-bridge rejections often come through as plain {code, message}
// objects rather than real Error instances, so String(err) collapses to
// "[object Object]" -- a real bug hit while testing this on the emulator,
// hiding the actual failure reason. Pull out whatever's actually useful.
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
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone access',
    message: 'Needed to record the consultation. Audio never leaves this device.',
    buttonPositive: 'Allow',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function App(): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('preparing');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [herbs, setHerbs] = useState<HerbEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Raw ASR text isn't directly usable by the correction engine -- every
  // trigger phrase, herb name, and end-marker constant in correctHerbs.ts is
  // Simplified-only, and mobile's whisper.cpp model has been confirmed (on
  // real audio) to sometimes output Traditional characters where desktop's
  // faster-whisper never did. Normalize once, right after transcription, so
  // this app-level pipeline stays a straight port of the Python one.
  function runPipeline(rawTranscript: string) {
    const normalized = toSimplified(rawTranscript);
    setTranscript(normalized);
    const { corrected, edits } = correctPrescriptionOnly(normalized);
    setHerbs(extractPrescription(corrected, edits));
  }

  const whisperContextRef = useRef<WhisperContext | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    // Model loading does NOT depend on mic permission -- file-based
    // transcription (the sample-file test path) needs no microphone at
    // all, and gating it behind a mic prompt was a real bug: a denied mic
    // permission silently blocked the whole app, including paths that
    // never touch the mic.
    (async () => {
      try {
        let modelPath: string;
        if (await isModelDownloaded()) {
          modelPath = `file://${modelLocalPath()}`;
        } else {
          setStage('downloading_model');
          modelPath = await downloadModel(setDownloadProgress);
        }

        whisperContextRef.current = await initWhisper({ filePath: modelPath });
        setStage('ready');
      } catch (err) {
        setErrorMessage(formatError(err));
        setStage('error');
      }
    })();
  }, []);

  async function handleRecordPress() {
    if (stage === 'recording') {
      setStage('transcribing');
      try {
        const recorder = recorderRef.current;
        if (!recorder) throw new Error('Recorder not initialized');
        const audioPath = await recorder.stop();

        const whisperContext = whisperContextRef.current;
        if (!whisperContext) throw new Error('Whisper model not ready');

        const { promise } = whisperContext.transcribe(audioPath, { language: 'zh' });
        const { result } = await promise;
        runPipeline(result);
        setStage('ready');
      } catch (err) {
        setErrorMessage(formatError(err));
        setStage('error');
      }
      return;
    }

    if (stage === 'ready') {
      const hasMic = await requestMicPermission();
      if (!hasMic) {
        setErrorMessage('Microphone permission was denied. Enable it in system settings to record.');
        setStage('error');
        return;
      }
      try {
        setTranscript('');
        setHerbs([]);
        recorderRef.current = new AudioRecorder();
        await recorderRef.current.start();
        setStage('recording');
      } catch (err) {
        setErrorMessage(formatError(err));
        setStage('error');
      }
    }
  }

  async function handleTranscribeSample() {
    const whisperContext = whisperContextRef.current;
    if (!whisperContext) return;
    setStage('transcribing');
    setTranscript('');
    setHerbs([]);
    try {
      const { promise } = whisperContext.transcribe(SAMPLE_AUDIO_PATH, { language: 'zh' });
      const { result } = await promise;
      runPipeline(result);
      setStage('ready');
    } catch (err) {
      setErrorMessage(formatError(err));
      setStage('error');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>TCM Consultation Scribe</Text>
        <Text style={styles.subtitle}>Mobile proof-of-concept — on-device transcription only, nothing else ported yet.</Text>

        {stage === 'preparing' && <Text style={styles.status}>Preparing…</Text>}

        {stage === 'downloading_model' && (
          <Text style={styles.status}>Downloading speech model — {Math.round(downloadProgress * 100)}%</Text>
        )}

        {stage === 'error' && (
          <View>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {(stage === 'ready' || stage === 'recording' || stage === 'transcribing') && (
          <Pressable
            onPress={handleRecordPress}
            disabled={stage === 'transcribing'}
            style={[
              styles.recordButton,
              stage === 'recording' && styles.recordButtonActive,
              stage === 'transcribing' && styles.recordButtonDisabled,
            ]}>
            <Text style={styles.recordButtonText}>
              {stage === 'recording' ? 'Stop' : stage === 'transcribing' ? 'Transcribing…' : 'Record'}
            </Text>
          </Pressable>
        )}

        {stage === 'ready' && (
          <Pressable onPress={handleTranscribeSample} style={styles.sampleButton}>
            <Text style={styles.sampleButtonText}>Transcribe sample file (debug)</Text>
          </Pressable>
        )}

        {herbs.length > 0 ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>Extracted herbs ({herbs.length})</Text>
            {herbs.map((h, i) => (
              <View key={i} style={styles.herbRow}>
                <Text style={[styles.herbText, h.ambiguous && styles.herbTextAmbiguous]}>
                  {h.name} {h.dosage}
                  {h.unit}
                  {h.highRisk ? ' ⚠ high-risk' : ''}
                </Text>
                {h.ambiguous && (
                  <Text style={styles.ambiguousNote}>
                    Uncertain — could also be "{h.ambiguousWith}". Please verify.
                  </Text>
                )}
                {h.dosageWarning && <Text style={styles.ambiguousNote}>{h.dosageCheckMessage}</Text>}
              </View>
            ))}
          </View>
        ) : null}

        {transcript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>Transcript (normalized)</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f3ec' },
  scroll: { padding: 20, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#1e4438', marginTop: 12 },
  subtitle: { fontSize: 13, color: '#66675c', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  status: { fontSize: 14, color: '#66675c', marginVertical: 20 },
  errorText: { fontSize: 14, color: '#a3352a', textAlign: 'center', marginVertical: 20 },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
  },
  recordButtonActive: { backgroundColor: '#a3352a' },
  recordButtonDisabled: { backgroundColor: '#cfc7ac' },
  recordButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  sampleButton: {
    borderWidth: 1,
    borderColor: '#cfc7ac',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sampleButtonText: { color: '#66675c', fontSize: 13 },
  transcriptBox: {
    width: '100%',
    backgroundColor: '#fffefb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3ddcc',
    padding: 16,
    marginTop: 12,
  },
  transcriptLabel: { fontSize: 12, fontWeight: '600', color: '#66675c', marginBottom: 8, textTransform: 'uppercase' },
  transcriptText: { fontSize: 14, color: '#17190f', lineHeight: 20 },
  herbRow: { marginBottom: 10 },
  herbText: { fontSize: 15, color: '#17190f' },
  herbTextAmbiguous: { color: '#a3352a', fontWeight: '600' },
  ambiguousNote: { fontSize: 12, color: '#a3352a', marginTop: 2 },
});

export default App;
