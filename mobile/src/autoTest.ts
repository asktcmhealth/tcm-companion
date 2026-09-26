// Automated end-to-end test hook, used by CI (codemagic.yaml: ios-simulator-e2e).
//
// If -- and only if -- a plan file exists inside the app's OWN private
// Documents directory, the app skips the normal setup screen, runs the whole
// real pipeline on the audio file the plan names (download model -> load ->
// transcribe -> correct/extract), and writes what happened to result.json and
// progress.log beside it, so a CI script can read the outcome and screenshot
// the finished screen.
//
// Why this is safe to ship in the production bundle: the app sandbox is
// writable only by the app itself and by the developer tooling that installs
// it (simctl in CI); nothing in the app ever creates the plan file, and a
// physician's device has no way to. Without the file this module does nothing.

import RNFS from 'react-native-fs';

const dir = () => `${RNFS.DocumentDirectoryPath}/autotest`;

export interface AutoTestPlan {
  audioPath: string;
}

export async function readAutoTestPlan(): Promise<AutoTestPlan | null> {
  try {
    const planPath = `${dir()}/plan.json`;
    if (!(await RNFS.exists(planPath))) return null;
    const plan = JSON.parse(await RNFS.readFile(planPath, 'utf8'));
    if (typeof plan?.audio !== 'string' || plan.audio.includes('/')) return null;
    return { audioPath: `${dir()}/${plan.audio}` };
  } catch {
    return null;
  }
}

/** Appends a timestamped line to progress.log so CI can show live progress. */
export async function logAutoTest(startedAt: number, message: string): Promise<void> {
  try {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1).padStart(7);
    await RNFS.appendFile(`${dir()}/progress.log`, `${seconds}s  ${message}\n`, 'utf8');
  } catch {
    // Logging must never break the run it is describing.
  }
}

export async function writeAutoTestResult(result: Record<string, unknown>): Promise<void> {
  await RNFS.writeFile(`${dir()}/result.json`, JSON.stringify(result, null, 1), 'utf8');
}
