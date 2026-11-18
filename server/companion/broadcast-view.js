/* global document, window, matchMedia */
/* Shared by the offline concept and the local companion panel. */
(() => {
  function layout(base, demo = false) {
    return `  <header class="shell-header">
    <div class="mast"><i class="brand-disc" aria-hidden="true"></i><h1>虹轨放送</h1><span class="brand-script" lang="en">Cherry Sessions</span></div>
    <span class="air" id="air" role="status">可以连线</span>
  </header>
  <div class="layout">
    <aside class="booth" aria-label="角色与调频">
      <figure class="portrait">
        <button class="stage-card" id="open-stage-card" type="button" aria-haspopup="dialog" aria-label="查看完整卡面">
        </button>
        <figcaption><span class="artist-name"><small>当前角色</small><strong></strong></span><span class="stage-hint">查看原卡 ↗</span></figcaption>
        ${demo ? '' : '<button class="choose-stage-card" type="button">更换角色卡</button>'}
      </figure>
      <div class="tuner">
        <button type="button" id="platter" class="turn" aria-label="唱片打拍，可点按、拖动或按空格" title="点按打拍，拖动拨片"><img src="${base}arc-cherry-vinyl.webp" alt="" draggable="false"><span>点按打拍</span></button>
        <div class="channel"><div class="channel-head"><span>频道调谐<span id="tune-target" aria-hidden="true"></span></span><output id="beat-readout" aria-label="拍点">♪ —</output></div>
        <input id="tuning" type="range" min="0" max="1000" step="1" value="500" aria-label="调频模式" aria-valuetext="连线">
        <div class="stops">
          <button type="button" data-mode="listen" aria-pressed="false">收听</button>
          <button type="button" data-mode="talk" aria-pressed="true">连线</button>
          <button type="button" data-mode="quiet" aria-pressed="false">静音</button>
        </div>
        </div>
      </div>
    </aside>
    <div class="desk">
      <nav class="nav" aria-label="面板导航">
        <button type="button" data-page="overview">总览</button>
        <button type="button" data-page="people">人物</button>
        <button type="button" data-page="world">世界书</button>
        <button type="button" data-page="dialogue" aria-current="page">对话</button>
        <button type="button" data-page="status">状态</button>
        <button type="button" data-page="settings">设置</button>
      </nav>
    </div>
  </div>`;
  }
  const meterMarkup = '<svg class="meter" id="meter" viewBox="0 0 86 32" aria-hidden="true"><path d="M2 16h8m3-2v4m4-8v12m4-17v22m4-15v8m4-12v16m4-22v28m4-19v10m4-15v20m4-16v12m4-20v28m4-18v8m4-12v16m4-13v10m4-8v6m4-5v4m4-2h8"/></svg>';
  function install(radio, {onPage,onMode,onCover,reduced}) {
    const get = id => radio.querySelector('#'+id);
    const tuning = get('tuning');
    const nav = [...radio.querySelectorAll('.nav [data-page]')];
    const stops = [...radio.querySelectorAll('.stops button')];
    const modes = ['listen', 'talk', 'quiet'];
    const navPaths = {
      overview:'M3 4h6v6H3z M13 4h6v6h-6z M3 14h6v6H3z M13 14h6v6h-6z',
      people:'M3 3h16v18H3z M8 9a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M6 18c1-5 9-5 10 0',
      world:'M2 5q5-2 9 1q4-3 9-1v13q-5-1-9 2q-4-3-9-2z M11 6v14',
      dialogue:'M4 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M6 11h2l2-3 2 6 2-4 2 1',
      status:'M3 12h3l3-8 4 16 3-10 2 2h3',
      settings:'M4 4v6m0 4v6 M11 4v10m0 4v2 M18 4v2m0 4v10 M2 10h4v4H2z M9 14h4v4H9z M16 6h4v4h-4z',
    };
    for (const button of nav) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
      const line = document.createElementNS(icon.namespaceURI,'path');
      icon.setAttribute('viewBox','0 0 22 24');
      icon.setAttribute('aria-hidden','true');
      line.setAttribute('d',navPaths[button.dataset.page]);
      icon.append(line);
      button.prepend(icon);
    }
    const platter = get('platter'), meter = get('meter');
    const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    const reduceMotion = () => reduced() || motionPreference.matches;
    let angle = 0, beat = 0, drag = null;
    function pulse() {
      if (reduceMotion() || !meter.checkVisibility()) return;
      for (const effect of meter.getAnimations()) effect.cancel();
      meter.animate([{transform:'scaleY(.75)'},{transform:'scaleY(1.45)',color:'#fd3b9a',offset:.32},{transform:'scaleY(1)'}],{duration:290,easing:'ease-out'});
    }
    function rotateDisc(delta) {
      angle += delta;
      platter.style.setProperty('--angle',angle+'deg');
    }
    function tapBeat() {
      beat = beat % 4 + 1;
      get('beat-readout').textContent = '♪ '+beat+' / 4';
      pulse();
    }
    function pointerAngle(event) {
      return Math.atan2(event.clientY-drag.cy,event.clientX-drag.cx)*180/Math.PI;
    }
    platter.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      const rect = platter.querySelector('img').getBoundingClientRect();
      drag = {id:event.pointerId,cx:rect.x+rect.width/2,cy:rect.y+rect.height/2,travel:0,moved:false};
      drag.last = pointerAngle(event);
      platter.setPointerCapture(event.pointerId);
      platter.setAttribute('data-dragging','');
    });
    platter.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const current = pointerAngle(event);
      const delta = (current-drag.last+540)%360-180;
      drag.last = current;
      drag.travel += Math.abs(delta);
      rotateDisc(delta);
      if (drag.travel >= 40) { tapBeat(); drag.travel %= 40; drag.moved = true; }
    });
    let skipPointerClick = false;
    platter.addEventListener('lostpointercapture', () => {
      skipPointerClick = Boolean(drag?.moved);
      drag = null;
      platter.removeAttribute('data-dragging');
    });
    platter.addEventListener('click', event => {
      if (!event.detail || !skipPointerClick) { rotateDisc(40); tapBeat(); }
      skipPointerClick = false;
    });
    const station = {
      listen: { label:'收听', air:'正在收听', title:'收听台', note:'碎碎念与世界书摘录' },
      talk: { label:'连线', air:'可以连线', title:'直播间', note:'文字连线 · 本地示例' },
      quiet: { label:'静音', air:'碎碎念已暂停', title:'直播间', note:'静音期间仍可发文字' },
    };

    const tuner = tuning.closest('.tuner'), targetLabel = get('tune-target');
    const nearestMode = () => modes[Math.round(Number(tuning.value)/500)];
    let tuningPointer = null;
    function previewStation() {
      const mode = nearestMode();
      if (mode === tuner.dataset.preview) return;
      tuner.dataset.preview = mode;
      targetLabel.textContent = '→ '+station[mode].label;
      tuning.setAttribute('aria-valuetext',station[mode].label);
      for (const stop of stops) stop.toggleAttribute('data-target',stop.dataset.mode === mode);
    }
    function clearPreview() {
      tuningPointer = null;
      delete tuner.dataset.preview;
      targetLabel.textContent = '';
      for (const stop of stops) stop.removeAttribute('data-target');
    }
    function commitTuning() {
      const mode = nearestMode();
      clearPreview();
      onMode(mode);
    }
    function cancelTuning() {
      if (tuningPointer === null) return;
      clearPreview();
      tuning.value = modes.indexOf(radio.dataset.mode)*500;
      tuning.setAttribute('aria-valuetext',station[radio.dataset.mode].label);
    }
    tuning.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      tuningPointer = event.pointerId;
      previewStation();
    });
    tuning.addEventListener('input',previewStation);
    window.addEventListener('pointerup', event => {
      if (event.pointerId === tuningPointer) commitTuning();
    });
    window.addEventListener('pointercancel',event => {
      if (event.pointerId === tuningPointer) cancelTuning();
    });
    window.addEventListener('blur',cancelTuning);
    tuning.addEventListener('change',() => {
      if (tuningPointer === null && tuner.hasAttribute('data-preview')) commitTuning();
    });
    const modeKeys = {ArrowRight:1,ArrowUp:1,PageUp:1,ArrowLeft:-1,ArrowDown:-1,PageDown:-1,Home:-2,End:2};
    tuning.addEventListener('keydown',event => {
      if (!(event.key in modeKeys)) return;
      event.preventDefault();
      clearPreview();
      const index = modes.indexOf(radio.dataset.mode) + modeKeys[event.key];
      onMode(modes[Math.max(0,Math.min(2,index))]);
    });

    for (const b of nav) b.onclick = () => onPage(b.dataset.page);
    for (const b of stops) b.onclick = () => onMode(b.dataset.mode);
    get('open-stage-card').onclick = () => onCover(get('open-stage-card').querySelector('img'));
    function setMode(mode) {
      const info = station[mode];
      tuning.value = modes.indexOf(mode)*500;
      tuning.setAttribute('aria-valuetext', info.label);
      radio.dataset.mode = mode;
      for (const button of stops) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
      get('air').textContent = info.air;

    }
    function setPage(page) {
      radio.dataset.page = page;
      for(const b of nav) {
        if (b.dataset.page===page) b.setAttribute('aria-current','page');
        else b.removeAttribute('aria-current');
      }
    }
    function spark(event) {
      const control = event.composedPath().find(n=>n.tagName==='BUTTON');
      if (!control || reduceMotion() || !control.checkVisibility() || control.disabled) return;
      const rect = control.getBoundingClientRect();
      const spark = document.createElement('span');
      spark.className = 'tap-spark';
      spark.textContent = '✦';
      spark.setAttribute('aria-hidden','true');
      spark.style.left = (event.detail ? event.clientX : rect.right-10)-6+'px';
      spark.style.top = (event.detail ? event.clientY : rect.top+8)-12+'px';
      (control.closest('dialog') || radio).append(spark);
      const effect = spark.animate([{transform:'translateY(0) scale(.6)',opacity:1},{transform:'translateY(-18px) rotate(28deg) scale(1.2)',opacity:0}],{duration:300,easing:'ease-out'});
      effect.finished.finally(()=>spark.remove()).catch(()=>{});
    }
    radio.addEventListener('click',spark);
    return {setMode,setPage,station,transmit(){rotateDisc(75);pulse();}};
  }
  window.ArkBroadcastView = {layout,meterMarkup,install};
})();
