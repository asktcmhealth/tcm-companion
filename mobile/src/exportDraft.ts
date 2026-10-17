import type { EffectiveHerb, EffectivePoint } from './herbEdits';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// Plain-text copy of the draft for sharing (message, notes, an EMR field).
// It carries the same cautions the screen shows, in the text itself, because
// once it leaves the app nothing else will remind the reader that it is an
// unsigned speech-recognition draft: every uncertain or unchecked entry is
// marked inline. It never includes the transcript or anything about the
// patient -- only the extracted herbs/doses and acupoints.
export function buildDraftText(
  herbs: EffectiveHerb[],
  points: EffectivePoint[],
  confirmedDoses: ReadonlySet<number>,
  t: TFn,
): string {
  const lines: string[] = [t('export_header'), ''];

  if (herbs.length > 0) {
    lines.push(t('result_prescription'));
    herbs.forEach((h, i) => {
      const marks: string[] = [];
      if (h.ambiguous) marks.push(t('export_verify', { alt: h.ambiguousWith ?? '?' }));
      if (h.dosageWarning) marks.push(h.dosageCheckMessage);
      if (h.highRisk) marks.push(t('badge_high_risk'));
      if (h.edited) marks.push(t('export_edited'));
      if (!confirmedDoses.has(i)) marks.push(t('export_unchecked'));
      lines.push(`- ${h.name} ${h.dosage}${h.unit}${marks.length ? `  [${marks.join('; ')}]` : ''}`);
    });
    lines.push('');
  }

  if (points.length > 0) {
    lines.push(t('result_acupuncture'));
    for (const p of points) {
      const lat = p.laterality ? ` (${p.laterality})` : '';
      const notes: string[] = [];
      if (p.ambiguous) notes.push(t('export_verify', { alt: p.ambiguousWith ?? '?' }));
      if (p.edited) notes.push(t('export_edited'));
      const mark = notes.length ? `  [${notes.join('; ')}]` : '';
      lines.push(`- ${p.name}${lat} ${p.code}${mark}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
