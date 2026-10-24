// The desktop app (app/src/edits.ts) carries its own copy of the physician-
// correction logic because it has no herb database in the UI -- the sidecar
// supplies each herb's dose range and ready-to-swap alternative. This runs the
// desktop copy through the same cases as mobile's, so the two cannot drift.
import { applyHerbEdit, applyPointEdit, parseDose, type HerbEntry } from '../../app/src/edits';

const herb = (over: Partial<HerbEntry> = {}): HerbEntry => ({
  name: '白芍', dosage: 15, unit: 'g', db_confirmed: true, dosage_warning: false,
  dosage_check_message: '', high_risk: false, ambiguous: true, ambiguous_with: '甘草',
  dose_range: [6, 15],
  alternative: { name: '甘草', dosage_warning: true, dosage_check_message: '甘草 15g is OUTSIDE typical range 2-10g', high_risk: false, dose_range: [2, 10] },
  ...over,
});

describe('parseDose (desktop)', () => {
  it.each([['10', 10], [' 12 ', 12], ['4.5', 4.5], ['9g', 9], ['9克', 9]])('accepts %j', (text, grams) => {
    expect(parseDose(text)).toBe(grams);
  });
  it.each(['', 'abc', '-5', '0', '1e3', '12.', '.5', '1001', '10 20'])('rejects %j', text => {
    expect(parseDose(text)).toBeNull();
  });
});

describe('applyHerbEdit (desktop)', () => {
  it('leaves an untouched entry as the engine produced it', () => {
    expect(applyHerbEdit(herb(), undefined)).toMatchObject({ name: '白芍', dosage: 15, ambiguous: true, edited: false, confirmed: false });
  });

  it('keep settles the flag only', () => {
    expect(applyHerbEdit(herb(), { resolved: true })).toMatchObject({ name: '白芍', ambiguous: false, confirmed: true, edited: false });
  });

  it('swap uses the supplied alternative with its own warning, risk and range', () => {
    const out = applyHerbEdit(herb(), { swap: true });
    expect(out).toMatchObject({ name: '甘草', originalName: '白芍', ambiguous: false, confirmed: true, edited: true, dosage_warning: true });
    expect(out.dose_range).toEqual([2, 10]);
  });

  it('retyping re-checks against the active range, including after a swap', () => {
    const inRange = applyHerbEdit(herb({ ambiguous: false }), { dosage: 10 });
    expect(inRange).toMatchObject({ dosage: 10, dosage_warning: false, edited: true, originalDosage: 15 });
    const tooBig = applyHerbEdit(herb({ ambiguous: false }), { dosage: 200 });
    expect(tooBig.dosage_warning).toBe(true);
    expect(tooBig.dosage_check_message).toMatch(/OUTSIDE typical range 6-15g/);
    const swappedThenTyped = applyHerbEdit(herb(), { swap: true, dosage: 6 });
    expect(swappedThenTyped).toMatchObject({ name: '甘草', dosage: 6, dosage_warning: false });
  });

  it('a high-risk herb stays flagged in the message even at a normal dose', () => {
    const out = applyHerbEdit(herb({ ambiguous: false, high_risk: true }), { dosage: 10 });
    expect(out.dosage_check_message).toMatch(/HIGH-RISK HERB/);
    expect(out.high_risk).toBe(true);
  });

  it('retyping alone leaves an uncertain flag unresolved', () => {
    expect(applyHerbEdit(herb(), { dosage: 12 }).ambiguous).toBe(true);
  });

  it('ignores a swap without an alternative, and cannot edit a dose without a range', () => {
    const noAlt = applyHerbEdit(herb({ alternative: undefined }), { swap: true });
    expect(noAlt).toMatchObject({ name: '白芍', edited: false });
    expect(applyHerbEdit(herb({ dose_range: undefined }), undefined).canEditDose).toBe(false);
    expect(applyHerbEdit(herb(), undefined).canEditDose).toBe(true);
  });

  it('typing the original dose back is not an edit', () => {
    expect(applyHerbEdit(herb({ ambiguous: false }), { dosage: 15 }).edited).toBe(false);
  });
});

describe('applyPointEdit (desktop)', () => {
  const pt = {
    name: '内关', code: 'PC6', meridian: '心包经', laterality: '双侧' as string | null, db_confirmed: true,
    ambiguous: true, ambiguous_with: '外关', alternative: { name: '外关', code: 'TE5', meridian: '三焦经' },
  };
  it('swap takes the alternative with its code and meridian', () => {
    expect(applyPointEdit(pt, { swap: true })).toMatchObject({ name: '外关', code: 'TE5', meridian: '三焦经', ambiguous: false, edited: true, confirmed: true });
  });
  it('keep settles the flag only; untouched stays flagged', () => {
    expect(applyPointEdit(pt, { resolved: true })).toMatchObject({ name: '内关', ambiguous: false, edited: false, confirmed: true });
    expect(applyPointEdit(pt, undefined)).toMatchObject({ ambiguous: true, edited: false });
  });
});
