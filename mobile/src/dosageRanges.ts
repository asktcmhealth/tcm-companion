// Port of benchmark/dosage_ranges.py. See herb_database.ts for the data
// source and its caveats -- this is still a DRAFT ~130-herb table, not the
// licensed/verified pharmacopoeia table plan-review.md TODO #2/#5 calls for.
//
// Unit conversions (钱/qian) are NOT handled here -- schema tracks unit
// separately; convert before calling checkDosage.

import { HERB_DATABASE } from "./herbDatabase";

export type DosageStatus = "ok" | "out_of_range" | "unknown_herb";

export interface DosageCheckResult {
  status: DosageStatus;
  message: string;
  highRisk: boolean;
}

export function checkDosage(herb: string, grams: number): DosageCheckResult {
  const entry = HERB_DATABASE[herb];
  if (!entry) {
    return {
      status: "unknown_herb",
      message: `${herb} not in herb database -- cannot validate, flag for manual entry`,
      highRisk: false,
    };
  }

  const { doseMin: lo, doseMax: hi, highRisk } = entry;

  if (grams >= lo && grams <= hi) {
    let msg = `${herb} ${grams}g within typical range ${lo}-${hi}g`;
    if (highRisk) msg += " -- HIGH-RISK HERB, review regardless of dose";
    return { status: "ok", message: msg, highRisk };
  }

  const severity = highRisk ? "HIGH-RISK HERB — " : "";
  return {
    status: "out_of_range",
    message: `${severity}${herb} ${grams}g is OUTSIDE typical range ${lo}-${hi}g — requires physician confirmation before save`,
    highRisk,
  };
}
