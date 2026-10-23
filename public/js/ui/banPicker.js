import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { data, useData } from '../data.js';
import { modeIdFor } from '../../../shared/constants.js';
import { banCandidates, normalizeBanConfig, DEFAULT_BAN_CONFIG } from '../../../shared/banConfig.js';
import { t, N_ } from '../../../shared/i18n.js';

const TYPES = [
  { key: 'hardCore', title: N_('大盟约硬禁'), hint: N_('拥有该大盟约的干员全部移出卡池'), mark: '×' },
  { key: 'softCore', title: N_('大盟约软禁'), hint: N_('大盟约及所有小盟约都被禁用，才移出卡池'), mark: '◇' },
  { key: 'addon', title: N_('小盟约禁用'), hint: N_('配合软禁筛选，不单独移除干员'), mark: '◈' },
];

export function BanConfigButton({ room, isHost, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const counts = room.banConfig || DEFAULT_BAN_CONFIG;
  const close = () => setOpen(false);
  return html`<${Button} variant="secondary" size="lg" class="room-bans" data-testid="ban-config-open" onClick=${() => setOpen(true)}>
    ${t('盟约禁用')} <span class="num">${counts.hardCore}/${counts.softCore}/${counts.addon}</span><//>
    <${Modal} open=${open} onClose=${close} title=${t('盟约禁用')} micro="OPENING RECRUITMENT FILTERS"
      class="ban-config-dialog" width="min(980px,calc(100vw - 24px))"
      actions=${html`<${Button} variant="secondary" data-testid="ban-config-close" onClick=${close}>${t('关闭')}<//>`}>
      <${BanPicker} room=${room} isHost=${isHost} busy=${busy} onPick=${onPick} />
    <//>`;
}

export function BanPicker({ room, isHost, busy, onPick }) {
  const loaded = useData('bonds', 'config');
  const mode = data.get('config')?.modes?.[modeIdFor(room.mode, room.difficulty)];
  const candidates = banCandidates(data.get('bonds'), mode?.inactiveBondIds);
  const limits = { core: candidates.core.length, addon: candidates.addon.length };
  const counts = normalizeBanConfig(room.banConfig, limits);
  const disabled = !loaded || !isHost || !!busy || room.inMatch;
  return html`<section class="ban-picker" data-testid="ban-picker" aria-label=${t('开局禁用配置')}>
    <div class="ban-picker__head">
      <div><h2>${t('开局禁用配置')}</h2><p>${t('只选择数量，具体盟约在开局随机抽取；硬禁与软禁不重复。')}</p></div>
      <button class="ban-picker__reset" disabled=${disabled} onClick=${() => onPick(normalizeBanConfig(DEFAULT_BAN_CONFIG, limits))}>${t('恢复默认')}</button>
    </div>
    <div class="ban-picker__cards">
      ${TYPES.map(({ key, title, hint, mark }) => {
        const max = key === 'addon' ? limits.addon : limits.core - counts[key === 'hardCore' ? 'softCore' : 'hardCore'];
        const set = n => onPick({ ...counts, [key]: n });
        return html`<article key=${key} class=${`ban-picker__card ban-picker__card--${key}`} data-ban-kind=${key}>
          <header><span class="ban-picker__mark" aria-hidden="true">${mark}</span><h3>${t(title)}</h3></header>
          <div class="ban-picker__stepper">
            <button disabled=${disabled || counts[key] === 0} aria-label=${t('减少{kind}', { kind: t(title) })} onClick=${() => set(counts[key] - 1)}>−</button>
            <output class="num" data-testid=${`ban-count-${key}`}>${counts[key]}</output>
            <button disabled=${disabled || counts[key] >= max} aria-label=${t('增加{kind}', { kind: t(title) })} onClick=${() => set(counts[key] + 1)}>+</button>
          </div>
          <input type="range" min="0" max=${max} step="1" value=${counts[key]} aria-label=${t(title)} disabled=${disabled}
            onChange=${e => set(Number(e.currentTarget.value))} />
          <p>${t(hint)}</p>
        </article>`;
      })}
    </div>
    <p class="ban-picker__note">${isHost ? t('修改后其他博士需要重新准备；开局后配置锁定。') : t('由创建者设置')}
      ${t('只有一个大盟约的干员，该盟约被软禁时也会移出卡池。')}</p>
  </section>`;
}
