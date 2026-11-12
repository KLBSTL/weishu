/** Shared, bounded recognition of profile labels; keep identity facts available for Q&A. */
export function sourceHeading(value) {
  const title = String(value || '').replace(/^[\s#*_【\[]+|[\s*_】\]]+$/gu, '').trim();
  const voice = /^声部[一二三四五六七八九十\d]{0,4}\s*[·・:：-]\s*([^。！？\n]{1,24})$/u.exec(title);
  if (voice) return { title, role: /作者|创作者/u.test(voice[1]) ? 'author' : 'voice' };
  return /^(?:作者(?:的话|注|备注|评论|笔记)?|创作(?:备注|思路)|写作(?:指导|说明))$/u.test(title) ? { title, role: 'author' } : null;
}
export function profileLabel(value) {
  const label = String(value || '').replace(/^[\s#*_[【-]+|[\s*_\]】:：]+$/gu, '').trim();
  return /^(?:姓名|名字|性别|年龄|种族|阶位|位阶|等级|身份|职业|住处|住所|居住地|家庭成员|身高|体重|身材|头发|发色|瞳色|衣着|着装|服装(?:风格)?|服饰|穿着|外貌(?:特征|描述)?|外在(?:特征|描述)?|外观|容貌|体系与来源|现存长处|短板|神灵权能)$/u.test(label) ? label : null;
}
export function labelledProfileLine(value, includeBehaviour = false) {
  const line = String(value || '').replace(/^\s*[-*•]\s+/u, '').replace(/\*\*|__/gu, '');
  const match = /^(?:【([^】]+)】|\[([^\]]+)\]|([^:：\n]+)[:：])\s*([\s\S]*)$/u.exec(line);
  const raw = match && (match[1] || match[2] || match[3]).trim();
  const label = profileLabel(raw) || (includeBehaviour && /^(?:性格|爱好|习惯|口癖|说话方式|兴趣)$/u.test(raw) ? raw : null);
  return label ? { label, value: match[4] } : null;
}
