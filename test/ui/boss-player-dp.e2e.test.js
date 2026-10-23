import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startServer } from '../../server/index.js';
import { makeBattle } from '../helpers/battleHarness.js';

const chrome = process.env.CHROME_PATH;
const enabled = process.env.SP_E2E === '1' && chrome && existsSync(chrome);

test('boss/hidden: both clients show personal DP and switch balances without another battle frame',
  { skip: !enabled && 'Set SP_E2E=1 and CHROME_PATH', timeout: 60000 }, async () => {
    const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
    const cases = [];
    try {
      for (const kind of ['boss', 'hidden']) {
        const h = makeBattle({ kind, content: 'none', stageId: 'act2autochess_m01', autoFinish: false, fieldId: 'b1', players: [
          { playerId: 'p1', side: 'L', units: [{ uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 5 }] },
          { playerId: 'p3', side: 'R', colOffset: 8, units: [{ uid: 1, chessId: 'chess_char_1_01_a', row: 10, col: 5 }] },
        ] });
        h.step();
        h.b.addDp('p1', -3);
        h.b.addDp('p3', 30);
        const snapshot = h.b.snapshot();
        const field = { ...h.b.fieldMeta(), local: true, players: ['p1', 'p3'], sides: { p1: 'L', p3: 'R' } };
        for (const myId of field.players) {
          const page = await browser.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.setViewport({ width: 1280, height: 720 });
          await page.goto(`http://127.0.0.1:${server.port}/dev/game-mock.html?render=fallback&shot=1&phase=PREP`);
          await page.waitForSelector('.ff-piece');
          await page.evaluate(async ({ myId, field, snapshot, kind }) => {
            const { store } = await import('/js/store.js');
            const { net } = await import('/js/net.js');
            const s = store.get();
            store.set({ me: { ...s.me, playerId: myId }, match: { ...s.match,
              public: { ...s.match.public, combatMode: 'client', phase: kind === 'boss' ? 'FINAL_ASSAULT' : 'HIDDEN_CORE',
                round: kind === 'boss' ? 14 : 15, bossRound: true, fields: [field],
                players: s.match.public.players.map((p) => ({ ...p, fieldId: field.players.includes(p.playerId) ? 'b1' : null })) },
              field, battle: { fieldId: 'b1', kind, members: field.players, loading: false, watch: false },
            } });
            net._emit('b.snap', snapshot); // buffered frame, before the field-entry effect
          }, { myId, field, snapshot, kind });
          const balance = async (expected) => page.waitForFunction((n) => document.querySelector('.dpbox b')?.textContent === String(n), {}, expected);
          await balance(snapshot.dps[myId]);
          await page.waitForSelector('.chud__layers');
          const other = myId === 'p1' ? 'p3' : 'p1';
          const side = myId === 'p1' ? '右侧战场' : '左侧战场';
          await page.click(`.chud__layers .vswitch__arrow[aria-label="${side}"]`);
          await balance(snapshot.dps[other]);
          const back = side === '右侧战场' ? '左侧战场' : '右侧战场';
          await page.click(`.chud__layers .vswitch__arrow[aria-label="${back}"]`);
          await balance(snapshot.dps[myId]);
          await page.evaluate(async (snapshot) => {
            const { net } = await import('/js/net.js');
            net._emit('b.snap', { ...snapshot, dp: 0, dps: { p1: 0, p3: 99 } });
          }, snapshot);
          await balance(myId === 'p1' ? 0 : 99);
          assert.deepEqual(errors, []);
          cases.push(`${kind}/${myId}: own, other half, panorama, live 0/99`);
          await page.close();
        }
      }
      console.log(cases.join('\n'));
    } finally {
      await browser.close();
      await server.close();
    }
  });
