/* global document */
import { t, setMessages, setLang } from './library-i18n/i18n.js';

export async function installAiSettings(container, { request, notice }) {
  try {
    const lang = localStorage.getItem('sp.pref.lang');
    if (['en', 'ja', 'ko', 'zh-TW'].includes(lang)) { const pack = await request('library-i18n/' + lang + '.json'); setMessages(lang, pack); setLang(lang); }
  } catch { /* Source language remains available when a language pack cannot load. */ }
  const el = (tag, value, attrs = {}) => Object.assign(document.createElement(tag), { textContent: value || '', ...attrs });
  const form = el('form', '', { id: 'apiForm' }), status = el('p', '', { id: 'connectionStatus', className: 'note' });
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const label = (parent, title, control) => { const node = el('label', title); node.append(control); parent.append(node); return control; };
  const select = (id, options) => { const node = el('select', '', { id }); for (const [value, text] of options) node.append(el('option', text, { value })); return node; };
  const mode = label(form, t('连接方式'), select('connectionMode', [['direct', t('API直连')], ['dsh-api', t('本机DSH · 当前API')], ['dsh-official', t('本机DSH · 官方账号')]]));
  const summary = el('p', '', { id: 'connectionSummary', className: 'note' }); form.append(summary);
  const dsh = el('div', '', { className: 'form-grid' }); form.append(dsh);
  const executable = label(dsh, t('DeepSeek Harness 程序路径'), el('input', '', { id: 'dshExecutable', placeholder: t('留空自动查找，也可填写程序的完整路径') }));
  const officialLabel = el('label', t('官方账号模型')), officialModel = el('input', '', { id: 'dshModel', value: 'deepseek-flash', required: true }); officialLabel.append(officialModel); dsh.append(officialLabel);
  const accountHint = el('p', t('请先在本机 DeepSeek Harness 中登录官方账号。这里不需要填写 API 密钥。'), { className: 'note' }); form.append(accountHint);
  const api = el('div', '', { className: 'form-grid' }); form.append(api);
  const protocol = label(api, t('协议'), select('apiProtocol', [['openai-compatible', 'OpenAI compatible'], ['anthropic', 'Anthropic']]));
  const model = label(api, t('模型'), el('input', '', { id: 'apiModel', required: true }));
  const base = label(api, t('服务地址'), el('input', '', { id: 'apiBase', type: 'url', required: true }));
  const key = label(api, t('密钥'), el('input', '', { id: 'apiKey', type: 'password', autocomplete: 'new-password', placeholder: t('留空保留已有密钥') }));
  const keyState = el('p', '', { id: 'apiKeyState', className: 'note' }); form.append(keyState);
  const hint = el('p', t('检查本机不会请求模型；测试连接只发送公开短提示，使用当前填写的连接，不会发送角色资料或聊天历史。'), { className: 'note' }); form.append(hint);
  const buttons = el('div', '', { className: 'actions' }), detect = el('button', t('自动查找'), { type: 'button', id: 'detectDsh' }),
    check = el('button', t('检查本机'), { type: 'button', id: 'checkDsh' }), test = el('button', t('测试连接'), { type: 'button', id: 'testApi' }),
    save = el('button', t('保存并使用'), { type: 'submit', id: 'saveConnection', className: 'primary' });
  buttons.append(detect, check, test, save); form.append(buttons, status); container.replaceChildren(form);
  let dirty = false, loaded = false, busy = false;
  function visibility() {
    const native = mode.value !== 'direct', official = mode.value === 'dsh-official';
    dsh.hidden = !native; officialLabel.hidden = !official; accountHint.hidden = !official;
    api.hidden = official; keyState.hidden = official; detect.hidden = check.hidden = !native;
    for (const control of api.querySelectorAll('input,select')) control.disabled = official;
    officialModel.disabled = !official; executable.disabled = !native;
  }
  function message(code) {
    return ({ 'invalid-settings': t('请检查连接方式、模型名称和服务地址。'), 'api-incomplete': t('请填写服务地址、模型和密钥；已有密钥可留空。'),
      'runtime-missing': t('未找到 DeepSeek Harness，请安装后填写程序路径，或选择 API直连。'),
      'runtime-incompatible': t('本机 DSH 运行时无法加载，请检查程序路径及安装是否完整。'),
      busy: t('连接操作正在进行，请稍候。'), auth: t('鉴权未通过：官方账号请在 DSH 重新登录，API连接请检查密钥。'),
      quota: t('服务暂时限流或额度不足，请稍后重试并检查账户额度。'), timeout: t('连接超时，设置仍保留，可以稍后重试。'),
      'save-failed': t('保存失败，请检查数据目录的写入权限后重试。'), unavailable: t('连接服务尚未就绪，请重新启动桌宠。'),
      'connection-failed': t('连接未完成，请检查地址、模型和网络后重试。') })[code] || t('连接未完成，请检查地址、模型和网络后重试。');
  }
  const body = action => ({ action, connection: { mode: mode.value, executable: executable.value.trim(), model: officialModel.value.trim() || 'deepseek-flash' },
    ...(mode.value !== 'dsh-official' && { api: { protocol: protocol.value, baseUrl: base.value.trim(), model: model.value.trim(), ...(key.value.trim() && { apiKey: key.value.trim() }) } }) });
  async function load(force = false) {
    if (busy || loaded && dirty && !force) return;
    const data = await request('ai-connection');
    mode.value = data.connection.mode; executable.value = data.connection.executable || data.detectedExecutable;
    officialModel.value = data.connection.model; protocol.value = data.api.protocol; base.value = data.api.baseUrl; model.value = data.api.model; key.value = '';
    keyState.textContent = data.api.hasKey ? t('已保存密钥') : t('尚未配置密钥');
    summary.textContent = data.loadError ? t('连接配置无法读取，请重新检查并保存。') : data.ready ? t('已启用的连接：{mode}', { mode: mode.selectedOptions[0].textContent }) : t('填写连接后保存，即可开始聊天。');
    loaded = true; dirty = false; visibility();
  }
  async function perform(action) {
    if (busy) return;
    busy = true; status.textContent = t('正在检查连接…'); status.dataset.error = 'false';
    const controls = [...form.querySelectorAll('input,select,button')]; controls.forEach(control => { control.disabled = true; });
    let saved = false;
    try {
      const result = await request('ai-connection', body(action));
      if (action === 'detect') { executable.value = result.executable; dirty = true; status.textContent = result.executable ? t('已找到本机 DSH，可以检查后保存。') : message('runtime-missing'); }
      if (action === 'check') { executable.value = result.executable; dirty = true; status.textContent = t('本机运行时可用；账号和服务连接请使用“测试连接”检查。'); }
      if (action === 'test') status.textContent = t('连接成功，耗时 {seconds} 秒。当前表单尚未保存时，请点击“保存并使用”。', { seconds: (result.elapsedMs / 1000).toFixed(2) });
      if (action === 'save') { saved = true; status.textContent = t('连接已保存并生效，重启后仍会使用。'); notice(status.textContent); }
    } catch (error) { status.textContent = error.code ? message(error.code) : error.message; status.dataset.error = 'true'; }
    finally { busy = false; controls.forEach(control => { control.disabled = false; }); visibility(); }
    if (saved) await load(true).catch(error => { status.textContent = error.message; });
  }
  form.oninput = () => { dirty = true; status.textContent = t('有未保存的修改。'); };
  mode.onchange = visibility;
  detect.onclick = () => void perform('detect'); check.onclick = () => void perform('check');
  test.onclick = () => { if (form.reportValidity()) void perform('test'); };
  form.onsubmit = event => { event.preventDefault(); void perform('save'); };
  return { load };
}
