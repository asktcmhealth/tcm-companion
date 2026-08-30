// Port of benchmark/correct_herbs.py's fuzzy pinyin-correction engine.
// Faithfully mirrors the Python implementation's algorithm (including the
// hard-won fixes documented there: Hanzi-run window boundaries, reject-not-
// fallback on dosage conflicts is handled in pipeline.ts, no length-based
// threshold penalty) rather than reinventing it, since that Python version
// only reached its current accuracy after many rounds of real-recording
// debugging this session -- silently drifting from it here would silently
// reintroduce bugs already fixed once.

import { pinyin } from 'pinyin-pro';
import { HERB_DATABASE, allHerbNames } from './herbDatabase';
import { ACUPOINT_DATABASE, allAcupointNames } from './acupointDatabase';

// ---------- Pinyin + similarity (difflib.SequenceMatcher.ratio port) ----------

const pinyinCache = new Map<string, string>();

function pinyinStr(text: string): string {
  const cached = pinyinCache.get(text);
  if (cached !== undefined) return cached;
  const syllables = pinyin(text, { toneType: 'num', type: 'array' }) as string[];
  const result = syllables.join(' ');
  pinyinCache.set(text, result);
  return result;
}

function findLongestMatch(
  a: string,
  b: string,
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
): [number, number, number] {
  let bestI = aLo;
  let bestJ = bLo;
  let bestSize = 0;
  let j2len = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) {
    const newJ2len = new Map<number, number>();
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const k = (j2len.get(j - 1) || 0) + 1;
        newJ2len.set(j, k);
        if (k > bestSize) {
          bestI = i - k + 1;
          bestJ = j - k + 1;
          bestSize = k;
        }
      }
    }
    j2len = newJ2len;
  }
  return [bestI, bestJ, bestSize];
}

function similarity(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  const queue: Array<[number, number, number, number]> = [[0, a.length, 0, b.length]];
  let matches = 0;
  while (queue.length) {
    const [aLo, aHi, bLo, bHi] = queue.pop()!;
    const [i, j, k] = findLongestMatch(a, b, aLo, aHi, bLo, bHi);
    if (k) {
      matches += k;
      if (aLo < i && bLo < j) queue.push([aLo, i, bLo, j]);
      if (i + k < aHi && j + k < bHi) queue.push([i + k, aHi, j + k, bHi]);
    }
  }
  return (2 * matches) / total;
}

// ---------- Hanzi-run windowing ----------

function isHanzi(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff;
}

function hanziRuns(text: string): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (isHanzi(text[i])) {
      let j = i;
      while (j < n && isHanzi(text[j])) j++;
      runs.push([i, j]);
      i = j;
    } else {
      i++;
    }
  }
  return runs;
}

function blockedMask(text: string, blockPhrases?: string[]): boolean[] {
  const blocked = new Array(text.length).fill(false);
  for (const phrase of blockPhrases || []) {
    let start = 0;
    for (;;) {
      const idx = text.indexOf(phrase, start);
      if (idx === -1) break;
      for (let i = idx; i < idx + phrase.length; i++) blocked[i] = true;
      start = idx + 1;
    }
  }
  return blocked;
}

// ---------- Core fuzzy matching ----------

export interface Correction {
  start: number;
  end: number;
  term: string;
  score: number;
  // Set when a DIFFERENT vocab term scored within AMBIGUITY_MARGIN of the
  // winner for an overlapping span. Found via two real garbled-audio cases
  // where a wrong-but-plausible herb silently won: 制附子 (high-risk) lost
  // to 知母 (not high-risk) at 75%, and 麻黄 (high-risk) lost to 大黄 (also
  // high-risk, but a different herb) at 86%. Both were genuine near-ties,
  // not threshold bugs -- the fix is to surface the uncertainty for
  // physician review rather than silently picking a winner, mirroring the
  // reject-on-conflict (not fallback-search) rule already applied to
  // dosage-claiming in pipeline.ts.
  ambiguous?: boolean;
  runnerUp?: string;
  runnerUpScore?: number;
}

// If another vocab term scores within this much of the winner WHEN TESTED
// AGAINST THE WINNER'S OWN MATCHED WINDOW, treat the match as too close to
// call automatically. Raised from an initial 0.08 to 0.12 after live
// end-to-end retesting on script 2's real audio: 大黄 won "下黄" at 85.7%,
// with the correct herb 麻黄 scoring 76.2% at that exact same span -- a 9.5
// point gap that 0.08 missed entirely (this is the confirmed-dangerous
// case documented on the Correction.ambiguous field below). 0.12 catches
// it with a small margin of headroom. Still not tuned against a large
// corpus -- watch for over-flagging as more real recordings are tested.
const AMBIGUITY_MARGIN = 0.12;

function findBestMatches(
  transcript: string,
  vocab: string[],
  threshold = 0.75,
  blockPhrases?: string[],
): Array<{ score: number; start: number; end: number; term: string }> {
  const blocked = blockedMask(transcript, blockPhrases);
  const runs = hanziRuns(transcript);
  const matches: Array<{ score: number; start: number; end: number; term: string }> = [];

  for (const term of vocab) {
    const termPy = pinyinStr(term);
    const termLen = term.length;
    let best = { score: 0, start: -1, end: -1 };
    for (const wlen of [termLen - 1, termLen, termLen + 1]) {
      if (wlen <= 0) continue;
      for (const [runStart, runEnd] of runs) {
        if (runEnd - runStart < wlen) continue;
        for (let i = runStart; i <= runEnd - wlen; i++) {
          let anyBlocked = false;
          for (let k = i; k < i + wlen; k++) {
            if (blocked[k]) {
              anyBlocked = true;
              break;
            }
          }
          if (anyBlocked) continue;
          const window = transcript.slice(i, i + wlen);
          const score = similarity(termPy, pinyinStr(window));
          if (score > best.score) best = { score, start: i, end: i + wlen };
        }
      }
    }
    if (best.score >= threshold && best.start !== -1) {
      matches.push({ score: best.score, start: best.start, end: best.end, term });
    }
  }
  return matches;
}

// Tests every OTHER vocab term directly against the exact window text that
// won, rather than comparing to each term's own independently-best window
// elsewhere in the transcript. That distinction matters: in the confirmed
// real case, the correct herb (制附子) never reached the acceptance
// threshold ANYWHERE in the transcript, so it would never appear as an
// accepted "candidate" to compare against -- but tested directly against
// the exact span that 知母 won, it scored 70%, well within margin of 知母's
// 75%. Only testing here (not a wider transcript scan) keeps this cheap:
// vocab-size comparisons per accepted edit.
function flagAmbiguous(segment: string, vocab: string[], edits: Correction[]): Correction[] {
  return edits.map(edit => {
    const windowPy = pinyinStr(segment.slice(edit.start, edit.end));
    let runnerUp: string | undefined;
    let runnerUpScore = -1;
    for (const term of vocab) {
      if (term === edit.term) continue;
      const score = similarity(pinyinStr(term), windowPy);
      if (edit.score - score <= AMBIGUITY_MARGIN && score > runnerUpScore) {
        runnerUp = term;
        runnerUpScore = score;
      }
    }
    return runnerUp ? { ...edit, ambiguous: true, runnerUp, runnerUpScore } : edit;
  });
}

function applyCorrections(
  transcript: string,
  matches: Array<{ score: number; start: number; end: number; term: string }>,
): { corrected: string; edits: Correction[] } {
  const sorted = [...matches].sort((a, b) => b.score - a.score || (b.end - b.start) - (a.end - a.start));
  const used = new Array(transcript.length).fill(false);
  const edits: Correction[] = [];

  for (const { score, start, end, term } of sorted) {
    let anyUsed = false;
    for (let i = start; i < end; i++) {
      if (used[i]) {
        anyUsed = true;
        break;
      }
    }
    if (anyUsed) continue;
    if (transcript.slice(start, end) === term) {
      for (let i = start; i < end; i++) used[i] = true;
      continue;
    }
    edits.push({ start, end, term, score });
    for (let i = start; i < end; i++) used[i] = true;
  }
  edits.sort((a, b) => a.start - b.start);

  const parts: string[] = [];
  let last = 0;
  for (const { start, end, term } of edits) {
    parts.push(transcript.slice(last, start));
    parts.push(term);
    last = end;
  }
  parts.push(transcript.slice(last));
  return { corrected: parts.join(''), edits };
}

// ---------- Span finding (scopes correction to the treatment section only --
// whole-transcript correction against a 100+ term vocab corrupts ordinary
// sentences, confirmed on desktop) ----------

function findFuzzySectionStarts(text: string, trigger: string, threshold = 0.85): number[] {
  const targetPy = pinyinStr(trigger);
  const tlen = trigger.length;
  const exactStarts = new Set<number>();
  {
    let idx = text.indexOf(trigger);
    while (idx !== -1) {
      exactStarts.add(idx);
      idx = text.indexOf(trigger, idx + 1);
    }
  }
  const hits: number[] = [];
  for (let i = 0; i <= text.length - tlen; i++) {
    if (exactStarts.has(i)) continue;
    const window = text.slice(i, i + tlen);
    let hasHanzi = false;
    for (const ch of window) {
      if (isHanzi(ch)) {
        hasHanzi = true;
        break;
      }
    }
    if (!hasHanzi) continue;
    if (similarity(targetPy, pinyinStr(window)) >= threshold) hits.push(i + tlen);
  }
  return hits;
}

const PREP_INSTRUCTIONS = ['先煎', '后下', '包煎', '另煎', '烊化', '冲服', '分钟'];

function findTreatmentSpans(
  text: string,
  trigger: string,
  endRe: RegExp,
  maxSpanLen = 250,
  boundaryRe?: RegExp,
  fuzzyThreshold = 0.85,
): Array<[number, number]> {
  const starts: number[] = [];
  {
    const exact = new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let m: RegExpExecArray | null;
    while ((m = exact.exec(text))) starts.push(m.index + trigger.length);
  }
  starts.push(...findFuzzySectionStarts(text, trigger, fuzzyThreshold));

  const spans: Array<[number, number]> = [];
  for (const start of starts) {
    endRe.lastIndex = 0;
    const endMatch = endRe.exec(text.slice(start));
    const coarseEnd = endMatch
      ? Math.min(start + endMatch.index, start + maxSpanLen)
      : Math.min(text.length, start + maxSpanLen);
    if (coarseEnd <= start) continue;

    let end: number;
    if (boundaryRe) {
      const re = new RegExp(boundaryRe.source, 'g');
      let last: RegExpExecArray | null = null;
      let m: RegExpExecArray | null;
      const segment = text.slice(start, coarseEnd);
      while ((m = re.exec(segment))) last = m;
      end = last ? start + last.index + last[0].length : coarseEnd;
    } else {
      end = coarseEnd;
    }
    if (end > start) spans.push([start, end]);
  }
  return spans;
}

function correctSpansOnly(
  text: string,
  spans: Array<[number, number]>,
  vocab: string[],
  blockPhrases?: string[],
): { corrected: string; edits: Correction[] } {
  if (spans.length === 0) return { corrected: text, edits: [] };

  // Compute each span's correction independently (content doesn't overlap,
  // so order doesn't affect what's found), then assemble left-to-right so
  // absolute offsets never need backward-adjustment bookkeeping.
  const results = spans.map(([start, end]) => {
    const segment = text.slice(start, end);
    const matches = findBestMatches(segment, vocab, 0.75, blockPhrases);
    const { corrected, edits } = applyCorrections(segment, matches);
    return { start, end, corrected, edits: flagAmbiguous(segment, vocab, edits) };
  });
  results.sort((a, b) => a.start - b.start);

  const parts: string[] = [];
  const allEdits: Correction[] = [];
  let last = 0;
  for (const { start, end, corrected, edits } of results) {
    parts.push(text.slice(last, start));
    const newStart = parts.join('').length;
    parts.push(corrected);
    for (const e of edits) {
      allEdits.push({ ...e, start: newStart + e.start, end: newStart + e.end });
    }
    last = end;
  }
  parts.push(text.slice(last));
  allEdits.sort((a, b) => a.start - b.start);
  return { corrected: parts.join(''), edits: allEdits };
}

// ---------- Prescription ----------

const RX_PRESCRIPTION_END = /服[药要]说明|不要说明|方剂基础|方剂|放弃基础|放鸡鸡杵|独活济生汤|复诊/;
// 0.85 was tuned against desktop's faster-whisper (large-v3) error profile,
// where a garbled "处方" trigger typically had one tone wrong (e.g. "除方",
// chu2fang1 vs chu3fang1 = 0.90 similarity). Mobile's whisper.cpp small
// model, tested against BOTH real consultation recordings, consistently
// garbles the trigger with BOTH tones wrong ("厨房"/"廚房", chu2fang2 =
// 0.80) -- a systematic mobile-specific pattern confirmed on two
// independent recordings, not a one-off. 0.80 catches it; verified against
// both real transcripts that this does not introduce any spurious
// additional trigger match elsewhere in either one.
const PRESCRIPTION_START_THRESHOLD = 0.8;
// [gG克]: see the matching comment on DOSAGE_PATTERN in pipeline.ts -- the
// boundary that trims a prescription span to its last dosage number must
// recognize the same unit spellings the extractor does, or a span gets cut
// short (or not found at all) purely because of which unit the model wrote.
const DOSAGE_BOUNDARY_RE = /\d+\s*[gG克]/;

export function findPrescriptionSpans(text: string, maxSpanLen = 250): Array<[number, number]> {
  return findTreatmentSpans(text, '处方', RX_PRESCRIPTION_END, maxSpanLen, DOSAGE_BOUNDARY_RE, PRESCRIPTION_START_THRESHOLD);
}

export function correctPrescriptionOnly(text: string): { corrected: string; edits: Correction[]; spans: Array<[number, number]> } {
  const spans = findPrescriptionSpans(text);
  const { corrected, edits } = correctSpansOnly(text, spans, allHerbNames(), PREP_INSTRUCTIONS);
  return { corrected, edits, spans };
}

// ---------- Acupuncture (UNTESTED against real acupuncture audio, same
// caveat as the Python original -- no acupuncture recording exists yet) ----------

const RX_ACUPUNCTURE_END = /留针|疗程|隔[天日]|服[药要]说明|复诊/;
const ACUPUNCTURE_TRIGGERS = ['取穴', '针灸处方', '选穴'];
const ACUPUNCTURE_START_THRESHOLD = 0.85;

export function findAcupunctureSpans(text: string, maxSpanLen = 150): Array<[number, number]> {
  let spans: Array<[number, number]> = [];
  for (const trigger of ACUPUNCTURE_TRIGGERS) {
    spans = spans.concat(findTreatmentSpans(text, trigger, RX_ACUPUNCTURE_END, maxSpanLen, undefined, ACUPUNCTURE_START_THRESHOLD));
  }
  if (spans.length === 0) return spans;
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [spans[0]];
  for (const [s, e] of spans.slice(1)) {
    const top = merged[merged.length - 1];
    if (s <= top[1]) top[1] = Math.max(top[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function correctAcupunctureOnly(text: string): { corrected: string; edits: Correction[]; spans: Array<[number, number]> } {
  const spans = findAcupunctureSpans(text);
  const { corrected, edits } = correctSpansOnly(text, spans, allAcupointNames());
  return { corrected, edits, spans };
}

export { HERB_DATABASE, ACUPOINT_DATABASE };
