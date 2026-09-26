// Companion to parity.test.ts: checks the two things the extraction results
// depend on -- the herb/acupoint databases themselves, and the pinyin strings
// the fuzzy matcher compares. Expected values come from the Python engine
// (python benchmark/tests/generate_parity_fixtures.py); never edit them by hand.

import { HERB_DATABASE } from '../src/herbDatabase';
import { ACUPOINT_DATABASE } from '../src/acupointDatabase';
import { pinyinStr } from '../src/correctHerbs';
import databases from './fixtures/databases.json';
import pinyinData from './fixtures/pinyin.json';

describe('databases are identical to the Python source', () => {
  // Found by this test's very first design pass: 天冬 carried the pinyin of the
  // different, longer name 天门冬 in BOTH copies.
  it('herbs', () => {
    expect(HERB_DATABASE).toEqual(databases.herbs);
  });
  it('acupoints', () => {
    expect(ACUPOINT_DATABASE).toEqual(databases.acupoints);
  });
});

describe('pinyin used by the matcher', () => {
  const { vocab, windows } = pinyinData as { vocab: Record<string, string>; windows: Record<string, string> };

  it('every vocabulary term reads exactly as it does in the Python engine', () => {
    const wrong = Object.entries(vocab).filter(([term, py]) => pinyinStr(term) !== py);
    expect(wrong.map(([term, py]) => `${term}: python='${py}' ts='${pinyinStr(term)}'`)).toEqual([]);
  });

  it('the canonical readings for terms both libraries get wrong are correct', () => {
    // pinyin-pro alone says a/can/shan; pypinyin alone says huang bai/zhi ke/hang/chui/yu.
    const expected: Record<string, string> = {
      阿胶: 'e jiao', 太子参: 'tai zi shen', 膻中: 'dan zhong', 行间: 'xing jian', 大椎: 'da zhui',
      黄柏: 'huang bo', 枳壳: 'zhi qiao', 肾俞: 'shen shu', 脾俞: 'pi shu', 天冬: 'tian dong',
    };
    for (const [term, py] of Object.entries(expected)) expect(pinyinStr(term)).toBe(py);
  });

  it('transcript windows agree except for a small residue of genuine library disagreement', () => {
    const wrong = Object.entries(windows).filter(([w, py]) => pinyinStr(w) !== py);
    // pypinyin and pinyin-pro have different phrase dictionaries, so a few
    // arbitrary character sequences read differently. Bound it so a real
    // regression (e.g. tones sneaking back in) fails loudly.
    expect(wrong.length / Object.keys(windows).length).toBeLessThan(0.02);
  });
});
