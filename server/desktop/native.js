/* global strongholdPetConfig, PetSprite, sprites, S, BASE, document, window, VIEW, WORK_AREAS */
'use strict';

{
  const { origin, token } = strongholdPetConfig;
  const label = '卫戍聊天';
  const gamePlayingUrl = origin + '/playing.webm';
  const playingUrl = gamePlayingUrl;
  let dailyRoleplay = false;
  let roleplayPet = null;
  let dailyRequest = null;
  try {
    roleplayPet = window.localStorage?.getItem('ark-roleplay-pet') || window.localStorage?.getItem('ark-playing-preview-pet') || null;
    if (roleplayPet) window.localStorage?.setItem('ark-roleplay-pet', roleplayPet);
    window.localStorage?.removeItem('ark-playing-preview-pet');
  } catch { /* session-only fallback */ }
  let activeSprite = null;
  let activeMatch = null;
  let panelRound = null, lastPanelReport = '';
  let composer = null;
  const openedComposers = new Set();
  let latestSources = [];
  let activeRequestId = null;
  let shownErrorId = null;
  let lastPhase = null;
  let lastAnswerId = null;
  let entryPending = false;
  let transition = null;
  let lastContact = 0;
  let lastInteraction = Date.now();
  let bubbleUntil = 0;
  let automaticBubble = false;
  let idleController = null;
  let speechSerial = 0;
  let idleRetryAt = 0;
  const docked = new WeakSet();
  let lastGroupDelivery = null;
  let lastIdleDelivery = null;
  const chatDeliveries = new Map(), shownChat = new Map();
  function acknowledgeChat(pet, item) {
    if (item && Date.now() - item.started > 180000) { chatDeliveries.delete(pet); return; }
    const shown = shownChat.get(pet);
    if (!item || !shown || shown.text !== item.text || shown.at < item.started || item.acknowledging) return;
    item.acknowledging = true;
    void fetch(BASE + '/stronghold/library', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack-chat', pet, deliveryId: item.id }) }).then(r => r.json()).then(result => {
      if (typeof result.ok === 'boolean' && chatDeliveries.get(pet) === item) chatDeliveries.delete(pet);
    }).catch(() => {}).finally(() => { item.acknowledging = false; });
  }
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const started = Date.now(), response = await originalFetch.apply(this, args);
      try {
        const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url, window.location.href);
        if (/\/chat$/u.test(url.pathname) && response.ok) {
          const reply = await response.clone().json(), pet = url.searchParams.get('pet') || 'main';
          if (reply.deliveryId && typeof reply.text === 'string') {
            const item = { id: reply.deliveryId, text: reply.text, started }; chatDeliveries.set(pet, item); acknowledgeChat(pet, item);
          }
        }
      } catch { /* Leave unrelated/native responses intact. */ }
      return response;
    };
  }
  let groupPollAt = 0;
  let groupSpeaking = false;
  let groupPollBusy = false;
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
    .stronghold-game-composer { display: grid; grid-template-columns: minmax(0, 1fr); }
    .stronghold-game-composer > input { box-sizing: border-box; width: 100%; min-width: 0; }
    .stronghold-game-composer[hidden] { display: none !important; }
    .stronghold-game-composer [hidden] { display: none !important; }
    .stronghold-game-composer > input { padding-right: 29px; }
    .stronghold-game-composer > .stronghold-composer-close { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; padding: 0; line-height: 20px; }
    .stronghold-pet-actions { display: flex; gap: 4px; width: 100%; }
    .stronghold-pet-actions button { flex: 1; min-width: 0; white-space: nowrap; }
  `;
  document.head.append(style);

  const cardFile = document.createElement('input');
  const dailyControls = new window.MutationObserver(() => {
    for (const dialog of document.querySelectorAll('.dsh-pet-chat:not(.stronghold-pet-chat)')) {
      if (!dialog.querySelector('.dsh-pet-chat-input') || dialog.querySelector('[data-role="stronghold-cancel"]')) continue;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '取消回复';
      button.dataset.role = 'stronghold-cancel';
      button.addEventListener('click', () => {
        void fetch(BASE + '/stronghold/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .catch(() => { button.textContent = '暂未连接'; });
      });
      dialog.append(button);
    }
  });
  dailyControls.observe(document.body, { childList: true, subtree: true });
  cardFile.type = 'file';
  cardFile.accept = '.json,.png,application/json,image/png';
  cardFile.hidden = true;
  cardFile.setAttribute('aria-label', '选择人设角色卡');
  document.body.append(cardFile);
  let personaSprite = null;
  let selectingPersona = false;
  let chatOptions = { mode: 'daily', maxChars: 60, effort: 'low', proactive: true, idleSeconds: 30, bubbleSeconds: 20 };
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
    if (patch.proactive === false && !idleController?.foreground) activity(true);
    try {
      const response = await fetch(BASE + '/stronghold/chat-options', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch), signal: AbortSignal.timeout(5000) });
      if (response.status === 404) throw new Error('请用「启动桌宠.ps1」重启桌宠以加载对话模式。');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '对话设置保存失败');
      chatOptions = result;
      const effortNames = { low: '低', medium: '中', high: '高' };
      sprite.showWhisper(patch.effort ? `请求强度：${effortNames[result.effort]}。${result.effort === 'low' ? '快速回答，争取 10 秒内完成。' : '下次对话生效。'}`
        : patch.proactive !== undefined ? (result.proactive ? '已开启空闲主动聊天。' : '已关闭空闲主动聊天。')
        : patch.idleSeconds ? `安静 ${result.idleSeconds} 秒后开始碎碎念。`
        : patch.bubbleSeconds ? `回答气泡保留 ${result.bubbleSeconds} 秒。`
        : patch.maxChars ? `已保存 ${result.maxChars} 字上限，日常模式下生效。`
        : result.mode === 'daily' ? `日常模式：最多 ${result.maxChars} 字，不配图。`
        : '已切换到无限制模式。', undefined, undefined, 4000, false);
      return true;
    } catch (error) {
      sprite.showWhisper(error.message || '没连上桌宠服务，请稍后再试。', undefined, undefined, 5000, false);
      return false;
    }
  }

  async function clearHistory(sprite) {
    const request = async (action, values = {}) => {
      const response = await fetch(BASE + '/stronghold/library', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pet: sprite.pet.id, ...values }), signal: AbortSignal.timeout(15000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '清空未完成，请重试。'); return result;
    };
    try {
      const preview = await request('clear-history-preview');
      sprite.chatMount?.close();
      const form = document.createElement('form');
      form.className = 'dsh-pet-chat stronghold-pet-control'; form.setAttribute('role', 'dialog'); form.setAttribute('aria-label', '确认清空记忆和历史记录');
      const message = document.createElement('p'); message.textContent = `清空「${preview.name}」的全部记忆和历史记录？删除后无法恢复，角色卡和世界书会保留。`;
      const confirm = document.createElement('button'); confirm.type = 'submit'; confirm.textContent = '确认清空';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
      const close = () => { form.remove(); if (sprite.chatMount?.el === form) { sprite.chatMount = null; sprite.chatOpen = false; } sprite.syncInputBusy(); sprite.syncInputRegions(); if (!sprite.inputBusy()) sprite.setInteractive(false); };
      cancel.onclick = close;
      form.addEventListener('focusin', () => window.petBridge?.requestKeyboardFocus());
      form.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
      form.onsubmit = async e => {
        e.preventDefault(); if (confirm.disabled) return; confirm.disabled = true;
        try {
          activity(true); if (activeSprite === sprite) dailyRequest?.abort();
          await request('clear-history', { confirmation: preview.confirmation });
          chatDeliveries.delete(sprite.pet.id); shownChat.delete(sprite.pet.id);
          close(); sprite.showWhisper('记忆和历史记录已清空。', undefined, undefined, 5000, false);
        }
        catch (error) { message.textContent = error.message; confirm.disabled = false; }
      };
      form.append(message, confirm, cancel); document.body.append(form);
      const bounds = sprite.visibleClampRect(), hit = sprite.hit.getBoundingClientRect(), width = Math.min(330, bounds.w - 8);
      form.style.width = width + 'px'; form.style.left = Math.max(bounds.x + 4, Math.min(hit.left, bounds.x + bounds.w - width - 4)) + 'px';
      form.style.top = Math.max(bounds.y + 4, Math.min(hit.top - form.offsetHeight - 6, bounds.y + bounds.h - form.offsetHeight - 4)) + 'px';
      sprite.chatMount = { el: form, close }; sprite.chatOpen = true;
      sprite.syncInputBusy(); sprite.setInteractive(true); sprite.syncInputRegions(); cancel.focus();
    } catch (error) { sprite.showWhisper(error.message || '未能读取人物资料，请重试。', undefined, undefined, 5000, false); }
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
    activity(true);
    try {
      const response = await fetch(BASE + '/stronghold/persona', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, pet: sprite.pet.id }), signal: AbortSignal.timeout(10000),
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
    if (!composer || composer.hidden) {
      if (activeSprite?.bubble) activeSprite.bubble.style.translate = '';
      activeSprite?.syncInputBusy(); return;
    }
    const frame = (activeSprite.stage || activeSprite.hit).getBoundingClientRect();
    const bounds = activeSprite.visibleClampRect();
    const width = Math.max(1, Math.min(360, bounds.w - 8));
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
    activeSprite.syncInputBusy();
  }

  function showSources(sprite, sources) {
    if (!sprite) return;
    document.querySelector('.stronghold-source-list')?.remove();
    if (!sources.length) return;
    const panel = document.createElement('div');
    panel.className = 'dsh-pet-chat stronghold-pet-chat stronghold-pet-control stronghold-source-list';
    panel.setAttribute('aria-label', '回答来源');
    const title = document.createElement('b'); title.textContent = '回答来源';
    panel.append(title);
    for (const [index, source] of sources.entries()) {
      if (!/^https:\/\//u.test(source.url || '')) continue;
      const link = document.createElement('a'); link.href = source.url; link.textContent = `[${index + 1}] ` + (source.title || source.url);
      link.style.cssText = 'display:block;flex-basis:100%;overflow-wrap:anywhere';
      link.addEventListener('click', event => {
        event.preventDefault();
        if (activeSprite && !dailyRoleplay) void request('/pet/open-source', { url: source.url });
        else void fetch(BASE + '/stronghold/open-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: source.url, pet: sprite.pet.id }) });
      });
      panel.append(link);
    }
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭';
    close.addEventListener('click', () => { panel.remove(); sprite.syncInputBusy(); }); panel.append(close);
    document.body.append(panel);
    const bounds = sprite.visibleClampRect(), hit = sprite.hit.getBoundingClientRect();
    panel.style.cssText += `;width:${Math.min(310, bounds.w - 8)}px;max-height:240px;overflow:auto;left:${Math.max(bounds.x + 4, hit.left)}px;top:${Math.max(bounds.y + 4, hit.top - 180)}px`;
    sprite.syncInputBusy();
  }

  function mount() {
    const form = document.createElement('form');
    form.className = 'dsh-pet-chat stronghold-pet-chat stronghold-game-composer';
    form.setAttribute('aria-label', dailyRoleplay ? '角色扮演聊天' : '卫戍聊天');
    form.hidden = !openedComposers.has(activeSprite.pet.id);
    const input = document.createElement('input');
    input.placeholder = '和我聊聊…';
    input.setAttribute('aria-label', '和我聊聊');
    input.maxLength = 280;
    input.autocomplete = 'off';
    const send = document.createElement('button');
    send.type = 'submit';
    send.textContent = '发送';
    const status = document.createElement('output');
    status.setAttribute('aria-live', 'polite');
    status.dataset.role = 'status';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
    cancel.dataset.role = 'cancel'; cancel.disabled = true;
    cancel.addEventListener('click', () => {
      activity(true);
      if (dailyRequest) {
        dailyRequest.abort();
        void fetch(BASE + '/stronghold/cancel', { method: 'POST' }).catch(() => {});
      } else if (activeRequestId) void request('/pet/cancel', { matchId: activeMatch, requestId: activeRequestId });
    });
    const sources = document.createElement('button'); sources.type = 'button'; sources.textContent = '来源';
    sources.dataset.role = 'sources'; sources.hidden = !latestSources.length;
    sources.addEventListener('click', () => showSources(activeSprite, latestSources));
    const ask = async (text, goal) => {
      if (!text || send.disabled) return;
      activity(true);
      send.disabled = true;
      delete status.dataset.error;
      delete status.dataset.chatterError;
      delete status.dataset.speechPending;
      status.textContent = goal ? '' : '我想想。';
      const sprite = activeSprite;
      try {
        if (dailyRoleplay) {
          if (goal) return;
          const controller = new AbortController(); dailyRequest = controller; activeRequestId = 'preview-chat';
          try {
            const res = await fetch(BASE + '/chat?pet=' + encodeURIComponent(sprite.pet.id) + '&surface=any', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal });
            const answer = await res.json();
            if (controller.signal.aborted || activeSprite !== sprite || !dailyRoleplay) return;
            if (!res.ok || !answer.ok || !answer.text) {
              status.dataset.error = '1'; status.textContent = answer.message || answer.error || '这次没回答出来，稍后再试试。';
            } else {
              input.value = ''; status.textContent = '';
              latestSources = answer.sources || [];
              sprite.showWhisper(answer.text, undefined, undefined, chatOptions.bubbleSeconds * 1000, false);
            }
          } finally { if (dailyRequest === controller) { dailyRequest = null; activeRequestId = null; } }
          return;
        }
        const res = await request('/pet/ask', { matchId: activeMatch, text, goal });
        if (res.ok) { activeRequestId = (await res.json()).requestId; if (!goal) input.value = ''; }
        else {
          const result = await res.json();
          status.dataset.error = '1';
          status.textContent = result.error === 'RATE' ? '我还在想上一句，稍等一下。' : '这会儿没发出去，等一下再试。';
        }
      } catch (error) {
        if (error.name === 'AbortError') { delete status.dataset.error; status.textContent = ''; }
        else { status.dataset.error = '1'; status.textContent = '这次没连上服务，等一下再试。'; }
      } finally {
        send.disabled = false;
        if (composer === form) place();
      }
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (input.dataset.composing === '1') return;
      void ask(input.value.trim());
    });
    input.addEventListener('compositionstart', () => { input.dataset.composing = '1'; });
    input.addEventListener('compositionend', () => { delete input.dataset.composing; });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229 || input.dataset.composing === '1')) event.preventDefault();
    });
    form.addEventListener('focusin', () => window.petBridge?.requestKeyboardFocus());
    input.addEventListener('pointerdown', () => window.petBridge?.requestKeyboardFocus());
    const actions = document.createElement('div'); actions.className = 'stronghold-pet-actions';
    actions.append(send);
    for (const [text, goal] of [['补对空', 'anti-air'], ['先保血', 'protect-lp']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.hidden = dailyRoleplay;
      button.addEventListener('click', () => void ask(text, goal));
      actions.append(button);
    }
    const whisper = document.createElement('button'); whisper.type = 'button'; whisper.textContent = '碎碎念';
    whisper.dataset.role = 'whisper'; whisper.addEventListener('click', () => void speak(true));
    actions.append(whisper, cancel, sources);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
    close.className = 'stronghold-composer-close'; close.dataset.role = 'close'; close.setAttribute('aria-label', '关闭输入栏');
    close.addEventListener('click', () => {
      openedComposers.delete(activeSprite.pet.id); form.hidden = true; input.blur(); place();
    });
    form.append(input, close, actions, status);
    document.body.append(form);
    return form;
  }

  const { switchTo, playOnce, onMenuAction, onContextMenu, inputBusy, showWhisper } = PetSprite.prototype;
  function activity(interrupt = false) {
    lastInteraction = Date.now();
    if (interrupt && idleController) {
      idleController.abort(); idleController = null;
      void fetch(BASE + '/stronghold/idle', { method: 'DELETE' }).catch(() => {});
    }
  }
  for (const type of ['input', 'keydown', 'pointerdown']) document.addEventListener(type, () => activity(), { capture: true });
  PetSprite.prototype.showWhisper = function (text, image, url, duration, anim) {
    if (duration !== 0 && (duration == null || duration >= 8000)) duration = (chatOptions.bubbleSeconds || 20) * 1000;
    if (duration !== 0) { activity(); bubbleUntil = Date.now() + (duration || 20000); automaticBubble = false; }
    const result = showWhisper.call(this, text, image, url, duration, anim);
    if (duration !== 0 && this.pet?.id && this.whisperText === text && this.whisperView) {
      shownChat.set(this.pet.id, { text, at: Date.now() }); acknowledgeChat(this.pet.id, chatDeliveries.get(this.pet.id));
    }
    return result;
  };
  async function speechResponse(response) {
    let value;
    try { value = await response.json(); } catch { /* The helper may return a plain-text transport error. */ }
    if (!response.ok) {
      const status = response.status;
      return { error: status === 429 ? '请求暂时过多，请稍后再试（HTTP 429）。'
        : status === 401 || status === 403 ? '桌宠服务验证未通过，请检查连接设置。'
        : value?.code === 'IDLE_CONTEXT_FAILED' ? '人物资料暂时读取失败，请重启桌宠后再试。'
        : `碎碎念请求未能送达（HTTP ${status}），请稍后重试。`, failure: { status } };
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { error: '桌宠服务没有返回有效结果，请稍后重试。' };
  }
  async function speak(manual = false) {
    const sprite = activeSprite || sprites[0];
    if (!manual && Date.now() < idleRetryAt) return;
    if (idleController) {
      if (manual) {
        idleController.foreground = true;
        const button = composer?.querySelector('[data-role="whisper"]'); if (button) button.disabled = true;
        speechProgress(idleController);
      }
      return;
    }
    if (!sprite || sprite.sleeping || sprite.dragState?.active || sprite.menuOpen || sprite.menuMount || selectingPersona || activeRequestId) return;
    const preparing = !manual && Date.now() - lastInteraction < (chatOptions.idleSeconds || 30) * 1000;
    if (!manual && (groupSpeaking || !chatOptions.proactive || Date.now() - lastInteraction < Math.min(5000, (chatOptions.idleSeconds || 30) * 500)
      || (!automaticBubble && (Date.now() < bubbleUntil || sprite.whisperOn))
      || [...document.querySelectorAll('.dsh-pet-chat input, .dsh-pet-chat textarea')].some(input => input.value.trim()))) return;
    const controller = new AbortController(); idleController = controller;
    controller.speechId = String(++speechSerial);
    controller.foreground = manual; controller.started = Date.now(); controller.stage = 'generating';
    if (manual) lastInteraction = Date.now();
    const notice = composer?.querySelector('[data-role="status"]');
    const button = composer?.querySelector('[data-role="whisper"]');
    if (manual) speechProgress(controller);
    if (button) button.disabled = manual;
    let shown = false, failed = false;
    try {
      const res = await fetch(BASE + '/stronghold/idle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pet: sprite.pet.id, manual, prepare: preparing, warmStart: true }), signal: controller.signal });
      let result = await speechResponse(res);
      if (result?.prepared && controller.foreground) {
        const ready = await fetch(BASE + '/stronghold/idle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pet: sprite.pet.id, manual: true, warmStart: true }), signal: controller.signal });
        result = await speechResponse(ready);
      }
      const recoverable = value => value?.skipped && !value.recoveryExhausted && [undefined, 'duplicate', 'cooldown'].includes(value.reason);
      if (controller.foreground && recoverable(result) && !controller.signal.aborted) {
        if (notice) { delete notice.dataset.error; notice.textContent = '正在换个话题，准备下一条。'; }
        await new Promise((resolve, reject) => {
          const stop = () => { clearTimeout(timer); reject(controller.signal.reason); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, Math.min(1500, Math.max(1050, result.retryAfterMs || 0)));
          controller.signal.addEventListener('abort', stop, { once: true }); if (controller.signal.aborted) stop();
        });
        const next = await fetch(BASE + '/stronghold/idle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pet: sprite.pet.id, manual: true, warmStart: true }), signal: controller.signal });
        result = await speechResponse(next);
      }
      if (result?.retryAfterMs) idleRetryAt = Date.now() + Math.min(60000, result.retryAfterMs);
      if (result?.prepared && controller.foreground && notice) {
        notice.dataset.chatterError = '1'; notice.textContent = '后面的话正在准备，稍等一下。';
      }
      failed = !result || !!result.error || result.reason === 'stories-exhausted';
      if (result?.text && !controller.signal.aborted && (controller.foreground || (chatOptions.proactive && Date.now() - lastInteraction >= (chatOptions.idleSeconds || 30) * 1000))) {
        idleController = null;
        if (!result.deliveryId || lastIdleDelivery !== result.deliveryId) sprite.showWhisper(result.text, undefined, undefined, chatOptions.bubbleSeconds * 1000, false);
        if (sprite.whisperText !== result.text || !sprite.whisperView) throw new Error('Speech was not displayed');
        lastIdleDelivery = result.deliveryId;
        if (result.deliveryId) void fetch(BASE + '/stronghold/idle', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pet: sprite.pet.id, deliveryId: result.deliveryId, warmStart: true }) }).catch(() => {});
        automaticBubble = !controller.foreground;
        shown = true;
        if (notice && (controller.foreground || notice.dataset.chatterError)) {
          notice.textContent = ''; delete notice.dataset.error; delete notice.dataset.chatterError;
        }
      } else if (!result?.prepared && !result?.text && !controller.signal.aborted && notice && (controller.foreground || result?.error)) {
        notice.dataset.error = '1'; notice.dataset.chatterError = '1';
        notice.textContent = result?.error || (result?.reason === 'busy' ? '模型还在处理上一条请求，稍后再点即可。'
          : result?.reason === 'stories-exhausted' ? '这张卡的新背景暂时讲完了，可以补充故事或直接和我聊聊。'
          : result?.reason === 'needs-speaker' ? '这张剧情卡还没有固定人物，请在右键「角色扮演 → 资料管理」中填写人物名字和设定。'
          : result?.reason === 'interrupted' ? ''
          : result?.reason === 'duplicate' ? '生成的内容仍与已讲过的话题重复，稍后再试试。'
          : '这次请求没有返回台词，请稍后重试。');
      }
    } catch {
      failed = true;
      if (controller.foreground && !controller.signal.aborted && notice) {
        notice.dataset.error = '1'; notice.dataset.chatterError = '1';
        notice.textContent = '没连上桌宠服务，稍后再试试。';
      }
    } finally {
      if (idleController === controller) idleController = null;
      if (button?.isConnected && !idleController) button.disabled = false;
      if (notice?.dataset.speechPending === controller.speechId) {
        if (controller.signal.aborted) notice.textContent = '';
        delete notice.dataset.speechPending;
      }
      if (shown || manual || failed) lastInteraction = Date.now();
    }
  }
  function speechProgress(controller, info = {}) {
    if (idleController !== controller || !controller.foreground) return;
    Object.assign(controller, info);
    const notice = composer?.querySelector('[data-role="status"]'); if (!notice) return;
    delete notice.dataset.error; delete notice.dataset.chatterError; notice.dataset.speechPending = controller.speechId;
    const stage = controller.stage === 'queued' ? '正在等上一条模型请求完成。'
      : controller.stage === 'retrying' ? `服务暂时繁忙，正在重试（${controller.attempt}/${controller.attempts}）。` : '正在生成碎碎念。';
    const elapsed = Math.max(0, Math.floor((Date.now() - controller.started) / 1000));
    notice.textContent = stage + (elapsed ? ` 已等待 ${elapsed} 秒，可随时取消。` : '');
  }
  let speechStatusPending = false;
  async function refreshSpeechProgress() {
    const controller = idleController;
    if (!controller?.foreground || speechStatusPending) return;
    speechStatusPending = true;
    speechProgress(controller);
    try {
      const res = await fetch(BASE + '/stronghold/idle-status?pet=' + encodeURIComponent((activeSprite || sprites[0])?.pet.id || 'main'), { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const info = await res.json(); if (info.pending) speechProgress(controller, { stage: info.stage, attempt: info.attempt, attempts: info.attempts });
      }
    } catch { /* preserve elapsed progress while reconnecting */ }
    finally { speechStatusPending = false; }
  }
  PetSprite.prototype.inputBusy = function () {
    // Visible controls need their native input lease before a first click can give them focus.
    return inputBusy.call(this) || !!(this === activeSprite && composer && !composer.hidden)
      || !!document.querySelector('.stronghold-pet-control');
  };
  PetSprite.prototype.onContextMenu = function (event) {
    void refreshChatOptions();
    const owner = `Stronghold Protocol (${this.pet.id})`;
    const labels = ['切换人设', '恢复默认人设', '资料管理', '日常模式', '无限制模式', '查看来源'];
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
      const roleItems = labels.map(label => ({ label, action: 'third-party', owner,
        hint: (label === '日常模式' && chatOptions.mode === 'daily')
          || (label === '无限制模式' && chatOptions.mode === 'unlimited') ? '✓' : '' }));
      roleItems.unshift({ label: '打开输入栏', action: 'stronghold-open-composer' });
      roleItems.unshift({ label: roleplayPet === this.pet.id ? '停止角色扮演' : '开启角色扮演',
        action: 'stronghold-preview', hint: roleplayPet === this.pet.id ? '✓' : '' });
      roleItems.push(
      { label: '清空记忆和历史记录', action: 'stronghold-clear-history' },
      { label: '对话预算', action: 'stronghold-info' },
      { label: '请求强度', children: [['low', '低'], ['medium', '中'], ['high', '高']].map(([effort, label]) => ({
        label, action: 'stronghold-effort', effort, hint: effort === chatOptions.effort ? '✓' : '' })) },
      { label: '主动聊天', children: [[true, '开启'], [false, '关闭']].map(([proactive, label]) => ({
        label, action: 'stronghold-proactive', proactive, hint: proactive === chatOptions.proactive ? '✓' : '' })) },
      { label: '碎碎念间隔', children: [10, 15, 20, 30, 45, 60].map(idleSeconds => ({ label: `${idleSeconds}秒`,
        action: 'stronghold-idle', idleSeconds, hint: idleSeconds === chatOptions.idleSeconds ? '✓' : '' })) },
      { label: '气泡时长', children: [15, 20, 30, 60, 120].map(bubbleSeconds => ({ label: `${bubbleSeconds}秒`,
        action: 'stronghold-bubble', bubbleSeconds, hint: bubbleSeconds === chatOptions.bubbleSeconds ? '✓' : '' })) },
      { label: '回复字数', children: [25, 60, 120].map(maxChars => ({ label: `${maxChars}字`,
        action: 'stronghold-max-chars', maxChars, hint: maxChars === chatOptions.maxChars ? '✓' : '' }))
        .concat([{ label: '自定义…', action: 'stronghold-max-chars' }]) });
      tree.splice(afterChat, 0, { label: '角色扮演', children: roleItems });
      return mountContextMenu({ ...options, tree });
    };
    try {
      return onContextMenu.call(this, event);
    } finally {
      S.mountContextMenu = mountContextMenu;
    }
  };
  PetSprite.prototype.switchTo = function (name, once, playbackId, url) {
    if (this === activeSprite && !dailyRoleplay && url !== playingUrl) return;
    return switchTo.call(this, name, once, playbackId, url);
  };
  PetSprite.prototype.playOnce = function (name, playbackId, url) {
    if (this === activeSprite && !dailyRoleplay) return;
    return playOnce.call(this, name, playbackId, url);
  };
  PetSprite.prototype.onMenuAction = function (leaf, ...args) {
    if (leaf?.action === 'stronghold-clear-history' && !args[1]) { this.closeMenu(); void clearHistory(this); return; }
    if (leaf?.action === 'stronghold-preview' && !args[1]) {
      this.closeMenu(); activity(true);
      setRoleplay(this, roleplayPet !== this.pet.id);
      return;
    }
    if (leaf?.action === 'stronghold-open-composer' && !args[1]) {
      this.closeMenu();
      if (!activeSprite) setRoleplay(this, true);
      if (this === activeSprite && composer) {
        openedComposers.add(this.pet.id); composer.hidden = false; place(); composer.querySelector('input').focus();
        return;
      }
      return onMenuAction.call(this, { action: 'chat' }, ...args);
    }
    if (!args[1] && leaf?.action === 'stronghold-info') {
      this.closeMenu(); this.showWhisper('普通/复杂问答上限 120/180 秒；低档争取 10 秒内回复，复杂问题临时至少 300 字。', undefined, undefined, 6000, false); return;
    }
    if (!args[1] && ['stronghold-effort', 'stronghold-proactive', 'stronghold-bubble', 'stronghold-idle'].includes(leaf?.action)) {
      this.closeMenu(); activity();
      const key = { 'stronghold-effort': 'effort', 'stronghold-proactive': 'proactive', 'stronghold-bubble': 'bubbleSeconds', 'stronghold-idle': 'idleSeconds' }[leaf.action];
      void saveOptions(this, { [key]: leaf[key] }); return;
    }
    if (!args[1] && leaf?.action === 'stronghold-max-chars') {
      this.closeMenu();
      if (leaf.maxChars) void saveOptions(this, { maxChars: leaf.maxChars });
      else editMaxChars(this);
      return;
    }
    if (!args[1] && leaf?.action === 'third-party' && leaf.owner === `Stronghold Protocol (${this.pet.id})`) {
      if (leaf.label === '资料管理') {
        this.closeMenu(); activity(true);
        if (window.arkDesktop) { void window.arkDesktop.openPanel('people', this.pet.id); return; }
        void fetch(BASE + '/stronghold/library', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'open', pet: this.pet.id }) }).then(async res => {
          const data = await res.json(); if (!res.ok) throw new Error(data.error || '资料管理打开失败');
          if (window.petBridge) window.petBridge.openDshSite(data.url);
          else window.open(data.url, '_blank', 'noopener');
        }).catch(error => this.showWhisper(error.message, undefined, undefined, 6000, false));
        return;
      }
      if (leaf.label === '查看来源') {
        this.closeMenu();
        if (this === activeSprite) showSources(this, latestSources);
        else void fetch(BASE + '/stronghold/sources?pet=' + encodeURIComponent(this.pet.id)).then(res => res.json()).then(data => showSources(this, data.sources || []));
        return;
      }
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
      openedComposers.add(this.pet.id); composer.hidden = false; place();
      composer.querySelector('input').focus();
      return;
    }
    return onMenuAction.call(this, leaf, ...args);
  };

  function unmount(animate = false) {
    const sprite = activeSprite;
    if (!sprite) return;
    const wasGame = !dailyRoleplay;
    dailyRequest?.abort(); dailyRequest = null; activeRequestId = null;
    activeSprite = activeMatch = null;
    dailyRoleplay = false;
    composer.remove();
    composer = null;
    if (sprite.bubble) sprite.bubble.style.translate = '';
    sprite.syncInputBusy();
    sprite.clearWhisper();
    const video = frontVideo(sprite);
    const exit = animate && wasGame && !sprite.dragState?.active && video?.src === playingUrl ? cue(video, 'leave') : null;
    const idle = () => {
      if (!wasGame || activeSprite === sprite || sprite.sleeping) return;
      if (sprite.animations.idle.length) sprite.playOnce(S.pick(sprite.animations.idle, sprite.anim));
    };
    if (exit) {
      void exit.finished.then(idle, () => {});
    } else {
      idle();
    }
  }

  function dockRole(sprite) {
    if (docked.has(sprite) || !sprite.sendBounds || !sprite.pos || typeof VIEW === 'undefined' || typeof WORK_AREAS === 'undefined') return;
    const cx = sprite.pos.x + sprite.halfW, cy = sprite.pos.y + sprite.halfH;
    const area = S.resolveRect?.(WORK_AREAS, cx, cy) || WORK_AREAS.find(a => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height) || WORK_AREAS[0];
    if (!area) return;
    const x = Math.max(area.x, Math.min(sprite.pos.x, area.x + area.width - sprite.size));
    const y = Math.max(area.y, area.y + area.height - (sprite.winH || sprite.height || sprite.size * 9 / 16));
    sprite.stopMove(); sprite.stopThrow?.(); sprite.sendBounds(x, y);
    sprite.customPos = { rx: (x + sprite.halfW) / VIEW.w, ry: (y + sprite.halfH) / VIEW.h };
    docked.add(sprite);
  }

  function applyScene(gameState) {
    panelRound = gameState?.round || null;
    const real = gameState?.active ? sprites.find(sprite => sprite.pet.id === gameState.pet) : null;
    const daily = real ? null : sprites.find(sprite => sprite.pet.id === roleplayPet && !sprite.sleeping);
    const sprite = real || daily || null, asPreview = !!daily;
    const state = real ? gameState : { matchId: null, phase: 'ROLEPLAY' };
    if (activeSprite !== sprite || activeMatch !== state.matchId || dailyRoleplay !== asPreview) unmount(!sprite);
    if (sprite && !activeSprite) {
      sprite.chatMount?.close(); sprite.stopMove();
      activeSprite = sprite; activeMatch = state.matchId; dailyRoleplay = asPreview;
      if (real) dockRole(sprite);
      latestSources = []; composer = mount();
      lastPhase = state.phase; lastAnswerId = state.lastAnswerId;
      entryPending = true; transition?.cancel();
      // A daily bar can reopen during a game exit cue; cancelling that cue must still restore ordinary motion.
      if (asPreview && (frontVideo(sprite)?.src === playingUrl || sprite.pending?.anim === playingUrl) && sprite.animations.idle.length) sprite.playOnce(S.pick(sprite.animations.idle, sprite.anim));
    }
    if (!activeSprite) return;
    const video = frontVideo(sprite);
    if (!asPreview) {
      if (video?.src !== playingUrl && sprite.pending?.anim !== playingUrl) {
        sprite.anim = playingUrl; sprite.once = false; sprite.facing = 'left';
        sprite.switchTo(playingUrl, false, null, playingUrl);
      } else if (video?.src === playingUrl && video.paused && video.readyState >= 2) {
        void video.play().catch(() => {});
      }
      if (video?.src === playingUrl && video.readyState >= 2 && !sprite.dragState?.active) {
        if (entryPending) { cue(video, 'enter'); entryPending = false; }
        else if (state.lastAnswerId && state.lastAnswerId !== lastAnswerId) cue(video, 'reply');
        else if (state.phase !== lastPhase && ['SETTLE', 'FINAL_ASSAULT', 'HIDDEN_CORE'].includes(state.phase)) cue(video, 'settle');
      }
    }
    lastPhase = state.phase; lastAnswerId = state.lastAnswerId;
    const notice = composer.querySelector('[data-role="status"]'), pending = asPreview ? !!dailyRequest : state.pending;
    activeRequestId = asPreview ? (dailyRequest ? 'preview-chat' : null) : state.activeRequestId || null;
    composer.querySelector('[data-role="cancel"]').disabled = !(pending || idleController);
    if (!asPreview) latestSources = state.lastTurn?.sources || [];
    composer.querySelector('[data-role="sources"]').hidden = !latestSources.length;
    if (state.lastTurn?.state === 'error' && shownErrorId !== state.lastTurn.requestId) {
      shownErrorId = state.lastTurn.requestId;
      notice.dataset.error = '1'; notice.textContent = state.lastTurn.text;
    }
    if (!notice.dataset.error && !idleController && !composer.querySelector('button[type="submit"]').disabled) {
      notice.textContent = pending ? (state.progress || '正在生成回复。') : '';
    }
    place();
  }

  async function poll() {
    try {
      for (const [pet, item] of chatDeliveries) acknowledgeChat(pet, item);
      if (sprites.length && Date.now() - groupPollAt > 1500 && !activeRequestId && !idleController && !groupPollBusy) {
        groupPollBusy = true;
        void (async () => { try {
        groupPollAt = Date.now();
        const sprite = activeSprite || sprites[0];
        if (!sprite.sleeping && !sprite.chatOpen && !sprite.menuOpen && !sprite.dragState?.active
          && ![...document.querySelectorAll('.dsh-pet-chat input, .dsh-pet-chat textarea')].some(input => input.value.trim())) {
          const groupRes = await fetch(BASE + '/stronghold/library', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delivery', pet: sprite.pet.id }), signal: AbortSignal.timeout(2500) });
          if (groupRes.ok) {
            const packet = await groupRes.json(), delivery = packet.delivery;
            groupSpeaking = !!packet.group?.running;
            if (delivery) {
              if (delivery.id !== lastGroupDelivery) sprite.showWhisper(delivery.text, undefined, undefined, chatOptions.bubbleSeconds * 1000, false);
              if (sprite.whisperText !== delivery.text || !sprite.whisperView) throw new Error('Group speech was not displayed');
              lastGroupDelivery = delivery.id;
              await fetch(BASE + '/stronghold/library', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ack', pet: sprite.pet.id, deliveryId: delivery.id }) });
            }
          }
        }
        } catch { /* Optional library polling must not unmount an otherwise healthy game composer. */ }
        finally { groupPollBusy = false; } })();
      }
      void refreshChatOptions();
      void refreshSpeechProgress();
      if (!sprites.length) {
        unmount();
        return;
      }
      const res = await request('/pet/status');
      if (!res.ok) throw new Error('status');
      const state = await res.json();
      lastContact = Date.now();
      applyScene(state);
    } catch {
      if (Date.now() - lastContact > 4000) applyScene(null);
    } finally {
      void refreshChatOptions();
      void speak();
      reportPanel();
      setTimeout(poll, 750);
    }
  }
  function setRoleplay(sprite, enabled) {
    roleplayPet = enabled ? sprite.pet.id : null; docked.delete(sprite);
    if (!enabled) openedComposers.delete(sprite.pet.id);
    try { if (roleplayPet) window.localStorage?.setItem('ark-roleplay-pet', roleplayPet); else window.localStorage?.removeItem('ark-roleplay-pet'); } catch { /* session-only fallback */ }
    if (!activeSprite || dailyRoleplay) applyScene(null);
  }
  function reportPanel(requestId) {
    const value = { roleplay: !!activeSprite, game: !!activeSprite && !dailyRoleplay, round: panelRound, phase: lastPhase };
    const serialized = JSON.stringify(value);
    if (requestId || serialized !== lastPanelReport) { lastPanelReport = serialized; window.arkDesktop?.report({ ...value, requestId }); }
  }
  window.arkDesktop?.onCommand(async message => {
    const sprite = sprites[0]; if (!sprite) return;
    try {
      if (message.name === 'roleplay') { activity(true); setRoleplay(sprite, message.enabled); }
      if (message.name === 'composer') sprite.onMenuAction({ action: 'stronghold-open-composer' });
      if (message.name === 'refresh') await refreshChatOptions();
    } finally { reportPanel(message.requestId); }
  });
  void poll();
}
