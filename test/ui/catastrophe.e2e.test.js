import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer, problemsOf, sleep } from '../e2e/client.mjs';

const enabled = process.env.SP_E2E === '1' && hasChrome();

test('天灾: lobby choices, legacy preference, icon, room switching and a real match briefing', { skip: !enabled, timeout: 150000 }, async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startRealServer();
  const c = new Client(puppeteer, srv.base, '天灾', { prefix: 'catastrophe', w: 1600, h: 900 });
  try {
    await c.open(); await c.enter('天灾验收');
    const names = () => c.page.$$eval('.diff-card__name', els => els.map(e => e.textContent.trim()));
    assert.deepEqual(await names(), ['险境模拟', '绝境模拟', '终极模拟', '天灾模拟']);
    await c.page.evaluate(async () => { const { savePref } = await import('/js/store.js'); savePref('lobby.difficulty', 'FUNNY'); });
    await c.page.reload({ waitUntil: 'domcontentloaded' });
    await c.page.waitForSelector('.lobby-screen', { timeout: 30000 });
    assert.equal(await c.page.$eval('.diff-card.is-selected .diff-card__name', e => e.textContent.trim()), '险境模拟');
    await c.click('.mode-card', '独立模拟');
    await c.click('.diff-card', '天灾');
    await c.page.waitForFunction(() => [...document.querySelectorAll('.diff-card img')].some(e => e.src.endsWith('/icons/catastrophe.svg') && e.complete && e.naturalWidth > 0));
    const effects = await c.page.$$eval('.diff-card.is-selected .diff-card__effects > span:not(.diff-card__stage)', els => els.map(e => e.textContent));
    assert.deepEqual(effects, ['道中敌人移速增加，两路类型不同', '领袖阶段敌方生命与物理、法术减伤增加', '隐秘核心领袖能力增加']);
    assert.ok(effects.every(text => text.includes('增加')));
    assert.ok(effects.every(text => !/[0-9%×]/.test(text)), 'difficulty descriptions use qualitative wording');
    await sleep(350); // let the existing selection transition finish before capturing its visual state
    await c.shot('lobby');
    await c.page.setViewport({ width: 844, height: 390 });
    assert.equal(await c.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await c.shot('mobile');
    await c.page.setViewport({ width: 1600, height: 900 });
    await c.click('.create-box button', '开始独立模拟');
    await c.waitFor(s => !!s.room, '天灾 room');
    assert.deepEqual(await c.page.$$eval('.dpick__opt', els => els.map(e => e.textContent.trim())), ['险境', '绝境', '终极', '天灾']);
    await c.click('.dpick__opt', '终极');
    await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.difficulty === 'ABYSS');
    await c.click('.dpick__opt', '天灾');
    await c.page.waitForFunction(() => globalThis.__SP__.store.get().room?.difficulty === 'CATASTROPHE');
    await c.shot('room');
    await c.click('.room-bar__right button', '开始模拟');
    await c.waitFor(s => s.phase === 'INFO_CHECK', '天灾 briefing');
    assert.equal(await c.page.evaluate(() => globalThis.__SP__.store.get().match.public.modeId), 'mode_single_catastrophe');
    await c.shot('briefing');
    assert.deepEqual(problemsOf([c]).filter(s => !/fonts.googleapis|fonts.gstatic/.test(s)), []);
  } catch (error) {
    if (c.page) await c.shot('failure').catch(() => {});
    throw error;
  } finally { await c.close(); await srv.stop(); }
});
