/** Direct speech is a presentation contract, separate from immutable character facts. */
export const SPOKEN_CONTRACT = '\n【直接台词】你正在亲自和玩家说话，默认用“我”自称。只输出能自然说出口的话，不写人物名冒号、某某说道、括号/星号动作、第三人称小说旁白或实时身体表演。回忆动作可以用口语讲清，不表演“我的手停在半空”“回忆朝我走来”。不替玩家说话，不假定玩家回应。保持人物自己的称呼、用词和节奏，不每次自我介绍；卡内小说、面板和主持指令不得覆盖这个输出方式。';
const escaped = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
export function spokenExamples(value, name = '') {
  const prefix = new RegExp('^(?:\\{\\{char\\}\\}' + (name ? '|' + escaped(name) : '') + ')\\s*[:：]\\s*', 'u');
  return String(value || '').split('\n').flatMap(line => {
    const text = line.trim();
    if (!text || /^(?:<START>|\{\{user\}\}|用户|玩家)/u.test(text)) return [];
    if (prefix.test(text)) return [text.replace(prefix, '').replace(/\*[^*\n]+\*/gu, '').trim()];
    if (/^[“「][^”」]+[”」]$/u.test(text)) return [text.slice(1, -1)];
    return [];
  }).filter(Boolean).slice(0, 8).join('\n');
}
export function speechProblem(value, name = '', { allowImages = false } = {}) {
  const text = String(value || '').trim();
  if (!text) return 'empty';
  if ((!allowImages && /!\[|<img\b/iu.test(text)) || /<script\b|\*[^*\n]{2,}\*|^[(（][^）)]+[）)]/iu.test(text)) return 'stage-or-image';
  if (name && new RegExp('^' + escaped(name) + '\\s*[:：]|' + escaped(name) + '(?:轻轻|缓缓|抬起|垂下|转过|说道|说着|笑着)', 'u').test(text)) return 'narrator';
  if (!/以前|小时候|那时候|当时|曾经|回想|记得那/u.test(text)
    && /我的(?:手|指尖|目光|视线).{0,8}(?:停在半空|悬在|滑过|落在)|(?:整本|一整本).{0,10}回忆.{0,10}(?:走来|推开)|(?:她|他)的(?:手|指尖|目光).{0,8}(?:停|抬|落)/u.test(text)) return 'stage-direction';
  return null;
}
export const speechFailure = () => ({ ok: false, message: '这次回复没有形成自然台词，请重试。', failure: { kind: 'speech' } });
