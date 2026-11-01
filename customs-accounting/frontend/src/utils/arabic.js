// Arabic shaping for PDF generation.
// jsPDF 4.x applies bidi reordering itself but does not join Arabic letters,
// so we replace each letter with its contextual presentation form (logical
// order) and let jsPDF handle the visual ordering.
// Implemented in-house to avoid a GPL dependency.

// [isolated, final, initial, medial] presentation forms (U+FE80..U+FEFC)
const FORMS = {
  'ء': ['\uFE80'],
  'آ': ['\uFE81', '\uFE82'],
  'أ': ['\uFE83', '\uFE84'],
  'ؤ': ['\uFE85', '\uFE86'],
  'إ': ['\uFE87', '\uFE88'],
  'ئ': ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'],
  'ا': ['\uFE8D', '\uFE8E'],
  'ب': ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'],
  'ة': ['\uFE93', '\uFE94'],
  'ت': ['\uFE95', '\uFE96', '\uFE97', '\uFE98'],
  'ث': ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'],
  'ج': ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'],
  'ح': ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'],
  'خ': ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'],
  'د': ['\uFEA9', '\uFEAA'],
  'ذ': ['\uFEAB', '\uFEAC'],
  'ر': ['\uFEAD', '\uFEAE'],
  'ز': ['\uFEAF', '\uFEB0'],
  'س': ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'],
  'ش': ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'],
  'ص': ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'],
  'ض': ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'],
  'ط': ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'],
  'ظ': ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'],
  'ع': ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'],
  'غ': ['\uFECD', '\uFECE', '\uFECF', '\uFED0'],
  'ف': ['\uFED1', '\uFED2', '\uFED3', '\uFED4'],
  'ق': ['\uFED5', '\uFED6', '\uFED7', '\uFED8'],
  'ك': ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'],
  'ل': ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'],
  'م': ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'],
  'ن': ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'],
  'ه': ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'],
  'و': ['\uFEED', '\uFEEE'],
  'ى': ['\uFEEF', '\uFEF0'],
  'ي': ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'],
};

const LAM_ALEF = {
  'آ': ['\uFEF5', '\uFEF6'],
  'أ': ['\uFEF7', '\uFEF8'],
  'إ': ['\uFEF9', '\uFEFA'],
  'ا': ['\uFEFB', '\uFEFC'],
};

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

const isArabic = (ch) => ARABIC_RANGE.test(ch);
const joinsForward = (ch) => Boolean(FORMS[ch] && FORMS[ch][2]);

function nextLetter(chars, i) {
  for (let j = i + 1; j < chars.length; j++) {
    if (DIACRITICS.test(chars[j])) continue;
    return { ch: chars[j], index: j };
  }
  return { ch: '', index: -1 };
}

function prevLetter(chars, i) {
  for (let j = i - 1; j >= 0; j--) {
    if (DIACRITICS.test(chars[j])) continue;
    return { ch: chars[j], index: j };
  }
  return { ch: '', index: -1 };
}

/** Replace Arabic letters with their contextual presentation forms (logical order). */
export function shapeArabic(text) {
  if (!text) return '';
  const chars = Array.from(String(text));
  const out = [];
  let skipUntil = -1;

  for (let i = 0; i < chars.length; i++) {
    if (i <= skipUntil) continue;
    const ch = chars[i];

    if (DIACRITICS.test(ch)) {
      if (out.length) out[out.length - 1] += ch;
      else out.push(ch);
      continue;
    }

    if (!isArabic(ch)) {
      out.push(ch);
      continue;
    }

    const prev = prevLetter(chars, i).ch;
    const next = nextLetter(chars, i);
    const prevJoins = prev ? joinsForward(prev) : false;

    // lam + alef ligature
    if (ch === 'ل' && LAM_ALEF[next.ch]) {
      out.push(LAM_ALEF[next.ch][prevJoins ? 1 : 0]);
      skipUntil = next.index;
      continue;
    }

    const forms = FORMS[ch];
    if (!forms) {
      out.push(ch);
      continue;
    }

    const nextJoins = Boolean(next.ch) && isArabic(next.ch) && forms.length > 1;
    const dual = Boolean(forms[2]);

    let form;
    if (prevJoins && nextJoins && dual) form = forms[3];
    else if (prevJoins) form = forms[1];
    else if (nextJoins && dual) form = forms[2];
    else form = forms[0];

    out.push(form);
  }

  return out.join('');
}

export default shapeArabic;
