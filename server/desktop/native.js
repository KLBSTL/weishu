/* global strongholdPetConfig, PetSprite, sprites, S, BASE, document, window */
'use strict';

{
  const { origin, token } = strongholdPetConfig;
  const label = '卫戍聊天';
  const playingUrl = origin + '/playing.webm';
  let activeSprite = null;
  let activeMatch = null;
  let composer = null;
  let lastPhase = null;
  let lastAnswerId = null;
  let entryPending = false;
  let transition = null;
  let lastContact = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const poses = {
    enter: [{ opacity: .2, scale: .97 }, { opacity: 1, scale: 1 }],
    reply: [{ scale: 1 }, { scale: 1.028 }, { scale: 1 }],
    settle: [{ opacity: 1, scale: 1 }, { opacity: .86, scale: .985 }, { opacity: 1, scale: 1 }],
    leave: [{ opacity: 1, scale: 1 }, { opacity: .12, scale: .985 }],
  };

  function frontVideo(sprite) {
    return sprite.front === 0 ? sprite.videoA : sprite.videoB;
  }

  function cue(video, name) {
    if (motion.matches || !video?.animate) return null;
    transition?.cancel();
    transition = video.animate(poses[name], { duration: name === 'settle' ? 540 : 340, easing: 'ease-in-out',
      fill: name === 'leave' ? 'forwards' : 'none' });
    return transition;
  }

  const style = document.createElement('style');
  style.textContent = `
    .stronghold-pet-chat { position: fixed; z-index: 20; box-sizing: border-box; display: flex;
      flex-wrap: wrap; gap: 4px; margin: 0; padding: 5px; border: 1px solid #cbd7ed; border-radius: 9px;
      background: #fff9; color: #25334d; font: 12px system-ui, sans-serif; pointer-events: auto; }
    .stronghold-pet-chat input { flex: 1; min-width: 55px; padding: 3px; color: inherit; font: inherit;
      background: #fffe; border: 1px solid #bbc9e2; border-radius: 5px; }
    .stronghold-pet-chat button { padding: 2px 5px; color: inherit; font: inherit; cursor: pointer;
      background: #edf3ff; border: 1px solid #bbc9e2; border-radius: 5px; }
    .stronghold-pet-chat output { flex-basis: 100%; }
    .stronghold-pet-chat output:empty { display: none; }
  `;
  document.head.append(style);

  const cardFile = document.createElement('input');
  cardFile.type = 'file';
  cardFile.accept = '.json,.png,application/json,image/png';
  cardFile.hidden = true;
  cardFile.setAttribute('aria-label', '选择人设角色卡');
  document.body.append(cardFile);
  let personaSprite = null;
  let selectingPersona = false;
  let chatOptions = { mode: 'daily', maxChars: 60 };
  let lastOptionsRead = 0;

  async function refreshChatOptions() {
    if (Date.now() - lastOptionsRead < 5000) return;
    lastOptionsRead = Date.now();
    try {
      const response = await fetch(BASE + '/stronghold/chat-options', { signal: AbortSignal.timeout(2500) });
      if (response.ok) chatOptions = await response.json();
    } catch { /* keep the last known settings while the host reconnects */ }
  }

  async function saveOptions(sprite, patch) {
    try {
      const response = await fetch(BASE + '/stronghold/chat-options', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), signal: AbortSignal.timeout(5000) });
      if (response.status === 404) throw new Error('请用「启动桌宠.ps1」重启桌宠以加载对话模式。');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '对话设置保存失败');
      chatOptions = result;
      sprite.showWhisper(patch.maxChars ? `已保存 ${result.maxChars} 字上限，日常模式下生效。`
        : result.mode === 'daily' ? `日常模式：最多 ${result.maxChars} 字，不配图。`
        : '已切换到无限制模式。', undefined, undefined, 4000, false);
      return true;
    } catch (error) {
      sprite.showWhisper(error.message || '没连上桌宠服务，请稍后再试。', undefined, undefined, 5000, false);
      return false;
    }
  }

  function editMaxChars(sprite) {
    sprite.chatMount?.close();
    const form = document.createElement('form');
    form.className = 'dsh-pet-chat stronghold-pet-chat';
    form.setAttribute('aria-label', '设置回复字数');
    const label = document.createElement('label');
    label.textContent = '最多回复字数（1–2000）';
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.max = '2000'; input.step = '1'; input.required = true;
    input.value = String(chatOptions.maxChars);
    input.setAttribute('aria-label', '最多回复字数');
    const save = document.createElement('button'); save.type = 'submit'; save.textContent = '保存';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
    const close = () => {
      if (!form.isConnected) return;
      form.remove();
      if (sprite.chatMount?.el === form) { sprite.chatMount = null; sprite.chatOpen = false; }
      sprite.syncInputBusy(); sprite.syncInputRegions();
      if (!sprite.inputBusy()) sprite.setInteractive(false);
    };
    cancel.addEventListener('click', close);
    form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity() || save.disabled) return;
      save.disabled = true;
      if (await saveOptions(sprite, { maxChars: Number(input.value) })) close();
      else save.disabled = false;
    });
    form.addEventListener('focusin', () => window.petBridge?.requestKeyboardFocus());
    form.append(label, input, save, cancel);
    document.body.append(form);
    const bounds = sprite.visibleClampRect(), hit = sprite.hit.getBoundingClientRect();
    const width = Math.min(242, bounds.w - 8);
    form.style.width = width + 'px';
    form.style.left = Math.max(bounds.x + 4, Math.min(hit.left, bounds.x + bounds.w - width - 4)) + 'px';
    form.style.top = Math.max(bounds.y + 4, Math.min(hit.top - form.offsetHeight - 6,
      bounds.y + bounds.h - form.offsetHeight - 4)) + 'px';
    sprite.chatMount = { el: form, close }; sprite.chatOpen = true;
    sprite.syncInputBusy(); sprite.setInteractive(true); sprite.syncInputRegions();
    window.petBridge?.requestKeyboardFocus(); input.focus(); input.select();
  }

  async function selectPersona(sprite, body) {
    if (selectingPersona) return;
    selectingPersona = true;
    try {
      const response = await fetch(BASE + '/stronghold/persona', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      }).catch(() => {
        throw new Error('没连上桌宠服务，请重启桌宠后再试。');
      });
      if (response.status === 404) throw new Error('桌宠人设服务未加载，请用「启动桌宠.ps1」重启桌宠。');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || '人设切换失败');
      sprite.showWhisper(`人设已切换为「${result.name}」，下句话开始按这个人设聊天。`, undefined, undefined, 4500, false);
    } catch (error) {
      sprite.showWhisper(error.message || '人设切换失败，请稍后重试。', undefined, undefined, 5000, false);
    } finally {
      selectingPersona = false;
    }
  }

  cardFile.addEventListener('change', async () => {
    const file = cardFile.files[0];
    const sprite = personaSprite;
    cardFile.value = '';
    if (!file || !sprite || selectingPersona) return;
    if (file.size > 8 * 1024 * 1024) {
      sprite.showWhisper('请选择 8 MB 以内的角色卡。', undefined, undefined, 5000, false);
      return;
    }
    const reader = new window.FileReader();
    reader.onload = () => { void selectPersona(sprite, { file: String(reader.result).split(',')[1] }); };
    reader.onerror = () => sprite.showWhisper('角色卡读取失败，请重新选择。', undefined, undefined, 5000, false);
    reader.readAsDataURL(file);
  });

  function request(path, body) {
    return fetch(origin + path, {
      signal: AbortSignal.timeout(2500),
      headers: { Authorization: 'Bearer ' + token, 'X-Stronghold-Pet': sprites[0].pet.id,
        ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { method: 'POST', body: JSON.stringify(body) }),
    });
  }

  function place() {
    const frame = (activeSprite.stage || activeSprite.hit).getBoundingClientRect();
    const bounds = activeSprite.visibleClampRect();
    const width = Math.max(1, Math.min(242, bounds.w - 8));
    const x = frame.left + frame.width * .32 - width / 2;
    composer.style.width = width + 'px';
    composer.style.left = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.w - width - 4)) + 'px';
    const y = Math.max(bounds.y + 4, Math.min(frame.top - composer.offsetHeight - 6,
      bounds.y + bounds.h - composer.offsetHeight - 4));
    composer.style.top = y + 'px';
    if (activeSprite.bubble) {
      const bubbleBottom = activeSprite.el.getBoundingClientRect().top + activeSprite.size * .108;
      activeSprite.bubble.style.translate = `0 ${Math.min(0, y - bubbleBottom - 6)}px`;
    }
    activeSprite.syncInputRegions();
  }

  function mount() {
    const form = document.createElement('form');
    form.className = 'dsh-pet-chat stronghold-pet-chat';
    form.setAttribute('aria-label', '卫戍聊天');
    form.title = '问题和必要的局面摘要会发送给 DeepSeek';
    const input = document.createElement('input');
    input.placeholder = '和我聊聊卫戍…';
    input.setAttribute('aria-label', '和我聊聊卫戍');
    input.maxLength = 280;
    input.autocomplete = 'off';
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = '发送';
    const status = document.createElement('output');
    status.setAttribute('aria-live', 'polite');
    status.dataset.role = 'status';
    const ask = async (text, goal) => {
      if (!text || send.disabled) return;
      send.disabled = true;
      delete status.dataset.error;
      status.textContent = goal ? '' : '我看看这局。';
      try {
        const res = await request('/pet/ask', { matchId: activeMatch, text, goal });
        if (res.ok) { if (!goal) input.value = ''; }
        else {
          const result = await res.json();
          status.dataset.error = '1';
          status.textContent = result.error === 'RATE' ? '我还在想上一句，稍等一下。' : '这会儿没发出去，等一下再试。';
        }
      } catch {
        status.dataset.error = '1';
        status.textContent = '没连上卫戍，等一下再试。';
      } finally {
        send.disabled = false;
        if (composer === form) place();
      }
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      void ask(input.value.trim());
    });
    form.addEventListener('focusin', () => window.petBridge?.requestKeyboardFocus());
    input.addEventListener('pointerdown', () => window.petBridge?.requestKeyboardFocus());
    form.append(input, send);
    for (const [text, goal] of [['补对空', 'anti-air'], ['先保血', 'protect-lp']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.addEventListener('click', () => void ask(text, goal));
      form.append(button);
    }
    form.append(status);
    document.body.append(form);
    return form;
  }

  const { switchTo, playOnce, onMenuAction, onContextMenu } = PetSprite.prototype;
  PetSprite.prototype.onContextMenu = function (event) {
    void refreshChatOptions();
    const owner = `Stronghold Protocol (${this.pet.id})`;
    const labels = ['切换人设', '恢复默认人设', '日常模式', '无限制模式'];
    const removeDuplicates = items => items.flatMap(item => {
      if (item.action === 'third-party' && item.owner === owner && labels.includes(item.label)) return [];
      if (!item.children) return [item];
      const children = removeDuplicates(item.children);
      return children.length ? [{ ...item, children }] : [];
    });
    // Augment the upstream menu only while this sprite builds it, retaining its layout and input handling.
    const mountContextMenu = S.mountContextMenu;
    S.mountContextMenu = options => {
      const tree = removeDuplicates(options.tree);
      const afterChat = tree.findIndex(item => item.action === 'chat') + 1;
      tree.splice(afterChat, 0, ...labels.map(label => ({ label, action: 'third-party', owner,
        hint: (label === '日常模式' && chatOptions.mode === 'daily')
          || (label === '无限制模式' && chatOptions.mode === 'unlimited') ? '✓' : '' })),
      { label: '回复字数', children: [25, 60, 120].map(maxChars => ({ label: `${maxChars}字`,
        action: 'stronghold-max-chars', maxChars, hint: maxChars === chatOptions.maxChars ? '✓' : '' }))
        .concat([{ label: '自定义…', action: 'stronghold-max-chars' }]) });
      return mountContextMenu({ ...options, tree });
    };
    try {
      return onContextMenu.call(this, event);
    } finally {
      S.mountContextMenu = mountContextMenu;
    }
  };
  PetSprite.prototype.switchTo = function (name, once, playbackId, url) {
    if (this === activeSprite && url !== playingUrl) return;
    return switchTo.call(this, name, once, playbackId, url);
  };
  PetSprite.prototype.playOnce = function (name, playbackId, url) {
    if (this === activeSprite) return;
    return playOnce.call(this, name, playbackId, url);
  };
  PetSprite.prototype.onMenuAction = function (leaf, ...args) {
    if (!args[1] && leaf?.action === 'stronghold-max-chars') {
      this.closeMenu();
      if (leaf.maxChars) void saveOptions(this, { maxChars: leaf.maxChars });
      else editMaxChars(this);
      return;
    }
    if (!args[1] && leaf?.action === 'third-party' && leaf.owner === `Stronghold Protocol (${this.pet.id})`) {
      if (leaf.label === '日常模式' || leaf.label === '无限制模式') {
        this.closeMenu();
        void saveOptions(this, { mode: leaf.label === '日常模式' ? 'daily' : 'unlimited' });
        return;
      }
      if (leaf.label === '切换人设') {
        this.closeMenu();
        personaSprite = this;
        if (!selectingPersona) cardFile.click();
        return;
      }
      if (leaf.label === '恢复默认人设') {
        this.closeMenu();
        void selectPersona(this, { reset: true });
        return;
      }
    }
    if (this === activeSprite && !args[1] && (leaf?.action === 'chat'
      || (leaf?.action === 'third-party' && leaf.label === label && leaf.owner === `Stronghold Protocol (${this.pet.id})`))) {
      this.closeMenu();
      composer.querySelector('input').focus();
      return;
    }
    return onMenuAction.call(this, leaf, ...args);
  };

  function unmount(animate = false) {
    const sprite = activeSprite;
    if (!sprite) return;
    activeSprite = activeMatch = null;
    composer.remove();
    composer = null;
    if (sprite.bubble) sprite.bubble.style.translate = '';
    sprite.syncInputRegions();
    sprite.clearWhisper();
    const video = frontVideo(sprite);
    const exit = animate && !sprite.dragState?.active && video?.src === playingUrl ? cue(video, 'leave') : null;
    const idle = () => {
      if (activeSprite === sprite) return;
      if (sprite.animations.idle.length) sprite.playOnce(S.pick(sprite.animations.idle, sprite.anim));
    };
    if (exit) {
      void exit.finished.then(idle, () => {});
    } else {
      idle();
    }
  }

  async function poll() {
    try {
      void refreshChatOptions();
      if (!sprites.length) {
        unmount();
        return;
      }
      const res = await request('/pet/status');
      if (!res.ok) throw new Error('status');
      const state = await res.json();
      lastContact = Date.now();
      const sprite = state.active ? sprites.find(s => s.pet.id === state.pet) : null;
      if (activeSprite !== sprite || activeMatch !== state.matchId) unmount(!sprite);
      if (sprite && !activeSprite) {
        sprite.chatMount?.close();
        sprite.stopMove();
        activeSprite = sprite;
        activeMatch = state.matchId;
        composer = mount();
        lastPhase = state.phase;
        lastAnswerId = state.lastAnswerId;
        entryPending = true;
        transition?.cancel();
      }
      if (activeSprite) {
        const sprite = activeSprite;
        const video = frontVideo(sprite);
        if (video?.src !== playingUrl && sprite.pending?.anim !== playingUrl) {
          sprite.anim = playingUrl;
          sprite.once = false;
          sprite.facing = 'left';
          sprite.switchTo(playingUrl, false, null, playingUrl);
        } else if (video?.src === playingUrl && video.paused && video.readyState >= 2) {
          void video.play().catch(() => {});
        }
        if (video?.src === playingUrl && video.readyState >= 2 && !sprite.dragState?.active) {
          if (entryPending) { cue(video, 'enter'); entryPending = false; }
          else if (state.lastAnswerId && state.lastAnswerId !== lastAnswerId) cue(video, 'reply');
          else if (state.phase !== lastPhase && ['SETTLE', 'FINAL_ASSAULT', 'HIDDEN_CORE'].includes(state.phase)) cue(video, 'settle');
        }
        lastPhase = state.phase;
        lastAnswerId = state.lastAnswerId;
        const notice = composer.querySelector('[data-role="status"]');
        if (!notice.dataset.error && !composer.querySelector('button[type="submit"]').disabled) {
          notice.textContent = state.pending ? '我看看这局。' : '';
        }
        place();
      }
    } catch {
      if (Date.now() - lastContact > 4000) unmount();
    } finally {
      setTimeout(poll, 750);
    }
  }
  void poll();
}
