// Runs inside the installed DSH Electron/Node runtime. No tools or UI plugins.
const { createRequire } = require('node:module');
const { join, dirname } = require('node:path');
const { homedir } = require('node:os');
const { performance } = require('node:perf_hooks');
const send = value => process.stdout.write(JSON.stringify({ arkDsh: 1, ...value }) + '\n');

async function main(input) {
  const started = performance.now(), timings = { http: [] };
  const runtimeRoot = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh');
  const load = createRequire(join(runtimeRoot, 'package.json'));
  const moduleOf = name => load('@deepseek-ai/' + name);
  const { Context } = moduleOf('cordis');
  if (input.action === 'check') {
    for (const name of ['dsh-agent', 'dsh-agent-loop', 'dsh-session', 'dsh-session-persistence-jsonl', 'dsh-llm-pi-ai',
      'dsh-credentials-local', 'dsh-authorization', 'dsh-deepseek-account-platform', 'dsh-llm-deepseek-account']) moduleOf(name);
    send({ result: { compatible: true } }); return;
  }
  const ctx = new Context();
  let handle, failure, terminal, output, inputTokens, outputTokens, restoreProxy;
  // Credentials enter only the official provider resolver, never a session or config file.
  if (input.settings.apiKey) process.env.ARK_DSH_API_KEY = input.settings.apiKey;
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const inference = options?.method?.toUpperCase() === 'POST' && /\/(?:messages|chat\/completions)(?:\?|$)/u.test(String(url));
    const at = performance.now(), row = inference ? { startedMs: at - started } : null;
    if (row) {
      if (timings.http.length >= 1) throw Object.assign(new Error('One request per harness attempt'), { code: 'SP_ATTEMPT_BUDGET' });
      timings.http.push(row);
      send({ event: 'request' });
    }
    try {
      const response = await nativeFetch(url, options);
      if (row) { row.headersMs = performance.now() - at; row.status = response.status; }
      return response;
    } catch (error) { if (row) row.networkCode = error.cause?.code; throw error; }
  };
  const plugin = async (name, config) => { const m = moduleOf(name); await ctx.plugin(m.default || m, config); };
  try {
    restoreProxy = await moduleOf('dsh-http-proxy').installProxyFromEnvironment(moduleOf('dsh-launch-environment').launchEnvironmentOf(ctx), () => {});
    await plugin('cordis-plugin-timer');
    await plugin('dsh-session-projection');
    await plugin('dsh-llm');
    await plugin('dsh-session');
    await plugin('dsh-system-prompt', { includeHarnessIdentity: false, includeRuntimeContext: false });
    ctx.systemPrompt.section({ name: 'ark:character', order: 0, complete: true, interpolate: false, text: input.system });
    await plugin('dsh-tools');
    await plugin('dsh-agent');
    await plugin('dsh-agent-loop', { agents: [] });
    await plugin('dsh-session-persistence-jsonl', { root: join(input.directory, 'sessions', input.sessionId), compression: 'none' });
    let provider;
    if (input.settings.auth === 'deepseek-account') {
      // Standard DSH account authentication. No application code reads or exports tokens.
      await plugin('dsh-credentials-local', { dshHome: input.settings.credentialHome || join(homedir(), '.dsh'), watch: false });
      await plugin('dsh-authorization');
      await plugin('dsh-deepseek-account-platform');
      await plugin('dsh-llm-deepseek-account', { baseURL: 'https://api.deepseek.com/anthropic', modelsTimeoutMs: 5000 });
      provider = 'deepseek-account';
    } else if (input.settings.protocol === 'anthropic') {
      await plugin('dsh-llm-deepseek-api-key', { apiKeyEnv: 'ARK_DSH_API_KEY', baseURL: input.settings.baseUrl,
        models: [{ id: input.settings.model, name: input.settings.model, contextWindow: 1000000 }] });
      provider = 'deepseek-official';
    } else {
      await plugin('dsh-llm-pi-ai', { providers: { 'ark-gateway': {
        api: 'openai-completions', baseURL: input.settings.baseUrl, apiKeyEnv: 'ARK_DSH_API_KEY',
        models: [{ id: input.settings.model, name: input.settings.model, contextWindow: 1000000,
          reasoning: false, input: ['text'], maxTokens: input.maxTokens }],
      } } });
      provider = 'ark-gateway';
    }
    ctx.on('agent/error', info => { failure = info.error; });
    ctx.on('agent/assistant-stream', ({ frame }) => {
      const chunk = frame.chunk?.chunk || frame.chunk;
      if (chunk?.type === 'text-delta' && chunk.text) {
        if (timings.firstTextMs === undefined) {
          timings.firstTextMs = performance.now() - started;
          send({ event: 'text', firstTextMs: timings.firstTextMs });
        }
        timings.lastTextMs = performance.now() - started;
      }
    });
    ctx.on('session/event', (_session, event) => {
      if (event.type === 'turn/end') terminal = event.data;
      if (event.type === 'assistant/message') {
        output = event.data;
        inputTokens = output.usage?.inputTokens; outputTokens = output.usage?.outputTokens;
      }
    });
    const agentOptions = { provider, model: input.settings.model, maxTokens: input.maxTokens,
      ...(['deepseek-account', 'deepseek-official'].includes(provider) && { reasoningEffort: input.effort === 'low' ? 'off' : input.effort === 'medium' ? 'high' : 'max' }) };
    handle = input.resume ? await ctx.agents.resume({ resumeSessionId: input.sessionId, agentOptions })
      : await ctx.agents.create({ sessionId: input.sessionId, meta: { cwd: input.directory }, agentOptions });
    timings.startupMs = performance.now() - started;
    send({ event: 'ready', startupMs: timings.startupMs, resumed: !!input.resume });
    handle.agent.followup(moduleOf('dsh-llm').createUserMessage({ content: [{ type: 'text', text: input.prompt }], source: { kind: 'user' } }));
    await handle.agent.whenIdle();
    if (failure) throw failure;
    if (terminal?.reason?.kind === 'max-tokens') throw Object.assign(new Error('Incomplete output'), { code: 'max_tokens_exceeded' });
    if (terminal?.reason?.kind !== 'completed') throw Object.assign(new Error('Incomplete turn'), { code: 'SP_DSH_RUNTIME' });
    const message = handle.agent.session.deriveMessages().filter(m => m.role === 'assistant').at(-1);
    const content = message?.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    if (!output || !content.trim()) throw Object.assign(new Error('No new assistant text'), { code: 'SP_EMPTY' });
    if (message.content.some(b => b.type === 'tool-call')) throw Object.assign(new Error('No tools allowed'), { code: 'SP_TOOL_LIMIT' });
    await ctx.sessions.flush(handle.agent.session);
    timings.totalMs = performance.now() - started;
    send({ result: { content, sessionId: input.sessionId, resumed: !!input.resume, timings,
      inputTokens, outputTokens, terminal: terminal?.reason, messageCount: handle.agent.session.deriveMessages().length } });
  } catch (error) {
    const chain = []; for (let e = error; e && chain.length < 5; e = e.cause) chain.push(e);
    const nativeCode = chain.find(e => e.code)?.code;
    const mapping = { AUTH: ['invalid_api_key', 401], ACCOUNT_SIGN_IN_REQUIRED: ['invalid_api_key', 401], ACCOUNT_TOKEN_INVALID: ['invalid_api_key', 401],
      QUOTA: ['insufficient_quota', 402], ACCOUNT_QUOTA: ['insufficient_quota', 402], RATE_LIMIT: ['rate_limit_exceeded', 429],
      CONTEXT_WINDOW_EXCEEDED: ['context_length_exceeded', 413], TRANSPORT: ['ECONNRESET'], EMPTY_RESPONSE: ['SP_EMPTY'],
      TIMEOUT: ['ETIMEDOUT'], SERVER: ['server_error', 503], MAX_TOKENS: ['max_tokens_exceeded'] };
    const mapped = mapping[nativeCode] || [nativeCode?.startsWith('SP_') || nativeCode === 'max_tokens_exceeded' ? nativeCode : 'SP_DSH_RUNTIME'];
    send({ error: { code: mapped[0],
      status: mapped[1] || timings.http.at(-1)?.status || chain.find(e => e.status || e.statusCode)?.status || chain.find(e => e.statusCode)?.statusCode,
      name: error.name, stage: handle ? 'generation' : 'startup' }, timings });
    process.exitCode = 1;
  } finally {
    if (handle) await handle.dispose().catch(() => {});
    await ctx.fiber.dispose().catch(() => {});
    await restoreProxy?.().catch(() => {});
  }
}
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; if (data.length > 600000) process.exit(2); });
process.stdin.on('end', () => main(JSON.parse(data)).catch(() => { send({ error: { code: 'SP_DSH_RUNTIME', stage: 'boot' } }); process.exitCode = 1; }));
