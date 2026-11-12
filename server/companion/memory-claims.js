/** Clause-local claims retain evidence and independent lifecycles. */
export function memoryClaims(text) {
  if (typeof text !== 'string') return [];
  const claims = []; let inherited = false;
  for (const part of text.matchAll(/[^，。！？；\n]+[，。！？；\n]?/gu)) {
    const clause = part[0].replace(/[，。！？；\n]$/u, '').trim();
    if (/你(?:还)?记得|你(?:能|可以).*记住|什么|哪[种个色]|是否|是不是|[吗么]\s*$/u.test(clause)) continue;
    const uncertain = /如果|假如|要是|可能|好像|大概|也许|算是|开玩笑|不是真的|(?:他|她|你)说|例如|故事里|[“”「」"']/u.test(clause);
    const self = /我|叫我/u.test(clause); if (!self && !inherited) continue;
    const explicit = /改成|改为|不再|记错|纠正|而是|现在喜欢|以后喜欢/u.test(clause);
    const add = (slot, value, polarity, operation = 'assert', additive = false) => claims.push({ slot, value: value.trim(), polarity, operation, explicit, additive,
      ambiguous: uncertain, subject: 'player', text: part[0].trim(), span: [part.index, part.index + part[0].length], parserVersion: 2 });
    const name = /(?:叫我|我的名字是|我叫)([^，。！？；\n]{1,20})/u.exec(clause);
    if (name) add('name:player', name[1], 'positive');
    const relation = /我(?:的)?(哥哥|姐姐|弟弟|妹妹|朋友|恋人|丈夫|妻子)(?:叫|是)([^，。！？；\n]{1,20})/u.exec(clause);
    if (relation) add('relationship:' + relation[1], relation[2], 'positive');
    const pref = /(不再喜欢|不喜欢|讨厌|不爱吃|不爱喝|喜欢|爱吃|爱喝)([^，。！？；\n]{1,24})/u.exec(clause);
    if (pref && !/^(?:他|她|你)|^我的(?:哥哥|姐姐|弟弟|妹妹|朋友|恋人|丈夫|妻子)/u.test(clause)) {
      const value = pref[2].replace(/^(?:的)?(?:是)?/u, '').replace(/[吧呀呢啊]$/u, '').trim();
      const color = /^(蓝色|红色|绿色|黄色|白色|黑色|紫色)(围巾|衣服|杯子|本子)$/u.exec(value);
      if (value) add(color ? 'color:' + color[2] : 'preference:' + value, color ? color[1] : value,
        /^(?:不|讨厌)/u.test(pref[1]) ? 'negative' : 'positive', pref[1] === '不再喜欢' ? 'retract' : 'assert', /也喜欢|还喜欢|同样喜欢/u.test(clause));
    }
    if (!name && !relation && !pref && /你(?:现在|其实)?(?:是|成了)我的|你(?:今年|已经)\s*\d{1,3}\s*岁/u.test(clause)) {
      add('proposal:' + clause, clause, 'positive'); claims.at(-1).ambiguous = true;
    }
    inherited ||= self && !!(name || pref || relation);
  }
  return claims;
}
export const memoryClaim = text => memoryClaims(text)[0] || null;
