// Best-effort removal of patient identifiers from text that is KEPT on the
// device (the transcript history). It is a port of the pattern-based layer of
// benchmark/deid_layer.py -- NRIC, phone numbers, ages and names that follow
// an introducing phrase. The desktop's name-recognition models are too heavy
// for a phone, so a name said without an introducing phrase can still get
// through: this lowers the risk, it does not remove it. The text shown during
// the live session is never altered (the physician checks it against the
// recording); only what is written to storage goes through here.

const SURNAMES =
  '王李张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈' +
  '曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔' +
  '康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文';

// Same shapes as the desktop layer. JS has no portable look-behind on every
// engine this runs on, so the character before is captured and put back.
const NRIC = /(^|[^A-Za-z0-9])([STFGstfg]\d{6,8}[A-Za-z])(?![A-Za-z0-9])/g;
const PHONE = /(^|\D)((?:\+?65[- ]?)?[689]\d{3}[- ]?\d{4})(?!\d)/g;
const AGE = /(\d{1,3})(?=\s*岁)|(\d{1,3})(?=[\s-]*years?[\s-]*old)/gi;
const ZH_NAME = new RegExp(`(叫|姓名[是为]?|姓|病人|患者)([${SURNAMES}][一-鿿]{1,2})(?=[^一-鿿]|$)`, 'g');

// Words that end a spoken name ("patient is julie low and has a cough").
const NOT_A_NAME = new Set(
  ('a an the here today coming came feeling having has had suffering complaining complains male female ' +
    'elderly young new old is was and who with for from in on at of to he she his her they their this that ' +
    'presenting presents years year aged age').split(' '),
);

// "patient is julie low", "name is Mary Tan", "called John", "Mr Lim", "Madam Tan".
const EN_CUE = /\b(?:patient(?:'s)?(?:\s+name)?\s+(?:is|was)|name\s+is|called|(?:Mr|Mrs|Ms|Miss|Madam|Mdm|Dr)\.?)\s+((?:[A-Za-z][A-Za-z'-]*)(?:\s+[A-Za-z][A-Za-z'-]*){0,2})/gi;

function redactEnglishNames(text: string): string {
  return text.replace(EN_CUE, (whole, nameWords: string) => {
    const words = nameWords.split(/\s+/);
    const kept: string[] = [];
    for (const w of words) {
      if (NOT_A_NAME.has(w.toLowerCase())) break;
      kept.push(w);
    }
    if (kept.length === 0) return whole;
    const cut = whole.indexOf(kept[0], whole.length - nameWords.length);
    return whole.slice(0, cut) + '[NAME]' + whole.slice(cut + kept.join(' ').length);
  });
}

export function redactIdentifiers(text: string): string {
  let out = text;
  out = out.replace(NRIC, (_m, pre: string) => `${pre}[ID]`);
  out = out.replace(PHONE, (_m, pre: string) => `${pre}[PHONE]`);
  out = out.replace(AGE, '[AGE]');
  out = out.replace(ZH_NAME, (_m, cue: string) => `${cue}[姓名]`);
  out = redactEnglishNames(out);
  return out;
}
