// Scores the iOS-simulator end-to-end run (result.json written by
// mobile/src/autoTest.ts) against the known script. Names only + dosages come
// from benchmark/simulation_script.txt. Prints a report; exits 1 if the run
// errored or fewer than MIN_NAMES herbs were found (desktop baseline: 24/25).
const fs = require('fs');

const EXPECTED = [
  ['柴胡', 10], ['白芍', 15], ['当归', 10], ['白术', 15], ['茯苓', 20], ['黄芪', 30],
  ['党参', 15], ['陈皮', 6], ['半夏', 10], ['甘草', 6], ['薏苡仁', 20], ['砂仁', 5],
  ['制附子', 9], ['肉桂', 5], ['熟地黄', 20], ['山茱萸', 12], ['杜仲', 15], ['牛膝', 15],
  ['独活', 10], ['桑寄生', 20], ['川芎', 10], ['红花', 6], ['桃仁', 10], ['延胡索', 12],
  ['炙甘草', 6],
];
const MIN_NAMES = 22;

const file = process.argv[2];
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
if (r.error) {
  console.log('RUN FAILED:', r.error);
  process.exit(1);
}

function score(label, v) {
  const got = new Map();
  for (const h of v.herbs || []) got.set(h.name, (got.get(h.name) || []).concat(h));
  let names = 0, doses = 0;
  const lines = [];
  for (const [name, dose] of EXPECTED) {
    const hits = got.get(name) || [];
    const nameOk = hits.length > 0;
    const doseOk = hits.some(h => h.dosage === dose);
    names += nameOk; doses += doseOk;
    lines.push(`${nameOk ? (doseOk ? 'OK ' : 'DOSE') : 'MISS'}  ${name} expected ${dose}g, got ${hits.map(h => h.dosage + 'g' + (h.ambiguous ? '?' : '')).join(',') || '-'}`);
  }
  const extras = [...got.keys()].filter(n => !EXPECTED.some(e => e[0] === n));
  const dups = [...got.entries()].filter(([, x]) => x.length > 1).map(([k]) => k);
  console.log(`\n===== ${label} ${v.prompt ? '(prompt: ' + v.prompt + ')' : ''} =====`);
  console.log(lines.join('\n'));
  console.log(`Herb names : ${names}/${EXPECTED.length}   (desktop baseline 24/25)`);
  console.log(`Dosages    : ${doses}/${EXPECTED.length}`);
  console.log(`Unexpected herbs: ${extras.join(' ') || 'none'}`);
  console.log(`Duplicated herbs: ${dups.join(' ') || 'none'}`);
  console.log(`Transcript length: ${(v.rawTranscript || '').length} chars; transcribe ${v.transcribeSeconds}s`);
  return { names, doses, len: (v.rawTranscript || '').length };
}

const variants = r.variants || { baseline: r };
const scored = {};
for (const [label, v] of Object.entries(variants)) scored[label] = score(label, v);

// Hallucination guard for any prompted variant: the failure mode seen on
// desktop replaces a stretch of the transcript with invented text, so compare
// length and herb count with the unprompted baseline.
const base = scored.baseline;
if (base) {
  for (const [label, s] of Object.entries(scored)) {
    if (label === 'baseline') continue;
    const drift = Math.abs(s.len - base.len) / base.len;
    const sign = n => (n >= 0 ? '+' : '') + n;
    console.log(`\n${label} vs baseline: names ${sign(s.names - base.names)}, dosages ${sign(s.doses - base.doses)}, transcript length drift ${(drift * 100).toFixed(0)}%${drift > 0.25 || s.names < base.names - 3 ? '  <-- POSSIBLE HALLUCINATION / REGRESSION: read the transcript' : ''}`);
  }
}
console.log(`\nTiming (s) : download ${r.downloadSeconds ?? 'cached'}, load ${r.loadSeconds}, total ${r.totalSeconds}`);
process.exit((base ? base.names : Math.max(...Object.values(scored).map(x => x.names))) >= MIN_NAMES ? 0 : 1);
