// Model download/management. NOT bundled into the app package -- both app
// stores cap what can ship in the installable bundle (iOS: 200MB over
// cellular before falling back to on-demand resources; Play Store: 150MB
// base package) well under any usable Whisper model size, so this has to
// be a post-install download over wifi, same conclusion the mobile
// feasibility research reached.
//
// Model choice: ggml-medium-q5_0 (~539MB, quantized, multilingual).
// Benchmarked against ggml-small (~466MB) on both real consultation
// recordings -- medium-q5_0 is a clear win for only ~16% more disk/RAM:
// - Script 1 patient 1: small missed 当归/白术/党参 entirely; medium got
//   all three, with only 2 herbs flagged ambiguous (correctly -- both were
//   the right herb, just phonetically close to a real alternative).
// - Script 2: small extracted 9/~12 herbs including a SILENT wrong-herb
//   substitution (麻黄, high-risk, transcribed so badly it matched 大黄
//   instead) with no flag at all. medium extracted 11/~12 herbs, and
//   transcribed 麻黄 correctly outright -- no correction, no ambiguity,
//   just right. Zero silent wrong-herb substitutions found on medium.
// Not yet benchmarked on real ARM hardware -- this was measured on an x86
// Windows emulator under heavy host memory pressure (each transcription
// took 30-45 real minutes), which is not a valid proxy for on-phone speed.
// Whisper.cpp is typically far faster on real ARM devices with NEON/Core
// ML-class acceleration. Re-benchmark wall-clock time once a real Android
// device is available -- accuracy is proven, speed on-device is not.
import RNFS from "react-native-fs";

const MODEL_FILENAME = "ggml-medium-q5_0.bin";
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;

export function modelLocalPath(): string {
  return `${RNFS.DocumentDirectoryPath}/${MODEL_FILENAME}`;
}

export async function isModelDownloaded(): Promise<boolean> {
  return RNFS.exists(modelLocalPath());
}

export async function downloadModel(onProgress?: (fractionComplete: number) => void): Promise<string> {
  const destPath = modelLocalPath();
  if (await RNFS.exists(destPath)) return `file://${destPath}`;

  const { promise } = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: destPath,
    progress: (res) => {
      if (onProgress && res.contentLength > 0) {
        onProgress(res.bytesWritten / res.contentLength);
      }
    },
    progressDivider: 5,
  });

  const result = await promise;
  if (result.statusCode !== 200) {
    await RNFS.unlink(destPath).catch(() => {});
    throw new Error(`Model download failed: HTTP ${result.statusCode}`);
  }
  return `file://${destPath}`;
}
