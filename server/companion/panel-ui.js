/* global $, data, pet, token, actorId, api, requestJson, selectedActor, notice */
/* global window, document, Element, HTMLImageElement, Image, Option, IntersectionObserver, ResizeObserver, MutationObserver, matchMedia, getComputedStyle, requestAnimationFrame, cancelAnimationFrame */
(() => {
  let translate=value=>value;
  const t=(...args)=>translate(...args);
  void import('./library-i18n/i18n.js').then(async m=>{
    translate=m.t;
    const lang=window.localStorage.getItem('sp.pref.lang');
    if(!['en','ja','ko','zh-TW'].includes(lang))return;
    m.setMessages(lang,await requestJson('library-i18n/'+lang+'.json'));
    m.setLang(lang);
    $('entryBroadcastLabel').textContent=t('公开播出的摘录');
    $('entryBroadcast').placeholder=t('填写收听台可以展示的文字');
    document.dispatchEvent(new Event('companion:language'));
    const selector=$('panelTheme');
    if(!selector)return;
    $('panelThemeLabel').textContent=t('界面主题');
    for(const option of selector.options)option.textContent=t(themeCatalog.themes[option.value].name);
  }).catch(()=>{});
  const themeCatalog=window.ArkPanelThemes;
  themeCatalog.loadStyles(document,'library-themes');
  const bookTheme=()=>document.documentElement.dataset.theme==='book';
  const paths={
    overview:'M3 10 12 3 21 10V21H4V10M9 21v-8h6v8',
    people:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
    world:'M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2v15',
    dialogue:'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM7 9h10M7 13h6',
    status:'M2 12h5l3-8 4 16 3-8h5', settings:'M3 6h5m4 0h9M3 12h11m4 0h3M3 18h4m4 0h10M8 4h4v4H8ZM14 10h4v4h-4ZM7 16h4v4H7Z',
    close:'m6 6 12 12M18 6 6 18', down:'m5 9 7 7 7-7', refresh:'M21 9a9 9 0 1 0 0 7M21 3v6h-6',
    send:'m4 12 16-8-6 16-3-6-7-2ZM11 14l9-10', stop:'M6 6h12v12H6Z',
    frame:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z',
    spark:'m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z',
    moon:'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.6 8.6 0 1 0 20 15.5Z',
    image:'M3 3h18v18H3ZM3 18l6-6 4 4 3-6 5 7M7 7h2v2H7Z',
    clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2',
    edit:'m4 16 12-12 4 4L8 20H4ZM13 7l4 4',
    link:'m9 15 6-6M8 8l3-3a5 5 0 0 1 7 7l-2 2M8 10l-2 2a5 5 0 0 0 7 7l3-3',
    check:'m5 12 4 4L19 6', filter:'M3 4h18l-7 8v7l-4 2v-9Z',
    plus:'M5 12h14M12 5v14', more:'M4 12h1m6 0h1m6 0h1', left:'m15 5-7 7 7 7', right:'m9 5 7 7-7 7',
    type:'m3 20 6-16 6 16M5 14h8M16 8h6M19 8v12',
    code:'m8 6-5 6 5 6m8-12 5 6-5 6m-2-15-4 18',
    download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
    palette:'M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H19a2 2 0 0 0 2-2c0-5.5-4-10-9-10ZM7.5 11h.1M11 7h.1M15.7 8.6h.1',
    feather:'M3 21 15 9M5 19c-2-7 1-12 6-15 3-2 7-2 10-2-1 3-1 6-3 9h-5l3 2c-3 4-6 6-11 6Z',
    window:'M3 4h18v13H3ZM8 21h8m-4-4v4',
    pendant:'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 6c3 3 6 6 6 10a6 6 0 0 1-12 0c0-4 3-7 6-10Zm0 5 3 5-3 3-3-3 3-5Z',
    archive:'M4 4h16v7H4Zm0 9h16v7H4ZM10 7.5h4m-4 9h4',
    tools:'M3 7h18v13H3Zm5 0V5h8v2M3 12h18m-10-1v3h2v-3',
  };
  const aliases={actors:'image',cast:'people',actorEditor:'edit',persona:'people',worldBindings:'check',worldLibrary:'world',books:'edit',worldInspect:'filter',chatPage:'dialogue',historyPage:'clock',memories:'world',sourcePage:'link',runtimePage:'status',gamePage:'overview',roleSettings:'people',dialogueSettings:'dialogue',promptSettings:'edit',appearanceSettings:'type',windowSettings:'frame',dockSettings:'spark',apiSettings:'link',dataSettings:'clock',advancedPage:'settings'};
  const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[aliases[name]||name]||paths.spark)+'"/></svg>';
  const bookIcons={overview:'archive',overviewActor:'people',overviewHistory:'clock',memories:'archive',
    appearanceSettings:'palette',promptSettings:'feather',windowSettings:'window',
    dockSettings:'pendant',dataSettings:'archive',advancedPage:'tools'};
  const button=(id,name,label)=>{const b=document.createElement('button');b.id=id;b.type='button';b.className='panel-icon';b.setAttribute('aria-label',t(label));b.innerHTML=icon(name);return b;};
  const paragraph=text=>{const p=document.createElement('p');p.textContent=text;return p;};
  function installBookPortrait(portrait){
    const motion=window.ArkMotion;
    const layers=[['rear',-.59,10],['slip',-.78,12],['paper',-1.62,13],['card',-2.8,18],
      ['flowers',-1.9,9],['ribbon',-1.04,9],['seal',-3.22,13]].map(([name,angle,frequency])=>{
      const art=document.createElement('i');
      art.className='book-portrait-'+name;
      art.setAttribute('aria-hidden','true');
      return {art,angle,property:'--book-'+name+'-turn',spring:new motion.Spring(0,frequency)};
    });
    let frame=0,last=0;
    function paint(){
      for(const {spring,property} of layers)portrait.style.setProperty(property,spring.value+'deg');
    }
    function step(time){
      const dt=last?(time-last)/1000:1/60;
      last=time;
      const reduced=motion.reduced();
      let moving=false;
      for(const {spring} of layers)moving=spring.step(dt,reduced)||moving;
      paint();
      frame=moving?requestAnimationFrame(step):0;
    }
    function turn(active,snap=false){
      for(const {spring,angle} of layers){
        const target=active&&bookTheme()?angle:0;
        if(target!==spring.target)spring.velocity=0;
        spring.target=target;
        if(snap)spring.step(0,true);
      }
      if(snap){cancelAnimationFrame(frame);frame=0;paint();}
      else if(!frame&&bookTheme()){last=0;frame=requestAnimationFrame(step);}
    }
    portrait.addEventListener('pointerenter',()=>turn(true));
    portrait.addEventListener('pointerleave',()=>turn(false));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)turn(false,true);});
    return {
      reset:()=>turn(false,true),
      show(content){
        const isImage=content instanceof HTMLImageElement;
        portrait.classList.toggle('has-book-cover',isImage);
        const ratio=isImage?content.naturalWidth/content.naturalHeight:1;
        portrait.style.setProperty('--book-card-ratio',String(Math.min(2,Math.max(.5,ratio))));
        portrait.replaceChildren(content,...layers.map(layer=>layer.art));
      },
    };
  }
  function placePopover(popover,anchor,{above=false,align='center'}={}){
    const panel=($('panelMotion')||document.body).getBoundingClientRect();
    const left=Math.max(panel.left,0)+8,right=Math.min(panel.right,window.innerWidth)-8;
    const top=Math.max(panel.top,0)+8,bottom=Math.min(panel.bottom,window.innerHeight)-8;
    const target=anchor.getBoundingClientRect();
    if(right<=left||bottom<=top||target.top<top-8||target.bottom>bottom+8)return false;
    const gap=7,spaceAbove=target.top-top-gap,spaceBelow=bottom-target.bottom-gap;
    popover.style.maxWidth=(right-left)+'px';
    popover.style.maxHeight='';
    const idealHeight=popover.offsetHeight;
    const useAbove=(above&&spaceAbove>=idealHeight)||(spaceBelow<idealHeight&&spaceAbove>spaceBelow);
    const space=useAbove?spaceAbove:spaceBelow;
    if(space<24)return false;
    if(popover.id==='deskShortcuts')popover.style.maxHeight=space+'px';
    const {width,height}=popover.getBoundingClientRect();
    if(height>space)return false;
    const x=align==='end'?target.right-width:align==='start'?target.left:target.left+(target.width-width)/2;
    popover.style.left=Math.max(left,Math.min(x,right-width))+'px';
    popover.style.top=(useAbove?target.top-gap-height:target.bottom+gap)+'px';
    return true;
  }
  function installTooltips(){
    const tooltip=document.createElement('div');
    tooltip.id='panelTooltip';
    tooltip.setAttribute('popover','manual');
    tooltip.setAttribute('role','tooltip');
    document.body.append(tooltip);
    let hovered,focused,anchor,timer;
    function hide(){
      clearTimeout(timer);
      if(tooltip.matches(':popover-open'))tooltip.hidePopover();
      anchor=null;
    }
    function reset(){
      hovered=focused=null;
      hide();
    }
    function showFor(target){
      hide();
      if(!target||target.disabled)return;
      if(target.title){
        target.dataset.tooltip=target.title;
        target.removeAttribute('title');
        if(!target.getAttribute('aria-label')&&!target.textContent.trim())
          target.setAttribute('aria-label',target.dataset.tooltip);
      }
      const label=target.dataset.tooltip||(!target.textContent.trim()&&target.getAttribute('aria-label'));
      if(!label)return;
      anchor=target;
      timer=setTimeout(()=>{
        if(!target.isConnected||target.disabled||!target.getClientRects().length||document.hidden)return;
        tooltip.textContent=label;
        tooltip.showPopover();
        if(!placePopover(tooltip,target))hide();
      },450);
    }
    const targetOf=node=>node instanceof Element?node.closest('button'):null;
    document.addEventListener('pointerover',event=>{
      if(event.pointerType==='touch')return;
      const target=targetOf(event.target);
      if(!target||target===hovered)return;
      hovered=target;
      showFor(target);
    });
    document.addEventListener('pointerout',event=>{
      if(event.pointerType==='touch'||!hovered||hovered.contains(event.relatedTarget))return;
      hovered=null;
      showFor(focused);
    });
    document.addEventListener('focusin',event=>{
      const target=targetOf(event.target);
      focused=target?.matches(':focus-visible')?target:null;
      if(focused)showFor(focused);
    });
    document.addEventListener('focusout',()=>{
      if(!focused)return;
      focused=null;
      if(anchor!==hovered)showFor(hovered);
    });
    document.addEventListener('pointerdown',reset,true);
    document.addEventListener('scroll',event=>{
      if(!(event.target instanceof Element)||event.target.contains(anchor))reset();
    },true);
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!event.defaultPrevented&&tooltip.matches(':popover-open')){
        event.preventDefault();
        reset();
      }
    },true);
    document.addEventListener('visibilitychange',reset);
    window.addEventListener('resize',reset);
    window.addEventListener('blur',reset);
    return reset;
  }
  let coverKey,coverPromise;
  function cover(asset){
    if(!asset||asset.sourceFormat!=='png')return Promise.resolve(null);
    const key=asset.id+':'+(asset.updatedAt||'');
    if(coverKey!==key){coverKey=key;coverPromise=api('export',{assetId:asset.id,original:true}).then(r=>{
      if(r.extension!=='png'||typeof r.file!=='string'||r.file.length>45000000||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u.test(r.file))return null;
      return 'data:image/png;base64,'+r.file;
    }).catch(e=>{if(coverKey===key)coverKey=null;throw e;});}
    return coverPromise;
  }
  function preferences(prefs){
    const root=document.documentElement;
    const theme=themeCatalog.normalizeTheme(prefs.theme);
    if(root.dataset.theme!==theme)root.dataset.theme=theme;
    root.style.setProperty('--panel-background-opacity',String((prefs.backgroundOpacity??8)/100));
    root.style.setProperty('--book-font-scale',String((prefs.fontSize||18)/18));
    root.style.setProperty('--book-type',!prefs.fontFamily||prefs.fontFamily==='Microsoft YaHei'
      ? 'KaiTi,"Microsoft YaHei UI"':'var(--font-family)');
    root.dataset.palette=prefs.palette||'blue';
    const selector=$('panelTheme');
    if(selector)selector.value=root.dataset.theme;
  }
  function addAppearanceControls(savePreferences,getPreferences){
    const form=document.querySelector('#appearanceForm .form-grid');
    const label=document.createElement('label');
    const title=document.createElement('span');title.id='panelThemeLabel';title.textContent=t('界面主题');
    const selector=document.createElement('select');selector.id='panelTheme';
    for(const [id,theme] of Object.entries(themeCatalog.themes))selector.add(new Option(t(theme.name),id));
    selector.value=themeCatalog.normalizeTheme(getPreferences().theme);
    selector.addEventListener('change',async()=>{
      selector.disabled=true;
      try{await savePreferences({theme:selector.value});}
      catch(error){selector.value=themeCatalog.normalizeTheme(getPreferences().theme);notice(error.message,true);}
      finally{selector.disabled=false;}
    });
    label.append(title,selector);form.prepend(label);
    const opacity=document.createElement('label');opacity.textContent=t('背景透明度');
    const range=document.createElement('input');range.type='range';range.id='backgroundOpacity';range.min=0;range.max=16;range.step=1;
    range.value=getPreferences().backgroundOpacity??8;
    opacity.append(range);form.append(opacity);
  }
  function install({main,savePreferences,getPreferences}){
    const art=document.createElement('div');art.className='panel-ornaments';art.setAttribute('aria-hidden','true');art.innerHTML='<i class="panel-corner tl"></i><i class="panel-corner tr"></i><i class="panel-corner bl"></i><i class="panel-corner br"></i>';document.body.append(art);
    const side=document.createElement('aside');side.id='currentCompanion';side.setAttribute('aria-label',t('当前人物'));
    const portrait=button('companionPortrait','people','查看完整卡面');portrait.className='companion-portrait';
    const portraitArt=installBookPortrait(portrait);
    const tools=document.createElement('div');tools.className='companion-tools';
    const select=button('companionSelect','people','选择人物'),chat=button('companionChat','dialogue','对话'),toggle=button('companionRole','spark','角色扮演');tools.append(select,chat,toggle);
    const latest=document.createElement('div');latest.id='companionSpeech';latest.className='panel-speech';latest.hidden=true;
    const excerpt=document.createElement('section');
    excerpt.id='deskExcerpt';excerpt.className='panel-scene-extra';excerpt.hidden=true;
    const excerptTitle=document.createElement('h3');excerptTitle.innerHTML=icon('world');
    excerptTitle.append(t('世界书摘录'));
    const excerptText=paragraph('');
    const excerptCopy=document.createElement('span');
    excerptCopy.className='excerpt-copy';
    excerptText.append(excerptCopy);
    excerptText.tabIndex=0;
    excerptText.setAttribute('aria-label',t('世界书摘录'));
    const excerptLayer=document.createElement('span'), animatedCopy=document.createElement('span');
    excerptLayer.className='excerpt-scroll-layer';
    excerptLayer.hidden=true;
    excerptLayer.setAttribute('aria-hidden','true');
    excerptLayer.append(animatedCopy);
    const earlier=button('excerptEarlier','left','上一条'),later=button('excerptLater','right','下一条');
    const excerptNav=document.createElement('div');excerptNav.append(earlier,later);
    excerpt.append(excerptTitle,excerptText,excerptLayer,excerptNav);
    let entries=[],recentSpeech='',excerptIndex=0,excerptTimer=0,excerptFrame=0,excerptVisible=false;
    let broadcastProgram={title:'世界书摘录',entries:[]};
    let excerptAnimation;
    const readEntries=()=>bookTheme()&&recentSpeech?[recentSpeech,...entries]:entries;
    const excerptPaused=()=>!bookTheme()||!excerptVisible||document.hidden||window.ArkMotion.reduced()
      ||dialog.open||excerpt.matches(':hover,:focus-within');
    function stopExcerptMotion(){
      clearTimeout(excerptTimer);
      cancelAnimationFrame(excerptFrame);
      excerptAnimation?.cancel();
      excerptAnimation=undefined;
      excerptLayer.hidden=true;
    }
    function scheduleExcerpt(delay=4800){
      stopExcerptMotion();
      if(!excerptPaused())excerptTimer=setTimeout(advanceExcerpt,delay);
    }
    function advanceExcerpt(){
      if(excerptPaused())return;
      const limit=excerptText.scrollHeight-excerptText.clientHeight;
      const start=excerptText.scrollTop;
      if(limit-start<=1){
        const count=readEntries().length;
        if(count>1)showExcerpt((excerptIndex+1)%count);
        else if(limit>1)showExcerpt(0);
        return;
      }
      const rate=Math.max(46,parseFloat(getComputedStyle(excerptText).fontSize)*2.65);
      const duration=(limit-start)/rate*1000;
      animatedCopy.textContent=excerptCopy.textContent;
      excerptLayer.style.width=excerptText.clientWidth+'px';
      excerptLayer.hidden=false;
      // The overlay moves on the compositor. Native scrolling only tracks the scrollbar.
      excerptAnimation=animatedCopy.animate([
        {transform:'translateY('+(-start)+'px)'},
        {transform:'translateY('+(-limit)+'px)'},
      ],{duration,fill:'forwards'});
      function step(){
        if(excerptPaused()){stopExcerptMotion();return;}
        const elapsed=Number(excerptAnimation.currentTime)||0;
        excerptText.scrollTop=Math.min(limit,start+elapsed*rate/1000);
        if(elapsed<duration)excerptFrame=requestAnimationFrame(step);
        else scheduleExcerpt(2400);
      }
      excerptFrame=requestAnimationFrame(step);
    }
    function showExcerpt(index){
      const items=readEntries();
      excerptIndex=Math.max(0,Math.min(items.length-1,index));
      excerpt.hidden=!items.length;
      excerptCopy.textContent=items[excerptIndex]||'';
      excerptText.scrollTop=0;
      earlier.disabled=excerptIndex===0;
      later.disabled=excerptIndex>=items.length-1;
      scheduleExcerpt();
    }
    const excerptObserver=new IntersectionObserver(([entry])=>{
      excerptVisible=entry.isIntersecting;
      scheduleExcerpt();
    },{threshold:.1});
    excerptObserver.observe(excerpt);
    const excerptSize=new ResizeObserver(()=>scheduleExcerpt());
    excerptSize.observe(excerptText);
    const excerptMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const syncExcerptMotion=()=>scheduleExcerpt();
    excerptMotion.addEventListener('change',syncExcerptMotion);
    for(const event of ['pointerenter','pointerleave','pointerdown','focusin','focusout','wheel']){
      excerpt.addEventListener(event,()=>queueMicrotask(()=>scheduleExcerpt()),{passive:true});
    }
    document.addEventListener('visibilitychange',()=>scheduleExcerpt());
    earlier.onclick=()=>showExcerpt(excerptIndex-1);
    later.onclick=()=>showExcerpt(excerptIndex+1);
    const bottom=document.createElement('div');bottom.className='companion-bottom';const palette=button('companionPalette','moon','切换配色'),motion=button('companionMotion','spark','减少动效');bottom.append(palette,motion);
    side.append(portrait,tools,latest,bottom,excerpt);document.body.append(side);
    const dialog=document.createElement('dialog');dialog.id='portraitDialog';const close=button('portraitClose','close','关闭');close.onclick=()=>dialog.close();dialog.append(close);document.body.append(dialog);
    function showCover(image){
      if(!image?.naturalWidth||dialog.open)return;
      portraitArt.reset();
      dialog.querySelector('img')?.remove();
      const enlarged=new Image();
      enlarged.src=image.src;
      enlarged.alt=image.alt;
      dialog.append(enlarged);
      dialog.showModal();
      stopExcerptMotion();
      if(bookTheme())window.ArkMotion.enter(dialog,0);
    }
    portrait.onclick=()=>showCover(portrait.querySelector('img'));
    dialog.addEventListener('close',()=>scheduleExcerpt());
    dialog.addEventListener('click',event=>{
      if(!bookTheme()||event.target!==dialog)return;
      const box=dialog.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
    });
    select.onclick=()=>document.querySelector('#mainNav [data-page="people"]').click();
    chat.onclick=()=>document.querySelector('#mainNav [data-page="dialogue"]').click();
    toggle.onclick=()=>$('toggleRole').click();
    palette.onclick=()=>{const colors=['blue','dusk','mist'];void savePreferences({palette:colors[(colors.indexOf(getPreferences().palette||'blue')+1)%colors.length]}).catch(e=>notice(e.message,true));};
    motion.onclick=()=>{void savePreferences({reducedMotion:!getPreferences().reducedMotion}).catch(e=>notice(e.message,true));};
    for(const[id,name]of [['reload','refresh'],['toggleRole','spark'],['collapsePanel','down'],['closePanel','close']]){const b=$(id);b.classList.add('panel-icon');b.innerHTML=icon(name);}
    const title=document.createElement('h2');title.id='panelSceneTitle';title.className='panel-scene-extra';
    document.querySelector('#panelHeader').append(title);
    const bookTitle=document.createElement('h1');bookTitle.id='bookSceneTitle';
    document.querySelector('#panelHeader').append(bookTitle);
    const more=button('deskMore','more','面板工具');
    $('closePanel').before(more);
    const shortcuts=document.createElement('div');shortcuts.id='deskShortcuts';
    shortcuts.setAttribute('popover','manual');
    shortcuts.setAttribute('role','group');
    document.body.append(shortcuts);
    let shortcutAnchor;
    function closeShortcuts(restoreFocus=false){
      if(!shortcutAnchor)return;
      const trigger=shortcutAnchor;
      shortcutAnchor=null;
      shortcuts.hidePopover();
      trigger.setAttribute('aria-expanded','false');
      if(restoreFocus)trigger.focus();
    }
    function showShortcuts(trigger,mode='panel'){
      const wasOpen=shortcutAnchor===trigger;
      closeShortcuts();
      resetTooltips();
      if(wasOpen)return;
      shortcuts.replaceChildren();
      shortcuts.setAttribute('aria-label',trigger.getAttribute('aria-label'));
      const append=(source,name,label=source.getAttribute('aria-label')||source.textContent,section)=>{
        const entry=document.createElement('button');
        entry.type='button';
        entry.disabled=source.disabled;
        entry.innerHTML=icon(name);
        entry.append(t(label));
        if(source.hasAttribute('aria-current'))entry.setAttribute('aria-current',source.getAttribute('aria-current'));
        entry.onclick=()=>{
          const previousSection=sectionId;
          closeShortcuts(true);
          source.click();
          if(section)$('subNav').querySelector('[data-section="'+section+'"]')?.click();
          if(sectionId!==previousSection)$('subNav').querySelector('[aria-current=true]')?.focus();
        };
        shortcuts.append(entry);
      };
      if(mode==='chat'&&bookTheme()){
        const appendAction=(label,name,apply,disabled)=>{
          const entry=button('',name,label);
          entry.classList.remove('panel-icon');
          entry.append(t(label));entry.disabled=disabled;
          entry.onclick=()=>{
            closeShortcuts();
            apply();
            input.dispatchEvent(new Event('input',{bubbles:true}));
            input.focus({preventScroll:true});
          };
          shortcuts.append(entry);
        };
        appendAction('插入摘录','world',()=>{
          input.setRangeText(excerptText.textContent.slice(0,input.maxLength-input.value.length),input.selectionStart,input.selectionEnd,'end');
        },input.readOnly||input.value.length===input.maxLength||!excerptText.textContent);
        appendAction('清空输入','close',()=>{input.value='';},input.readOnly||!input.value);
      }else if(mode==='chat'){
        for(const source of $('subNav').querySelectorAll('button'))append(source,source.dataset.section);
        append(document.querySelector('#mainNav [data-page="world"]'),'world');
      }else{
        if(bookTheme()&&sectionId==='promptSettings'){
          for(const [id,name] of [['promptDiff','edit'],['promptReset','refresh'],['promptVoiceActor','people'],['promptImport','world'],['promptExport','send']]){
            if($(id))append($(id),name);
          }
          shortcuts.append(document.createElement('hr'));
        }
        if(document.documentElement.dataset.theme==='desk'&&document.body.dataset.page==='dialogue'){
          for(const source of $('subNav').querySelectorAll('button'))append(source,source.dataset.section);
          shortcuts.append(document.createElement('hr'));
        }
        append(document.querySelector('#mainNav [data-page="settings"]'),'settings','外观与主题','appearanceSettings');
        append($('reload'),'refresh');
        append($('toggleRole'),'spark');
        append($('collapsePanel'),'down');
      }
      shortcutAnchor=trigger;
      shortcuts.showPopover();
      if(!placePopover(shortcuts,trigger,{above:mode!=='panel',align:mode==='chat'?'start':'end'})){
        closeShortcuts();
        return;
      }
      trigger.setAttribute('aria-expanded','true');
      shortcuts.querySelector('button:enabled')?.focus({preventScroll:true});
    }
    const resetTooltips=installTooltips();
    document.addEventListener('pointerdown',event=>{
      if(shortcutAnchor&&!shortcuts.contains(event.target)&&!shortcutAnchor.contains(event.target))closeShortcuts();
    },true);
    document.addEventListener('focusin',event=>{
      if(shortcutAnchor&&!shortcuts.contains(event.target)&&!shortcutAnchor.contains(event.target))closeShortcuts();
    });
    document.addEventListener('keydown',event=>{
      if(!shortcutAnchor)return;
      if(event.key==='Escape'){
        event.preventDefault();
        closeShortcuts(true);
      }else if(shortcuts.contains(document.activeElement)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const items=Array.from(shortcuts.querySelectorAll('button:enabled')),index=items.indexOf(document.activeElement);
        if(!items.length)return;
        const next={ArrowDown:(index+1)%items.length,ArrowUp:(index+items.length-1)%items.length,Home:0,End:items.length-1};
        items[next[event.key]].focus();
      }
    },true);
    window.addEventListener('resize',()=>closeShortcuts());
    window.addEventListener('blur',()=>closeShortcuts());
    more.setAttribute('aria-controls',shortcuts.id);
    more.setAttribute('aria-expanded','false');
    more.onclick=()=>showShortcuts(more);
    const page=document.createElement('section');page.id='chatPage';page.hidden=true;
    const log=document.createElement('div');log.id='liveChat';log.setAttribute('role','log');log.setAttribute('aria-label',t('对话'));log.setAttribute('aria-live','polite');
    const form=document.createElement('form');form.id='liveComposer';
    const add=button('deskAdd','plus','对话工具');add.classList.add('panel-scene-extra');
    add.setAttribute('aria-controls',shortcuts.id);
    add.setAttribute('aria-expanded','false');
    add.onclick=()=>showShortcuts(add,'chat');
    const input=document.createElement('textarea');input.id='liveMessage';input.rows=1;input.maxLength=2000;input.setAttribute('aria-label',t('输入消息'));
    const send=button('liveSend','send','发送'),cancel=button('liveCancel','stop','取消');send.type='submit';send.disabled=true;cancel.hidden=true;
    const sendLabel=document.createElement('span');sendLabel.className='arc-send-label';sendLabel.textContent=t('发送')+' ↗';send.append(sendLabel);
    const feedback=document.createElement('output');feedback.id='liveFeedback';feedback.setAttribute('aria-live','polite');
    form.append(add,input,cancel,send);page.append(log,feedback,form);main.append(page);
    let currentKey='',portraitSerial=0,active=null,loadSerial=0,sectionId='',lastRows=[],pendingReply,receiptTimer,disposed=false;
    const identity=()=>{const a=data&&selectedActor();return a?[pet,a.id,a.characterId,a.assetId,a.resolvedSpeaker?.name].join(':'):'';};
    const visible=()=>{
      if(page.hidden||document.hidden)return false;
      const panel=$('panelMotion');
      if(panel&&panel.getBoundingClientRect().top < -1)return false;
      const surface=$('broadcastPanel');
      if(!surface)return true;
      const message=log.lastElementChild?.getBoundingClientRect();
      if(!message)return false;
      const viewport=surface.getBoundingClientRect(),clip=log.getBoundingClientRect();
      return Math.max(message.top,clip.top,viewport.top,0)<Math.min(message.bottom,clip.bottom,viewport.bottom,window.innerHeight);
    };
    const boundActor=()=>!!actorId&&data?.bindings?.[pet]===actorId;
    const enabled=()=>{
      input.readOnly=!!active;
      send.disabled=!!active||!!pendingReply||!input.value.trim()||!boundActor();
      cancel.hidden=!active;
      page.setAttribute('aria-busy',String(!!active));
    };
    function row(r){
      const article=document.createElement('article');article.className='chat-record';article.dataset.role=r.type;
      article.dataset.speaker=r.type==='user'?(data.userPersona?.name||'我'):(r.speakerName||selectedActor()?.resolvedSpeaker?.name||selectedActor()?.name||'角色');
      article.dataset.messageId=r.id||'';article.append(paragraph(r.text));return article;
    }
    function paint(rows){const tail=log.scrollHeight-log.scrollTop-log.clientHeight<60;log.replaceChildren(...rows.map(row));if(tail)log.scrollTop=log.scrollHeight;}
    async function load(){
      const key=identity(),serial=++loadSerial;
      if(!key)return;
      try{
        const history=await api('recent-history',{actorId});
        if(serial!==loadSerial||key!==identity())return;
        lastRows=[...(history.messages||[])].reverse();
        const rows=[...lastRows];
        if(pendingReply){
          const [question,reply]=pendingReply.rows;
          if(!lastRows.some(r=>r.type==='user'&&r.text===question.text&&r.at>=pendingReply.sentAt))rows.push(question);
          if(!lastRows.some(r=>r.id===reply.id))rows.push(reply);
        }
        paint(rows);
      }catch{
        if(serial===loadSerial&&key===identity()&&!active)feedback.textContent=t('历史暂时无法更新，当前对话已保留。');
      }
    }
    async function cancelRequest(){
      const job=active;
      if(!job||job.controller.signal.aborted)return;
      job.controller.abort();
      cancel.disabled=true;
      feedback.textContent='';
      try{await requestJson('cancel',{method:'POST'});}
      catch{if(active===job)feedback.textContent=t('取消结果尚未确认，请稍后再试。');}
      finally{if(active===job)active=null;cancel.disabled=false;enabled();}
    }
    cancel.onclick=cancelRequest;
    input.oninput=enabled;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();form.requestSubmit();}});
    // Only a reply which reached the visible panel receives the same display receipt as the pet bubble.
    async function acknowledge(){
      clearTimeout(receiptTimer);const p=pendingReply;if(!p||p.key!==identity()||disposed)return;
      if(Date.now()-p.at>180000){pendingReply=null;enabled();return;}
      if(p.confirming)return;
      if(!visible()){receiptTimer=setTimeout(()=>void acknowledge(),500);return;}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(p!==pendingReply||p.key!==identity()||p.confirming)return;
      if(!visible()){receiptTimer=setTimeout(()=>void acknowledge(),500);return;}
      p.confirming=true;
      try{
        if(p.deliveryId){
          const renderedAt=p.renderedAt??=Date.now();
          const receipt=await api('ack-chat',{deliveryId:p.deliveryId,renderedAt,displayMs:renderedAt-p.sentAt});
          if(typeof receipt.ok!=='boolean')throw new Error('receipt');
        }
        if(p!==pendingReply)return;
        pendingReply=null;enabled();
        if(p.deliveryId)await load();
        else lastRows.push(...p.rows);
      }catch{if(p===pendingReply)receiptTimer=setTimeout(()=>void acknowledge(),3000);}
      finally{p.confirming=false;}
    }
    form.onsubmit=async e=>{
      e.preventDefault();const text=input.value.trim();if(!text||active||pendingReply||!boundActor())return;
      const job={key:identity(),controller:new AbortController(),sentAt:Date.now()};active=job;enabled();feedback.textContent=t('正在回复…');
      try{
        const response=await fetch('../chat?pet='+encodeURIComponent(pet)+'&surface=any',{method:'POST',headers:{'Content-Type':'application/json',...(token&&{'X-DSH-Pet-Token':token})},body:JSON.stringify({text}),signal:AbortSignal.any([job.controller.signal,AbortSignal.timeout(120000)])});
        const answer=await response.json();if(active!==job||job.controller.signal.aborted||job.key!==identity())return;
        if(!response.ok||!answer.ok||typeof answer.text!=='string'||!answer.text.trim())throw new Error('unavailable');
        input.value='';feedback.textContent='';pendingReply={key:job.key,at:Date.now(),sentAt:job.sentAt,deliveryId:answer.deliveryId,rows:[{id:'question:'+job.sentAt,type:'user',text},{id:answer.deliveryId||'reply:'+job.sentAt,type:'assistant',text:answer.text}]};
        paint([...lastRows,...pendingReply.rows]);log.scrollTop=log.scrollHeight;latest.replaceChildren(paragraph(answer.text));latest.hidden=false;
        recentSpeech=answer.text;
        if(bookTheme())showExcerpt(0);
        void acknowledge();
      }catch{if(active===job&&!job.controller.signal.aborted)feedback.textContent=t('这次没有收到回复，输入已保留，可以稍后重试。');}
      finally{if(active===job&&!job.controller.signal.aborted)active=null;enabled();}
    };
    async function fill(actor,profile){
      const key=identity(),changed=key!==currentKey;
      if(changed){active?.controller.abort();active=null;pendingReply=null;clearTimeout(receiptTimer);lastRows=[];log.replaceChildren();input.value='';feedback.textContent='';currentKey=key;}
      const previousExcerpts=readEntries();
      entries=actor?.panelExcerpts?.reading||[];
      const excerpts=actor?.panelExcerpts?.broadcast||[];
      const asset=data.assets.find(a=>a.id===actor?.assetId),card=asset?.card?.data||asset?.card||{};
      const greetings=[card.first_mes,...(Array.isArray(card.alternate_greetings)?card.alternate_greetings:[])];
      const publicLines=(excerpts.length?excerpts:greetings).filter(line=>typeof line==='string'&&line.trim())
        .map(line=>line.trim().replace(/\{\{char\}\}/gi,()=>profile.name||'').replace(/\{\{user\}\}/gi,()=>data.userPersona?.name||'你'));
      broadcastProgram={title:excerpts.length||!publicLines.length?'世界书摘录':'角色卡开场',entries:[...new Set(publicLines)]};
      enabled();
      const serial=++portraitSerial;
      const displayed=portrait.querySelector('img');
      if(changed||!displayed){
        const fallback=document.createElement('span');
        fallback.textContent=Array.from(profile.name||'◇')[0];
        portraitArt.show(fallback);
        delete log.dataset.speakerArt;
        log.style.removeProperty('--speaker-art');
      }
      const speech=data.events.filter(e=>e.characterId===actor?.characterId&&e.type==='assistant'&&e.deliveryState==='displayed').at(-1)?.text;latest.replaceChildren(...(speech?[paragraph(speech)]:[]));latest.hidden=!speech;
      recentSpeech=speech||'';
      const currentExcerpts=readEntries();
      if(changed||currentExcerpts.length!==previousExcerpts.length||currentExcerpts.some((value,i)=>value!==previousExcerpts[i]))showExcerpt(0);
      try{
        const src=await cover(asset)||profile.portrait;
        if(serial===portraitSerial&&(!displayed?.isConnected||displayed.src!==src||!log.hasAttribute('data-speaker-art'))
          &&typeof src==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(src)){
          const image=new Image();image.src=src;image.alt=profile.name;
          await image.decode();
          if(serial===portraitSerial){
            if(!displayed?.isConnected||displayed.src!==src)portraitArt.show(image);
            const preview=document.createElement('canvas');
            preview.width=preview.height=112;
            const size=Math.min(image.naturalWidth,image.naturalHeight);
            preview.getContext('2d').drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,112,112);
            const thumbnail=new Image();
            thumbnail.src=preview.toDataURL('image/png');
            await thumbnail.decode();
            if(serial===portraitSerial){
              log.style.setProperty('--speaker-art','url("'+thumbnail.src+'")');
              log.dataset.speakerArt='';
            }
          }
        }
      }catch{/* keep the existing identity placeholder */}
      if(sectionId==='chatPage')void load();
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pendingReply)void acknowledge();});
    const preferenceObserver=new MutationObserver(()=>{
      const reduced=String(document.body.classList.contains('reduce-motion'));
      if(motion.getAttribute('aria-pressed')===reduced)return;
      motion.setAttribute('aria-pressed',reduced);
      scheduleExcerpt();
    });
    preferenceObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    const themeObserver=new MutationObserver(()=>{
      closeShortcuts();resetTooltips();portraitArt.reset();showExcerpt(0);
      const cardDetails=$('cardPreview')?.querySelector('details');
      if(cardDetails)cardDetails.open=!bookTheme();
    });
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    window.addEventListener('pagehide',()=>{
      disposed=true;active?.controller.abort();clearTimeout(receiptTimer);
      stopExcerptMotion();excerptObserver.disconnect();excerptSize.disconnect();
      excerptMotion.removeEventListener('change',syncExcerptMotion);
      portraitArt.reset();preferenceObserver.disconnect();themeObserver.disconnect();
    },{once:true});
    return {fill,showCover,broadcastProgram:()=>broadcastProgram,ready(){addAppearanceControls(savePreferences,getPreferences);},
      title(id,label,page){
        title.textContent=id==='chatPage'?t('对话记录'):label||'';
        bookTitle.textContent=document.body.dataset.page==='dialogue'?t('对话记录'):t(page||'');
        main.dataset.bookTitle=t(label||'');
      },
      section(id){closeShortcuts();resetTooltips();sectionId=id;if(id==='chatPage'){void load();if(pendingReply)void acknowledge();}}};
  }
  window.ArkPanelUI={t,icon,bookIcon:name=>icon(bookIcons[name]||name),cover,preferences,install};
})();
