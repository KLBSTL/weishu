import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, sleep, problemsOf } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();
for (const startRound of [1, 'boss']) test(`relay map: selected via UI, ${startRound} battlefield`, { skip: !enabled, timeout: 180000 }, async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startRealServer({ fast: { seed: 3, startRound, kit: 6, autoPlace: true, timerScale: 1 } });
  const c = new Client(puppeteer, srv.base, 'relay', { prefix: `relay-${startRound}` });
  try {
    await c.open(); await c.enter('双廊验收');
    await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '险境');
    await c.click('.create-box button', '开始独立模拟');
    await c.waitFor(s => !!s.room, 'room');
    await c.page.waitForSelector('#room-stage:not(:disabled)');
    await c.page.select('#room-stage', 'local_relay_lab');
    await c.page.waitForFunction(() => globalThis.__SP__.store.get().room.stageId === 'local_relay_lab');
    await c.shot('room-desktop');
    await c.page.setViewport({ width: 844, height: 390 }); await sleep(300);
    await c.shot('room-phone');
    const fits = await c.page.$eval('#room-stage', el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight; });
    assert.ok(fits, 'map selector fits landscape phone');
    await c.page.setViewport({ width: 1920, height: 1080 });
    await c.click('.room-bar__right button', '开始模拟');
    await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
    assert.equal(await c.page.$eval('.brief-stage__pool', e => e.textContent), '战场固定');
    await c.click('.brief__foot .btn--primary', '准备就绪');
    await c.waitFor(s => s.phase === 'BAND_DRAFT', 'draft');
    await c.page.waitForSelector('[data-band="band_recruit_sarkaz"]');
    await c.page.$eval('[data-band="band_recruit_sarkaz"]', e => e.scrollIntoView({ block: 'center' }));
    await c.click('[data-band="band_recruit_sarkaz"]');
    await c.click('.draft-detail__btns .btn--primary', '确认选择');
    await c.waitFor(s => s.phase === 'PREP' && !s.ready, 'prep');
    assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().match.public.stageId), 'local_relay_lab');
    await sleep(3000); await c.shot('prep');
    await c.click('.readybtn');
    await c.click('.modal__actions button', '准备就绪', { optional: true, timeout: 1500 });
    await c.waitFor(s => ['COMBAT', 'FINAL_ASSAULT'].includes(s.phase), 'battle');
    await sleep(2500); await c.shot('combat');
    assert.deepEqual(problemsOf([c]).filter(x => !/fonts.googleapis|fonts.gstatic/.test(x)), []);
  } finally { await c.close(); await srv.stop(); }
});
