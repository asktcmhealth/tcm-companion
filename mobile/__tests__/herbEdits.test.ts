import { applyHerbEdit, applyPointEdit, parseDose } from '../src/herbEdits';
import type { AcupointEntry, HerbEntry } from '../src/pipeline';

const herb = (over: Partial<HerbEntry> = {}): HerbEntry => ({
  name: '白芍', dosage: 15, unit: 'g', dbConfirmed: true, dosageWarning: false,
  dosageCheckMessage: '', highRisk: false, ambiguous: true, ambiguousWith: '甘草', ...over,
});

describe('parseDose', () => {
  it.each([['10', 10], [' 12 ', 12], ['4.5', 4.5], ['9g', 9], ['9克', 9]])('accepts %j', (text, grams) => {
    expect(parseDose(text)).toBe(grams);
  });
  it.each(['', 'abc', '-5', '0', '1e3', '12.', '.5', '1001', '10 20'])('rejects %j', text => {
    expect(parseDose(text)).toBeNull();
  });
});

describe('applyHerbEdit', () => {
  it('leaves an untouched entry exactly as the engine produced it', () => {
    const out = applyHerbEdit(herb(), undefined);
    expect(out).toMatchObject({ name: '白芍', dosage: 15, ambiguous: true, edited: false, confirmed: false });
  });

  it('keeping the heard herb settles the flag without changing anything else', () => {
    const out = applyHerbEdit(herb(), { resolved: true });
    expect(out).toMatchObject({ name: '白芍', dosage: 15, ambiguous: false, confirmed: true, edited: false });
  });

  it('swapping uses the alternative and re-checks the SAME dose against its range and risk', () => {
    const out = applyHerbEdit(herb({ name: '半夏', dosage: 10, ambiguousWith: '麻黄', highRisk: true }), { swap: true });
    expect(out.name).toBe('麻黄');
    expect(out.originalName).toBe('半夏');
    expect(out.highRisk).toBe(true); // 麻黄 is high-risk
    expect(out.ambiguous).toBe(false);
    expect(out.confirmed).toBe(true);
    expect(out.edited).toBe(true);
  });

  it('a swap to an herb with a narrower range raises the dose warning', () => {
    const out = applyHerbEdit(herb({ name: '甘草', dosage: 30, ambiguousWith: '细辛' }), { swap: true });
    expect(out.name).toBe('细辛');
    expect(out.dosageWarning).toBe(true);
    expect(out.dosageCheckMessage).toMatch(/OUTSIDE typical range/);
  });

  it('retyping a dose re-checks it and marks the entry edited, keeping the uncertain flag', () => {
    const out = applyHerbEdit(herb({ name: '熟地黄', dosage: 10, ambiguous: false, ambiguousWith: undefined }), { dosage: 20 });
    expect(out.dosage).toBe(20);
    expect(out.originalDosage).toBe(10);
    expect(out.edited).toBe(true);
    const flagged = applyHerbEdit(herb(), { dosage: 200 });
    expect(flagged.dosageWarning).toBe(true);
    expect(flagged.ambiguous).toBe(true); // still unresolved: only a keep/swap settles it
  });

  it('ignores a swap when there is no usable alternative', () => {
    const out = applyHerbEdit(herb({ ambiguous: false, ambiguousWith: undefined }), { swap: true });
    expect(out).toMatchObject({ name: '白芍', edited: false });
    const unknown = applyHerbEdit(herb({ ambiguousWith: '不存在' }), { swap: true });
    expect(unknown.name).toBe('白芍');
  });

  it('typing the original dose back is not an edit', () => {
    expect(applyHerbEdit(herb({ ambiguous: false }), { dosage: 15 }).edited).toBe(false);
  });
});

describe('applyPointEdit', () => {
  const pt = (over: Partial<AcupointEntry> = {}): AcupointEntry => ({
    name: '内关', code: 'PC6', meridian: '心包经', laterality: '双侧', dbConfirmed: true,
    ambiguous: true, ambiguousWith: '外关', ...over,
  });
  it('swap takes the alternative point with its own code and meridian', () => {
    const out = applyPointEdit(pt(), { swap: true });
    expect(out).toMatchObject({ name: '外关', code: 'TE5', ambiguous: false, edited: true, confirmed: true });
  });
  it('keep settles the flag only', () => {
    expect(applyPointEdit(pt(), { resolved: true })).toMatchObject({ name: '内关', ambiguous: false, edited: false, confirmed: true });
  });
  it('untouched stays flagged', () => {
    expect(applyPointEdit(pt(), undefined)).toMatchObject({ ambiguous: true, edited: false });
  });
});
