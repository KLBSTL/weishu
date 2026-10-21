// Read-only observations of the prepared board. Geometry is a diagnostic, not a proof of combat DPS or safety.
import {fieldModel,rangeRec,rangeTiles,PLAN_DIRS} from '../server/match/bot.js';
import {parseKey,pieceDir,basePositionClass} from '../server/match/board.js';

export function observeBotBoard(m,ps){
  const gd=ps.gd||m.gd,model=fieldModel(m,ps);
  const units=[...ps.board].filter(([,p])=>p.kind==='chess').map(([key,piece])=>({key,piece,rec:rangeRec(ps,gd.chess(piece.id))})).filter(u=>u.rec);
  const heal=u=>u.rec.attackKind==='heal'||u.rec.dmgType==='heal';
  const cover=(u,dir)=>new Set(rangeTiles(u.rec,...parseKey(u.key),dir));
  let attackers=0,wrongFacing=0,unreachableAttackers=0,healers=0,uncoveredHealers=0,exposedHealers=0;
  for(const u of units){
    const now=cover(u,pieceDir(u.piece));
    if(heal(u)){
      healers++;
      if(!units.some(a=>a!==u&&!heal(a)&&now.has(a.key)))uncoveredHealers++;
      // Count a medic beside an incoming path strictly before its first deployed blocker.
      if(model.routes.some(rt=>{
        if(rt.fly)return false;
        const first=rt.tiles.findIndex(k=>units.some(a=>a!==u&&basePositionClass(a.rec)==='melee'&&(a.rec.stats?.blockCnt??1)>0&&a.key===k));
        if(first<0)return false;
        const [r,c]=parseKey(u.key);let index=-1,distance=Infinity;
        rt.tiles.forEach((k,i)=>{const [a,b]=parseKey(k),d=Math.abs(a-r)+Math.abs(b-c);if(d<distance){distance=d;index=i;}});
        return distance<=1&&index>=0&&index<first;
      }))exposedHealers++;
    }else if(u.rec.attackKind!=='none'){
      attackers++;
      const reaches=tiles=>model.routes.some(rt=>(!rt.fly||u.rec.canHitFly)&&rt.tiles.some(k=>tiles.has(k)));
      if(!reaches(now)){
        if(PLAN_DIRS.some(dir=>reaches(cover(u,dir))))wrongFacing++;
        else unreachableAttackers++;
      }
    }
  }
  const specialtyIds=gd.bandBondIds(ps.bandId).filter(id=>gd.bond(id)?.isCore&&!gd.modeInactiveBonds.has(id));
  return{bandId:ps.bandId,specialtyIds,specialtyMembers:specialtyIds.length?Math.max(...specialtyIds.map(id=>ps.bonds[id]?.count||0)):null,
    attackers,wrongFacing,unreachableAttackers,healers,uncoveredHealers,exposedHealers};
}
