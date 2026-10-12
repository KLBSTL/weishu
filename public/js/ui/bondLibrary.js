import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { BondGlyph, RichText, UnitThumb } from './gameComponents.js';
import { ChessDetail } from './detailPanel.js';
import { data, useData } from '../data.js';
import { t } from '../../../shared/i18n.js';

export function libraryMembers(bond, chess) {
  const seen = new Set();
  return (bond?.visibleMembers || bond?.members || []).map(id => chess?.[id]).filter(rec => {
    if (!rec?.visible || rec.isGolden || seen.has(rec.charId)) return false;
    seen.add(rec.charId); return true;
  });
}
export function BondLibraryButton({ class: cls = '', size = 'sm' }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('columbiaShip');
  const [member, setMember] = useState(null);
  const ready = useData('bonds', 'chess', 'assets', 'garrisons', 'effects', 'backups');
  useEffect(() => { if (open) for (const name of ['bonds', 'chess', 'assets', 'garrisons', 'effects', 'backups']) data.load(name); }, [open]);
  const bonds = data.list('bonds').slice().sort((a, b) => Number(b.isCore) - Number(a.isCore) || a.identifier - b.identifier);
  const bond = data.lookup('bonds', selected) || bonds[0];
  const rec = member && data.lookup('chess', member);
  const close = () => { setOpen(false); setMember(null); };
  return html`<${Button} class=${cls} size=${size} variant="secondary" icon="info" data-testid="bond-library-open" onClick=${() => setOpen(true)}>${t('盟约图鉴')}<//>
    <${Modal} open=${open} title=${t('盟约图鉴')} micro="BOND LIBRARY" width="min(980px,calc(100vw - 24px))" class="bond-library" onClose=${close}
      actions=${html`<${Button} onClick=${close}>${t('关闭')}<//>`}>
      ${!ready ? html`<p role="status">${t('正在读取数据…')}</p>` : html`<div class="bond-library-grid">
        <nav aria-label=${t('盟约列表')}>${bonds.map(item => html`<button key=${item.bondId} type="button" class=${selected === item.bondId ? 'is-on' : ''}
          aria-pressed=${selected === item.bondId} onClick=${() => { setSelected(item.bondId); setMember(null); }}><${BondGlyph} bondId=${item.bondId} /><span>${item.name}</span></button>`)}</nav>
        <article data-testid="bond-library-detail">${rec ? html`<${Button} size="sm" variant="ghost" icon="chevronLeft" onClick=${() => setMember(null)}>${t('返回盟约')}<//>
          <${ChessDetail} chess=${rec} bonds=${[]} onBond=${id => { setSelected(id); setMember(null); }} />`
        : bond ? html`<h3><${BondGlyph} bondId=${bond.bondId} />${bond.name}</h3>
          <p>${t('激活人数')}：${(bond.thresholds || []).join(' / ')}${bond.maxCount != null ? t('名及以下') : t('名')}</p>
          <${RichText} as="div" text=${bond.descRaw || bond.desc} class="bond-library-effect" />
          <h4>${t('成员')}</h4><div class="bond-library-members">${libraryMembers(bond, data.get('chess')).map(item => html`<button key=${item.chessId} type="button" onClick=${() => setMember(item.chessId)}>
            <${UnitThumb} kind="chess" id=${item.chessId} size="sm" /><span>${item.name}</span><small>${t('{tier} 本', { tier: item.tier })}</small></button>`)}</div>` : null}
        </article></div>`}
    <//>`;
}
