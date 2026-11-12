const plain = t => String(t || '').normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '');
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const common = new Set(['我们','你们','自己','今天','现在','时候','这样','那样','觉得','喜欢','可以','还有','一点','一个','这个','那个','真的','已经','怎么','什么','然后','所以','因为','不过','其实','后来']);
export function expressionWords(text, anchors = []) {
  return [...new Set([...segmenter.segment(String(text))].filter(s => s.isWordLike).map(s => s.segment)
    .filter(w => [...w].length >= 2 && !common.has(w) && !anchors.includes(w)))];
}
export function expressionCost(text, recent, anchors = []) {
  const words = expressionWords(text, anchors), window = recent.slice(-8);
  return words.reduce((sum, word) => sum + Math.max(0, window.filter(r => (r.text || r).includes(word)).length - 1), 0);
}
export function expressionProblem(text, recent, { topic, anchors = [] } = {}) {
  const rows = recent.slice(-8).filter(r => !topic || r.topic !== topic), normalized = plain(text);
  if (rows.some(r => plain(r.text || r) === normalized)) return 'exact';
  // A repeated opening is rejected only after two uses; names and continuing stories are exempt.
  for (const length of [10, 9, 8]) {
    const prefix = [...normalized].slice(0, length).join('');
    if ([...prefix].length >= 8 && !anchors.some(a => prefix.includes(a))
      && rows.filter(r => plain(r.text || r).startsWith(prefix)).length >= 2) return 'opening';
  }
  return null;
}
export function expressionGuidance(recent, anchors = []) {
  const words = new Set(recent.slice(-8).flatMap(r => expressionWords(r.text || r, anchors)));
  const crowded = [...words].filter(w => recent.slice(-8).filter(r => (r.text || r).includes(w)).length >= 3).length;
  return crowded ? '【表达提醒】近期话题比较集中，本次直接进入新细节，换一种自然开头；保留必要人名和事件名，不靠固定口头禅衔接。' : '';
}
