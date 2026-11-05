export const DEFAULT_CHAT_OPTIONS = Object.freeze({ mode: 'daily', maxChars: 60 });
export const UNLIMITED_CHAT_OPTIONS = Object.freeze({ mode: 'unlimited', maxChars: 60 });
const segments = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export function chatOptionsPrompt(options = DEFAULT_CHAT_OPTIONS) {
  return options.mode === 'unlimited' ? ''
    : `\n【日常模式】本次回复最多 ${options.maxChars} 个显示字符，包含标点和空白。用简短完整的话直接回答，角色卡中的长篇要求让位于此上限。不配图，不写图片标记、Markdown 图片或 HTML 图片。`;
}

export function replyText(text, options = DEFAULT_CHAT_OPTIONS) {
  if (options.mode === 'unlimited') return text;
  const plain = String(text).replace(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>|\[图[:：][^\]]*\]/giu, '').trim();
  return Array.from(segments.segment(plain), item => item.segment).slice(0, options.maxChars).join('').trimEnd();
}

export function replyResult(result, options = DEFAULT_CHAT_OPTIONS) {
  if (!result.ok || options.mode === 'unlimited') return result;
  const out = { ...result, text: replyText(result.text, options) };
  if (!out.text && (result.image || result.text)) out.text = replyText('日常模式不配图。', options);
  delete out.image;
  return out;
}
