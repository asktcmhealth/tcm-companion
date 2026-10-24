// Runs the SAME cases against mobile's review logic and the desktop copy
// (app/src/review.ts), so the two cannot drift apart.
import * as mobile from '../src/review';
import * as desktop from '../../app/src/review';

const herb = (over: Record<string, unknown> = {}) =>
  ({ name: '柴胡', dosage: 10, ambiguous: false, dosageWarning: false, dosage_warning: false, ...over }) as never;
const point = (over: Record<string, unknown> = {}) => ({ name: '合谷', laterality: '双侧', ambiguous: false, ...over }) as never;

describe.each([
  ['mobile', mobile],
  ['desktop', desktop],
])('review logic (%s)', (_name, r) => {
  it('is not ready until every dose is ticked', () => {
    const herbs = [herb(), herb({ name: '当归' })];
    expect(r.reviewStatus(herbs, [], new Set([0]))).toMatchObject({ ready: false, uncheckedDoses: 1, unresolved: 0 });
    expect(r.reviewStatus(herbs, [], new Set([0, 1])).ready).toBe(true);
  });

  it('is not ready while any herb or point is still uncertain, even if every dose is ticked', () => {
    const herbs = [herb({ ambiguous: true })];
    expect(r.reviewStatus(herbs, [], new Set([0]))).toMatchObject({ ready: false, unresolved: 1 });
    expect(r.reviewStatus([herb()], [point({ ambiguous: true })], new Set([0]))).toMatchObject({ ready: false, unresolved: 1 });
  });

  it('an out-of-range dose does not block by itself: its tick is the deliberate confirmation', () => {
    const herbs = [herb({ dosageWarning: true, dosage_warning: true })];
    expect(r.reviewStatus(herbs, [], new Set()).ready).toBe(false);
    expect(r.reviewStatus(herbs, [], new Set([0])).ready).toBe(true);
  });

  it('there is nothing to review when nothing was extracted', () => {
    expect(r.reviewStatus([], [], new Set())).toMatchObject({ ready: false, nothingToReview: true });
  });

  it('a review is withdrawn when anything it covered changes', () => {
    const herbs = [herb()];
    const ticks = new Set([0]);
    const status = r.reviewStatus(herbs, [], ticks);
    const record = { signature: r.reviewSignature(herbs, [], ticks), time: '14:32' };
    expect(r.activeReview(record, status, r.reviewSignature(herbs, [], ticks))).toEqual(record);

    const retyped = [herb({ dosage: 20 })];
    expect(r.activeReview(record, r.reviewStatus(retyped, [], ticks), r.reviewSignature(retyped, [], ticks))).toBeNull();
    const swapped = [herb({ name: '白芍' })];
    expect(r.activeReview(record, r.reviewStatus(swapped, [], ticks), r.reviewSignature(swapped, [], ticks))).toBeNull();
    const unticked = new Set<number>();
    expect(r.activeReview(record, r.reviewStatus(herbs, [], unticked), r.reviewSignature(herbs, [], unticked))).toBeNull();
    const withPoint = [point()];
    expect(r.activeReview(record, r.reviewStatus(herbs, withPoint, ticks), r.reviewSignature(herbs, withPoint, ticks))).toBeNull();
  });

  it('an unsettled entry cancels a review even if the signature somehow matches', () => {
    const herbs = [herb({ ambiguous: true })];
    const ticks = new Set([0]);
    const sig = r.reviewSignature(herbs, [], ticks);
    expect(r.activeReview({ signature: sig, time: '1' }, r.reviewStatus(herbs, [], ticks), sig)).toBeNull();
  });

  it('formats the time as HH:MM', () => {
    expect(r.clockTime(new Date(2026, 9, 25, 9, 5))).toBe('09:05');
    expect(r.clockTime(new Date(2026, 9, 25, 23, 59))).toBe('23:59');
  });
});
