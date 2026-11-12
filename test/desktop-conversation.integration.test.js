import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { startDesktopPet } from '../server/desktop/bridge.js';
import { makeMatch } from './match/harness.js';
import { deepSeekChatClient } from '../server/match/deepseek.js';
import { createPersonaStore } from '../server/desktop/persona.js';
import { readConversationSettings } from '../server/desktop/conversation.js';
import { freePort } from './e2e/client.mjs';
const entry = fileURLToPath(new URL('../desktop-pet/node_modules/dsh-pet/lib/standalone.js', import.meta.url));
async function until(read, name) {
  for (const end = Date.now() + 15000; Date.now() < end; await delay(40)) { const value = await read(); if (value) return value; }
  assert.fail('Timeout: ' + name);
}
test('native daily chat and game composer share live facts, model settings and conversation without visible windows',
  { skip: !existsSync(entry), timeout: 45000 }, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'sp-conversation-bridge-'));
    const data = join(temp, 'dsh-pet');
    const savedHome = process.env.DSH_HOME; process.env.DSH_HOME = temp;
    const requests = [];
    const model = http.createServer(async (req, res) => {
      let raw = ''; for await (const b of req) raw += b;
      const body = JSON.parse(raw); requests.push(body);
      const batch = body.messages[0].content.includes('【连贯碎碎念批次】');
      const proactive = batch || body.messages[0].content.includes('【空闲主动聊天】');
      const gameQuestion = /干员|这轮/u.test(body.messages.at(-1).content);
      if (!proactive && gameQuestion) {
        const factsMessage = body.messages.find(m => m.content?.startsWith?.('以下为本机游戏'));
        const facts = JSON.parse(factsMessage.content.split('：').slice(1).join('：'));
        assert.equal(facts.round, 2); assert.ok(facts.current.find(p => p.seat === 1).shop);
        assert.ok(facts.transactions.some(t => t.action === 'buy'));
      } else if (!proactive) {
        assert.equal(body.messages.some(m => m.content?.startsWith?.('以下为本机游戏')), false, 'a follow-up about a personal story has no attached game snapshot');
      }
      assert.equal(body.model, 'host-configured-model');
      assert.equal(body.thinking.type, 'disabled'); assert.equal(body.reasoning_effort, undefined);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const selected = proactive ? JSON.parse((batch ? /【唯一背景证据】([^\n]+)/u : /【本次唯一故事素材】([^\n]+)/u).exec(body.messages[0].content)[1]).text : '';
      const speech = selected.includes('图书馆') ? '我在图书馆翻到一本夹着地图的日记，泛黄的纸页一下把我吸引住了。从那以后，去过的地方我都会认真记下来，偶尔翻看还能想起一路上的风景。'
        : selected.includes('收音机') ? '邻居的旧收音机没声了，我花了整整一个下午检查线路。终于调出遥远城市的广播时，那点小小成就感让我开心了很久，现在想起来还会笑。'
        : '我在海边长大，小时候总爱跟父亲沿着沙滩散步。风大起来，他就替我把外套拉紧。海浪一层层漫过脚边，那段被家人照顾着的时光，到现在还记得很清楚。';
      const content = batch ? JSON.stringify({ text: speech })
        : proactive ? speech : gameQuestion ? '我看的是现在的商店，上轮买入记录也在。' : '刚才说的是小时候和父亲在海边散步。';
      res.end('data: ' + JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    });
    let child, bridge, h, origin, token, hostOutput = '';
    const call = async (path, body) => {
      const res = await fetch(origin + path, { headers: { 'X-DSH-Pet-Token': token, ...(body && { 'Content-Type': 'application/json' }) },
        ...(body && { method: 'POST', body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
      assert.equal(res.status, 200); return res.json();
    };
    try {
      await mkdir(data);
      const personas = await createPersonaStore(join(data, 'stronghold-persona.json'));
      await personas.select(Buffer.from(JSON.stringify({ name: '公开海边角色', description: '小时候和父亲沿海边散步，风大时他会替我拉紧外套。\n学生时在图书馆发现一本夹着地图的日记，从此记录旅行见闻。\n有一年替邻居修好了旧收音机，第一次听到遥远城市的广播。' })));
      await writeFile(join(data, 'main-config.jsonc'), JSON.stringify({ pets: [{ id: 'main', display: 'none', balanceEnabled: false, whisperEnabled: false }] }));
      model.listen(0, '127.0.0.1'); await once(model, 'listening');
      const fixedRandom = join(temp, 'fixed-random.mjs'); await writeFile(fixedRandom, 'Math.random = () => 0;\n');
      child = spawn(process.execPath, ['--import', pathToFileURL(fixedRandom).href, '--import', new URL('../server/desktop/standalone-persona.js', import.meta.url).href, entry, '--port', String(await freePort())],
        { env: { ...process.env, DSH_HOME: temp }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { hostOutput = (hostOutput + b).slice(-1800).replace(/token=[A-Za-z0-9_-]+/gu, 'token=REDACTED'); });
      const runtimeFile = join(data, 'standalone-runtime.json');
      const runtime = await until(async () => JSON.parse(await readFile(runtimeFile, 'utf8').catch(() => 'null')), 'host');
      origin = 'http://127.0.0.1:' + runtime.port; token = runtime.token;
      await call('/standalone-ai/settings', { protocol: 'openai-compatible', apiKey: 'public-fixture',
        baseUrl: 'http://127.0.0.1:' + model.address().port + '/v1', model: 'host-configured-model' });
      const fallback = { base: 'https://wrong.invalid', key: 'unused', model: 'wrong-game-model' };
      const chat = deepSeekChatClient({ ...fallback, getSettings: () => readConversationSettings(runtimeFile, fallback) });
      h = makeMatch({ bots: 3, seed: 78, deepSeek: { seat: 1, choose: async () => 0, chat,
        getChatOptions: () => ({ mode: 'daily', maxChars: 60 }) } }).start().toPrep(2);
      bridge = await startDesktopPet({ base: origin + '/dsh-pet-7340', runtimeFile, port: 0, headless: true, tickMs: 80, log: { info() {}, warn() {} } });
      bridge.bind({ code: 'TEST', match: h.m }, h.m.teammateChat);
      await until(async () => JSON.parse(await readFile(join(data, 'stronghold-connection.json'), 'utf8').catch(() => 'null')), 'connection');
      const first = await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '你上一轮买了什么干员？' });
      assert.equal(first.ok, true, JSON.stringify(first));
      assert.equal(requests.length, 1);
      assert.equal(h.m.teammateChat.dialogue[0].question, '你上一轮买了什么干员？');
      h.m.teammateChat.lastStarted = -Infinity;
      const connection = JSON.parse(await readFile(join(data, 'stronghold-connection.json'), 'utf8'));
      const response = await fetch(bridge.origin + '/pet/ask', { method: 'POST', headers: {
        Authorization: 'Bearer ' + connection.token, 'X-Stronghold-Pet': 'main', 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: connection.matchId, text: '那你这轮准备买谁？' }) });
      assert.equal(response.status, 200);
      await until(() => !h.m.teammateChat.active, 'composer answer');
      assert.equal(requests.length, 2);
      assert.ok(requests[1].messages.some(m => m.role === 'user' && m.content === '你上一轮买了什么干员？'));
      assert.ok(requests[1].messages.some(m => m.role === 'assistant' && m.content === first.text));
      assert.equal(h.m.teammateChat.turns.at(-1).state, 'complete');
      await call('/dsh-pet-7340/stronghold/chat-options', { idleSeconds: 10 });
      assert.equal((await call('/dsh-pet-7340/stronghold/idle', { pet: 'main' })).skipped, true);
      const before = await readFile(join(data, 'memory.json'), 'utf8');
      await delay(11000);
      const idle = await call('/dsh-pet-7340/stronghold/idle', { pet: 'main' });
      assert.match(idle.text, /^我在海边长大/);
      assert.match(requests[2].messages[0].content, /公开海边角色/);
      assert.equal(requests[2].tools, undefined, 'proactive speech cannot search or call game tools');
      assert.ok(requests[2].messages[0].content.includes('你上一轮买了什么干员？'), 'recent dialogue is preserved as completed reference, not a question to answer again');
      assert.equal(await readFile(join(data, 'memory.json'), 'utf8'), before, 'automatic prompt is never saved as a fake user message');
      const ack = async deliveryId => {
        const response = await fetch(origin + '/dsh-pet-7340/stronghold/idle', { method: 'PATCH', headers: { 'X-DSH-Pet-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ pet: 'main', deliveryId }) });
        assert.equal((await response.json()).ok, true);
      };
      assert.equal((await call('/dsh-pet-7340/stronghold/idle', { pet: 'main' })).deliveryId, idle.deliveryId, 'unshown speech is retained without a second model call');
      await ack(idle.deliveryId);
      assert.equal((await call('/dsh-pet-7340/stronghold/idle', { pet: 'main' })).skipped, true);
      await delay(11000);
      const nextIdle = await call('/dsh-pet-7340/stronghold/idle', { pet: 'main' });
      assert.ok(nextIdle.text, JSON.stringify(nextIdle) + '\n' + hostOutput); assert.notEqual(nextIdle.text, idle.text, 'continued silence produces another speech');
      assert.match(nextIdle.text, /图书馆/);
      await ack(nextIdle.deliveryId);
      const ledger = JSON.parse(await readFile(join(data, 'stronghold-idle-memory.json'), 'utf8'));
      assert.equal(ledger.version, 2); assert.ok(Object.keys(ledger.cards[ledger.activeKey].used).length >= 2);
      h.m.teammateChat.lastStarted = -Infinity;
      assert.equal((await call('/dsh-pet-7340/chat?pet=main&surface=any', { text: '你刚才说的海边呢？' })).ok, true);
      assert.match(requests[4].messages[0].content, /我在海边长大/);
      await call('/dsh-pet-7340/stronghold/chat-options', { proactive: false, maxChars: 25 });
      const beforeManual = await readFile(join(data, 'memory.json'), 'utf8');
      const manual = await call('/dsh-pet-7340/stronghold/idle', { pet: 'main', manual: true });
      assert.ok(manual.text.length >= 50 && manual.text.length <= 100, 'manual speech bypasses automatic switch and normal 25 character limit');
      assert.match(requests.at(-1).messages[0].content, /【唯一背景证据】/);
      assert.equal(await readFile(join(data, 'memory.json'), 'utf8'), beforeManual);
      const pwsh = process.env.SP_PWSH_EXECUTABLE || 'pwsh';
      if (process.platform === 'win32' && existsSync(pwsh)) {
        const stopScript = join(temp, 'stop-test-pet.ps1');
        await writeFile(stopScript, 'param([string]$Common,[string]$Data,[int]$Port)\n. $Common\nStop-StrongholdDesktopPet -Port $Port -DataPath $Data\n');
        const exited = once(child, 'exit');
        await new Promise((resolve, reject) => execFile(pwsh, ['-NoLogo', '-NoProfile', '-File', stopScript,
          '-Common', fileURLToPath(new URL('../launcher-common.ps1', import.meta.url)), '-Data', data, '-Port', String(runtime.port)],
        { windowsHide: true, timeout: 15000 }, error => error ? reject(error) : resolve()));
        await exited; assert.equal(child.exitCode, 0, 'restart helper gracefully stops only its verified isolated host');
      }
    } finally {
      await bridge?.close(); h?.m.dispose();
      if (child?.exitCode === null) {
        const exited = once(child, 'exit');
        await call('/shutdown', {}).catch(() => child.kill());
        await exited;
      }
      model.closeAllConnections(); await new Promise(resolve => model.close(resolve));
      if (savedHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = savedHome;
      await rm(temp, { recursive: true, force: true });
    }
  });
