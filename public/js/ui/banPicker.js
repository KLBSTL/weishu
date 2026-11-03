import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { BondGlyph } from './gameComponents.js';
import { data, useData } from '../data.js';
import { modeIdFor } from '../../../shared/constants.js';
import { banCandidates, normalizeBanConfig, DEFAULT_BAN_CONFIG } from '../../../shared/banConfig.js';
import { t, N_ } from '../../../shared/i18n.js';
import { ArtButton } from './settings.js';

const TYPES = [
  { key: 'hardCore', ids: 'hardCoreIds', title: N_('大盟约硬禁'), hint: N_('拥有该大盟约的干员全部移出卡池'), mark: '×' },
  { key: 'softCore', ids: 'softCoreIds', title: N_('大盟约软禁'), hint: N_('大盟约及所有小盟约都被禁用，才移出卡池'), mark: '◇' },
  { key: 'addon', ids: 'addonIds', title: N_('小盟约禁用'), hint: N_('配合软禁筛选，不单独移除干员'), mark: '◈' },
];

export function BanConfigButton({ room, isHost, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const counts = room.banConfig || DEFAULT_BAN_CONFIG;
  const close = () => setOpen(false);
  return html`<${ArtButton} art="bans" variant="secondary" size="lg" class="room-bans" data-testid="ban-config-open" onClick=${() => setOpen(true)}
    badge=${html`<span class="num">${counts.hardCore}/${counts.softCore}/${counts.addon}</span>`}>
    ${t('盟约禁用')}<//>
    <${Modal} open=${open} onClose=${close} title=${t('盟约禁用')} micro="OPENING RECRUITMENT FILTERS"
      class="ban-config-dialog" width="min(980px,calc(100vw - 24px))"
      actions=${html`<${Button} variant="secondary" data-testid="ban-config-close" onClick=${close}>${t('关闭')}<//>`}>
      <${BanPicker} room=${room} isHost=${isHost} busy=${busy} onPick=${onPick} />
    <//>`;
}

export function BanPicker({ room, isHost, busy, onPick }) {
  const loaded = useData('bonds', 'config', 'assets');
  const [query, setQuery] = useState('');
  const mode = data.get('config')?.modes?.[modeIdFor(room.mode, room.difficulty)];
  const candidates = banCandidates(data.get('bonds'), mode?.inactiveBondIds);
  const limits = { core: candidates.core.length, addon: candidates.addon.length };
  const counts = normalizeBanConfig(room.banConfig, limits, candidates);
  const manual = counts.mode === 'manual';
  const disabled = !loaded || !isHost || !!busy || room.inMatch;
  const chooseMode = manualMode => {
    if (manualMode === manual) return;
    onPick(manualMode
      ? { hardCore: 0, softCore: 0, addon: 0, mode: 'manual', hardCoreIds: [], softCoreIds: [], addonIds: [] }
      : { hardCore: counts.hardCore, softCore: counts.softCore, addon: counts.addon });
  };
  const toggle = (field, id) => {
    const selected = counts[field] || [];
    const next = { ...counts, [field]: selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] };
    // Moving a core to another category is one atomic edit, never an overlapping pair of requests.
    if (field !== 'addonIds' && !selected.includes(id)) {
      const other = field === 'hardCoreIds' ? 'softCoreIds' : 'hardCoreIds';
      next[other] = (counts[other] || []).filter(value => value !== id);
    }
    onPick(normalizeBanConfig(next, limits, candidates));
  };
  const term = query.trim().toLocaleLowerCase();
  return html`<section class="ban-picker" data-testid="ban-picker" aria-label=${t('开局禁用配置')}>
    <div class="ban-picker__head">
      <div><h2>${t('开局禁用配置')}</h2><p>${t('按数量随机抽取，或直接指定三个分类的盟约名单。')}</p></div>
      <button class="ban-picker__reset" disabled=${disabled} onClick=${() => onPick(normalizeBanConfig(DEFAULT_BAN_CONFIG, limits))}>${t('恢复默认')}</button>
    </div>
    <div class="ban-picker__modes" role="group" aria-label=${t('禁用方式')}>
      <button type="button" data-testid="ban-mode-random" aria-pressed=${!manual} disabled=${disabled} onClick=${() => chooseMode(false)}>${t('随机禁用')}</button>
      <button type="button" data-testid="ban-mode-manual" aria-pressed=${manual} disabled=${disabled} onClick=${() => chooseMode(true)}>${t('指定禁用')}</button>
    </div>
    ${manual ? html`<div class="ban-picker__tools">
      <input type="search" class="ban-picker__search" aria-label=${t('搜索盟约')} placeholder=${t('搜索盟约')} value=${query} disabled=${!loaded || !isHost} onInput=${event => setQuery(event.currentTarget.value)} />
      <${Button} size="sm" disabled=${disabled || counts.hardCore + counts.softCore + counts.addon === 0}
        onClick=${() => onPick({ hardCore: 0, softCore: 0, addon: 0, mode: 'manual', hardCoreIds: [], softCoreIds: [], addonIds: [] })}>${t('清空指定')}<//>
    </div><p>${t('指定名单不会随机补齐；同一大盟约不能同时硬禁和软禁。')}</p>`
      : html`<p>${t('只选择数量，具体盟约在开局随机抽取；硬禁与软禁不重复。')}</p>`}
    <div class="ban-picker__cards">
      ${TYPES.map(({ key, ids, title, hint, mark }) => {
        const max = key === 'addon' ? limits.addon : limits.core - counts[key === 'hardCore' ? 'softCore' : 'hardCore'];
        const set = n => onPick({ ...counts, [key]: n });
        return html`<article key=${key} class=${`ban-picker__card ban-picker__card--${key}`} data-ban-kind=${key}>
          <header><span class="ban-picker__mark" aria-hidden="true">${mark}</span><h3>${t(title)}</h3></header>
          ${manual ? html`<p class="ban-picker__selected-count">${t('已指定 {n} 个', { n: counts[key] })}</p>
            <div class="ban-picker__choices" role="group" aria-label=${t(title)}>
              ${(key === 'addon' ? candidates.addon : candidates.core).map(id => data.lookup('bonds', id)).filter(Boolean)
                .filter(bond => !term || `${bond.name} ${bond.bondId}`.toLocaleLowerCase().includes(term))
                .map(bond => {
                  const selected = (counts[ids] || []).includes(bond.bondId);
                  return html`<button key=${bond.bondId} type="button" class="ban-picker__choice" data-ban-id=${bond.bondId}
                    aria-label=${`${t(title)}：${bond.name}`} aria-pressed=${selected} disabled=${disabled}
                    onClick=${() => toggle(ids, bond.bondId)}><span class="ban-picker__tick" aria-hidden="true">${selected ? '✓' : ''}</span>
                    <${BondGlyph} bondId=${bond.bondId} /><span>${bond.name}</span></button>`;
                })}
            </div>
            ${counts[key] === 0 ? html`<p class="ban-picker__empty">${t('本类未指定盟约')}</p>` : null}`
            : html`<div class="ban-picker__stepper">
            <button disabled=${disabled || counts[key] === 0} aria-label=${t('减少{kind}', { kind: t(title) })} onClick=${() => set(counts[key] - 1)}>−</button>
            <output class="num" data-testid=${`ban-count-${key}`}>${counts[key]}</output>
            <button disabled=${disabled || counts[key] >= max} aria-label=${t('增加{kind}', { kind: t(title) })} onClick=${() => set(counts[key] + 1)}>+</button>
          </div>
          <input type="range" min="0" max=${max} step="1" value=${counts[key]} aria-label=${t(title)} disabled=${disabled}
            onChange=${e => set(Number(e.currentTarget.value))} />`}
          <p>${t(hint)}</p>
        </article>`;
      })}
    </div>
    <p class="ban-picker__note">${isHost ? t('修改后其他博士需要重新准备；开局后配置锁定。') : t('由创建者设置')}
      ${t('只有一个大盟约的干员，该盟约被软禁时也会移出卡池。')}
      ${t('仅含小盟约的干员，在所有小盟约被禁用时移出卡池。')}</p>
  </section>`;
}
