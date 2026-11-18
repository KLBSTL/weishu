// Shared by the Electron host, local routes and panel. Theme packs contain only CSS and art.
(function () {
  const themes = Object.freeze({
    crystal: Object.freeze({
      name: '冰晶',
      assets: ['crystal-panel.svg', 'crystal-button.svg', 'crystal-cat.svg', 'crystal-shards.svg',
        'crystal-tip.svg', 'corner.svg', 'portrait.svg', 'background.png', 'pendant.svg'],
    }),
    parchment: Object.freeze({
      name: '羊皮手札',
      assets: ['paper.svg', 'frame.svg', 'user-frame.svg', 'plaque.svg', 'botanical.svg', 'corner.svg', 'portrait.svg', 'pendant.svg'],
    }),
    desk: Object.freeze({
      name: '复古书桌',
      assets: ['study.png','quill.png','nav.svg','nav-active.svg','sheet.svg','input-deck.svg','title.svg','accent.svg','portrait.svg','tassel.svg',
        ...['overview','people','world','dialogue','status','settings'].map(page => 'icon-' + page + '.svg')],
    }),
    book: Object.freeze({
      name: '摊开书册',
      assets: ['shell.webp','rail.webp','rim.webp','seal.webp','flowers.svg',
        'frame-paper.svg','frame-engraved.svg','frame-gilded.svg'],
    }),
    broadcast: Object.freeze({
      name: '虹轨放送',
      assets: ['skin.css','cursors.css','panel.css','bubbles.css','arc-broadcast.webp','arc-cherry-vinyl.webp'],
    }),
  });
  const defaultTheme = 'crystal';
  const defaultPanelTheme = 'book';
  const normalizeTheme = (id, fallback = defaultTheme) =>
    typeof id === 'string' && Object.hasOwn(themes, id) ? id : fallback;
  function loadStyles(document, base) {
    for (const id of Object.keys(themes)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + '/' + id + '/theme.css';
      document.head.append(link);
    }
  }
  const catalog = { themes, defaultTheme, defaultPanelTheme, normalizeTheme, loadStyles };
  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
  else globalThis.ArkPanelThemes = catalog;
})();
