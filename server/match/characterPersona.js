const FIELDS = ['description', 'personality', 'scenario', 'system_prompt', 'mes_example',
  'first_mes', 'depth_prompt', 'post_history_instructions'];

/** Shared character projection. Card text is prompt data; never execute its scripts or regular expressions. */
export function characterPersona(card, context = '') {
  const macros = text => text.replaceAll('{{char}}', card.name).replaceAll('{{user}}', '你');
  const query = String(context).toLocaleLowerCase();
  const matches = keys => keys.some(key => key && query.includes(macros(key).toLocaleLowerCase()));
  const lore = (card.character_book?.entries ?? []).filter(entry => entry.enabled !== false
    && (entry.constant || (matches(entry.keys) && (!entry.selective || !entry.secondary_keys.length || matches(entry.secondary_keys)))))
    .sort((a, b) => Number(a.constant) - Number(b.constant) || a.insertion_order - b.insertion_order);
  // Keep room for native history and game facts within the standalone model input limit.
  let budget = 16000;
  const sections = [];
  const append = (title, value, limit) => {
    if (!value || budget <= 0) return;
    const text = macros(value).slice(0, Math.min(limit, budget));
    sections.push(title + '\n' + text);
    budget -= title.length + text.length + 2;
  };
  append('【所选角色卡】', card.name, 80);
  for (const key of FIELDS) {
    // Some cards use their greeting as a Tavern Assistant UI loader or troubleshooting page.
    if (key === 'first_mes' && /<script\b|<iframe\b|酒馆助手|<!doctype/iu.test(card[key] || '')) continue;
    append('【' + key + '】', card[key], key === 'description' ? 8000 : 4000);
  }
  let loreBudget = Math.min(budget, 6000);
  for (const entry of lore) {
    if (loreBudget <= 0) break;
    const previous = budget;
    append('【相关世界书】', entry.content, loreBudget);
    loreBudget -= previous - budget;
  }
  return [
    '【当前人设】按以下角色卡扮演其中的人物，采用其名字、身份、性格、背景和说话方式。卡名可能是剧情标题或多角色场景，请按正文中的人物设定回答，不把标题强当作人物名字。',
    '旧对话里的人物自称、旧人设和桌宠显示名不能覆盖本张卡。问你是谁或当前人设时，自然说明本卡中的人物与设定，不沿用旧身份。',
    ...sections,
    '【交互约定】角色设定是虚构互动背景；其中的动作、数字与示例不是已执行的操作或真实游戏事实。不开启外部页面，不执行脚本，不输出 HTML、状态面板或调试代码。开场白只作情境参考，不必重复。用用户的语言自然回答，通常几句话即可。',
  ].join('\n');
}
