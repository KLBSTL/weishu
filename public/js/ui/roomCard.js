import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, AvatarFrame, Tooltip, Modal, TextField } from './components.js';
import { Img } from './gameComponents.js';
import { chessAvatarUrl, chessPortraitUrl } from './assetUrls.js';
import { data, useData } from '../data.js';
import { roomAvatars } from '../../../shared/roomAvatar.js';
import { CUSTOM_ROOM_PORTRAITS, STANDBY_PORTRAITS, standbyPortraitUrl, standbyScene, isUploadedPortrait } from '../../../shared/standbyArt.js';
import { useStandby } from './standbyState.js';
import { PortraitUpload } from './portraitUpload.js';
import { t } from '../../../shared/i18n.js';

export function RoomCard({ seat, index, room, facts, myId, busy, onAddBot, onRemoveBot, onKick, onAvatar }) {
  useData('chess', 'assets');
  const standby = useStandby();
  const [picker, setPicker] = useState(false);
  const [botPicker, setBotPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const mine = seat?.playerId === myId;
  const host = !!seat && seat.playerId === room.hostId;
  const offline = seat?.connected === false && !seat?.isBot;
  const state = !seat ? 'empty' : offline ? 'offline' : seat.isBot || seat.ready ? 'ready' : host ? 'host' : 'waiting';
  const stateText = state === 'ready' ? t('已就绪') : state === 'host' ? t('房主待命') : state === 'offline' ? t('连接中断') : t('准备中');
  const glyph = state === 'ready' ? 'check' : state === 'host' ? 'crown' : state === 'offline' ? 'wifiOff' : 'hourglass';
  const roster = roomAvatars(data.get('chess'));
  const choices = [...standby.uploads.map((id, i) => ({ charId: id, name: t('本地卡面 {n}', { n: i + 1 }) })),
    ...roster, ...CUSTOM_ROOM_PORTRAITS.map(p => ({ charId: p.id, name: t(p.name), cosmetic: true }))];
  const rec = roster.find(r => r.charId === seat?.avatarId)
    || (seat?.isBot ? roster.find(r => r.name === seat.name.replace(/^AI[·\s]*/, '')) : null);
  const displayId = seat?.avatarId || (standby.cards === 'operator' && seat ? STANDBY_PORTRAITS[index % 4].id : rec?.charId);
  const display = STANDBY_PORTRAITS.find(p => p.id === displayId)
    || (isUploadedPortrait(displayId) ? { kind: 'poster', name: t('本地卡面'), frame: ['50% 50%', 1, '#17131d'] } : null);
  const full = standbyPortraitUrl(data.get('assets'), displayId);
  const scene = standbyScene(data.get('assets'), standby.scene);
  const frame = display?.frame || ['50% 18%', 1, '#3d4848'];
  const displayRec = rec || roster.find(r => r.charId === displayId);
  const smallPortrait = chessPortraitUrl(data.get('assets'), displayRec) || chessAvatarUrl(data.get('assets'), displayRec);
  const portrait = (standby.cards === 'operator' || display?.kind === 'poster' ? full : null)
    || chessPortraitUrl(data.get('assets'), rec) || chessAvatarUrl(data.get('assets'), rec);
  const head = chessAvatarUrl(data.get('assets'), rec);
  const editablePortrait = mine && Object.hasOwn(seat || {}, 'avatarId');
  const canInvite = room.mode !== 'solo' && facts.isHost && !busy && !room.inMatch;
  const deepSeekTaken = room.seats?.some(s => s?.deepSeek);
  const addBot = (deepSeek) => {
    setBotPicker(false);
    onAddBot(deepSeek);
  };
  const fallback = html`<${AvatarFrame} size="xl" name=${seat?.name || ''} seat=${index} bot=${seat?.isBot} self=${mine} />`;
  return html`<article class=${`seat doctor-card is-${state}${standby.cards === 'operator' ? ' doctor-card--operator' : ''}${display?.kind === 'poster' ? ' doctor-card--poster' : ''}${mine ? ' is-me' : ''}${host ? ' is-host' : ''}${seat?.isBot ? ' is-bot' : ''}${!seat ? ' seat--empty' : ''}`}
      style=${`--seat-i:${index};--card-focus:${frame[0]};--card-scale:${frame[1]};--card-tone:${frame[2]}`}>
    ${standby.cards === 'operator' && display?.kind !== 'poster' ? html`<div class="doctor-card__backdrop" aria-hidden="true">
      ${scene ? html`<div class="doctor-card__scene" style=${`--scene-ratio:${scene.ratio}`}>${[scene.left, scene.right].map(url => html`<img src=${url} alt="" loading="lazy" />`)}</div>` : null}
    </div>` : null}
    <span class="seat__filigree" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <div class="doctor-card__paper" aria-hidden="true"></div>
    <header class="seat__head">
      <span class="seat__no num">P${index + 1}</span><${MicroLabel}>${`SEAT ${String(index + 1).padStart(2, '0')}`}<//>
      ${host ? html`<span class="doctor-card__crown" title=${t('创建者')}><${Icon} name="crown" /></span>` : null}
      ${seat?.isBot ? html`<span class="doctor-card__identity">${seat.deepSeek ? 'DeepSeek' : 'AI'}</span>` : mine ? html`<span class="doctor-card__identity">${t('你')}</span>` : null}
    </header>
    <div class="doctor-card__portrait">
      <span class="doctor-card__sprig doctor-card__sprig--left" aria-hidden="true"></span>
      <span class="doctor-card__sprig doctor-card__sprig--right" aria-hidden="true"></span>
      ${!seat ? html`<button class="doctor-card__invite" disabled=${!canInvite}
          onClick=${() => room.deepSeekAvailable ? setBotPicker(true) : addBot(false)}
          aria-label=${t('添加 AI 队友')}><${Icon} name="plus" /><span>${t('添加 AI 队友')}</span></button>`
        : html`<button class="doctor-card__portrait-button" disabled=${!editablePortrait || !!busy || room.inMatch} data-testid=${mine ? 'room-avatar-open' : undefined}
            aria-label=${mine ? t('选择卡面肖像') : seat.name} onClick=${() => setPicker(true)} title=${mine ? t('选择卡面肖像') : undefined}>
          <picture class="doctor-card__picture">${!full ? html`<source media="(max-width:1100px)" srcSet=${head || undefined} />` : null}
            <${Img} src=${portrait} class="doctor-card__portrait-image" fallback=${full && smallPortrait ? html`<${Img} src=${smallPortrait} class="doctor-card__portrait-image" fallback=${fallback} />` : fallback} />
          </picture>
          ${editablePortrait ? html`<span class="doctor-card__edit"><${Icon} name="edit" /></span>` : null}
        </button>`}
    </div>
    <div class="doctor-card__signature">
      ${seat && (display || rec) ? html`<span class="doctor-card__character">${display ? t(display.name) : rec.name}</span>` : null}
      <span class="doctor-card__eyebrow">${!seat ? 'OPEN INVITATION' : seat.isBot ? 'AUTONOMOUS UNIT' : 'ALLIANCE DOCTOR'}</span>
      <strong class="seat__name">${seat?.name || t('等待博士加入')}</strong>
      <span class="doctor-card__rule" aria-hidden="true"></span>
    </div>
    <footer class="seat__foot">
      ${seat ? html`<div class=${`doctor-card__seal doctor-card__seal--${state}`} title=${stateText} aria-label=${stateText}>
        <span class="doctor-card__seal-symbol"><${Icon} name=${glyph} /></span>
        <span class="seat__state">${stateText}</span>
      </div>` : html`<span class="doctor-card__empty-note">${`P${index + 1} · ALLIANCE`}</span>`}
      ${seat && !mine && facts.isHost ? html`<${Tooltip} text=${seat.isBot ? t('移除该 AI 队友') : t('将该博士移出同盟')}>
        <${Button} variant="ghost" size="sm" square=${true} icon="close" class="doctor-card__remove" disabled=${!!busy}
          aria-label=${seat.isBot ? t('移除 AI 队友') : t('移出该博士')}
          onClick=${() => seat.isBot ? onRemoveBot(index) : onKick(index, seat.name, seat.playerId)} />
      <//>` : null}
    </footer>
  </article>
    <${Modal} open=${botPicker && !seat && canInvite} onClose=${() => setBotPicker(false)} title=${t('添加 AI 队友')} width="min(360px, calc(100vw - 24px))">
      <${Button} onClick=${() => addBot(false)}>${t('本地 AI')}<//>
      <${Button} disabled=${deepSeekTaken} onClick=${() => addBot(true)}>DeepSeek<//>
      ${deepSeekTaken ? html`<p>${t('房间已有一名 DeepSeek 队友。')}</p>` : null}
    <//>
    <${Modal} open=${picker} onClose=${() => setPicker(false)} title=${t('选择卡面肖像')} micro="DOCTOR PORTRAIT" width="min(740px,calc(100vw - 24px))" class="room-avatar-picker"
      actions=${html`<${Button} onClick=${async () => { if (await onAvatar(null)) setPicker(false); }}>${t('使用默认卡面')}<//>
        <${Button} onClick=${() => setPicker(false)}>${t('关闭')}<//>`}>
      <div class="appearance-portrait-tools"><${TextField} value=${query} onInput=${setQuery} placeholder=${t('搜索干员')} />
        <${PortraitUpload} disabled=${!!busy || !!room.inMatch} onBusy=${setUploading} onSelect=${async id => {
          const applied = await onAvatar(id); if (applied) setPicker(false); return applied;
        }} /></div>
      <div class="room-avatar-grid">${choices.filter(r => !query || r.name.toLowerCase().includes(query.toLowerCase())).map(r => html`<button type="button" key=${r.charId}
        data-avatar-id=${r.charId} aria-label=${r.name} aria-pressed=${seat?.avatarId === r.charId} disabled=${!!busy || uploading}
        onClick=${async () => { if (await onAvatar(r.charId)) setPicker(false); }}>
        <${Img} src=${standbyPortraitUrl(data.get('assets'), r.charId) || chessAvatarUrl(data.get('assets'), r)} fallback=${html`<span>${r.name[0]}</span>`} /><span>${r.name}</span>
      </button>`)}</div>
    <//>
  `;
}
