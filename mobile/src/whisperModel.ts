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

import { Platform } from "react-native";
import RNFS from "react-native-fs";

const MODEL_FILENAME = "ggml-medium-q5_0.bin";
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;

// Exact byte size of the file at MODEL_URL (from its Content-Length). Used to
// tell a complete download from a truncated one: RNFS rejects the download
// promise on a dropped connection but leaves the partial file where it was
// writing, and "does the file exist?" alone would then load a corrupt model on
// the next launch. Update this if MODEL_FILENAME changes.
export const MODEL_BYTES = 539_212_467;
export const MODEL_SIZE_MB = Math.round(MODEL_BYTES / 1_000_000);

// Free space required on top of the model itself -- room for the .part file
// to be renamed, the OS to breathe, and the recordings that follow.
const FREE_SPACE_HEADROOM_BYTES = 300_000_000;

// iOS: RNFS.DocumentDirectoryPath is included in iCloud/iTunes backups, and
// Apple rejects apps that back up large re-downloadable files. So on iOS the
// model lives in Library/models, and that directory is flagged
// NSURLIsExcludedFromBackupKey (see ensureModelDir) -- a flagged directory
// excludes everything inside it. Not Library/Caches, which the OS may purge
// under storage pressure, silently forcing a 539MB re-download.
// Android: the app-private files dir is already outside user-visible storage,
// and AndroidManifest sets allowBackup=false, so it stays where it was.
function modelDir(): string {
  return Platform.OS === "ios" ? `${RNFS.LibraryDirectoryPath}/models` : RNFS.DocumentDirectoryPath;
}

export function modelLocalPath(): string {
  return `${modelDir()}/${MODEL_FILENAME}`;
}

// Debug-only test audio lives beside the model (app-private storage, which
// native whisper.cpp can read -- see the scoped-storage note in App.tsx).
export function debugSampleAudioPath(): string {
  return `${modelDir()}/tcm_test_audio.wav`;
}

async function ensureModelDir(): Promise<void> {
  if (Platform.OS !== "ios") return; // Android's dir always exists
  await RNFS.mkdir(modelDir(), { NSURLIsExcludedFromBackupKey: true });
}

async function fileSize(path: string): Promise<number> {
  return Number((await RNFS.stat(path)).size);
}

export async function isModelDownloaded(): Promise<boolean> {
  const path = modelLocalPath();
  try {
    if (!(await RNFS.exists(path))) return false;
    if ((await fileSize(path)) === MODEL_BYTES) return true;
    // Present but the wrong size: a corrupt/partial leftover. Remove it so
    // the download path starts clean instead of loading garbage.
    await RNFS.unlink(path).catch(() => {});
    return false;
  } catch {
    return false;
  }
}

export async function downloadModel(onProgress?: (fractionComplete: number) => void): Promise<string> {
  await ensureModelDir();

  // getFSInfo is what makes "not enough space" a clear message up front
  // instead of a cryptic write failure 400MB into the download.
  const { freeSpace } = await RNFS.getFSInfo();
  const needed = MODEL_BYTES + FREE_SPACE_HEADROOM_BYTES;
  if (freeSpace < needed) {
    throw new Error(
      `Not enough free storage. About ${Math.ceil(needed / 1_000_000)} MB is needed; ${Math.floor(freeSpace / 1_000_000)} MB is available.`,
    );
  }

  const finalPath = modelLocalPath();
  const partPath = `${finalPath}.part`;
  await RNFS.unlink(partPath).catch(() => {}); // leftover from an earlier interrupted attempt

  // Download to a .part file and only rename into place once the size checks
  // out, so the final path never holds anything but a complete model.
  const { promise } = RNFS.downloadFile({
    fromUrl: MODEL_URL,
    toFile: partPath,
    progress: (res) => {
      if (!onProgress) return;
      const total = res.contentLength > 0 ? res.contentLength : MODEL_BYTES;
      onProgress(Math.min(1, res.bytesWritten / total));
    },
    progressDivider: 1,
  });

  try {
    const result = await promise;
    if (result.statusCode !== 200) {
      throw new Error(`Model download failed: HTTP ${result.statusCode}`);
    }
    const size = await fileSize(partPath);
    if (size !== MODEL_BYTES) {
      throw new Error(`Model download was incomplete (${size} of ${MODEL_BYTES} bytes). Please try again.`);
    }
    await RNFS.moveFile(partPath, finalPath);
  } catch (err) {
    await RNFS.unlink(partPath).catch(() => {});
    throw err;
  }
  return `file://${finalPath}`;
}
