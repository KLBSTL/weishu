import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { PHASE } from '../../shared/constants.js';
import { readConversationSettings } from './conversation.js';
import { validateC2S } from '../../shared/protocol.js';
import { createPersonaStore, MAX_CARD_BYTES } from './persona.js';
import { readChatOptions } from './chat-options.js';
import { chatProfile } from '../match/replyStyle.js';

const LABEL = '卫戍聊天';
const WATCH_LABEL = '卫戍观战';
const PERSONA_LABEL = '切换人设';
const DEFAULT_PERSONA_LABEL = '恢复默认人设';
const TTL = 8000;
const PLAYING_DURATION_MS = 24000; // 8 seconds of movement, then 16 seconds in the same pose.
const PLAYBACK_GRACE_MS = 3500;
const NATIVE_TTL = 4000;
const NATIVE_CORS = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Stronghold-Pet',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Private-Network': 'true',
};

function openDesktop(url) {
  const child = process.platform === 'win32'
    ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
  child.on('error', () => {}); // the in-game link is also available
  child.unref();
}

async function readIntent(req, maxBytes = 2048) {
  if (req.headers['content-type'] !== 'application/json') return null;
  let body = '';
  let bytes = 0;
  for await (const chunk of req.setEncoding('utf8')) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxBytes) return null;
    body += chunk;
  }
  try { return JSON.parse(body); } catch { return null; }
}

function reply(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    ...headers,
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

/** Optional local presentation for one configured pet. Match timers never await this bridge. */
export async function startDesktopPet({
  base = 'http://127.0.0.1:3080/dsh-pet-7340', pet = 'main', port = 3087, gameUrl = '', headless = false,
  runtimeFile = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-pet', 'standalone-runtime.json'),
  launch = openDesktop, log = console, tickMs = 750,
} = {}) {
  const upstream = new URL(base);
  if (upstream.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)
      || upstream.username || upstream.password || upstream.search || upstream.hash) {
    throw new Error('SP_DSH_PET_BASE must be a local HTTP endpoint');
  }
  const owner = `Stronghold Protocol (${pet})`;
  const surface = headless ? 'any' : 'desktop';
  const personas = await createPersonaStore(join(dirname(runtimeFile), 'stronghold-persona.json'), log);
  if (!pet.trim() || owner.length > 64 || /[\u0000-\u001f\u007f]/u.test(pet)) throw new Error('Invalid SP_DSH_PET_ID');
  const [page, script, preview, animation] = await Promise.all(
    ['chat.html', 'chat.js', 'preview.html', 'playing.webm'].map(name => readFile(new URL(name, import.meta.url))),
  );

  let origin = '';
  let binding = null;
  let nativeUntil = 0;
  let lock = null;
  let playback = null;
  let menu = false;
  let petStatus = 'connecting';
  let stopped = false;
  let timer;
  let pending;
  let connectionWrite = Promise.resolve();

  async function upstreamToken() {
    try {
      const state = JSON.parse(await readFile(runtimeFile, 'utf8'));
      if (state.name === 'dsh-pet-standalone' && state.port === Number(upstream.port || 80)
          && typeof state.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(state.token)) return state.token;
    } catch { /* DSH plugin mode has no standalone runtime file */ }
    return '';
  }

  async function call(path, { query = {}, method = 'GET', body } = {}) {
    const url = new URL(upstream);
    url.pathname = upstream.pathname.replace(/\/$/, '') + path;
    url.search = new URLSearchParams(query).toString();
    try {
      const token = method !== 'GET' ? await upstreamToken() : '';
      const res = await fetch(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(1500),
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token && { 'X-DSH-Pet-Token': token }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return res.ok ? await res.json() : { ok: false, reason: `http-${res.status}` };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  function current(pair) {
    return !!pair && pair === binding && pair.room.match === pair.chat.match
      && pair.chat.match.phase !== PHASE.RESULT && !pair.chat.match.players.get(pair.chat.playerId)?.left;
  }

  function chatUrl(pair) {
    return origin + '/' + (pair ? '#' + pair.token : '');
  }

  function watchUrl(pair) {
    const watch = new URL(gameUrl);
    watch.search = new URLSearchParams({
      spectate: pair.room.code, seat: String(pair.chat.identity.seat), match: pair.chat.identity.matchId,
    }).toString();
    return watch.href;
  }

  function alive(pair) {
    return pair.chat.match.order.some(player => player.seat === pair.chat.identity.seat && player.alive);
  }

  async function release() {
    if (!lock) return;
    const { id } = lock;
    lock = null;
    playback = null;
    await call('/bubble/clear', { query: { pet, surface, lock: id }, method: 'POST' });
    await call('/lock/release', { query: { pet }, method: 'POST', body: { lockId: id } });
  }

  function lost(pair, reason, cause) {
    if (reason === 'lock-lost' || reason === 'pet-not-displayed' || reason === 'offline' || reason === 'unknown-pet') {
      lock = null;
      playback = null;
    }
    if (reason === 'lock-lost' && cause === 'preempted') pair.retryAfter = Date.now() + 1400;
  }

  async function present(pair) {
    if (lock && lock.pair !== pair) await release();
    if (!current(pair)) return;
    const { chat } = pair;
    const playing = alive(pair);
    const native = Date.now() < nativeUntil;
    if (native && lock) await release();
    if (!current(pair) || stopped) return;
    const frames = chat.turns.filter(turn => ['complete', 'error'].includes(turn.state) && turn.delivery !== 'native' && turn.text
      && pair.seen.get(turn.requestId) !== turn);
    const frame = frames[0];
    if (!native && Date.now() < pair.retryAfter) { petStatus = 'paused'; return; }
    if (!playing && !frame && (!lock || Date.now() >= pair.bubbleUntil)) {
      await release();
      return;
    }
    const query = { pet, surface };
    if (!native && (!lock || Date.now() + TTL / 2 >= lock.expiresAt)) {
      const result = await call('/lock', { query, method: 'POST', body: { ttl: TTL, ...(lock && { lockId: lock.id }) } });
      if (!result.ok) {
        lost(pair, result.reason, result.cause);
        petStatus = result.reason;
        return;
      }
      lock = { id: result.lockId, expiresAt: result.expiresAt, pair };
    }
    if (!current(pair) || stopped) return;
    const locked = native ? query : { ...query, lock: lock.id };
    if (frame) {
      const duration = readChatOptions().bubbleSeconds * 1000;
      const result = await call('/broadcast', { query: locked, method: 'POST', body: { text: frame.text, duration, anim: false } });
      if (!result.ok) {
        lost(pair, result.reason, result.cause);
        petStatus = result.reason;
        return;
      }
      pair.seen = new Map(chat.turns.map(turn => [
        turn.requestId, turn === frame ? turn : pair.seen.get(turn.requestId),
      ]));
      pair.bubbleUntil = Date.now() + duration;
    }
    if (native) { petStatus = 'online'; return; }
    if (!playing || !current(pair) || stopped) return;
    if (playback) {
      const result = await call('/playback/' + encodeURIComponent(playback.id));
      if (!current(pair) || stopped) return;
      const state = result.status;
      if (['playing', 'accepted'].includes(state) && Date.now() < playback.retryAt) return;
      if (!state && Date.now() < playback.retryAt) return;
      if (state === 'failed' && Date.now() < playback.retryAt) {
        petStatus = result.reason || 'playback-failed';
        return;
      }
    }
    const result = await call('/anim', { query: locked, method: 'POST', body: { url: origin + '/playing.webm' } });
    if (result.ok) {
      playback = { id: result.playbackId, retryAt: Date.now() + PLAYING_DURATION_MS + PLAYBACK_GRACE_MS };
      petStatus = 'online';
    } else {
      lost(pair, result.reason, result.cause);
      petStatus = result.reason;
    }
  }

  async function tick() {
    if (!menu) {
      const result = await call('/menu/item', { method: 'POST', body: { owner, labels: [LABEL, WATCH_LABEL, PERSONA_LABEL, DEFAULT_PERSONA_LABEL] } });
      menu = result.ok;
      petStatus = result.ok ? 'online' : result.reason;
    }
    if (menu && !stopped) {
      const result = await call('/menu/events', { query: { owner } });
      if (!result.ok) { menu = false; petStatus = result.reason; }
      else if (result.events?.[LABEL] === pet && Date.now() >= nativeUntil) launch(chatUrl(current(binding) ? binding : null));
      if (result.events?.[WATCH_LABEL] === pet && current(binding)) launch(watchUrl(binding));
    }
    if (binding && !current(binding)) binding = null;
    if (!stopped) await present(binding);
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      pending = tick().catch(e => log.warn(`[desktop] ${e.message}`)).finally(schedule);
    }, tickMs);
    timer.unref();
  }

  const server = http.createServer({ requestTimeout: 5000 }, (req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) reply(res, 400, { error: 'BAD_MSG' });
      else res.destroy();
    });
  });

  async function handle(req, res) {
    if (req.headers.host !== new URL(origin).host) return reply(res, 403, {});
    if (['/pet/status', '/pet/ask', '/pet/persona'].includes(req.url)) return handleNative(req, res);
    if (req.headers.origin && req.headers.origin !== origin
        && req.url !== '/playing.webm') return reply(res, 403, {});
    if (req.method === 'GET') {
      if (req.url === '/') return reply(res, 200, page, 'text/html; charset=utf-8');
      if (req.url === '/chat.js') return reply(res, 200, script, 'text/javascript; charset=utf-8');
      if (req.url === '/preview') return reply(res, 200, preview, 'text/html; charset=utf-8');
      if (req.url === '/playing.webm') return reply(res, 200, animation, 'video/webm', { 'Access-Control-Allow-Origin': '*' });
    }
    if (!['/state', '/ask', '/cancel'].includes(req.url)) return reply(res, 404, {});
    const pair = binding;
    if (!current(pair) || req.headers.authorization !== 'Bearer ' + pair.token) return reply(res, 403, {});
    const { chat } = pair;
    const player = chat.match.players.get(chat.playerId);
    if (req.method === 'GET' && req.url === '/state') {
      const turns = chat.active
        ? [...chat.turns, { ...chat.active.frame, state: 'streaming', text: chat.active.text }] : chat.turns;
      return reply(res, 200, { room: pair.room.code, pet, petStatus, playerOnline: !!player?.connected,
        watch: watchUrl(pair), status: chat.publicStatus(), turns });
    }
    if (req.method !== 'POST' || req.url === '/state') return reply(res, 405, {});
    const body = await readIntent(req);
    const ask = req.url === '/ask';
    const intent = { ...body, ...chat.identity, t: ask ? 'g.teammateChat' : 'g.teammateChatCancel' };
    if (!body || validateC2S(intent)) return reply(res, 400, { error: 'BAD_MSG' });
    if (!current(pair) || !player || !chat.authorized(player, intent.matchId, intent.seat)) return reply(res, 403, { error: 'OFFLINE' });
    const result = ask ? chat.ask(player, intent) : chat.cancel(player, intent);
    return reply(res, result.error ? 409 : 200, result);
  }

  async function handleNative(req, res) {
    // Electron's local file renderer can omit Origin. Browser file pages send "null".
    if (req.headers.origin !== undefined && req.headers.origin !== 'null') return reply(res, 403, {});
    const send = (status, body) => reply(res, status, body, undefined, NATIVE_CORS);
    if (req.method === 'OPTIONS') return send(200, {});
    const key = await readFile(join(dirname(runtimeFile), 'stronghold-pet.key'), 'utf8').catch(() => '');
    const token = key.trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || req.headers.authorization !== 'Bearer ' + token
        || req.headers['x-stronghold-pet'] !== pet) return send(403, {});
    nativeUntil = Date.now() + NATIVE_TTL;
    if (req.url === '/pet/persona') {
      if (req.method !== 'POST') return send(405, {});
      const body = await readIntent(req, MAX_CARD_BYTES * 1.4 + 1024);
      if (!body || (body.reset !== true && (typeof body.file !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(body.file)))) {
        return send(400, { error: '请选择有效的 JSON 或 PNG 角色卡' });
      }
      try {
        const card = await personas.select(body.reset === true ? null : Buffer.from(body.file, 'base64'));
        return send(200, { name: card?.name ?? '默认肥鱼' });
      } catch (error) {
        log.warn('[desktop] Persona selection failed');
        return send(400, { error: error.code ? '人设保存失败，请稍后重试' : error.message });
      }
    }
    const pair = binding;
    const active = current(pair) && alive(pair);
    if (req.url === '/pet/status' && req.method === 'GET') {
      if (!active) return send(200, { pet, active: false, matchId: null });
      const { chat } = pair;
      const lastAnswer = chat.turns.findLast(turn => turn.state === 'complete' && turn.question && !turn.goal);
      return send(200, { pet, active, matchId: chat.identity.matchId, phase: chat.match.phase,
        pending: !!chat.active, progress: chat.active?.progress, activeRequestId: chat.active?.frame.requestId,
        budgetMs: chat.active?.extendedBudget ? chatProfile('', chat.active.chatOptions).extendedTimeoutMs : undefined,
        lastTurn: chat.turns.findLast(turn => turn.question && !turn.goal), turns: chat.turns,
        lastAnswerId: lastAnswer?.requestId ?? null });
    }
    if (!['/pet/ask', '/pet/cancel', '/pet/context', '/pet/open-source'].includes(req.url) || req.method !== 'POST') return send(405, {});
    if (!active) return send(409, { error: 'WRONG_PHASE' });
    const { chat } = pair;
    const player = chat.match.players.get(chat.playerId);
    const body = await readIntent(req, req.url === '/pet/ask' ? 20000 : 2048);
    if (!current(pair) || !player || !chat.authorized(player, chat.identity.matchId, chat.identity.seat)) {
      return send(403, { error: 'OFFLINE' });
    }
    if (req.url === '/pet/open-source') {
      const url = chat.turns.flatMap(turn => turn.sources || []).find(source => source.url === body?.url)?.url;
      if (!url || !/^https:\/\//u.test(url)) return send(400, { error: 'BAD_SOURCE' });
      launch(url); return send(200, { ok: true });
    }
    if (req.url === '/pet/context') return send(200, chat.facts(player, String(body?.question || '').slice(0, 280)));
    if (req.url === '/pet/cancel') return send(200, chat.cancel(player, { ...chat.identity, requestId: body?.requestId }));
    const intent = { t: 'g.teammateChat', ...chat.identity, requestId: body?.requestId || randomBytes(16).toString('hex'),
      text: body?.text, ...(body?.goal && { goal: body.goal }) };
    if (body?.matchId !== chat.identity.matchId || validateC2S(intent)) return send(400, { error: 'BAD_MSG' });
    const result = chat.ask(player, intent);
    if (result.ok && chat.active?.frame.requestId === intent.requestId && typeof body.contextPrompt === 'string' && body.contextPrompt.length <= 4500) chat.active.contextPrompt = body.contextPrompt;
    if (result.ok && body?.delivery === 'native' && chat.active?.frame.requestId === intent.requestId) chat.active.frame.delivery = 'native';
    return send(result.error ? 409 : 200, { ...result, requestId: intent.requestId });
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  schedule();

  return {
    origin,
    getPersona: personas.get,
    getChatOptions: () => readChatOptions(join(dirname(runtimeFile), 'stronghold-chat-options.json')),
    getConversationSettings: provider => readConversationSettings(runtimeFile, provider),
    bind(room, chat) {
      if (room.match !== chat.match || chat.match.phase === PHASE.RESULT) return null;
      if (current(binding) && binding.chat === chat) binding.retryAfter = 0;
      else binding = { room, chat, token: randomBytes(24).toString('base64url'),
        seen: new Map(chat.turns.map(turn => [turn.requestId, turn])), retryAfter: 0, bubbleUntil: 0 };
      connectionWrite = (async () => {
        await mkdir(dirname(runtimeFile), { recursive: true });
        const path = join(dirname(runtimeFile), 'stronghold-pet.key');
        try { await writeFile(path, randomBytes(32).toString('base64url'), { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
        const token = (await readFile(path, 'utf8')).trim();
        if (!stopped && current(binding) && binding.chat === chat) await writeFile(join(dirname(runtimeFile), 'stronghold-connection.json'), JSON.stringify({ origin, pet, token, matchId: chat.identity.matchId }));
      })().catch(() => log.warn('[desktop] Could not register local game conversation.'));
      return chatUrl(binding);
    },
    async close() {
      stopped = true;
      clearTimeout(timer);
      await pending;
      await connectionWrite;
      await release();
      const connection = join(dirname(runtimeFile), 'stronghold-connection.json');
      try { if (JSON.parse(await readFile(connection, 'utf8')).origin === origin) await rm(connection); } catch { /* already closed */ }
      if (menu) await call('/menu/item', { query: { owner }, method: 'DELETE' });
      await new Promise(resolve => server.close(resolve));
    },
  };
}
