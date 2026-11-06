const escape = value => String(value).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Only scalar interpolation, with own-property traversal. No expressions or executable templates. */
export function renderReadOnlyTemplate(template, { char = '', user = '', state = {} } = {}) {
  return String(template).replace(/\{\{\s*(char|user|state(?:\.[A-Za-z0-9_-]+)+)\s*\}\}/gu, (_all, key) => {
    const value = key.split('.').reduce((obj, part) => obj && Object.hasOwn(obj, part) && !['__proto__', 'constructor', 'prototype'].includes(part) ? obj[part] : undefined, { char, user, state });
    return value === null || value === undefined || typeof value === 'object' ? '（未设置）' : escape(value);
  });
}
