export const DEFAULT_CHAT_OPTIONS = Object.freeze({ mode: 'daily', maxChars: 60, effort: 'low', proactive: true, idleSeconds: 30, bubbleSeconds: 20 });
export const UNLIMITED_CHAT_OPTIONS = Object.freeze({ mode: 'unlimited', maxChars: 60 });
const segments = new Intl.Segmenter('zh', { granularity: 'grapheme' });

export function chatProfile(question = '', options = DEFAULT_CHAT_OPTIONS) {
  const shortIdentity = question.length < 40 && /你(?:现在)?是谁|你叫什么|人设是什么|名字是什么/u.test(question)
    && !/详细|分析|背景|为什么|联网/u.test(question);
  const complex = !shortIdentity && /解释|介绍|讲(?:一下|讲)|分析|为什么|为何|原因|规则|怎么玩|是什么|怎么(?:玩|搭配|选择)|复盘|总结|攻略|搜|查(?:一下|一查|找|资料)|最新|联网|explain|why|search|review|strategy/iu.test(question);
  const effort = ['low', 'medium', 'high'].includes(options.effort) ? options.effort : DEFAULT_CHAT_OPTIONS.effort;
  const budgets = { low: [2048, 4096], medium: [8192, 16384], high: [16384, 32768] };
  const [shortTokens, longTokens] = budgets[effort];
  // Fast effort is a latency target, never a reason to turn a slow provider into an early error.
  return { complex, effort, timeoutMs: complex ? 180000 : 120000, extendedTimeoutMs: 180000,
    maxTokens: complex ? longTokens : shortTokens,
    options: options.mode === 'daily' && complex ? { ...options, maxChars: Math.max(300, options.maxChars) } : options };
}

export function chatOptionsPrompt(options = DEFAULT_CHAT_OPTIONS) {
  return options.mode === 'unlimited' ? ''
    : `\n【日常模式】本次回复最多 ${options.maxChars} 个显示字符，包含标点和空白。尽量在 ${Math.max(1, Math.floor(options.maxChars * .7))} 字内用完整句回答，留出收尾余量，不要到上限仍在半句话中。角色卡中的长篇要求让位于此上限。不配图，不写图片标记、Markdown 图片或 HTML 图片。`;
}

export function replyText(text, options = DEFAULT_CHAT_OPTIONS) {
  if (options.mode === 'unlimited') return text;
  const plain = String(text).replace(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>|\[图[:：][^\]]*\]/giu, '').trim();
  const graphemes = Array.from(segments.segment(plain), item => item.segment);
  if (graphemes.length <= options.maxChars) return plain;
  const prefix = graphemes.slice(0, options.maxChars).join('');
  const complete = [...prefix.matchAll(/[。！？.!?](?:[”’」』）)])?/gu)].at(-1);
  return complete ? prefix.slice(0, complete.index + complete[0].length).trimEnd() : '';
}

export function replyResult(result, options = DEFAULT_CHAT_OPTIONS) {
  if (!result.ok || options.mode === 'unlimited') return result;
  const out = { ...result, text: replyText(result.text, options) };
  if (!out.text && result.text && !/^\s*(?:!\[|<img|\[图[:：])/iu.test(result.text)) {
    return { ok: false, message: '回复没有在字数上限内形成完整句子，请重试或增加字数。', failure: { kind: 'incomplete' } };
  }
  if (!out.text && (result.image || result.text)) out.text = replyText('日常模式不配图。', options);
  delete out.image;
  return out;
}
