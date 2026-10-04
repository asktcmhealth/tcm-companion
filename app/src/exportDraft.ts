// Plain-text copy of the draft (mirrors mobile/src/exportDraft.ts). It carries
// the same cautions the screen shows, inline, because once pasted elsewhere
// nothing else tells the reader this is an unsigned speech-recognition draft.
// Never includes the transcript or anything about the patient.

interface Herb {
  name: string;
  dosage: number;
  unit: string;
  dosage_warning: boolean;
  dosage_check_message: string;
  high_risk: boolean;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
}

interface Point {
  name: string;
  code: string;
  laterality: string | null;
  ambiguous?: boolean;
  ambiguous_with?: string | null;
}

type T = (key: string) => string;

export function buildDraftText(herbs: Herb[], points: Point[], confirmed: ReadonlySet<number>, t: T): string {
  const verify = (alt?: string | null) => t("export_verify").replace("{alt}", alt ?? "?");
  const lines: string[] = [t("export_header"), ""];

  if (herbs.length > 0) {
    lines.push(t("results_prescription_title"));
    herbs.forEach((h, i) => {
      const marks: string[] = [];
      if (h.ambiguous) marks.push(verify(h.ambiguous_with));
      if (h.dosage_warning) marks.push(h.dosage_check_message);
      if (h.high_risk) marks.push(t("badge_high_risk"));
      if (!confirmed.has(i)) marks.push(t("export_unchecked"));
      lines.push(`- ${h.name} ${h.dosage}${h.unit}${marks.length ? `  [${marks.join("; ")}]` : ""}`);
    });
    lines.push("");
  }

  if (points.length > 0) {
    lines.push(t("results_acupuncture_title"));
    for (const p of points) {
      const lat = p.laterality ? ` (${p.laterality})` : "";
      lines.push(`- ${p.name}${lat} ${p.code}${p.ambiguous ? `  [${verify(p.ambiguous_with)}]` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
