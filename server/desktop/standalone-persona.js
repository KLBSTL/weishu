import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAX_PERSONA_BODY_BYTES } from './persona.js';

// The launcher pins dsh-pet v0.4.1. Adapt its daily-chat call in memory, keeping package/config files intact.
const entry = pathToFileURL(resolve(process.argv[1])).href;
const helper = new URL('./daily-persona.js', import.meta.url).href;
const routeHelper = new URL('./persona-route.js', import.meta.url).href;
const optionsHelper = new URL('./chat-options.js', import.meta.url).href;
const requestHelper = new URL('./ai-request.js', import.meta.url).href;
const marker = 'const system = petSystemPrompt(found, { historyTimes: list.length > 0 });';
const routeMarker = 'return async (url, rest, method, body, signal) => {';
const limitMarker = 'const limit = pathname === "/standalone-ai/settings" ? MAX_SETTINGS_BYTES : MAX_REQUEST_BYTES;';
const bodyMarker = 'const body = readsBody ? await readBody(req) : void 0;';
const whisperMarker = 'const system = petSystemPrompt(found);';
const chatGenerator = 'async function generateChat(input) {';
const whisperGenerator = 'async function generateWhisper(ctx, request) {';
const transport = 'async function* sdkTextStream(settings, request, signal, fetcher) {';
const normalize = 'function normalizeFailure(runtime, controller, error) {';

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== entry) return loaded;
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    if ([marker, routeMarker, limitMarker, bodyMarker, chatGenerator, whisperGenerator, transport, normalize].some(text => source.split(text).length !== 2)
      || source.split(whisperMarker).length !== 3) {
      throw new Error('dsh-pet 人设适配点已改变，请使用 v0.4.1 并更新适配器。');
    }
    const adapted = source.replace(marker, `const system = petSystemPrompt({ ...found,
      pet: strongholdDailyPersonaPet(found.pet, text + '\\n' + list.map(m => m.content).join('\\n')),
    }, { historyTimes: list.length > 0 });`)
      .replaceAll(whisperMarker, 'const system = petSystemPrompt({ ...found, pet: strongholdDailyPersonaPet(found.pet) });')
      .replace(routeMarker, routeMarker + '\n if (rest === "stronghold/persona") return strongholdPersonaRoute(method, body);'
        + '\n if (rest === "stronghold/chat-options") return strongholdChatOptionsRoute(method, body);')
      .replace(chatGenerator, 'async function strongholdBaseChat(input) {')
      .replace(whisperGenerator, 'async function strongholdBaseWhisper(ctx, request) {')
      .replace(transport, 'async function* strongholdBaseTextStream(settings, request, signal, fetcher) {')
      .replace(normalize, 'function strongholdBaseNormalizeFailure(runtime, controller, error) {')
      .replace(bodyMarker, `const body = readsBody ? await (
        new URL(req.url ?? "/", "http://127.0.0.1").pathname === "/dsh-pet-7340/stronghold/persona"
          ? strongholdReadPersonaBody(req) : readBody(req)) : void 0;`)
      .replace(limitMarker, `const limit = pathname === "/dsh-pet-7340/stronghold/persona" ? ${MAX_PERSONA_BODY_BYTES}
        : pathname === "/standalone-ai/settings" ? MAX_SETTINGS_BYTES : MAX_REQUEST_BYTES;`);
    const at = adapted.startsWith('#!') ? adapted.indexOf('\n') + 1 : 0;
    const declaration = `import { dailyPersonaPet as strongholdDailyPersonaPet } from ${JSON.stringify(helper)};\n`
      + `import { standalonePersonaRoute as strongholdPersonaRoute, readPersonaBody as strongholdReadPersonaBody } from ${JSON.stringify(routeHelper)};\n`;
    const modes = `import { chatOptionsRoute as strongholdChatOptionsRoute, generatePetChat, generatePetWhisper } from ${JSON.stringify(optionsHelper)};\n`
      + 'async function generateChat(input) { return generatePetChat(strongholdBaseChat, input); }\n'
      + 'async function generateWhisper(ctx, request) { return generatePetWhisper(strongholdBaseWhisper, ctx, request); }\n';
    const requests = `import { resilientTextStream, normalizeAiFailure } from ${JSON.stringify(requestHelper)};\n`
      + 'async function* sdkTextStream(settings, request, signal, fetcher) { yield* resilientTextStream(strongholdBaseTextStream, settings, request, signal, fetcher, defaultLog); }\n'
      + 'function normalizeFailure(runtime, controller, error) { return normalizeAiFailure(error, strongholdBaseNormalizeFailure(runtime, controller, error), controller.signal, defaultLog); }\n';
    return { ...loaded, source: adapted.slice(0, at) + declaration + modes + requests + adapted.slice(at) };
  },
});
