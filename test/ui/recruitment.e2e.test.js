// Real server and browser clicks: squad draft -> search -> cancel/reopen -> reconnect -> confirm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, sleep, problemsOf } from '../e2e/client.mjs';
import { DATA } from '../match/harness.js';
const enabled = process.env.SP_E2E === '1' && hasChrome();
const privOf = c => c.page.evaluate(() => globalThis.__SP__.store.get().match.private);
const normal = name => Object.values(DATA.chess).find(c => !c.isGolden && c.name === name).chessId;

for (const kind of ['columbia', 'sarkaz']) test(`recruitment ${kind}: real UI, cancellation and reconnect`, { skip: !enabled, timeout: 180000 }, async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startRealServer({ fast: { seed: 3, startRound: kind === 'columbia' ? 3 : 4, level: 5,
    chess: [normal('伊芙利特')], timerScale: 0.2 } });
  const c = new Client(puppeteer, srv.base, kind, { prefix: `recruitment-${kind}` });
  try {
    await c.open(); await c.enter('检索验收');
    await c.click('.mode-card', '独立模拟'); await c.click('.diff-card', '险境');
    await c.click('.create-box button', '开始独立模拟');
    await c.waitFor(s => !!s.room, 'solo room');
    if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟');
    await c.waitFor(s => s.phase === 'INFO_CHECK', 'briefing');
    await c.click('.brief__foot .btn--primary', '准备就绪');
    await c.waitFor(s => s.phase === 'BAND_DRAFT', 'draft');
    await c.page.waitForSelector(`[data-band="band_recruit_${kind}"]`);
    await c.page.$eval(`[data-band="band_recruit_${kind}"]`, e => e.scrollIntoView({ block: 'center' }));
    await c.click(`[data-band="band_recruit_${kind}"]`);
    await c.click('.draft-detail__btns .btn--primary', '确认选择');
    await c.waitFor(s => s.phase === 'PREP' && !s.ready, 'prep', 45000);
    await c.page.waitForSelector('.recruitment-entry');
    await sleep(2200); // let the normal prep phase banner finish before inspecting the dialog
    const open = async () => {
      await c.click('.recruitment-entry');
      if (kind === 'columbia') {
        await c.click('.recruitment-panel__cards .scard');
        await c.page.waitForSelector('.recruitment-panel__warning');
        assert.match(await c.page.$eval('.recruitment-panel', e => e.textContent), /可能使萨卡兹盟约失活/);
      }
      await c.click('.recruitment-panel .modal__actions .btn--primary');
      await c.page.waitForFunction(() => !!globalThis.__SP__.store.get().match.private.recruitment.offer);
    };
    await open();
    const first = (await privOf(c)).recruitment.offer;
    assert.equal(first.ids.length, kind === 'columbia' ? 2 : 3);
    await sleep(400); await c.shot('desktop');
    await c.page.setViewport({ width: 844, height: 390 }); await sleep(300); await c.shot('phone');
    const bounds = await c.page.$eval('.recruitment-panel', e => { const b = e.getBoundingClientRect(); return { x:b.x, y:b.y, right:b.right, bottom:b.bottom }; });
    assert.ok(bounds.x >= 0 && bounds.right <= 845 && bounds.y >= 0 && bounds.bottom <= 391, JSON.stringify(bounds));
    await c.page.setViewport({ width: 1920, height: 1080 });
    await c.click('.recruitment-panel .modal__actions button', '取消');
    await c.page.waitForFunction(() => !globalThis.__SP__.store.get().match.private.recruitment.offer);
    assert.equal((await privOf(c)).recruitment.charges, 1);
    await open();
    assert.deepEqual((await privOf(c)).recruitment.offer.ids, first.ids);
    await c.page.reload({ waitUntil: 'domcontentloaded' });
    await c.page.waitForFunction(() => !!globalThis.__SP__);
    await c.waitFor(s => s.phase === 'PREP', 'reconnect');
    assert.deepEqual((await privOf(c)).recruitment.offer.ids, first.ids);
    await c.click('.recruitment-entry');
    await c.click('.recruitment-panel__cards .scard');
    await c.click('.recruitment-panel .modal__actions .btn--primary');
    await c.page.waitForFunction(() => globalThis.__SP__.store.get().match.private.recruitment.charges === 0);
    assert.equal((await privOf(c)).recruitment.offer, null);
    const errors = problemsOf([c]).filter(x => !/fonts.googleapis|fonts.gstatic/.test(x));
    assert.deepEqual(errors, []);
  } finally { await c.close(); await srv.stop(); }
});
