import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button } from './components.js';
import { ChessCard } from './shopBar.js';
import { actions } from './gameActions.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';

export function RecruitmentPanel({ priv, editable, open, onClose, onDetail }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const r = priv?.recruitment, offer = r?.offer;
  const key = offer?.id || 'samples';
  useLayoutEffect(() => { setSelected(null); }, [key, open]);
  if (!r || !open || !editable) return null;
  const columbia = r.kind === 'columbia';
  const options = offer ? offer.ids.map((id, idx) => ({ id, key: idx })) : (r.samples || []).map(p => ({ id: p.id, key: p.uid }));
  const chosen = options.find(p => p.key === selected);
  const sampleId = offer?.sampleId || (!offer ? chosen?.id : null);
  const ifrit = sampleId && data.lookup('chess', sampleId)?.bonds?.includes('sarkazShip');
  // Temporarily hide the modal so the existing detail panel remains readable; keep the reserved offer.
  const detail = (id, kind) => { onClose(); onDetail(id, kind); };
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const close = () => run(async () => { if (!offer || await actions.recruitCancel(offer.id)) onClose(); });
  const confirm = () => run(async () => {
    if (offer && chosen) { if (await actions.recruitPick(offer.id, selected)) onClose(); }
    else if (columbia && chosen) await actions.recruitOpen(selected);
    else if (!columbia) await actions.recruitOpen();
  });
  return html`<${Modal} open=${true} title=${columbia ? t('研发调令') : t('归队信标')} class="recruitment-panel" width="min(10rem, 96vw)" onClose=${close}
    actions=${html`<${Button} disabled=${busy} onClick=${close}>${t('取消')}<//>
      <${Button} variant="primary" loading=${busy} disabled=${r.charges < 1 || ((offer || columbia) && !chosen)} onClick=${confirm}>
        ${offer ? t('确认选择') : columbia ? t('检索高一阶干员') : t('开始检索')}<//>`}>
    <p>${t('剩余次数：{count}；未使用次数可保留。', { count: r.charges })}</p>
    <p>${offer ? t('确认后消耗一次；取消保留次数与样本，再次检索不会重抽候选。') : columbia ? t('选择普通哥伦比亚样本，确认取得候选时消耗样本；装备退回整备区。') : t('优先检索未持有的萨卡兹，候选不超过当前调度中心等级。')}</p>
    ${ifrit ? html`<p class="recruitment-panel__warning">${t('伊芙利特同时属于萨卡兹：换走她可能使萨卡兹盟约失活。')}</p>` : null}
    ${columbia && !offer && !options.length ? html`<p>${t('暂无可用样本：需要低于调度中心等级的普通哥伦比亚干员。')}</p>` : null}
    ${offer?.sampleId ? html`<p>${t('将消耗：{name}', { name: data.lookup('chess', offer.sampleId)?.name || offer.sampleId })}</p>` : null}
    <div class="recruitment-panel__cards">
      ${options.map((p, i) => html`<div key=${p.key} class="recruitment-panel__option">
        <${ChessCard} slot=${{ kind: 'chess', id: p.id, price: 0 }} idx=${i} priv=${priv} free=${true} armed=${selected === p.key}
          onDetail=${detail} onTap=${() => { if (busy) return; if (selected === p.key) confirm(); else setSelected(p.key); }} />
        <button type="button" class="toolbtn" disabled=${busy} onClick=${() => detail(p.id, 'chess')}>${t('查看详情')}<//>
      </div>`)}
    </div>
  <//>`;
}
