const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' });
export const speechLength = text => Array.from(graphemes.segment(text)).length;
const pairs = { '“': '”', '「': '」', '『': '』', '（': '）', '(': ')' };
const closers = new Set(Object.values(pairs));
export const completeSpeech = text => /[。！？.!?…][”」』）)"\s]*$/u.test(text);

/** Partition original UTF-16 ranges. Soft lengths never cut quotes or a sentence. */
export function sentenceParts(text, { preferredMinChars = 70, preferredMaxChars = 100 } = {}) {
  if (!text || !completeSpeech(text)) throw new Error('batch-length:正文没有完整句末');
  const stack = [], atoms = []; let start = 0, boundary = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '\\') { if (stack.at(-1) === '"') stack.pop(); else stack.push('"'); }
    else if (pairs[c]) stack.push(pairs[c]);
    else if (closers.has(c)) { if (stack.pop() !== c) throw new Error('batch-shape:引号或括号未配对'); }
    if (/[。！？!?…]/u.test(c) || c === '.' && !/\d/u.test(text[i + 1] || '')) boundary = true;
    else if (!closers.has(c) && c !== '"' && !/\s/u.test(c)) boundary = false;
    if (boundary && !stack.length && !/[。！？.!?…”」』）)"\s]/u.test(text[i + 1] || 'x')) {
      atoms.push({ start, end: i + 1 }); start = i + 1; boundary = false;
    }
  }
  if (stack.length) throw new Error('batch-shape:引号或括号未闭合');
  if (start < text.length) atoms.push({ start, end: text.length });
  const parts = []; let group;
  for (const atom of atoms) {
    if (group && speechLength(text.slice(group.start, group.end)) >= preferredMinChars
      && speechLength(text.slice(group.start, atom.end)) > preferredMaxChars) { parts.push(group); group = null; }
    group = { start: group?.start ?? atom.start, end: atom.end };
  }
  if (group) parts.push(group);
  return parts.map(range => ({ ...range, text: text.slice(range.start, range.end) }));
}
