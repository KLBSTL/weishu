import { html } from './components.js';
import { artTheme, ART_KINDS } from './gameLogic/artThemes.js';

/** Decorative viewport; the owning button retains its real label and hit area. */
export function ArtImage({ theme, kind = 'bans', onLoad, onError }) {
  const entry = artTheme(theme);
  const [width, height] = entry.canvas;
  const [x, y, w, h] = entry.regions[Math.max(0, ART_KINDS.indexOf(kind))];
  return html`<span class="art-image" aria-hidden="true" style=${`aspect-ratio:${w}/${h}`}>
    <img src=${`/ui-art/${entry.file}`} alt="" draggable=${false} onLoad=${onLoad} onError=${onError}
      style=${`width:${width / w * 100}%;height:${height / h * 100}%;left:${-x / w * 100}%;top:${-y / h * 100}%`} />
  </span>`;
}
