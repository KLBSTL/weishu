import { useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, TextField } from './components.js';
import { Img } from './gameComponents.js';
import { data, useData } from '../data.js';
import { net } from '../net.js';
import { store, useStore } from '../store.js';
import { toastError } from './toasts.js';
import { chessAvatarUrl } from './assetUrls.js';
import { ArtThemePicker, updateSettings, useSettings } from './settings.js';
import { appearanceDialog, useStandby, updateStandby, rememberRoomPortrait } from './standbyState.js';
import { PortraitUpload } from './portraitUpload.js';
import { roomAvatars } from '../../../shared/roomAvatar.js';
import { STANDBY_SCENES, STANDBY_PORTRAITS, DEFAULT_STANDBY, standbyScene, standbyPortraitUrl } from '../../../shared/standbyArt.js';
import { t } from '../../../shared/i18n.js';

export function AppearanceHost() {
  const open = useStore(s => s.open, Object.is, appearanceDialog);
  return open ? html`<${AppearancePanel} />` : null;
}

function AppearancePanel() {
  useData('assets', 'chess');
  const s = useStandby();
  const settings = useSettings();
  const room = useStore(s => s.room);
  const [tab, setTab] = useState('scene');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const manifest = data.get('assets');
  const roster = roomAvatars(data.get('chess'));
  const choices = [...s.uploads.map((id, index) => ({ id, name: t('本地卡面 {n}', { n: index + 1 }), kind: 'upload' })),
    ...STANDBY_PORTRAITS, ...roster.filter(r => !STANDBY_PORTRAITS.some(p => p.id === r.charId)).map(r => ({ id: r.charId, name: r.name, kind: 'portrait' }))];
  const close = () => appearanceDialog.set({ open: false });
  const selectPortrait = async id => {
    if (pending.current || room?.inMatch) return false;
    pending.current = true; setBusy(true);
    try {
      const current = store.get();
      if (current.room?.seats?.some(seat => seat?.playerId === current.me?.playerId)) await net.request('room.avatar', { avatarId: id });
      rememberRoomPortrait(id);
      return true;
    } catch (error) { toastError(error); return false; }
    finally { pending.current = false; setBusy(false); }
  };
  const reset = async () => {
    if (!await selectPortrait(null)) return;
    updateStandby(DEFAULT_STANDBY);
    updateSettings({ artUiEnabled: false, artUiTheme: 'inkSeal' });
  };
  const tabs = [['scene', t('待机场景')], ['cards', t('玩家卡面')], ['theme', t('艺术主题')]];
  const onTabKey = event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const current = tabs.findIndex(([id]) => id === tab);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : step ? (current + step + tabs.length) % tabs.length : null;
    if (index == null) return;
    event.preventDefault(); setTab(tabs[index][0]);
    event.currentTarget.querySelector(`#appearance-tab-${tabs[index][0]}`)?.focus();
  };
  return html`<${Modal} open=${true} title=${t('外观调整')} micro="APPEARANCE STUDIO" width="min(1040px,calc(100vw - 24px))" class="appearance-dialog" onClose=${close}
      actions=${html`<${Button} disabled=${busy || !!room?.inMatch} onClick=${reset}>${t('恢复默认外观')}<//><${Button} variant="primary" onClick=${close}>${t('完成')}<//>`}>
    <p class="appearance-note">${t('即时保存到本机；玩家卡面会同步给同盟队友。')}</p>
    <nav class="appearance-tabs" role="tablist" aria-label=${t('外观分类')} onKeyDown=${onTabKey}>
      ${tabs.map(([id, name]) => html`<button type="button" role="tab" id=${`appearance-tab-${id}`} aria-controls="appearance-panel" aria-selected=${tab === id ? 'true' : 'false'} tabIndex=${tab === id ? 0 : -1} onClick=${() => setTab(id)}>${name}</button>`)}
    </nav>
    <div id="appearance-panel" class="appearance-panel" role="tabpanel" aria-labelledby=${`appearance-tab-${tab}`}>
      ${tab === 'scene' ? html`
        <h3>${t('待机场景')}</h3>
        <div class="appearance-scenes" role="group" aria-label=${t('待机场景')}>${STANDBY_SCENES.map(entry => {
          const scene = standbyScene(manifest, entry.id);
          return html`<button type="button" class=${s.scene === entry.id ? 'is-selected' : ''} aria-pressed=${s.scene === entry.id} disabled=${entry.id !== 'none' && !scene} onClick=${() => updateStandby({ scene: entry.id })}>
            <span class="appearance-scene-thumb">${scene ? [scene.left, scene.right].map(url => html`<img src=${url} alt="" loading="lazy" />`) : html`<span>ORIGINAL</span>`}</span><strong>${t(entry.name)}</strong>
          </button>`;
        })}</div>
        <label class="appearance-range"><span>${t('背景遮罩')} <output>${Math.round(s.dim * 100)}%</output></span>
          <input type="range" aria-label=${t('背景遮罩')} min="15" max="80" step="5" value=${Math.round(s.dim * 100)} onInput=${event => updateStandby({ dim: Number(event.currentTarget.value) / 100 })} /></label>
        <h3>${t('大厅展示图')}</h3>
        <div class="appearance-gallery" role="group" aria-label=${t('大厅展示图')}>
          <button type="button" class=${s.assistant === 'none' ? 'is-selected' : ''} aria-pressed=${s.assistant === 'none'} onClick=${() => updateStandby({ assistant: 'none' })}><span class="appearance-empty">—</span><strong>${t('不展示')}</strong></button>
          ${STANDBY_PORTRAITS.map(p => html`<button type="button" class=${s.assistant === p.id ? 'is-selected' : ''} aria-pressed=${s.assistant === p.id} disabled=${!standbyPortraitUrl(manifest, p.id)} onClick=${() => updateStandby({ assistant: p.id })}>
            <${Img} src=${standbyPortraitUrl(manifest, p.id)} /><strong>${t(p.name)}</strong></button>`)}
        </div>` : null}
      ${tab === 'cards' ? html`
        <div class="appearance-card-style" role="group" aria-label=${t('卡片样式')}>
          <span>${t('卡片样式')}</span>${[['operator', t('立绘卡片')], ['classic', t('经典卡片')]].map(([id, name]) => html`<button type="button" aria-pressed=${s.cards === id} onClick=${() => updateStandby({ cards: id })}>${name}</button>`)}
        </div>
        <h3>${t('我的玩家卡面')}</h3>
        <p class="appearance-note">${t('卡面只改变外观，不改变玩家昵称或战斗阵容。')}</p>
        <div class="appearance-upload"><${PortraitUpload} disabled=${busy || !!room?.inMatch} onSelect=${selectPortrait} onBusy=${setBusy} />
          <p class="appearance-note">${t('支持 PNG、JPG、WebP，最大 20 MiB；上传后同盟队友可见。')}</p>
          <p class="appearance-note">${t('本机保留最近 8 张上传卡面供重选，建议使用 2:3 竖图。')}</p></div>
        ${room?.inMatch ? html`<p role="status">${t('模拟进行中，结束后可更换卡面。')}</p>` : null}
        <div class="appearance-portrait-tools"><${TextField} value=${query} onInput=${setQuery} placeholder=${t('搜索干员')} />
          <${Button} disabled=${busy || !!room?.inMatch} onClick=${() => selectPortrait(null)}>${t('使用默认卡面')}<//></div>
        <div class="appearance-portraits" role="group" aria-label=${t('我的玩家卡面')}>${choices.filter(p => !query || t(p.name).toLowerCase().includes(query.toLowerCase())).map(p => {
          const rec = roster.find(r => r.charId === p.id);
          const url = standbyPortraitUrl(manifest, p.id) || chessAvatarUrl(manifest, rec);
          return html`<button type="button" class=${s.portrait === p.id ? 'is-selected' : ''} aria-pressed=${s.portrait === p.id} data-portrait-id=${p.id} disabled=${busy || !!room?.inMatch || !url} onClick=${() => selectPortrait(p.id)}>
            <${Img} src=${url} /><strong>${['portrait', 'upload'].includes(p.kind) ? p.name : t(p.name)}</strong>${p.kind === 'poster' ? html`<small>${t('用户提供')}</small>` : null}</button>`;
        })}</div>` : null}
      ${tab === 'theme' ? html`<${ArtThemePicker} settings=${settings} />` : null}
    </div>
  <//>`;
}
