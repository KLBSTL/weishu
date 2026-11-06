/* global document, location, history, FileReader */
const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get('token') || '';
let pet = fragment.get('pet') || 'main', data, actorId, bookId, bookDraft, entryIndex = -1, roomId;
let candidates = [], candidateRequest = 0;
history.replaceState(null, '', location.pathname);
const notice = (message, error = false) => { $('notice').textContent = message; $('notice').dataset.error = String(error); };
async function api(action, values = {}) {
  const response = await fetch('library', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(token && { 'X-DSH-Pet-Token': token }) }, body: JSON.stringify({ action, pet, ...values }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '操作未完成');
  return result;
}
function options(node, items, value) {
  node.replaceChildren(...items.map(item => { const o = document.createElement('option'); o.value = item.id; o.textContent = item.name; return o; }));
  if (items.some(item => item.id === value)) node.value = value;
}
const selectedActor = () => data.actors.find(a => a.id === actorId);
const sessionKey = () => selectedActor()?.sessionKey || actorId + ':direct:' + actorId + ':' + (selectedActor()?.assetId || 'default');
function showActor(id) {
  actorId = id; const actor = selectedActor();
  options($('actorAsset'), [{ id: '', name: '自建人物' }, ...data.assets.filter(a => a.kind === 'card')], actor?.assetId);
  const source = data.assets.find(a => a.id === actor?.assetId)?.card || {}, raw = source.data || source, fields = actor?.overrides || {};
  $('actorName').value = actor?.name || '';
  $('speakerName').value = actor?.speaker?.name || actor?.resolvedSpeaker?.name || raw.extensions?.ark_companion?.speaker?.name || '';
  void loadCandidates(actor?.assetId).catch(e => notice(e.message, true));
  for (const [id, key] of [['description', 'description'], ['personality', 'personality'], ['background', 'background'], ['examples', 'mes_example']]) $(id).value = fields[key] ?? actor?.speaker?.[key] ?? actor?.resolvedSpeaker?.[key] ?? raw[key] ?? '';
  options($('actorBooks'), data.assets.filter(a => a.kind === 'lorebook'));
  for (const option of $('actorBooks').options) option.selected = actor?.bookIds?.includes(option.value) || false;
  $('inspection').textContent = '';
  const state = data.states?.[sessionKey()]; $('stateView').textContent = JSON.stringify(state || {}, null, 2);
  if (state?.schema) $('schema').value = JSON.stringify(state.schema, null, 2);
  $('html').value = raw.first_mes || raw.description || '';
}
async function loadCandidates(assetId) {
  const serial = ++candidateRequest;
  const result = assetId ? await api('analyze-card', { assetId }) : { candidates: [], needsSpeaker: false };
  if (serial !== candidateRequest) return;
  candidates = result.candidates;
  options($('speakerCandidate'), [{ id: '', name: '自动选择剧情较多的人物' }, ...candidates.map((c, i) => ({ id: String(i), name: c.name }))], '');
  $('speakerHint').textContent = candidates.length ? '剧情卡会自动选定资料较丰富的人物并保持；不用手动填写，角色卡标题不作为姓名。' : '沿用卡内已有身份；没有明确姓名时直接用“我”说话，不要求创建人物。';
}
const availableBooks = () => [...(data.embeddedBooks || []), ...data.assets.filter(a => a.kind === 'lorebook')];
function storeEntry() {
  if (!bookDraft || entryIndex < 0) return;
  Object.assign(bookDraft.entries[entryIndex], { comment: $('entryName').value, keys: $('entryKeys').value.split(/[,，]/u).map(s => s.trim()).filter(Boolean),
    content: $('entryContent').value, constant: $('entryConstant').checked, enabled: $('entryEnabled').checked, disable: !$('entryEnabled').checked });
  const entry = bookDraft.entries[entryIndex];
  entry.extensions ??= {}; entry.extensions.ark_companion = { ...entry.extensions.ark_companion };
  const ext = entry.extensions.ark_companion, knowledge = $('entryKnowledge').value, subject = $('entrySubject').value.trim();
  if (knowledge === 'auto') { if (['self', 'world', 'author_only'].includes(ext.knowledge)) delete ext.knowledge; } else ext.knowledge = knowledge;
  if (subject && knowledge !== 'world') ext.subject = subject; else delete ext.subject;
}
function showEntry(index) {
  entryIndex = Number(index); const entry = bookDraft?.entries?.[entryIndex] || {};
  $('entryName').value = entry.comment || entry.name || '';
  $('entryKeys').value = (entry.keys || entry.key || []).join(', '); $('entryContent').value = entry.content || '';
  $('entryConstant').checked = !!entry.constant; $('entryEnabled').checked = entry.enabled !== false && !entry.disable;
  const ext = entry.extensions?.ark_companion || {};
  $('entryKnowledge').value = ['self', 'world', 'author_only'].includes(ext.knowledge) ? ext.knowledge : 'auto'; $('entrySubject').value = ext.subject || '';
}
function entryOptions() { options($('entry'), (bookDraft?.entries || []).map((e, i) => ({ id: String(i), name: e.comment || e.name || '条目 ' + (i + 1) })), String(entryIndex)); }
function showBook(id) {
  bookId = id; const book = availableBooks().find(a => a.id === id);
  bookDraft = structuredClone(book?.book || { entries: [] }); $('bookName').value = book?.name || '';
  $('bookOrigin').textContent = book?.actorId ? '来源：角色卡内世界书。保存为该人物的本地覆盖，源PNG保持不变。' : '来源：独立世界书。保存后可在人物页关联。';
  entryIndex = bookDraft.entries.length ? 0 : -1; entryOptions(); showEntry(entryIndex);
}
function showRoom(id) {
  roomId = id; const room = data.rooms.find(r => r.id === id); $('roomName').value = room?.name || '';
  $('members').replaceChildren(...data.actors.map(actor => { const label = document.createElement('label'); label.className = 'check'; const input = document.createElement('input');
    input.type = 'checkbox'; input.value = actor.id; input.checked = !!room?.members.includes(actor.id); label.append(input, document.createTextNode(actor.name)); return label; }));
}
function renderTranscript() {
  $('transcript').replaceChildren(...data.events.filter(e => e.roomId === roomId && ['user', 'assistant'].includes(e.type)).slice(-12).map(e => {
    const p = document.createElement('p'); const name = e.type === 'user' ? data.userPersona.name : e.speakerName || data.actors.find(a => a.id === e.speakerId)?.name || e.speakerId;
    p.textContent = name + '：' + e.text; return p;
  }));
}
async function reload() {
  data = await api('snapshot'); actorId = data.actors.some(a => a.id === actorId) ? actorId : data.bindings[pet] || 'main';
  options($('actor'), data.actors, actorId); showActor(actorId);
  options($('pet'), data.petIds.map(id => ({ id, name: id })), pet);
  options($('book'), availableBooks(), bookId); showBook($('book').value);
  options($('room'), data.rooms, roomId); showRoom($('room').value);
  $('userName').value = data.userPersona.name; $('userDescription').value = data.userPersona.description; $('style').value = data.preset.style;
  $('groupStatus').textContent = data.group.running ? '角色正在对话，已显示 ' + data.group.completed + ' 句。' : data.group.error || '尚未开始角色对话。'; renderTranscript();
}
function bind(id, task) { $(id).addEventListener('click', async () => { $(id).disabled = true; try { await task(); } catch (e) { notice(e.message, true); } finally { $(id).disabled = false; } }); }
function download(name, value, binary = false, extension = 'json') {
  const content = binary ? Uint8Array.from(atob(value), c => c.charCodeAt(0)) : JSON.stringify(value, null, 2);
  const blob = new Blob([content], { type: binary ? 'application/octet-stream' : 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name.replace(/[<>:"/\\|?*]/gu, '_') + '.' + extension; a.click(); URL.revokeObjectURL(url);
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => {
  for (const section of document.querySelectorAll('main>section')) section.hidden = section.id !== button.dataset.tab;
  for (const item of document.querySelectorAll('[data-tab]')) item.setAttribute('aria-current', String(item === button));
});
$('actor').addEventListener('change', () => showActor($('actor').value));
$('actorAsset').addEventListener('change', () => {
  const card = data.assets.find(a => a.id === $('actorAsset').value)?.card || {}, raw = card.data || card;
  for (const [id, key] of [['description', 'description'], ['personality', 'personality'], ['examples', 'mes_example']]) $(id).value = raw[key] || '';
  if (!$('actorName').value) $('actorName').value = raw.name || '';
  $('speakerName').value = ''; $('background').value = '';
  void loadCandidates($('actorAsset').value).catch(e => notice(e.message, true));
});
$('speakerCandidate').addEventListener('change', () => {
  const candidate = candidates[Number($('speakerCandidate').value)];
  if ($('speakerCandidate').value === '' || !candidate) return;
  const changed = $('speakerName').value !== candidate.name;
  $('speakerName').value = candidate.name;
  if (changed || !$('description').value.trim()) $('description').value = candidate.description;
  if (changed) { $('personality').value = ''; $('background').value = ''; }
});
$('pet').addEventListener('change', () => { pet = $('pet').value; });
$('book').addEventListener('change', () => showBook($('book').value));
$('entry').addEventListener('change', () => { storeEntry(); showEntry($('entry').value); });
$('room').addEventListener('change', () => { showRoom($('room').value); renderTranscript(); });
bind('reload', async () => { await reload(); notice('已载入最新资料。'); });
bind('newActor', async () => { actorId = null; showActor(null); $('actorName').focus(); });
bind('saveActor', async () => {
  const saved = await api('save-actor', { expectedRevision: data.revision, actorId, actor: { name: $('actorName').value, assetId: $('actorAsset').value,
    speakerName: $('speakerName').value,
    overrides: { name: $('actorName').value, description: $('description').value, personality: $('personality').value, background: $('background').value, mes_example: $('examples').value },
    bookIds: [...$('actorBooks').selectedOptions].map(o => o.value) } }); actorId = saved.result.id; await reload(); notice('人物已保存。');
});
bind('bindActor', async () => { await api('bind', { expectedRevision: data.revision, actorId }); await reload(); notice('已绑定，下次回复使用这个人物。'); });
bind('inspect', async () => { const result = await api('inspect', { actorId, question: $('probe').value });
  $('inspection').textContent = (result.needsSpeaker ? '需要先指定固定人物。\n' : '当前说话人物：' + (result.speaker?.name || '未指定') + '\n')
    + '可读资料：' + result.units.length + '；可选闲聊素材：' + (result.idleEligible?.length || 0) + '。以下为资料预览，不是生成回答。\n'
    + JSON.stringify({ materials: result.units.slice(0, 16).map(u => ({ id: u.id, ownership: u.ownership, kind: u.kind, source: u.path, text: u.text.slice(0, 180) })), activation: result.diagnostics.slice(0, 30) }, null, 2); });
for (const [id, original] of [['exportCard', false], ['originalCard', true]]) bind(id, async () => {
  const actor = selectedActor(); if (!actor?.assetId) throw new Error('请先保存或选择人物');
  const result = await api('export', { actorId, assetId: actor.assetId, original }); download(result.name, result.original ? result.file : result.document, result.original, result.extension || 'json');
});
$('cardFile').addEventListener('change', async () => { try {
  const file = $('cardFile').files[0]; if (!file) return; const reader = new FileReader();
  reader.onload = async () => { try { await api('import-card', { file: String(reader.result).split(',')[1] }); await reload(); notice('角色卡已导入当前桌宠。'); } catch (e) { notice(e.message, true); } };
  reader.readAsDataURL(file);
} catch (e) { notice(e.message, true); } });
bind('newBook', async () => { showBook(null); });
bind('newEntry', async () => { storeEntry(); bookDraft ??= { entries: [] }; bookDraft.entries.push({ id: 'entry-' + Date.now(), content: '', keys: [], enabled: true }); entryIndex = bookDraft.entries.length - 1; entryOptions(); showEntry(entryIndex); });
bind('saveBook', async () => { storeEntry(); const book = availableBooks().find(b => b.id === bookId); const saved = await api(book?.actorId ? 'save-embedded-book' : 'save-book', { expectedRevision: data.revision, actorId: book?.actorId, assetId: bookId, name: $('bookName').value, book: bookDraft }); bookId = saved.result.id; await reload(); notice('世界书已保存。卡内修改仅影响本地人物覆盖。'); });
$('bookFile').addEventListener('change', async () => { try { const file = $('bookFile').files[0]; if (!file) return; const book = JSON.parse(await file.text());
  const saved = await api('save-book', { expectedRevision: data.revision, name: book.name || file.name, book }); bookId = saved.result.id; await reload(); notice('世界书已导入。'); } catch (e) { notice(e.message, true); } });
bind('exportBook', async () => { const book = availableBooks().find(b => b.id === bookId); if (book?.actorId) { download(book.name, bookDraft); return; } const result = await api('export', { assetId: bookId }); download(result.name, result.document); });
bind('savePersona', async () => { await api('save-persona', { expectedRevision: data.revision, persona: { name: $('userName').value, description: $('userDescription').value }, style: $('style').value }); await reload(); notice('身份与语气已保存。'); });
bind('newRoom', async () => showRoom(null));
bind('saveRoom', async () => { const saved = await api('save-room', { expectedRevision: data.revision, roomId, name: $('roomName').value,
  members: [...$('members').querySelectorAll('input:checked')].map(i => i.value) }); roomId = saved.result.id; await reload(); notice('房间已保存。'); });
bind('startGroup', async () => { await api('start-group', { roomId, topic: $('topic').value, limit: 2 }); notice('角色对话已开始，在各自桌宠气泡中显示。'); });
bind('stopGroup', async () => { await api('stop-group'); notice('已停止角色对话。'); });
bind('saveSchema', async () => { await api('state-schema', { expectedRevision: data.revision, actorId, schema: JSON.parse($('schema').value) }); await reload(); notice('状态结构已保存。'); });
bind('applyPatch', async () => { await api('state-patch', { expectedRevision: data.revision, actorId, stateRevision: data.states[sessionKey()]?.revision,
  patch: JSON.parse($('patch').value) }); await reload(); notice('状态已更新。'); });
bind('previewHtml', async () => { const result = await api('preview', { actorId, html: $('html').value }); $('frame').srcdoc = result.html; });
void reload().then(() => notice('资料已就绪。')).catch(e => notice(e.message + '。请从桌宠右键重新打开此页。', true));
setInterval(() => { if (!$('rooms').hidden) void api('snapshot').then(s => { data.events = s.events; $('groupStatus').textContent = s.group.running
  ? '正在对话，已显示 ' + s.group.completed + ' 句' + (s.group.waitingForDisplay ? '，等待桌宠展示。' : '。') : s.group.error || '对话已结束。'; renderTranscript(); }).catch(() => {}); }, 2000);
