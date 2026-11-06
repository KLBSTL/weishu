/* global sprites, BASE */
// Optional, status-only DSH Companion extension. Does not override animation/chat/menu methods.
(() => {
  const labels={idle:'待机',thinking:'思考中',working:'工作中',waiting_approval:'待审批',completed:'已完成',error:'异常',offline:'离线'};
  const style=document.createElement('style');
  style.textContent='.dsh-companion-state{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);z-index:15;white-space:nowrap;padding:4px 9px;border-radius:8px;background:#20332ee8;color:#edf6ef;font:11px/1.5 system-ui;pointer-events:none;box-shadow:0 2px 8px #0002}.dsh-companion-state[data-state=waiting_approval]{background:#795616}.dsh-companion-state[data-state=offline]{background:#5d6963}';
  document.head.append(style);
  let last=null;
  async function poll(){
    try{const res=await fetch(BASE+'/stronghold/companion-status',{cache:'no-store',signal:AbortSignal.timeout(2000)});if(!res.ok)throw Error();last=await res.json();}catch{if(last)last={...last,connected:false,state:'offline',pending:0};}
    for(const sprite of sprites){
      let badge=sprite.el.querySelector('.dsh-companion-state');
      if(!last?.enabled){badge?.remove();continue;}
      if(!badge){badge=document.createElement('div');badge.className='dsh-companion-state';badge.setAttribute('role','status');sprite.el.append(badge);}
      const state=last.connected&&last.expiresAt>Date.now()&&labels[last.state]?last.state:'offline';
      badge.dataset.state=state;badge.textContent='DSH · '+labels[state]+(state==='offline'?'':' · 待处理 '+Math.max(0,Math.min(1000,Number(last.pending)||0)));
    }
    setTimeout(poll,1500);
  }
  void poll();
})();
