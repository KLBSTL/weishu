/* global window, document, ResizeObserver, requestAnimationFrame, cancelAnimationFrame */
(() => {
  // Measure actual rendered rows; no estimates based on character counts or window presets.
  class FittedPages {
    constructor(body, controls, render, { split = true } = {}) {
      this.body = body; this.render = render; this.split = split; this.rows = []; this.pages = []; this.index = 0;
      this.previous = document.createElement('button'); this.next = document.createElement('button'); this.counter = document.createElement('span');
      this.previous.textContent = '‹'; this.previous.setAttribute('aria-label','上一页'); this.next.textContent = '›'; this.next.setAttribute('aria-label','下一页');
      controls.append(this.previous,this.counter,this.next); controls.classList.add('pager');
      this.previous.onclick = () => { this.index--; this.paint(); }; this.next.onclick = () => { this.index++; this.paint(); };
      this.observer = new ResizeObserver(() => this.refresh()); this.observer.observe(body);
    }
    set(rows, reset = true) { this.rows = rows; if (reset) this.index = 0; this.refresh(); }
    refresh() {
      cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.reflow());
    }
    reflow() {
      const room = this.body.clientHeight - 2; if (room < 35 || this.body.clientWidth < 40) return;
      const anchor = this.pages[this.index]?.[0];
      const measure = document.createElement('div'); measure.className = 'page-measure page-stack'; this.body.append(measure);
      const fits = rows => { measure.replaceChildren(...rows.map(row => this.render(row))); return measure.scrollHeight <= room; };
      const pages = []; let page = [];
      const finish = () => { if(page.length)pages.push(page);page=[]; };
      for (const row of this.rows) {
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
      finish(); measure.remove(); this.pages=pages;
      if(anchor){const at=pages.findIndex(p=>p.some(r=>r.id===anchor.id&&r.part===anchor.part));if(at>=0)this.index=at;}
      this.index=Math.max(0,Math.min(this.index,pages.length-1));this.paint();
    }
    paint() {
      const current=this.pages[this.index]||[];this.body.replaceChildren(...current.map(row=>this.render(row)));
      if(!current.length){const p=document.createElement('p');p.className='empty';p.textContent='暂无内容';this.body.append(p);}
      this.counter.textContent=(this.pages.length?this.index+1:0)+' / '+this.pages.length;
      this.previous.disabled=this.index<=0;this.next.disabled=this.index>=this.pages.length-1;
      this.body.dataset.page=String(this.index);this.body.dataset.pages=String(this.pages.length);
    }
  }
  window.FittedPages=FittedPages;
})();
