const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Only scalar interpolation, with own-property traversal. No expressions or executable templates. */
export function renderReadOnlyTemplate(template, { char = '', user = '', state = {} } = {}) {
  const read = key => key.split('.').reduce((obj, part) => obj && Object.hasOwn(obj, part) && !['__proto__', 'constructor', 'prototype'].includes(part) ? obj[part] : undefined, { char, user, state });
  let source = String(template).slice(0, 128000);
  // Deliberately no expressions, function calls, assignments or EJS. Bounded nesting.
  for (let depth = 0; depth < 8; depth++) {
    const next = source.replace(/\{\{#if\s+(char|user|state(?:\.[A-Za-z0-9_-]+)+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/gu, (_all, key, body) => {
      const [yes, no = ''] = body.split('{{else}}'); return read(key) ? yes : no;
    });
    if (next === source) break; source = next;
  }
  return source.replace(/\{\{\s*(char|user|state(?:\.[A-Za-z0-9_-]+)+)\s*\}\}/gu, (_all, key) => {
    const value = read(key);
    return value === null || value === undefined || typeof value === 'object' ? '（未设置）' : escape(value);
  });
}
