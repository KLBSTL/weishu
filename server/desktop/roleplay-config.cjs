const { defaultPanelTheme, normalizeTheme } = require('./roleplay-themes.cjs');
const defaults = Object.freeze({ width: 1200, height: 800, fontFamily: 'Microsoft YaHei', fontSize: 18, gemSize: 80, lineLength: 72, sway: true, reducedMotion: false, moveEnabled: false, palette: 'blue', backgroundOpacity: 8, theme: defaultPanelTheme });
function settings(input = {}) {
  const value = { ...defaults };
  for (const [key, min, max] of [['width',760,2400], ['height',560,1600], ['fontSize',14,28], ['gemSize',64,104], ['lineLength',24,160], ['backgroundOpacity',0,16]]) {
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
  if (input.palette !== undefined) { if (!['blue','dusk','mist'].includes(input.palette)) throw new Error('显示设置格式错误'); value.palette = input.palette; }
  value.theme = normalizeTheme(input.theme, defaultPanelTheme);
  return value;
}
function restoreSettings(position) {
  const stored=position.settings;
  const separated=Object.hasOwn(position,'petTheme');
  const petTheme=normalizeTheme(separated?position.petTheme:stored?.theme);
  // Before the two surfaces had separate preferences, theme applied to both windows.
  let prefs;
  try{prefs=settings({...stored,theme:separated?stored?.theme:undefined});}catch{prefs=settings();}
  return {prefs,petTheme};
}
const dockSize = value => ({ width: value.gemSize + 32, height: value.lineLength + Math.round(value.gemSize * 1.2) + 24 });
function shellLayout(value, display, anchor) {
  const a=display.workArea,b=display.bounds,tail=dockSize(value).height+12;
  const width=Math.min(value.width,a.width-16), height=Math.min(value.height,a.y+a.height-b.y-tail);
  const padding=Math.ceil(Math.sin(Math.PI/10)*(value.lineLength+value.gemSize*1.2+8))+16;
  const margin=value.gemSize/2+padding;
  const desired=Number.isFinite(anchor)?anchor:a.x+a.width-margin-16;
  const x=Math.round(Math.max(a.x+8,Math.min(desired-(width-margin),a.x+a.width-width-8)));
  const gemX=Math.round(Math.max(margin,Math.min(desired-x,width-margin)));
  return {bounds:{x,y:b.y,width,height:height+tail},panelHeight:height,gemX,tail,margin,screenTop:b.y};
}
module.exports = { defaults, settings, restoreSettings, dockSize, shellLayout };
