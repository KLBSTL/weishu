const defaults = Object.freeze({ width: 1200, height: 800, fontFamily: 'Microsoft YaHei', fontSize: 18, gemSize: 80, lineLength: 72, sway: true, reducedMotion: false, moveEnabled: false });
function settings(input = {}) {
  const value = { ...defaults };
  for (const [key, min, max] of [['width',760,2400], ['height',560,1600], ['fontSize',14,28], ['gemSize',64,104], ['lineLength',24,160]]) {
    if (input[key] !== undefined) {
      if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error('显示设置超出可选范围');
      value[key] = input[key];
    }
  }
  if (input.fontFamily !== undefined) {
    if (typeof input.fontFamily !== 'string' || !/^[\p{L}\p{N} _-]{1,64}$/u.test(input.fontFamily)) throw new Error('请输入本机字体名称');
    value.fontFamily = input.fontFamily;
  }
  for (const key of ['sway','reducedMotion','moveEnabled']) if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') throw new Error('显示设置格式错误'); value[key] = input[key]; }
  return value;
}
const dockSize = value => ({ width: value.gemSize + 32, height: value.lineLength + Math.round(value.gemSize * 1.2) + 24 });
function shellLayout(value, display, anchor) {
  const a=display.workArea,b=display.bounds,tail=dockSize(value).height+12;
  const width=Math.min(value.width,a.width-16), height=Math.min(value.height,a.y+a.height-b.y-tail);
  const padding=Math.ceil(Math.sin(Math.PI/30)*(value.lineLength+value.gemSize*1.2))+16;
  const margin=value.gemSize/2+padding;
  const desired=Number.isFinite(anchor)?anchor:a.x+a.width-margin-16;
  const x=Math.round(Math.max(a.x+8,Math.min(desired-(width-margin),a.x+a.width-width-8)));
  const gemX=Math.round(Math.max(margin,Math.min(desired-x,width-margin)));
  return {bounds:{x,y:b.y,width,height:height+tail},panelHeight:height,gemX,tail,margin,screenTop:b.y};
}
module.exports = { defaults, settings, dockSize, shellLayout };
