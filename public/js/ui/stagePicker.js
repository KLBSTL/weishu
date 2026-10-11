import { html } from './components.js';
import { data, useData } from '../data.js';
import { modeIdFor } from '../../../shared/constants.js';
import { selectableStages } from '../../../shared/stages.js';
import { t, N_ } from '../../../shared/i18n.js';

const LABELS = { h: N_('高台'), v: N_('活性源石'), q: N_('医疗符文'), i: N_('活性源石'),
  S: N_('敌方入口'), E: N_('保护目标'), I: N_('传送入口'), O: N_('传送出口') };
const MARKS = { h: '▰', v: '◆', q: '+', i: '◆', S: '◀', E: '◎', I: '▼', O: '▲' };

export function StagePicker({ room, isHost, busy, onPick }) {
  const loaded = useData('config', 'stages');
  const stages = selectableStages({ config: data.get('config'), stages: data.get('stages') }, modeIdFor(room.mode, room.difficulty));
  const selected = stages.find(s => s.id === room.stageId);
  const rows = selected?.rows?.slice(9, 13).reverse() || [];
  return html`<section class="stage-picker" aria-label=${t('战场选择')}>
    <div class="stage-picker__copy">
      <label for="room-stage">${t('战场选择')}</label>
      <select id="room-stage" value=${room.stageId || ''} disabled=${!isHost || !!busy || !loaded || room.inMatch}
        onChange=${e => onPick(e.currentTarget.value || null)}>
        <option value="">${t('随机地图（沿用当前难度地图池）')}</option>
        ${stages.map(s => html`<option key=${s.id} value=${s.id}>${s.manualOnly ? t('中继试验场·双廊') : s.name}</option>`)}
      </select>
      <p>${t('本局地图固定；联机由房主选择，修改后需要重新准备。')}</p>
      ${selected?.manualOnly ? html`<p>${t('双路折返；两个医疗符文，一个源石高台和一个源石地面。首领战使用对称阵地。')}</p>` : null}
    </div>
    ${selected ? html`<figure class="stage-picker__preview">
      <div class="stage-picker__grid" role="img" aria-label=${t('普通战场预览')}>
        ${rows.flatMap((row, i) => [...row.slice(2, 11)].map((g, j) => html`<span key=${`${i}-${j}`}
          class=${`stage-picker__tile stage-picker__tile--${g === '#' || g === 'X' ? 'void' : g}`}
          title=${`${String.fromCharCode(65 + j)}${4 - i} · ${LABELS[g] ? t(LABELS[g]) : t('地面')}`}>${MARKS[g] || ''}</span>`))}
      </div>
      <figcaption>${t('高台')} ▰ · ${t('医疗符文')} + · ${t('活性源石')} ◆</figcaption>
    </figure>` : null}
  </section>`;
}
