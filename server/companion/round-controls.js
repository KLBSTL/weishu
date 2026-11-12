/* global document, window, FileReader, $, data, actorId, bookId, bookDraft: writable, entryIndex, api, reload, notice, selectedActor, showEntry, download, storeEntry: writable */
(() => {
  const node = (tag, text, id) => { const n = document.createElement(tag); if (text) n.textContent = text; if (id) n.id = id; return n; };
  const fail = e => notice(e.message || '操作未完成', true);
  const button = (text, id, task) => { const n = node('button', text, id); n.type = 'button'; n.onclick = () => { void Promise.resolve().then(task).catch(fail); }; return n; };
  const dialog = node('dialog', '', 'revisionDialog'), question = node('p'), detail = node('pre'), actions = node('div'); actions.className = 'actions'; dialog.append(question, detail, actions); document.body.append(dialog);
  let finishDialog;
  dialog.oncancel = () => finishDialog?.(null);
  function ask(message, changes, choices) {
    if (dialog.open) return Promise.resolve(null);
    question.textContent = message; detail.textContent = changes; actions.replaceChildren();
    return new Promise(resolve => {
      finishDialog = choice => { dialog.close(); finishDialog = null; resolve(choice); };
      for (const [key, label] of choices) actions.append(button(label, 'revision-' + key, () => finishDialog(key)));
      dialog.showModal(); actions.lastElementChild?.focus();
    });
  }

  const fieldIds = ['actorName', 'description', 'personality', 'background', 'examples'];
  const actorValues = () => Object.fromEntries(fieldIds.map(id => [id, $(id).value]));
  let actorBase = actorValues(), bookBase = bookDraft ? JSON.stringify(bookDraft) : '', bookNameBase = $('bookName').value, bypass = false, bookTouched = false;
  function diffActor() { return fieldIds.filter(id => actorValues()[id] !== actorBase[id]); }
  function dirty() { if (bookTouched) storeEntry(); return !!actorId && diffActor().length > 0 || !!bookDraft && (JSON.stringify(bookDraft) !== bookBase || $('bookName').value !== bookNameBase); }
  const labels = { actorName: '名称', description: '身份与背景', personality: '性格与语气', background: '补充经历', examples: '说话示例' };
  for (const id of ['saveActor', 'saveBook']) $(id).addEventListener('click', async event => {
    if (bypass || id === 'saveActor' && !actorId) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (id === 'saveBook') storeEntry();
    const changes = id === 'saveActor' ? diffActor().map(key => `${labels[key]}：\n${actorBase[key].slice(0, 200)}\n→\n${$(key).value.slice(0, 200)}`).join('\n\n')
      : [$('bookName').value !== bookNameBase ? '世界书名称：' + bookNameBase + ' → ' + $('bookName').value : '', ...(bookDraft?.entries || []).flatMap((entry, index) => {
        const old = JSON.parse(bookBase || '{"entries":[]}').entries?.[index]; if (JSON.stringify(old) === JSON.stringify(entry)) return [];
        return ['条目 ' + (index + 1) + '：' + (entry.comment || entry.name || '未命名') + (old?.content !== entry.content ? '\n正文：' + (old?.content || '').slice(0, 160) + '\n→\n' + entry.content.slice(0, 160) : '')
          + (old?.enabled !== entry.enabled ? '\n启用：' + (entry.enabled === false ? '关闭' : '开启') : '')
          + (JSON.stringify(old?.extensions) !== JSON.stringify(entry.extensions) || JSON.stringify(old?.keys) !== JSON.stringify(entry.keys) ? '\n触发或归属设置已修改' : '')];
      })].filter(Boolean).join('\n\n');
    if (await ask('保存这些修改？相关未播内容会重新准备。', changes || '没有新的字段变化。', [['save', '保存'], ['cancel', '继续编辑']]) === 'save') {
      bypass = true; $(id).click(); bypass = false;
    }
  }, true);

  async function saveDraft() {
    if (!actorId) return;
    if (bookTouched) storeEntry();
    await api('editor-draft', { actorId, kind: 'editor', value: { actor: actorValues(), bookId, book: bookDraft, bookName: $('bookName').value, revision: data.revision } });
  }
  async function restoreDraft() {
    const { draft } = await api('editor-draft', { actorId, kind: 'editor' });
    if (!draft) { notice('没有保存的草稿'); return; }
    if (draft.revision !== data.revision && await ask('资料已有更新，仍恢复这份草稿？', '恢复后可再次比较修改再保存。', [['restore', '恢复草稿'], ['cancel', '取消']]) !== 'restore') return;
    for (const id of fieldIds) if (typeof draft.actor?.[id] === 'string') $(id).value = draft.actor[id];
    if (draft.book && draft.bookId === bookId) { bookDraft = draft.book; $('bookName').value = draft.bookName || bookNameBase; showEntry(Math.max(0, entryIndex)); }
    notice('已恢复草稿，保存后生效');
  }
  $('actorEditor').querySelector('.actions').append(button('保留草稿', 'keepActorDraft', saveDraft), button('恢复草稿', 'restoreActorDraft', restoreDraft));
  $('saveBook').parentElement.append(button('保留草稿', 'keepBookDraft', saveDraft), button('恢复草稿', 'restoreBookDraft', restoreDraft));
  document.addEventListener('click', event => {
    const target = event.target.closest('button'); if (bypass || !target || !dirty() || dialog.open || target.closest('dialog')) return;
    if (!target.closest('#mainNav,#subNav,#bookShelf,#cardShelf') && !['closePanel', 'collapsePanel', 'reload'].includes(target.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void ask('修改还没有保存', '', [['keep', '保留草稿'], ['discard', '放弃修改'], ['cancel', '继续编辑']]).then(async choice => {
      if (!choice || choice === 'cancel') return; if (choice === 'keep') await saveDraft();
      for (const id of fieldIds) $(id).value = actorBase[id];
      if (bookBase) { bookDraft = JSON.parse(bookBase); $('bookName').value = bookNameBase; showEntry(Math.max(0, entryIndex)); }
      bypass = true; target.click(); bypass = false;
    }).catch(fail);
  }, true);
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  const selectorValues = new Map();
  const trackSelectors = () => { for (const id of ['actor', 'book']) if ($(id)) selectorValues.set(id, $(id).value); };
  trackSelectors();
  for (const id of ['actor', 'book']) $(id)?.addEventListener('change', event => {
    if (bypass || !dirty()) { selectorValues.set(id, $(id).value); return; }
    const next = $(id).value; event.stopImmediatePropagation(); $(id).value = selectorValues.get(id);
    void ask('修改还没有保存', '', [['keep', '保留草稿'], ['discard', '放弃修改'], ['cancel', '继续编辑']]).then(async choice => {
      if (!choice || choice === 'cancel') return; if (choice === 'keep') await saveDraft();
      for (const field of fieldIds) $(field).value = actorBase[field];
      if (bookBase) { bookDraft = JSON.parse(bookBase); $('bookName').value = bookNameBase; showEntry(Math.max(0, entryIndex)); }
      bypass = true; $(id).value = next; $(id).dispatchEvent(new Event('change', { bubbles: true })); bypass = false; trackSelectors();
    }).catch(fail);
  }, true);

  const meta = document.querySelector('.entry-meta'), originalMeta = node('div'), chooser = node('select', '', 'entrySettingsPage');
  while (meta.firstChild) originalMeta.append(meta.firstChild);
  const groups = { base: originalMeta };
  function group(key, title) { const n = node('div'); groups[key] = n; const o = node('option', title); o.value = key; chooser.append(o); n.hidden = key !== 'base'; meta.append(n); return n; }
  meta.append(chooser); group('base', '基本资料').append(...originalMeta.childNodes);
  function field(parent, label, id, options) {
    const wrap = node('label', label), input = node(options ? 'select' : 'input', '', id);
    if (options) for (const [value, text] of options) { const o = node('option', text); o.value = value; input.append(o); }
    wrap.append(input); parent.append(wrap); return input;
  }
  const trigger = group('trigger', '触发规则');
  field(trigger, '次关键词', 'ruleSecondary');
  field(trigger, '次关键词逻辑', 'ruleLogic', [['0', '任一命中'], ['3', '全部命中'], ['2', '全部未命中'], ['1', '不全命中']]);
  for (const [label, id, max] of [['触发概率 %', 'ruleProbability', 100], ['扫描最近消息', 'ruleDepth', 1000]]) { const n = field(trigger, label, id); n.type = 'number'; n.min = '0'; n.max = String(max); }
  const matching = group('matching', '匹配与分组');
  field(matching, '互斥分组', 'ruleGroup'); field(matching, '分组权重', 'ruleWeight').type = 'number';
  field(matching, '标签（逗号分隔）', 'ruleTags');
  for (const [id, label] of [['ruleCase', '区分大小写'], ['ruleWhole', '英文整词匹配'], ['ruleNoRecurse', '阻断后续递归'], ['ruleExcludeRecurse', '不由递归触发'], ['ruleOnlyRecurse', '仅由递归触发'], ['ruleScoring', '分组按命中数筛选'], ['ruleOverride', '分组优先']]) { const n = field(matching, label, id); n.type = 'checkbox'; }
  const placement = group('placement', '位置与排序'); field(placement, '排序值', 'ruleOrder').type = 'number';
  field(placement, '插入位置', 'rulePosition', [['0', '人设前'], ['1', '人设后'], ['5', '示例前'], ['6', '示例后'], ['4', '聊天深度']]);
  field(placement, '聊天深度', 'ruleMessageDepth').type = 'number';
  field(placement, '资料消息类型', 'ruleRole', [['0', '系统资料'], ['1', '用户资料'], ['2', '角色资料']]);
  const timed = group('timed', '消息时效');
  for (const [id, label] of [['ruleSticky', '持续消息数'], ['ruleCooldown', '冷却消息数'], ['ruleDelay', '延迟消息数']]) { const n = field(timed, label, id); n.type = 'number'; n.min = '0'; n.max = '1000'; }
  const conditional = group('conditions', '剧情条件'), conditions = node('div', '', 'ruleConditions'); conditional.append(conditions);
  function addCondition(condition = {}) {
    const row = node('div'); row.className = 'condition-row';
    const path = field(row, '状态字段', ''), op = field(row, '关系', '', [['eq', '等于'], ['neq', '不等于']]), value = field(row, '值', '');
    path.value = condition.path || ''; op.value = condition.op || 'eq'; value.value = typeof condition.value === 'string' ? condition.value : condition.value === undefined ? '' : JSON.stringify(condition.value);
    row.append(button('移除', '', () => row.remove())); conditions.append(row);
  }
  conditional.append(button('添加条件', 'addLoreCondition', () => addCondition()));
  chooser.onchange = () => { for (const [key, n] of Object.entries(groups)) n.hidden = key !== chooser.value; }; chooser.value = 'base'; chooser.onchange();
  const oldStore = storeEntry;
  let ruleBase = '', conditionBase = '';
  const conditionSnapshot = () => JSON.stringify([...conditions.querySelectorAll('input,select')].map(n => n.value));
  const ruleSnapshot = () => JSON.stringify([...meta.querySelectorAll('input,select')].filter(n => n !== chooser && !groups.base.contains(n)).map(n => [n.type === 'checkbox' ? n.checked : n.value]));
  storeEntry = function () {
    oldStore(); const entry = bookDraft?.entries?.[entryIndex]; if (!entry) return;
    if (ruleSnapshot() === ruleBase) return;
    entry.secondary_keys = $('ruleSecondary').value.split(/[,，]/u).map(x => x.trim()).filter(Boolean); entry.selective = entry.secondary_keys.length > 0;
    entry.extensions = { ...entry.extensions, selectiveLogic: Number($('ruleLogic').value), probability: Number($('ruleProbability').value),
      scanDepth: Number($('ruleDepth').value), group: $('ruleGroup').value.trim(), groupWeight: Number($('ruleWeight').value) || 100,
      caseSensitive: $('ruleCase').checked, matchWholeWords: $('ruleWhole').checked, preventRecursion: $('ruleNoRecurse').checked,
      excludeRecursion: $('ruleExcludeRecurse').checked, delayUntilRecursion: $('ruleOnlyRecurse').checked, useGroupScoring: $('ruleScoring').checked, groupOverride: $('ruleOverride').checked,
      position: Number($('rulePosition').value), role: Number($('ruleRole').value), depth: Number($('ruleMessageDepth').value), sticky: Number($('ruleSticky').value), cooldown: Number($('ruleCooldown').value), delay: Number($('ruleDelay').value) };
    entry.extensions.ark_companion.tags = $('ruleTags').value.split(/[,，]/u).map(t => t.trim()).filter(Boolean).slice(0, 20);
    entry.insertion_order = Number($('ruleOrder').value);
    if (Object.hasOwn(entry, 'probability')) entry.probability = Number($('ruleProbability').value);
    if (Object.hasOwn(entry, 'case_sensitive')) entry.case_sensitive = $('ruleCase').checked;
    if (Object.hasOwn(entry, 'scan_depth')) entry.scan_depth = Number($('ruleDepth').value);
    if (conditionSnapshot() !== conditionBase) entry.extensions.ark_companion.conditions = [...conditions.children].flatMap(row => {
      const [path, op, value] = row.querySelectorAll('input,select'); if (!path.value.trim()) return [];
      let expected = value.value; try { expected = JSON.parse(value.value); } catch { /* plain string */ }
      return [{ path: path.value.trim(), op: op.value, value: expected }];
    });
  };
  function paintEntry() {
    const entry = bookDraft?.entries?.[entryIndex] || {}, ext = entry.extensions || {}, r = { ...entry, ...ext };
    for (const [id, value] of Object.entries({ ruleSecondary: (entry.secondary_keys || entry.keysecondary || []).join(', '), ruleLogic: r.selectiveLogic ?? 0,
      ruleProbability: r.probability ?? 100, ruleDepth: r.scanDepth ?? bookDraft?.scan_depth ?? 4, ruleGroup: r.group || '', ruleWeight: r.groupWeight ?? 100,
      ruleOrder: entry.insertion_order ?? entry.order ?? entryIndex, rulePosition: ({ before_char: 0, after_char: 1 })[r.position] ?? r.position ?? 1, ruleRole: r.role ?? 0,
      ruleTags: (Array.isArray(ext.ark_companion?.tags) ? ext.ark_companion.tags : []).join(', '),
      ruleMessageDepth: r.depth ?? 4, ruleSticky: r.sticky ?? 0, ruleCooldown: r.cooldown ?? 0, ruleDelay: r.delay ?? 0 })) $(id).value = String(value);
    $('ruleCase').checked = !!(r.case_sensitive ?? r.caseSensitive); $('ruleWhole').checked = !!r.matchWholeWords; $('ruleNoRecurse').checked = !!r.preventRecursion;
    for (const [id, key] of [['ruleExcludeRecurse', 'excludeRecursion'], ['ruleOnlyRecurse', 'delayUntilRecursion'], ['ruleScoring', 'useGroupScoring'], ['ruleOverride', 'groupOverride']]) $(id).checked = !!r[key];
    conditions.replaceChildren(); for (const c of Array.isArray(ext.ark_companion?.conditions) ? ext.ark_companion.conditions : []) addCondition(c);
    ruleBase = ruleSnapshot(); conditionBase = conditionSnapshot(); bookTouched = false;
  }
  $('books').addEventListener('input', () => { bookTouched = true; });
  const bulk = node('div'); bulk.className = 'toolbar compact';
  for (const [label, enabled] of [['全启用', true], ['全停用', false]]) bulk.append(button(label, '', () => { storeEntry(); for (const e of bookDraft?.entries || []) { e.enabled = enabled; e.disable = !enabled; } showEntry(entryIndex); }));
  document.querySelector('.entry-browser').append(bulk);

  const loreTools = node('div'); loreTools.className = 'toolbar';
  const profile = field(loreTools, '世界书规则', 'loreProfile', [['legacy', '现有规则'], ['enhanced', '增强规则']]);
  field(loreTools, '预览历史范围', 'loreHistory', [['0', '只看这句话'], ['4', '最近4条'], ['10', '最近10条'], ['40', '最近40条'], ['100', '最近100条']]).value = '40';
  loreTools.append(button('触发预览', 'previewLore', async () => {
    const r = await api('lore-preview', { actorId, question: $('probe').value, historyLimit: Number($('loreHistory').value) });
    const reasons = { active: '已选入', keyword: '关键词未命中', probability: '本次概率未选中', budget: '超出预算', group: '互斥分组未选中', delay: '尚未到启用消息数', cooldown: '冷却中', 'disabled-or-condition': '已关闭或条件不满足', 'proactive-disabled': '不用于碎碎念', 'unsupported-position': '此位置尚未支持', 'regex-timeout': '正则超时', 'regex-limit': '正则超过本次上限' };
    const legacy = new Set(r.legacy.filter(x => x.reason === 'active').map(x => x.id));
    $('inspection').textContent = r.enhanced.diagnostics.map(x => `${x.title}\n${legacy.has(x.id) ? '现有：生效' : '现有：未选入'} → 增强：${reasons[x.reason] || '当前条件未满足'}`).join('\n\n') + '\n\n尚未支持：' + r.compatibility.unsupported.join('、');
  }), button('应用规则', 'applyLoreProfile', async () => {
    if (await ask('切换世界书规则？', '相关未播内容会重新准备，已有聊天和记忆会保留。', [['apply', '应用'], ['cancel', '取消']]) !== 'apply') return;
    await api('rule-profile', { actorId, profile: profile.value, expectedRevision: data.revision }); await reload(); notice('世界书规则已更新');
  })); $('worldInspect').prepend(loreTools);
  $('inspect').hidden = true;
  $('probe').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('previewLore').click(); } });
  const proactiveWrap = node('label'); proactiveWrap.className = 'check'; const proactive = node('input', '', 'bookProactive'); proactive.type = 'checkbox'; proactiveWrap.append(proactive, document.createTextNode('用于碎碎念')); document.querySelector('.book-summary').append(proactiveWrap);
  proactive.onchange = () => { void api('book-proactive', { actorId, bookId: bookId?.startsWith('embedded:') ? 'embedded' : bookId, enabled: proactive.checked, expectedRevision: data.revision }).then(reload).catch(fail); };

  const exports = document.querySelector('.card-preview .actions'), scope = node('select', '', 'exportScope'); scope.setAttribute('aria-label', '导出范围');
  $('cardFile').accept += ',.charx';
  $('cardFile').addEventListener('change', event => {
    const file = $('cardFile').files[0]; if (!file?.name.toLowerCase().endsWith('.charx')) return;
    event.stopImmediatePropagation(); const reader = new FileReader();
    reader.onload = () => { void api('charx-inspect', { file: String(reader.result).split(',')[1] }).then(r => ask(r.name + ' · 资源包清单', r.reason + '\n\n' + r.entries.map(e => e.name + (e.unsafe ? '（路径不可用）' : e.encrypted ? '（已加密）' : '')).join('\n') + '\n\n' + r.assets.map(a => a.name + '：' + (a.available === true ? '包内可用' : a.available === false ? '缺少文件' : '外部引用，未访问')).join('\n'), [['close', '关闭']])).catch(fail); };
    reader.readAsDataURL(file);
  }, true);
  for (const [value, text] of [['whole', '整张卡'], ['single', '单个人物']]) { const o = node('option', text); o.value = value; scope.append(o); }
  const cover = node('input', '', 'exportCover'); cover.type = 'file'; cover.accept = '.png'; cover.hidden = true;
  exports.append(scope, button('当前PNG', 'exportPng', async () => {
    let image; if (cover.files[0]) image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(cover.files[0]); });
    const r = await api('export', { actorId, format: 'png', cover: image, singleActor: scope.value === 'single' }); download(r.name, r.file, true, 'png');
  }), button('选择封面', 'chooseExportCover', () => cover.click()), cover); $('exportCard').textContent = '当前JSON';

  const memoryTools = node('div'); memoryTools.className = 'toolbar';
  memoryTools.append(button('待确认', 'pendingMemories', async () => {
    const r = await api('memory-pending', { actorId }); $('memoryRows').replaceChildren();
    for (const m of r.pending) { const item = node('article'), text = node('p', m.text); item.append(text);
      for (const [label, accept] of [['记住', true], ['忽略', false]]) item.append(button(label, '', async () => { await api('memory-decide', { actorId, memoryId: m.id, accept }); item.remove(); notice('记忆已更新'); })); $('memoryRows').append(item);
    } if (!r.pending.length) $('memoryRows').textContent = '没有待确认的记忆';
  }), button('变更记录', 'memoryChanges', async () => { const r = await api('memory-changes', { actorId }); $('memoryRows').replaceChildren(...r.changes.map(m => { const n = node('article'); n.append(node('small', new Date(m.at).toLocaleString()), node('p', m.text || m.before || ''), node('small', ({ pending: '待确认', remembered: '已记住', replaced: '已更新', confirmed: '已确认', dismissed: '已忽略', corrected: '已纠正', forgotten: '已忘记', deleted: '已删除' })[m.action] || '已修改')); return n; })); }));
  $('memories').insertBefore(memoryTools, $('memoryRows'));

  const research = node('p', '', 'researchProgress'), researchActions = node('div'); researchActions.className = 'toolbar';
  let polling;
  async function researchStatus() {
    const r = await api('research-status', { actorId }); research.textContent = r.running ? `正在整理 ${r.done}/${r.total}` : r.paused ? `已暂停 ${r.done}/${r.total}` : r.error || (r.total ? `已整理 ${r.done}/${r.total}` : '');
    window.clearTimeout(polling); if (r.running) polling = window.setTimeout(() => { void researchStatus().catch(fail); }, 1200);
  }
  researchActions.append(button('暂停整理', 'pauseResearch', async () => { await api('research-stop'); await researchStatus(); }), button('继续整理', 'resumeResearch', () => $('researchCard').click()));
  $('advancedPage').append(researchActions, research);
  const statistics = node('pre'); statistics.hidden = true;
  $('advancedPage').append(button('回复统计', 'replyStatistics', async () => {
    const { summary } = await api('metrics'), names = { 'local-opening': '本地开场', 'model-cache': '模型缓存', 'new-chat': '普通问答', 'search-or-complex': '查询与复杂问答', batch: '连续碎碎念', proactive: '后台发言' };
    const seconds = value => Number.isFinite(value) ? (value / 1000).toFixed(2) + '秒' : '尚无测量';
    statistics.hidden = false;
    statistics.textContent = '最近100次准备记录\n\n' + summary.map(row => `${names[row.source] || '其他'} · ${row.count}次\n准备耗时：一半在${seconds(row.p50Ms)}内，95%在${seconds(row.p95Ms)}内\n取消${row.cancelled}次 · 超时${row.timedOut}次 · 未完成${row.failed}次\n模型请求${row.attempts}次 · 未提供用量${row.usageMissing}次`).join('\n\n');
  }), statistics);
  document.addEventListener('companion:research', () => { void researchStatus().catch(fail); });
  function loaded() { actorBase = actorValues(); profile.value = selectedActor()?.ruleProfile || 'legacy'; bookBase = bookDraft ? JSON.stringify(bookDraft) : ''; bookNameBase = $('bookName').value; paintEntry(); trackSelectors(); }
  document.addEventListener('companion:loaded', loaded);
  document.addEventListener('companion:actor', () => { actorBase = actorValues(); profile.value = selectedActor()?.ruleProfile || 'legacy'; trackSelectors(); });
  document.addEventListener('companion:entry', paintEntry);
  document.addEventListener('companion:book', () => { bookBase = bookDraft ? JSON.stringify(bookDraft) : ''; bookNameBase = $('bookName').value; proactive.checked = selectedActor()?.bookProactive?.[bookId?.startsWith('embedded:') ? 'embedded' : bookId] !== false; paintEntry(); trackSelectors(); });
  paintEntry();
})();
