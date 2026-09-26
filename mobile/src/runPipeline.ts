// The whole text-processing half of the app as one pure function, so the UI
// stays thin and the behavior is testable without a device (see
// __tests__/runPipeline.test.ts). Mirrors the desktop sidecar's process():
// herb correction, then acupuncture correction on top of the herb-corrected
// text, then extraction of both with the ambiguity edits carried through.

import { toSimplified } from './textNormalize';
import { correctPrescriptionOnly, correctAcupunctureOnly } from './correctHerbs';
import { extractPrescription, extractAcupuncture, type HerbEntry, type AcupointEntry } from './pipeline';

export interface PipelineOutput {
  // Simplified-normalized transcript (what the correction engine actually saw).
  transcript: string;
  herbs: HerbEntry[];
  points: AcupointEntry[];
  // False means no "处方" trigger was recognized at all -- the herb list is
  // empty because nothing was searched, NOT because the physician prescribed
  // nothing. The UI must say so rather than show a silent blank.
  prescriptionSectionFound: boolean;
}

export function runPipeline(rawTranscript: string): PipelineOutput {
  // Every trigger phrase, herb name, and end-marker in the engine is written
  // in Simplified script; whisper.cpp sometimes emits Traditional.
  const transcript = toSimplified(rawTranscript);

  const rx = correctPrescriptionOnly(transcript);
  const herbs = extractPrescription(rx.corrected, rx.edits);

  const acu = correctAcupunctureOnly(rx.corrected);
  const points = extractAcupuncture(acu.corrected, acu.edits);

  return { transcript, herbs, points, prescriptionSectionFound: rx.spans.length > 0 };
}
