// Behavior of the whole text-processing half of the app, pinned explicitly.
// (parity.test.ts proves the engine matches the Python one; these prove it's
// RIGHT -- so a fixture regenerated from a regressed Python engine can't
// silently bless a regression.)

import * as OpenCC from 'opencc-js';
import { runPipeline } from '../src/runPipeline';
import { findPrescriptionSpans } from '../src/correctHerbs';
import fixtures from './fixtures/parity.json';

const input = (name: string) => (fixtures as Record<string, { input: string }>)[name].input;

const SCRIPT1 = ['柴胡', '白芍', '当归', '白术', '茯苓', '黄芪', '党参', '陈皮', '半夏', '甘草', '薏苡仁', '砂仁', '制附子', '肉桂', '熟地黄', '山茱萸', '杜仲', '牛膝', '独活', '桑寄生', '川芎', '红花', '桃仁', '延胡索', '炙甘草'];
const SCRIPT2 = ['麻黄', '桂枝', '杏仁', '甘草', '苍术', '厚朴', '陈皮', '半夏', '茯苓', '桔梗', '紫苏子', '浙贝母', '瓜蒌'];

// The property the whole project rests on: a herb that is NOT in the ground
// truth must never appear without an ambiguity or dose flag. A missing herb is
// a visible gap; a wrong herb that looks fine is the dangerous failure.
const unflaggedWrong = (out: ReturnType<typeof runPipeline>, truth: string[]) =>
  out.herbs.filter(h => !truth.includes(h.name) && !h.ambiguous && !h.dosageWarning).map(h => h.name);

describe('real transcripts', () => {
  it.each([
    ['script1_faster_whisper', SCRIPT1, 23],
    ['script1_medium_whisper_cpp', SCRIPT1, 21], // ggml-medium on the emulator: writes 克, says 厨房 for 处方
    ['script2_faster_whisper', SCRIPT2, 11],
  ])('%s: recovers most herbs and never lets a wrong herb through unflagged', (name, truth, floor) => {
    const out = runPipeline(input(name));
    expect(out.herbs.filter(h => truth.includes(h.name)).length).toBeGreaterThanOrEqual(floor);
    expect(unflaggedWrong(out, truth)).toEqual([]);
  });

  it('flags the confirmed-dangerous 麻黄 / 大黄 collision instead of trusting it', () => {
    const flagged = Object.fromEntries(
      runPipeline(input('script2_faster_whisper')).herbs.filter(h => h.ambiguous).map(h => [h.name, h.ambiguousWith]),
    );
    expect(flagged['麻黄']).toBe('大黄');
  });

  it('marks high-risk herbs regardless of dose', () => {
    const risky = runPipeline(input('script1_faster_whisper')).herbs.filter(h => h.highRisk).map(h => h.name);
    expect(risky).toEqual(expect.arrayContaining(['半夏', '制附子']));
  });
});

describe('clean text', () => {
  it('extracts every herb with the right dose', () => {
    const out = runPipeline(input('clean_script1'));
    expect(out.herbs.map(h => h.name)).toEqual(SCRIPT1);
    expect(out.herbs.every(h => !h.ambiguous)).toBe(true);
    expect(out.herbs.find(h => h.name === '黄芪')?.dosage).toBe(30);
  });

  it('accepts 克 as well as g (ggml-medium writes the character, large-v3 writes the letter)', () => {
    for (const unit of ['g', '克']) {
      const herbs = runPipeline(`处方如下：麻黄6${unit}桂枝10${unit}杏仁10${unit}方剂基础：三拗汤。`).herbs;
      expect(herbs.map(h => [h.name, h.dosage])).toEqual([['麻黄', 6], ['桂枝', 10], ['杏仁', 10]]);
    }
  });

  it('handles Traditional-Chinese output from the speech model', () => {
    const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
    const traditional = toTraditional(input('clean_script1'));
    expect(traditional).not.toBe(input('clean_script1')); // the conversion really changed it
    expect(runPipeline(traditional).herbs.map(h => h.name)).toEqual(SCRIPT1);
  });
});

describe('section detection', () => {
  it('says so when no prescription section was found (an empty list must not read as "nothing prescribed")', () => {
    const out = runPipeline(input('no_prescription_trigger'));
    expect(out.prescriptionSectionFound).toBe(false);
    expect(out.herbs).toEqual([]);
  });

  it('lists each herb once when the physician says 处方 twice in a row', () => {
    const text = input('double_trigger');
    const out = runPipeline(text);
    expect(out.herbs.map(h => h.name)).toEqual(['柴胡', '白芍', '当归']);
    expect(findPrescriptionSpans(text)).toHaveLength(1);
    expect(out.transcript).toBe(text); // overlapping spans used to be stitched in twice, growing the text
  });

  it('never treats an ordinary phrase that merely sounds like 处方 as the start of one', () => {
    // "情绪方面" scores 0.80 against 处方 -- a permissive threshold admits it as a
    // fuzzy trigger, which used to scope herb-correction over the narrative. The
    // guard (a dosage must follow within 40 chars) rejects it at any threshold.
    // Asserts where the span STARTS, not how many there are: merging alone would
    // absorb a spurious early span into the real one and hide the problem.
    const text = input('script1_faster_whisper');
    const realStart = text.indexOf('处方') + '处方'.length;
    expect(findPrescriptionSpans(text, 250, 0.8)[0][0]).toBe(realStart);
    expect(findPrescriptionSpans(text)[0][0]).toBe(realStart);
  });
});

describe('acupuncture', () => {
  it('extracts points with laterality from clean text', () => {
    const { points } = runPipeline(input('acupuncture_clean'));
    expect(points.map(p => [p.name, p.laterality])).toEqual([['合谷', '双侧'], ['足三里', '左'], ['三阴交', '右'], ['肩髃', null], ['曲池', null]]);
  });

  it('recovers garbled point names', () => {
    expect(runPipeline(input('acupuncture_garbled')).points.map(p => p.name)).toEqual(['合谷', '足三里', '三阴交', '肩髃', '曲池']);
  });
});
