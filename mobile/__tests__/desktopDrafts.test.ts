// Desktop draft storage (app/src/drafts.ts), tested here because the desktop
// UI package has no test runner of its own.
import { parseDrafts, serializeDrafts, type DraftJob } from '../../app/src/drafts';

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const day = 24 * 60 * 60 * 1000;
const iso = (ageDays: number) => new Date(NOW - ageDays * day).toISOString();

const job = (over: Partial<DraftJob> = {}): DraftJob => ({
  id: 'job-1',
  label: 'Patient 1 · 2:15 PM',
  createdAt: iso(1),
  herbs: [{ name: '柴胡', dosage: 10, unit: 'g', db_confirmed: true, dosage_warning: false, dosage_check_message: '', high_risk: false }],
  points: [],
  prescriptionSectionFound: true,
  confirmed: [0],
  herbEdits: { 0: { dosage: 12 } },
  pointEdits: {},
  review: { signature: 's', time: '14:32' },
  ...over,
});

describe('desktop drafts', () => {
  it('round-trips finished patients', () => {
    const jobs = [job(), job({ id: 'job-2', label: 'Patient 2 · 3:00 PM' })];
    expect(parseDrafts(serializeDrafts(jobs), 30, NOW)).toEqual(jobs);
  });

  it('stores only the named draft fields -- never transcript, note, de-id report or paths', () => {
    const risky = {
      ...job(),
      transcript: '今天来的病人叫张三 NRIC S1234567D',
      consultation_note: '张三 说胸口痛',
      deid_report: [{ type: 'NRIC', text: 'S1234567D' }],
      correction_edits: [{ original: '张三', corrected: '张三' }],
      audioPath: 'C:/Users/julie/AppData/Local/Temp/tcm_recording_123.webm',
    } as unknown as DraftJob;
    const raw = serializeDrafts([risky]);
    expect(Object.keys(JSON.parse(raw).jobs[0]).sort()).toEqual(
      ['confirmed', 'createdAt', 'herbEdits', 'herbs', 'id', 'label', 'pointEdits', 'points', 'prescriptionSectionFound', 'review'],
    );
    for (const secret of ['S1234567D', '张三', 'tcm_recording', 'NRIC']) expect(raw).not.toContain(secret);
  });

  it('drops drafts older than the retention window, per patient', () => {
    const raw = serializeDrafts([job({ id: 'old', createdAt: iso(40) }), job({ id: 'new', createdAt: iso(5) })]);
    expect(parseDrafts(raw, 30, NOW).map((j) => j.id)).toEqual(['new']);
    expect(parseDrafts(raw, 90, NOW).map((j) => j.id)).toEqual(['old', 'new']);
  });

  it('returns nothing for missing, corrupt or unknown-version storage, and skips malformed entries', () => {
    expect(parseDrafts(null, 30, NOW)).toEqual([]);
    expect(parseDrafts('not json', 30, NOW)).toEqual([]);
    expect(parseDrafts(JSON.stringify({ version: 2, jobs: [job()] }), 30, NOW)).toEqual([]);
    const mixed = JSON.stringify({ version: 1, jobs: [{ id: 5 }, null, { ...job(), createdAt: 'yesterday' }, job()] });
    expect(parseDrafts(mixed, 30, NOW)).toHaveLength(1);
  });
});
