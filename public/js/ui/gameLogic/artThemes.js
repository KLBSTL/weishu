import { N_ } from '../../../../shared/i18n.js';

const rows = (width, height) => Array.from({ length: 4 }, (_, i) => [0, i * height / 4, width, height / 4]);
export const ART_THEMES = Object.freeze([
  { id: 'inkSeal', name: N_('水墨朱印'), file: 'ink-seal-v2.png', canvas: [1024, 1536], regions: rows(1024, 1536) },
  { id: 'animeSquad', name: N_('赛璐璐小队'), file: 'anime-squad-v2.png', canvas: [1024, 1536], regions: rows(1024, 1536) },
  { id: 'paperGarden', name: N_('花笺合奏 · 站立'), file: 'paper-garden-v2.png', canvas: [1024, 1536], regions: rows(1024, 1536) },
  { id: 'paperGardenSeated', name: N_('花笺合奏 · 围坐'), file: 'paper-garden-seated-v2.png', canvas: [1024, 1536], regions: rows(1024, 1536) },
  { id: 'pencilPaper', name: N_('钢笔彩铅'), file: 'pencil-paper-v1.png', canvas: [1024, 1536], regions: rows(1024, 1536) },
]);
export const ART_KINDS = Object.freeze(['bans', 'loadout', 'library', 'start']);
export const artTheme = id => ART_THEMES.find(theme => theme.id === id) || ART_THEMES[0];
