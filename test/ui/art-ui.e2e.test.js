import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';

test('optional menu art: scene settings, room layout, controls and safe fallbacks', {
  skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 120000,
}, async () => {
  const P = (await import('puppeteer-core')).default;
  const srv = await startRealServer();
  const c = new Client(P, srv.base, 'art-ui', { w: 1600, h: 1000, prefix: 'art-ui' });
  const click = async (selector, text) => {
    await c.page.waitForSelector(selector, { visible: true });
    await c.page.$eval(selector, e => e.scrollIntoView({ block: 'center' }));
    await c.click(selector, text);
  };
  const openAppearance = async () => {
    await click('.settings-btn');
    await click('[data-testid="settings-appearance"]');
  };
  try {
    await c.open(); await c.enter('卡片预览');
    await c.click('.mode-card', '同盟模拟'); await c.click('.diff-card', '终极');
    await c.click('.create-box button', '创建同盟'); await c.waitFor(s => !!s.room, 'room');
    assert.equal(await c.page.$('.topbar [data-testid="bond-library-open"]'), null, 'large library entry belongs in the four-entry dock');
    await click('[data-testid="room-avatar-open"]');
    await c.page.type('.room-avatar-picker input', '夕');
    await click('[data-avatar-id]');
    await c.page.waitForFunction(() => !!globalThis.__SP__.store.get().room.seats.find(s => s?.playerId === globalThis.__SP__.store.get().me.playerId)?.avatarId);
    assert.equal(await c.page.$('.art-button'), null, 'old/new profiles default to plain buttons');
    await openAppearance(); await click('#appearance-tab-theme'); await click('[data-art-theme="paperGardenSeated"]');
    assert.equal(await c.page.evaluate(() => document.documentElement.dataset.artUi), undefined, 'theme choice does not enable art');
    await click('.set-art [role="switch"]'); await c.page.keyboard.press('Escape');
    const outside = '[role="switch"][aria-label="局外纸绘风界面"]';
    const inside = '[role="switch"][aria-label="局内纸绘风界面"]';
    const paper = () => c.page.evaluate(() => document.documentElement.dataset.paperStyle);
    await click('.settings-btn');
    assert.equal(await c.page.$eval(outside, e => e.getAttribute('aria-checked')), 'false');
    assert.equal(await c.page.$eval(inside, e => e.getAttribute('aria-checked')), 'false');
    await click(inside);
    assert.equal(await paper(), 'off', 'inside-only setting leaves the room dark');
    await click(inside);
    await c.page.keyboard.press('Escape');
    for (const theme of ['inkSeal', 'animeSquad', 'paperGarden', 'paperGardenSeated', 'pencilPaper']) {
      await c.page.setViewport({ width: 1600, height: 1000 });
      await openAppearance(); await click('#appearance-tab-theme'); await click(`[data-art-theme="${theme}"]`);
      await c.page.keyboard.press('Escape');
      if (theme === 'pencilPaper') {
        assert.equal(await c.page.$('.room-bans.art-button'), null, 'live labels remain available in the dark room');
        await click('.settings-btn');
        await click(outside);
        await c.page.waitForFunction(() => document.documentElement.dataset.paperStyle === 'on');
        await c.page.keyboard.press('Escape');
      }
      await c.page.waitForFunction(id => document.documentElement.dataset.artUi === id && document.querySelectorAll('.room-screen .art-button--ready').length === 4, {}, theme);
      await c.page.waitForFunction(() => [...document.querySelectorAll('.room-bar .art-button--ready')]
        .every(e => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(e).boxShadow === 'none'));
      assert.equal(await c.page.$eval('.seat--empty .seat__filigree', e => getComputedStyle(e).display), 'none', 'full-image cards do not inherit legacy ornamental frames');
      for (const [width, height] of [[1920, 1080], [1280, 900], [844, 390], [640, 360]]) {
        await c.page.setViewport({ width, height });
        const layout = await c.page.evaluate(() => {
          const boxes = [...document.querySelector('.room-bar__right').children].map(e => e.getBoundingClientRect());
          const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
          const smallPrintHidden = [...document.querySelectorAll('.room-launch__status, .room-bar .art-button__badge')]
            .every(e => getComputedStyle(e).clipPath === 'inset(50%)');
          return { overlap, overflow: document.documentElement.scrollWidth > innerWidth + 1, smallPrintHidden };
        });
        assert.deepEqual(layout, { overlap: false, overflow: false, smallPrintHidden: true }, `${theme} ${width}`);
        assert.equal(await c.page.$eval('.doctor-card.is-me', e => {
          const portrait = e.querySelector('.doctor-card__portrait-button').getBoundingClientRect();
          const name = e.querySelector('.seat__name').getBoundingClientRect();
          const card = e.getBoundingClientRect();
          return Math.abs(portrait.left-card.left) < 1 && Math.abs(portrait.top-card.top) < 1
            && Math.abs(portrait.width-card.width) < 1 && Math.abs(portrait.height-card.height) < 1
            && name.bottom <= card.bottom && name.left >= card.left && name.right <= card.right;
        }), true, `${theme} ${width}: image fills the seat and the name stays inside it`);
        if (width >= 1280) {
          const dock = await c.page.evaluate(() => {
            const root = document.querySelector('.room-bar__right');
            const boxes = [...root.children].map(e => e.getBoundingClientRect());
            const banner = document.querySelector('.room-bans .art-image').getBoundingClientRect();
            return { sameRow: boxes.every(b => Math.abs(b.top - boxes[0].top) < 2), minWidth: Math.min(...boxes.map(b => b.width)), bannerHeight: banner.height, topHeight: document.querySelector('.room-topbar').getBoundingClientRect().height };
          });
          assert.ok(dock.sameRow && dock.minWidth > width * .2 && dock.bannerHeight > 42 && dock.topHeight < 90, `${theme} ${width} ${JSON.stringify(dock)}`);
          const frames = await c.page.$$eval('.room-bar .art-button--ready', buttons => buttons.map(e => {
            const s = getComputedStyle(e);
            return [s.borderTopWidth, s.backgroundColor, s.boxShadow];
          }));
          assert.ok(frames.every(([border, background, shadow]) => border === '0px' && background === 'rgba(0, 0, 0, 0)' && shadow === 'none'),
            `${theme}: image entries have no outer frame or panel: ${JSON.stringify(frames)}`);
        }
      }
    }
    await c.page.setViewport({ width: 1600, height: 1000 });
    await click('.settings-btn'); await click(outside); await c.page.keyboard.press('Escape');
    await openAppearance(); await click('#appearance-tab-theme'); await click('[data-art-theme="paperGardenSeated"]');
    await c.page.keyboard.press('Escape');
    await click('.seat--empty button');
    await c.page.waitForSelector('.seat.is-bot');
    await c.page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.seat.is-bot')).opacity) > .99);
    await c.shot('room-h4');
    await click('[data-testid="ban-config-open"]'); await c.page.waitForSelector('.ban-config-dialog');
    await click('[data-testid="ban-config-close"]');
    await click('[data-testid="loadout-open"]'); await c.page.waitForSelector('.lo');
    await c.page.keyboard.press('Escape');
    await click('[data-testid="bond-library-open"]'); await c.page.waitForSelector('.bond-library');
    await c.page.keyboard.press('Escape');
    await c.page.reload({ waitUntil: 'domcontentloaded' }); await c.page.waitForFunction(() => !!globalThis.__SP__);
    await c.waitFor(s => !!s.room, 'reconnected');
    await c.page.waitForFunction(() => document.documentElement.dataset.artUi === 'paperGardenSeated' && !!document.querySelector('.room-bans.art-button--ready'));
    await openAppearance(); await click('#appearance-tab-theme'); await click('.set-art [role="switch"]');
    assert.equal(await c.page.evaluate(() => document.documentElement.dataset.artUi), undefined);
    assert.equal(await c.page.$('.room-bans.art-button'), null);
    await click('.set-art [role="switch"]'); await c.page.keyboard.press('Escape');
    await c.page.setViewport({ width: 640, height: 360 });
    await c.page.waitForFunction(() => !document.querySelector('#boot') || Number(getComputedStyle(document.querySelector('#boot')).opacity) < .01);
    assert.equal(await c.page.$eval('.room-bar .art-button--ready:last-child', e => getComputedStyle(e).color === getComputedStyle(e).backgroundColor), false);
    await c.page.$eval('.room-bar', e => e.scrollIntoView({ block: 'end' })); await c.shot('compact-h4');
    await c.page.setViewport({ width: 1600, height: 1000 });
    await c.page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await c.page.$eval('.doctor-card', e => getComputedStyle(e).animationName), 'none');
    await c.page.goto(`${srv.base}/?lang=en`, { waitUntil: 'domcontentloaded' }); await c.page.waitForFunction(() => !!globalThis.__SP__);
    await c.waitFor(s => !!s.room, 'English');
    await c.page.waitForFunction(() => document.querySelector('.room-bans')?.textContent.includes('Alliance bans'));
    assert.equal(await c.page.$('.room-bans .art-image'), null, 'translated live labels replace Chinese art');
    await c.page.evaluate(() => localStorage.setItem('sp.pref.lang', 'zh'));
    await c.page.setCacheEnabled(false); await c.page.setRequestInterception(true);
    c.page.on('request', r => r.url().includes('/ui-art/') ? r.abort() : r.continue());
    await c.page.reload({ waitUntil: 'domcontentloaded' }); await c.page.waitForFunction(() => !!globalThis.__SP__);
    await c.waitFor(s => !!s.room, 'missing art');
    await c.page.waitForFunction(() => !document.querySelector('.room-bans.art-button') && document.querySelector('.room-bans')?.textContent.includes('盟约禁用'));
    await click('[data-testid="ban-config-open"]'); await c.page.waitForSelector('.ban-config-dialog');
    assert.deepEqual(problemsOf([c]).filter(x => !/fonts.googleapis|fonts.gstatic|\/ui-art\//.test(x)), []);
  } catch (error) {
    if (c.page) await c.shot('review');
    throw error;
  } finally { await c.close(); await srv.stop(); }
});
