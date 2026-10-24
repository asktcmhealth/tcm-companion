import { buildDraftText } from '../src/exportDraft';
import { translate } from '../src/i18n';
import type { EffectiveHerb, EffectivePoint } from '../src/herbEdits';

const herb = (over: Partial<EffectiveHerb>): EffectiveHerb => ({
  name: '柴胡', dosage: 10, unit: 'g', dbConfirmed: true, dosageWarning: false,
  dosageCheckMessage: '', highRisk: false, ambiguous: false,
  edited: false, confirmed: false, originalName: '柴胡', originalDosage: 10, ...over,
});
const t = (k: string, v?: Record<string, string | number>) => translate('en', k, v);

describe('buildDraftText', () => {
  it('starts with the not-signed-off warning', () => {
    expect(buildDraftText([herb({})], [], new Set(), t).split('\n')[0]).toMatch(/not signed off/);
  });

  it('marks unchecked, uncertain, out-of-range and high-risk entries inline', () => {
    const text = buildDraftText(
      [
        herb({}),
        herb({ name: '白芍', dosage: 15, ambiguous: true, ambiguousWith: '甘草' }),
        herb({ name: '半夏', highRisk: true, dosageWarning: true, dosageCheckMessage: '半夏 40g above range' }),
      ],
      [],
      new Set([0]),
      t,
    );
    const lines = text.split('\n');
    expect(lines.find(l => l.includes('柴胡'))).toBe('- 柴胡 10g');
    expect(lines.find(l => l.includes('白芍'))).toMatch(/verify - could also be 甘草.*dose not yet checked/);
    expect(lines.find(l => l.includes('半夏'))).toMatch(/above range.*High-risk/);
  });

  it('includes acupoints and never anything beyond herbs and points', () => {
    const pt: EffectivePoint = { name: '合谷', code: 'LI4', meridian: 'LI', laterality: '双侧', dbConfirmed: true, ambiguous: true, ambiguousWith: '合古', edited: false, confirmed: false, originalName: '合谷' };
    const text = buildDraftText([], [pt], new Set(), t);
    expect(text).toContain('- 合谷 (双侧) LI4  [verify - could also be 合古]');
    expect(text).not.toMatch(/transcript/i);
  });

  it('says when the physician changed an entry', () => {
    const text = buildDraftText([herb({ name: '甘草', edited: true, originalName: '白芍' })], [], new Set([0]), t);
    expect(text).toContain('- 甘草 10g  [edited by physician]');
  });

  it('uses the reviewed header, with the time, once the physician has reviewed', () => {
    const text = buildDraftText([herb({})], [], new Set([0]), t, '14:32');
    const first = text.split('\n')[0];
    expect(first).toMatch(/reviewed by physician at 14:32/);
    expect(first).not.toMatch(/not signed off/);
    expect(buildDraftText([herb({})], [], new Set([0]), t).split('\n')[0]).toMatch(/not signed off/);
  });

  it('works in Chinese', () => {
    expect(buildDraftText([herb({})], [], new Set(), (k, v) => translate('zh', k, v))).toContain('剂量尚未核对');
  });
});
