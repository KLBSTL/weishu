import { setTimeout as delay } from 'node:timers/promises';
import { createProxyFetch } from './proxy-fetch.js';

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ERR_STREAM_PREMATURE_CLOSE']);
const CONTEXT_CODES = new Set(['context_length_exceeded']);
const REMOTE_CODES = { rate_limit_exceeded: 'rate', insufficient_quota: 'quota', server_error: 'server',
  overloaded_error: 'server', api_error: 'server', invalid_api_key: 'auth', model_not_found: 'request', invalid_request_error: 'request' };
const proxyFetchers = new WeakMap();

/** Never include remote messages, URLs, headers or bodies in diagnostics. */
export function classifyAiFailure(error, aborted = false) {
  let status, code, node = error, endpoint = false;
  const pending = [];
  const seen = new Set();
  for (let depth = 0; node && depth < 12; depth++, node = pending.shift()) {
    if (seen.has(node)) continue;
    seen.add(node);
    pending.push(...[node.cause, node.error, node.lastError].filter(v => v && typeof v === 'object'));
    const candidate = Number(node.status ?? node.statusCode);
    if (!status && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) status = candidate;
    if (NETWORK_CODES.has(node.code) || CONTEXT_CODES.has(node.code)
      || ['SP_PROXY_UNAVAILABLE', 'max_tokens_exceeded', 'SP_PROTOCOL', 'SP_PERSONA_CHANGED', 'SP_GAME_CONTEXT', 'SP_CANCELLED',
        'SP_TOOL_LIMIT', 'SP_RESPONSE_SIZE', 'SP_REFUSAL', 'SP_EMPTY', 'SP_PROVIDER_BUSY'].includes(node.code)) code ??= node.code;
    if (Object.hasOwn(REMOTE_CODES, node.code)) code ??= node.code;
    if (Object.hasOwn(REMOTE_CODES, node.type)) code ??= node.type;
    if (node.message === 'Unexpected standalone AI endpoint.') endpoint = true;
  }
  let kind = 'unknown';
  if (code === 'SP_CANCELLED') kind = 'cancelled';
  else if (code === 'SP_PROVIDER_BUSY') kind = 'busy';
  else if (code === 'SP_PERSONA_CHANGED') kind = 'persona';
  else if (code === 'SP_GAME_CONTEXT') kind = 'game';
  else if (code === 'SP_TOOL_LIMIT') kind = 'tools';
  else if (code === 'SP_RESPONSE_SIZE') kind = 'output';
  else if (code === 'SP_REFUSAL') kind = 'refused';
  else if (code === 'SP_EMPTY') kind = 'empty';
  else if (aborted || error?.name === 'AbortError' || error?.name === 'TimeoutError') kind = 'timeout';
  else if (CONTEXT_CODES.has(code)) kind = 'context';
  else if (code === 'SP_PROXY_UNAVAILABLE') kind = 'proxy';
  else if (code === 'insufficient_quota') kind = 'quota';
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status === 402) kind = 'quota';
  else if (status === 429) kind = 'rate';
  else if (status >= 500) kind = 'server';
  else if (status === 413) kind = 'context';
  else if (status) kind = 'request';
  else if (endpoint) kind = 'endpoint';
  else if (Object.hasOwn(REMOTE_CODES, code)) kind = REMOTE_CODES[code];
  else if (NETWORK_CODES.has(code) || ['APIConnectionError', 'APIConnectionTimeoutError'].includes(error?.name)) kind = 'network';
  else if (error?.name === 'SyntaxError') kind = 'response';
  else if (error?.message === 'Standalone AI returned no text.') kind = 'empty';
  else if (error?.message === 'Standalone AI could not answer this request.') kind = 'refused';
  else if (error?.message === 'Standalone AI response exceeds limits.') kind = 'output';
  else if (code === 'max_tokens_exceeded') kind = 'output';
  else if (code === 'SP_PROTOCOL') kind = 'request';
  else if (['SP_PERSONA_CHANGED', 'SP_GAME_CONTEXT'].includes(code)) kind = 'timeout';
  return { kind, status, code,
    retryable: ['network', 'rate', 'response'].includes(kind)
      || (kind === 'server' && (!status || [500, 502, 503, 504].includes(status))) };
}

function retryDelay(error, fallback = 600) {
  const raw = error?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after'];
  if (raw === undefined || raw === null) return fallback;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Date.parse(raw) - Date.now();
  return Number.isFinite(ms) && ms >= 0 && ms <= 60000 ? ms : null;
}

export async function* resilientTextStream(generate, settings, request, signal, fetcher,
  log = () => {}, wait = (ms, options) => delay(ms, undefined, options)) {
  const deadline = Date.now() + (settings.timeoutMs || 30000);
  let transportFetch = fetcher;
  if (typeof fetcher === 'function') {
    if (!proxyFetchers.has(fetcher)) proxyFetchers.set(fetcher, createProxyFetch(fetcher, { log }));
    transportFetch = proxyFetchers.get(fetcher);
  }
  let emitted = 0;
  const attempts = Math.max(1, Math.min(3, settings.retryAttempts ?? 2));
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal.throwIfAborted();
    try {
      for await (const part of generate(settings, request, signal, transportFetch)) {
        if (part.text) emitted += part.text.length;
        yield part;
      }
      return;
    } catch (error) {
      const info = classifyAiFailure(error, signal.aborted);
      const pause = retryDelay(error, settings.retryBackoffMs?.[attempt] ?? 600);
      const retry = attempt < attempts - 1 && !emitted && !signal.aborted && info.retryable
        && pause !== null && Date.now() + pause + 1000 < deadline;
      log('warn', `[desktop-ai] kind=${info.kind} status=${info.status ?? '-'} code=${info.code ?? '-'} attempt=${attempt + 1} retry=${retry} emitted=${emitted}`);
      if (!retry) throw error;
      request.onRetry?.({ attempt: attempt + 2, attempts, delayMs: pause });
      await wait(pause, { signal });
    }
  }
}

export function normalizeAiFailure(error, fallback, signal, log = () => {}) {
  const info = classifyAiFailure(error, signal?.aborted);
  log('warn', `[desktop-ai] final kind=${info.kind} status=${info.status ?? '-'} code=${info.code ?? '-'}`);
  const status = info.status ? `（HTTP ${info.status}）` : '';
  const messages = {
    timeout: '请求已取消或超时，请稍后重试。',
    busy: '模型正在处理另一条请求，稍等即可继续。',
    cancelled: '本次回复已取消。',
    persona: '人设已切换，已取消旧回复，请重新提问。',
    game: '对局已结束或更换，未发送旧局回答，请重新提问。',
    tools: '本次查询轮次已到上限，未得到完整答案，可以重新提问。',
    context: '这次角色设定或聊天记录过长，请缩短后重试。',
    auth: `服务商拒绝访问${status}，请检查密钥与访问权限。`,
    quota: `服务账户额度不足${status}，请检查账户。`,
    rate: `请求过于频繁${status}，请稍后再试。`,
    server: `模型接口暂时不可用${status}，请稍后重试。`,
    request: `模型接口拒绝了请求${status}，请检查模型与接口兼容性。`,
    network: '连接模型服务失败，请检查网络或代理后重试。',
    response: '模型接口返回的数据格式异常，请稍后重试。',
    empty: '模型没有返回正文，请稍后重试。',
    refused: '模型未能回答这次请求，请换个说法。',
    output: '本次生成额度用尽，未得到完整回复，请重试。',
    endpoint: '模型接口地址不匹配，请检查 AI 设置中的地址。',
    proxy: '环境代理已配置，但代理组件不可用，请检查桌宠依赖。',
    unknown: '模型请求失败，原因尚未确定；请查看本机日志的错误分类。',
  };
  return new Error(messages[info.kind], { cause: fallback });
}

export function localizeGenerationResult(result) {
  if (result.ok) return result;
  const messages = {
    'Standalone AI is busy. Please wait.': '桌宠正在处理另一条请求，请稍等片刻。',
    'Standalone AI is not ready. Configure and enable the model first.': '模型尚未就绪，请先检查 AI 设置。',
    'Standalone AI request cancelled.': '请求已取消。',
    'Standalone AI input is empty or exceeds limits.': '角色设定或聊天记录超过输入上限，请缩短后重试。',
    'Invalid standalone AI model selection or input.': '模型设置或请求内容无效，请检查 AI 设置。',
  };
  return messages[result.message] ? { ...result, message: messages[result.message] } : result;
}
