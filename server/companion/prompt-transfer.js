/* global document */
import { t } from './library-i18n/i18n.js';

/** Import changes only the editor draft; the existing Save action remains the sole persistence boundary. */
export function installPromptTransfer(section, { request, notice, current, apply }) {
  const actions = section.querySelector('.actions');
  const button = (id, label) => { const node = document.createElement('button'); node.id = id; node.type = 'button'; node.textContent = label; actions.append(node); return node; };
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true; input.id = 'promptPresetFile'; actions.append(input);
  const load = button('promptImport', t('导入提示预设')), save = button('promptExport', t('导出提示预设'));
  let importing = false, exporting = false;
  const refresh = () => { const ready = !!current(); load.disabled = !ready || importing; save.disabled = !ready || exporting; };
  section.addEventListener('companion:prompt-ready', refresh); refresh();
  const failed = () => notice(t('请选择有效的提示预设JSON（不超过64KB）'), true);
  load.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0], start = current(); input.value = '';
    if (!file || !start) return;
    if (file.size > 65536) return failed();
    importing = true; refresh();
    try {
      const preset = JSON.parse(await file.text());
      const result = await request('prompt-import', { actorId: start.actorId, scope: start.scope, preset });
      if (current()?.key !== start.key || !await apply(start.key, result.settings)) {
        notice(t('人物或设置范围已切换，请重新导入。'), true); return;
      }
      notice(t('已载入预设草稿；预览后保存才会生效。'));
    } catch { failed(); } finally { importing = false; refresh(); }
  };
  save.onclick = async () => {
    const start = current(); if (!start) return;
    exporting = true; refresh();
    try {
      const { preset } = await request('prompt-export', { actorId: start.actorId, scope: start.scope, name: start.name, settings: start.settings });
      const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2) + '\n'], { type: 'application/json' }));
      link.href = url; link.download = (preset.name.replace(/[<>:"/\\|?*\x00-\x1f]/gu, '_') || 'character') + '.prompt.json';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { failed(); } finally { exporting = false; refresh(); }
  };
}
