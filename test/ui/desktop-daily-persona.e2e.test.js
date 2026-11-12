import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createPersonaStore, MAX_PERSONA_BODY_BYTES } from '../../server/desktop/persona.js';
import { DEFAULT_CHAT_OPTIONS } from '../../server/match/replyStyle.js';
import { CHROME, hasChrome } from '../e2e/client.mjs';
import { crc32, defaultCover, pngChunks } from '../../server/companion/card-png.js';

const entry = fileURLToPath(new URL('../../desktop-pet/node_modules/dsh-pet/lib/standalone.js', import.meta.url));
const enabled = process.env.SP_E2E === '1' && hasChrome() && existsSync(entry);
const helper = new URL('../../desktop-pet/node_modules/dsh-pet/runtime/electron-helper/', import.meta.url);

function pngCard(card) {
  const chunk = (kind, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind), data])));
    return Buffer.concat([length, Buffer.from(kind), data, crc]);
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ...pngChunks(defaultCover()).filter(c => c.type !== 'IEND').map(c => c.raw),
    chunk('tEXt', Buffer.from('chara\0' + Buffer.from(JSON.stringify(card)).toString('base64'))),
    chunk('paDd', Buffer.alloc(1024 * 1024)), chunk('IEND', Buffer.alloc(0))]);
}

async function until(read, label) {
  for (const end = Date.now() + 15000; Date.now() < end; await delay(80)) {
    const value = await read();
    if (value) return value;
  }
  assert.fail('Timed out: ' + label);
}

test('standalone daily chat reads the shared persona without a game server and retains native memory',
  { skip: !enabled && 'requires SP_E2E=1, Edge/Chrome and bundled dsh-pet v0.4.1', timeout: 120000 }, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'sp-daily-persona-'));
    const data = join(temp, 'dsh-pet');
    const requests = [];
    const faults = [], failures = [];
    const longReply = '长。'.repeat(50) + '[图:Ciallo]';
    const replies = ['嗯，我陪你慢慢聊。', '好呀，接着说！', '又回到平时的语气啦。', '今天也慢慢来。',
      longReply, longReply, longReply, '重试后恢复正常。', '想清楚了，我陪你慢慢聊。'];
    let releaseFirst;
    let releaseCancelled;
    const cancelledGate = new Promise(resolve => { releaseCancelled = resolve; });
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const model = http.createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      if (faults.length) {
        const status = faults.shift();
        failures.push(status);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'do-not-log-this-secret private-card-fragment', code: 'fixture-error' } }));
        return;
      }
      requests.push(JSON.parse(raw));
      const index = requests.length - 1;
      if (!index) await firstGate;
      if (index === 8) await delay(45000);
      if (index === 9) await cancelledGate;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: replies[index] } }] })
        + '\n\ndata: [DONE]\n\n');
    });
    let child;
    let browser;
    let origin;
    let token;
    const call = async (path, body) => {
      const response = await fetch(origin + path, { headers: { 'X-DSH-Pet-Token': token,
        ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200, path);
      return response.json();
    };
    try {
      await mkdir(data);
      model.listen(0, '127.0.0.1');
      await once(model, 'listening');
      const config = JSON.stringify({ whisperPrompt: '默认日常测试口吻', chatMemoryRounds: 5,
        chatImageEnabled: true, chatImageLimit: 1, whisperImageEnabled: true, memes: { Ciallo: '挥手问候' },
        pets: [{ id: 'main', name: '肥鱼原名', display: 'none', balanceEnabled: false,
          whisperEnabled: false, workStatusEnabled: false, fixedEnabled: true }] });
      await writeFile(join(data, 'main-config.jsonc'), config);
      const store = await createPersonaStore(join(data, 'stronghold-persona.json'));
      assert.equal(store.get(), null);
      let output = '';
      const adapter = new URL('../../server/desktop/standalone-persona.js', import.meta.url).href;
      child = spawn(process.execPath, ['--import', adapter, entry, '--port', '31980'], {
        env: { ...process.env, DSH_HOME: temp }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-4000); });
      const runtime = await until(async () => {
        assert.equal(child.exitCode, null, 'standalone failed: ' + output);
        return JSON.parse(await readFile(join(data, 'standalone-runtime.json'), 'utf8').catch(() => 'null'));
      }, 'standalone runtime');
      origin = `http://127.0.0.1:${runtime.port}`;
      token = runtime.token;
      await until(async () => (await call('/dsh-pet-7340/config')).main, 'host routes');
      const personaPath = '/dsh-pet-7340/stronghold/persona';
      const optionsPath = '/dsh-pet-7340/stronghold/chat-options';
      assert.deepEqual(await call(optionsPath), DEFAULT_CHAT_OPTIONS);
      assert.equal((await fetch(origin + personaPath, { method: 'POST', body: '{"reset":true}' })).status, 403);
      assert.equal((await fetch(origin + personaPath, { method: 'POST', headers: {
        'X-DSH-Pet-Token': token, Origin: 'https://untrusted.example',
      }, body: '{"reset":true}' })).status, 403);
      const tooLarge = await new Promise((resolve, reject) => {
        const req = http.request(origin + personaPath, { method: 'POST', headers: {
          'X-DSH-Pet-Token': token, 'Content-Length': MAX_PERSONA_BODY_BYTES + 1,
        } }, res => { res.resume(); resolve(res.statusCode); });
        req.on('error', reject);
        req.end();
      });
      assert.equal(tooLarge, 413);
      await call('/standalone-ai/settings', { protocol: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'daily-fixture', apiKey: 'fixture', timeoutMs: 5000 });
      const puppeteer = (await import('puppeteer-core')).default;
      browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.setBypassCSP(true);
      await page.setExtraHTTPHeaders({ 'X-DSH-Pet-Token': token });
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (request.isNavigationRequest() && request.url() === origin + '/persona-test') {
          void request.respond({ status: 200, contentType: 'text/html', body:
            '<!doctype html><button id="pet-hit" style="position:fixed;left:700px;top:480px">Pet</button>' });
        } else void request.continue();
      });
      await page.goto(origin + '/persona-test');
      await page.addScriptTag({ content: await readFile(new URL('shared-core.js', helper), 'utf8') });
      await page.addScriptTag({ content: `
        const BASE = ${JSON.stringify(origin + '/dsh-pet-7340')};
        const strongholdPetConfig = ${JSON.stringify({ origin: origin + '/no-game', token: 'T'.repeat(43) })};
        const S = window.PetShared, OPEN_TARGET = 'standalone', OPEN_SHORTCUT_HINT = '';
        window.__dshPetDebug = {};
        class PetSprite {
          pet = { id: 'main', name: '肥鱼原名' };
          hit = document.querySelector('#pet-hit');
          menuItems = [];
          dragState = {};
          animations = { idle: [], turn: [], drag: [], clicks: [], moves: { actions: [] }, categories: [] };
          visibleClampRect() { return { x: 0, y: 0, w: innerWidth, h: innerHeight }; }
          stopThrow() {} stopMove() {} setInteractive() {} syncInputBusy() {} syncInputRegions() {}
          inputBusy() { return false; }
          switchTo() {} playOnce() {}
          showWhisper(text) { window.personaNotice = text; }
        }
        const sprites = [new PetSprite()];
        sprites[0].hit.addEventListener('contextmenu', event => sprites[0].onContextMenu(event));
      ` });
      await page.addScriptTag({ content: await readFile(new URL('sprite/menu.js', helper), 'utf8') });
      await page.addScriptTag({ content: await readFile(new URL('../../server/desktop/native.js', import.meta.url), 'utf8') });
      assert.deepEqual(pageErrors, [], 'native extension loads without errors');
      assert.ok(await page.$('input[aria-label="选择人设角色卡"]'));
      const openRole = async () => {
        await page.click('#pet-hit', { button: 'right' });
        await page.evaluate(() => [...document.querySelector('.dsh-pet-menu-column').children]
          .find(node => node.querySelector('.dsh-pet-menu-label')?.textContent === '角色扮演').dataset.target = 'role');
        await page.hover('.dsh-pet-menu-item[data-target="role"]');
      };
      const menu = async label => {
        await openRole();
        await page.evaluate(text => [...document.querySelectorAll('.dsh-pet-menu-item')]
          .find(node => node.querySelector('.dsh-pet-menu-label')?.textContent === text).dataset.target = '1', label);
        await page.click('.dsh-pet-menu-item[data-target="1"]');
        assert.deepEqual(pageErrors, [], 'menu click succeeds');
      };
      const select = async (file, name) => {
        const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 6000 }), menu('切换人设')]);
        await page.evaluate(() => { window.personaNotice = ''; });
        await chooser.accept([file]);
        await page.waitForFunction(() => !!window.personaNotice, { timeout: 12000 });
        assert.ok(await page.evaluate(text => window.personaNotice.includes(text), name),
          'persona confirmation: ' + await page.evaluate(() => window.personaNotice));
      };
      const maxMenu = async (text, parent = '回复字数') => {
        await openRole();
        await page.evaluate(parent => [...document.querySelectorAll('.dsh-pet-menu-item')]
          .find(node => node.querySelector('.dsh-pet-menu-label')?.textContent === parent).dataset.target = 'length', parent);
        await page.hover('.dsh-pet-menu-item[data-target="length"]');
        await page.waitForFunction(label => [...document.querySelectorAll('.dsh-pet-menu-item')]
          .some(node => node.getClientRects().length && node.querySelector('.dsh-pet-menu-label')?.textContent === label), {}, text);
        await page.evaluate(label => [...document.querySelectorAll('.dsh-pet-menu-item')]
          .find(node => node.getClientRects().length && node.querySelector('.dsh-pet-menu-label')?.textContent === label).dataset.target = 'max', text);
        const saved = text === '自定义…' ? null : page.waitForResponse(response => response.url().includes('/stronghold/chat-options') && response.request().method() === 'POST', { timeout: 8000 });
        await page.$eval('.dsh-pet-menu-item[data-target="max"]', node => node.click());
        try { if (saved) assert.equal((await saved).status(), 200); }
        catch { assert.fail(`Menu did not save ${parent}/${text}: ` + JSON.stringify(await page.evaluate(() => window.personaNotice))); }
      };
      const cardFile = join(temp, 'voice.json');
      await writeFile(cardFile, JSON.stringify({ name: '温柔卡', personality: '温柔简短，先倾听。',
        mes_example: '{{char}}：嗯，{{user}}，我在听。' }));
      await select(cardFile, '温柔卡');
      await maxMenu('低', '请求强度');
      assert.equal((await call(optionsPath)).effort, 'low');
      await maxMenu('中', '请求强度');
      assert.equal((await call(optionsPath)).effort, 'medium');
      await maxMenu('高', '请求强度');
      await maxMenu('60秒', '气泡时长');
      assert.equal((await call(optionsPath)).bubbleSeconds, 60);
      await maxMenu('30秒', '气泡时长');
      await maxMenu('关闭', '主动聊天');
      assert.equal((await call(optionsPath)).proactive, false);
      await maxMenu('开启', '主动聊天');
      await maxMenu('45秒', '碎碎念间隔');
      assert.equal((await call(optionsPath)).idleSeconds, 45);
      await maxMenu('30秒', '碎碎念间隔');
      assert.equal(store.get().name, '温柔卡', 'an existing game reader sees the host selection');
      await writeFile(cardFile, 'broken');
      await select(cardFile, '不是有效');
      assert.equal(store.get().name, '温柔卡', 'invalid files keep the prior selection');
      const open = () => page.evaluate(baseUrl => {
        window.PetShared.mountChatDialog({ petId: 'main', baseUrl, surface: 'any', x: 10, y: 10 });
      }, origin + '/dsh-pet-7340/chat');
      const send = async text => {
        await open();
        await page.type('.dsh-pet-chat-input', text);
        const pending = page.waitForResponse(response => response.url().includes('/chat?') && response.request().method() === 'POST', { timeout: 100000 });
        await page.keyboard.press('Enter');
        return pending;
      };
      const first = send('今天有点累，可以陪我聊会儿吗？');
      void first.catch(() => {}); // Cleanup may close the page while the deliberately held reply is pending.
      await until(async () => {
        const error = await page.$eval('.dsh-pet-chat-err', node => node.textContent).catch(() => '');
        assert.equal(error, '', 'native daily chat: ' + error);
        return requests.length === 1;
      }, 'first daily model request');
      const system = requests[0].messages[0].content;
      assert.match(system, /温柔简短/);
      assert.match(system, /温柔卡/);
      assert.doesNotMatch(system, /肥鱼原名|你的名字是/);
      assert.match(system, /【当下】/);
      assert.doesNotMatch(system, /默认日常测试口吻|\{\{char\}\}/);
      assert.match(system, /最多 60/);
      assert.ok(!requests[0].messages.at(-1).content.includes('[配图]'));
      const pngFile = join(temp, 'voice.png');
      await writeFile(pngFile, pngCard({ name: '活泼卡', personality: '活泼爽快，短句接话。' }));
      await select(pngFile, '活泼卡');
      assert.equal(store.get().name, '活泼卡', 'PNG uploads over the old 1 MB HTTP limit are accepted');
      releaseFirst();
      const interrupted = await (await first).json();
      assert.equal(interrupted.ok, false, 'switching persona cancels the old in-flight reply');
      assert.equal(interrupted.text, undefined);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      assert.equal((await (await send('那接下来聊什么？')).json()).text, replies[1]);
      assert.match(requests[1].messages[0].content, /活泼爽快/);
      assert.doesNotMatch(requests[1].messages[0].content, /温柔简短/);
      assert.ok(!requests[1].messages.some(message => message.role === 'assistant' && message.content === replies[0]), 'cancelled replies never enter memory');
      await menu('恢复默认人设');
      await page.waitForFunction(() => window.personaNotice?.includes('默认肥鱼'));
      assert.equal(store.get(), null);
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      assert.equal((await (await send('恢复平时的口吻吧。')).json()).text, replies[2]);
      assert.match(requests[2].messages[0].content, /默认日常测试口吻/);
      assert.doesNotMatch(requests[2].messages[0].content, /活泼爽快|voiceReference/);
      const memory = await call('/dsh-pet-7340/chat?pet=main');
      assert.equal(memory.messages.length, 4);
      const state = await call('/dsh-pet-7340/state');
      assert.equal(state.pets.main.say.data.text, replies[2], 'reply is published to the native bubble');
      assert.equal(await readFile(join(data, 'main-config.jsonc'), 'utf8'), config, 'pet configuration is untouched');
      await call(personaPath, { file: Buffer.from(JSON.stringify({ name: '重启保留', personality: '温和短句。' })).toString('base64') });
      const whisper = await call('/dsh-pet-7340/whisper?pet=main&surface=any', {});
      assert.equal(whisper.ok, true);
      assert.match(requests[3].messages[0].content, /重启保留/);
      assert.doesNotMatch(requests[3].messages[0].content, /肥鱼原名|默认日常测试口吻/);
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      const daily = await (await send('请回复一段长一点的话。')).json();
      assert.equal(daily.text.length, 60);
      assert.equal(daily.image, undefined);
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      await menu('无限制模式');
      await page.waitForFunction(() => window.personaNotice?.includes('已切换到无限制模式'));
      const unlimited = await (await send('请按原设置回复并配图。')).json();
      assert.equal(unlimited.text.length, 100);
      assert.equal(unlimited.image, 'Ciallo');
      assert.ok(requests[5].messages.at(-1).content.includes('[配图]'));
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      await menu('日常模式');
      await page.waitForFunction(() => window.personaNotice?.startsWith('日常模式'));
      await maxMenu('120字');
      await until(async () => (await call(optionsPath)).maxChars === 120, 'preset length saved');
      await maxMenu('自定义…');
      await page.waitForSelector('form[aria-label="设置回复字数"]');
      await page.$eval('input[aria-label="最多回复字数"]', node => { node.value = ''; });
      await page.type('input[aria-label="最多回复字数"]', '25');
      await page.click('form[aria-label="设置回复字数"] button[type="submit"]');
      await page.waitForFunction(() => !document.querySelector('form[aria-label="设置回复字数"]'));
      assert.deepEqual(await call(optionsPath), { ...DEFAULT_CHAT_OPTIONS, maxChars: 25, effort: 'high', bubbleSeconds: 30 });
      const custom = await (await send('现在上限是多少？')).json();
      assert.equal(custom.text.length, 24);
      assert.equal(custom.image, undefined);
      assert.match(requests[6].messages[0].content, /最多 25/);
      assert.equal((await call(personaPath)).name, '重启保留');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      faults.push(503);
      assert.equal((await (await send('接口暂时失败后能恢复吗？')).json()).text, '重试后恢复正常。');
      assert.deepEqual(failures, [503]);
      const memoryBeforeFailure = await readFile(join(data, 'memory.json'), 'utf8');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      faults.push(502, 502, 502);
      const outage = await (await send('持续失败时是什么提示？')).json();
      assert.equal(outage.ok, true);assert.equal(outage.origin,'local-recovery');assert.equal(outage.degraded,true);
      assert.doesNotMatch(outage.text,/502|HTTP|接口/);
      assert.equal(await page.$('.dsh-pet-chat-err'),null,'provider errors are not dumped into the native chat');
      assert.deepEqual(failures, [503, 502, 502, 502]);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      faults.push(400);
      const badRequest = await (await send('无效请求不应该重试。')).json();
      assert.equal(badRequest.ok,true);assert.equal(badRequest.origin,'local-recovery');assert.equal(badRequest.recovery.needsSettings,true);
      assert.deepEqual(failures, [503, 502, 502, 502, 400]);
      assert.equal(await readFile(join(data, 'memory.json'), 'utf8'), memoryBeforeFailure);
      await until(async () => (await readFile(join(data, 'logs.txt'), 'utf8')).includes('status=400'), 'flushed error diagnostics');
      const log = await readFile(join(data, 'logs.txt'), 'utf8');
      assert.match(log, /status=503.*retry=true/);
      assert.match(log, /status=502/);
      assert.doesNotMatch(log, /do-not-log-this-secret|private-card-fragment/);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      const requestsBeforeCooldown=requests.length;
      const cooling=await (await send('连接恢复之前先陪我一会儿。')).json();assert.equal(cooling.origin,'local-recovery');
      assert.equal(requests.length,requestsBeforeCooldown,'the open circuit makes no additional model request');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      await call('/standalone-ai/settings',{protocol:'openai-compatible',baseUrl:`http://127.0.0.1:${model.address().port}/v1`,model:'daily-fixture-recovered',apiKey:'fixture',timeoutMs:5000});
      const waitStarted = Date.now();
      const delayed = await (await send('你打得怎么样？')).json();
      assert.equal(delayed.text, replies[8], 'a 45-second model response survives all native chat timeout layers');
      assert.ok(Date.now() - waitStarted >= 45000);
      assert.equal(requests[8].reasoning_effort, 'high');
      await page.waitForFunction(() => !document.querySelector('.dsh-pet-chat'));
      const beforeCancel = await readFile(join(data, 'memory.json'), 'utf8');
      const toCancel = send('这条请先等一下。');
      await until(() => requests.length === 10, 'pending cancellable model request');
      await page.click('[data-role="stronghold-cancel"]');
      const cancelled = await (await toCancel).json();
      assert.equal(cancelled.ok, false);
      assert.match(cancelled.message, /取消/);
      assert.equal(await readFile(join(data, 'memory.json'), 'utf8'), beforeCancel);
      releaseCancelled();
      const exited = once(child, 'exit');
      await call('/shutdown', {});
      await exited;
      child = spawn(process.execPath, ['--import', adapter, entry, '--port', '31980'], {
        env: { ...process.env, DSH_HOME: temp }, windowsHide: true, stdio: 'ignore',
      });
      const restarted = await until(async () => {
        assert.equal(child.exitCode, null, 'standalone restart failed');
        const state = JSON.parse(await readFile(join(data, 'standalone-runtime.json'), 'utf8').catch(() => 'null'));
        return state?.pid === child.pid ? state : null;
      }, 'standalone restart');
      origin = `http://127.0.0.1:${restarted.port}`;
      token = restarted.token;
      assert.equal((await call(personaPath)).name, '重启保留');
      assert.deepEqual(await call(optionsPath), { ...DEFAULT_CHAT_OPTIONS, maxChars: 25, effort: 'high', bubbleSeconds: 30 });
    } finally {
      releaseFirst();
      releaseCancelled();
      await browser?.close();
      if (child && child.exitCode === null) {
        const exited = once(child, 'exit');
        if (origin) await call('/shutdown', {}).catch(() => {});
        if (child.exitCode === null) child.kill();
        await exited;
      }
      model.closeAllConnections();
      await new Promise(resolve => model.close(resolve));
      await rm(temp, { recursive: true, force: true });
    }
  });
