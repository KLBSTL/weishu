/* global window, document, ResizeObserver, requestAnimationFrame, cancelAnimationFrame */
(() => {
  // Measure actual rendered rows; no estimates based on character counts or window presets.
  class FittedPages {
    constructor(body, controls, render, { split = true } = {}) {
      this.body = body; this.render = render; this.split = split; this.rows = []; this.pages = []; this.index = 0;
      this.events = new AbortController(); const signal = this.events.signal;
      this.previous = document.createElement('button'); this.next = document.createElement('button'); this.counter = document.createElement('span');
      this.previous.textContent = '‹'; this.previous.setAttribute('aria-label','上一页'); this.next.textContent = '›'; this.next.setAttribute('aria-label','下一页');
      controls.append(this.previous,this.counter,this.next); controls.classList.add('pager');
      this.previous.onclick = () => this.turn(-1); this.next.onclick = () => this.turn(1);
      body.tabIndex = 0;
      body.addEventListener('wheel', e => {
        if(e.ctrlKey||e.target.closest('textarea,input,select')||this.pages.length<2)return;
        const amount=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?18:e.deltaMode===2?body.clientHeight:1);
        if(!amount)return;e.preventDefault();
        const now=performance.now();if(now-(this.wheelAt||0)>150||Math.sign(amount)!==Math.sign(this.wheelDistance||0))this.wheelDistance=0;
        this.wheelAt=now;if(now<(this.wheelUntil||0))return;this.wheelDistance=(this.wheelDistance||0)+amount;
        if(Math.abs(this.wheelDistance)>=65){this.turn(Math.sign(this.wheelDistance));this.wheelDistance=0;this.wheelUntil=now+280;}
      },{passive:false,signal});
      body.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button'))return;const d={PageDown:1,PageUp:-1,ArrowRight:1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();this.turn(d);}},{signal});
      body.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')this.touch={x:e.clientX,y:e.clientY};},{signal});
      body.addEventListener('pointerup',e=>{const p=this.touch;this.touch=null;if(p&&Math.abs(e.clientX-p.x)>48&&Math.abs(e.clientX-p.x)>Math.abs(e.clientY-p.y)*1.4)this.turn(e.clientX<p.x?1:-1);},{signal});
      body.addEventListener('pointercancel',()=>{this.touch=null;},{signal});
      this.observer = new ResizeObserver(() => this.refresh()); this.observer.observe(body);
      document.fonts?.addEventListener('loadingdone',()=>{this.dirty=true;this.refresh();},{signal});
    }
    turn(direction) {
      const next=Math.max(0,Math.min(this.pages.length-1,this.index+direction));
      if(next===this.index)return;
      this.index=next;this.paint(direction);
    }
    set(rows, reset = true) { this.rows = rows; this.dirty=true; if (reset) this.index = 0; this.refresh(); }
    refresh() {
      if(this.disposed)return;
      cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.reflow());
    }
    dispose() { this.disposed=true;this.events.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);cancelAnimationFrame(this.workFrame);this.work?.return();this.work=null; }
    reflow() {
      const room = this.body.clientHeight - 2; if (room < 35 || this.body.clientWidth < 40) return;
      if(document.body.dataset.transition==='active'){this.frame=requestAnimationFrame(()=>this.reflow());return;}
      const style=window.getComputedStyle(this.body),dimensions=this.body.clientWidth+':'+room+':'+style.font+':'+style.lineHeight;
      if(!this.dirty&&this.dimensions===dimensions)return;
      this.dimensions=dimensions;this.dirty=false;
      this.work?.return();cancelAnimationFrame(this.workFrame);
      this.work=this.measurePages(room);const work=this.work;
      const advance=()=>{
        if(work!==this.work)return;
        if(this.body.clientHeight<35){work.return();this.dirty=true;return;}
        const start=performance.now();
        for(let count=0;count<24&&performance.now()-start<6;count++){
          if(work.next().done){this.work=null;return;}
        }
        this.workFrame=requestAnimationFrame(advance);
      };advance();
    }
    *measurePages(room) {
      const measure = document.createElement('div'); measure.className = 'page-measure page-stack'; this.body.append(measure);
      const fits = rows => { measure.replaceChildren(...rows.map(row => this.render(row))); return measure.scrollHeight <= room; };
      const pages = []; let page = [];
      const finish = () => { if(page.length)pages.push(page);page=[]; };
      try {
      for (const row of this.rows) {
        yield;
        if (!this.split || fits([row])) {
          if(page.length&&!fits([...page,row]))finish();
          page.push({ ...row, part:0 });continue;
        }
        const glyphs = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(row.text)].map(x=>x.segment) : Array.from(row.text);
        let offset = 0, part = 0;
        while (offset < glyphs.length) {
          let lo = 1, hi = glyphs.length - offset, best = 0;
          while (lo <= hi) { const mid = (lo+hi)>>1, fragment = { ...row, text:glyphs.slice(offset,offset+mid).join(''),part };
            if (fits([...page,fragment])) { best=mid;lo=mid+1; } else hi=mid-1;
            yield;
          }
          if(!best&&page.length){finish();continue;}
          best=Math.max(1,best);
          if (offset+best < glyphs.length) {
            const tail = glyphs.slice(offset,offset+best), boundary = tail.findLastIndex(g => /^[。！？；\n]$/u.test(g));
            if (boundary > best*.55) best = boundary+1;
          }
          page.push({ ...row, text:glyphs.slice(offset,offset+best).join(''), part:part++ }); offset+=best;
          if(offset<glyphs.length)finish();
        }
      }
      finish(); const anchor = this.pages[this.index]?.[0]; this.pages=pages;
      if(anchor){const at=pages.findIndex(p=>p.some(r=>r.id===anchor.id&&r.part===anchor.part));if(at>=0)this.index=at;}
      this.index=Math.max(0,Math.min(this.index,pages.length-1));this.paint();
      } finally { measure.remove(); }
    }
    paint(direction = 0) {
      const current=this.pages[this.index]||[],measure=this.body.querySelector('.page-measure');this.body.replaceChildren(...current.map(row=>this.render(row)));
      if(measure)this.body.append(measure);
      if(!current.length){const p=document.createElement('p');p.className='empty';p.textContent='暂无内容';this.body.append(p);}
      this.counter.textContent=(this.pages.length?this.index+1:0)+' / '+this.pages.length;
      this.previous.disabled=this.index<=0;this.next.disabled=this.index>=this.pages.length-1;
      this.body.dataset.page=String(this.index);this.body.dataset.pages=String(this.pages.length);
      if(direction)window.ArkMotion?.enter(this.body,direction);
    }
  }
  window.FittedPages=FittedPages;
})();
