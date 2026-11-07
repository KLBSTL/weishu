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
const conversationHelper = new URL('./conversation.js', import.meta.url).href;
const idleHelper = new URL('./idle-chat.js', import.meta.url).href;
const libraryHelper = new URL('../companion/routes.js', import.meta.url).href;
const profileHelper = new URL('../companion/profile.js', import.meta.url).href;
const marker = 'const system = petSystemPrompt(found, { historyTimes: list.length > 0 });';
const routeMarker = 'return async (url, rest, method, body, signal) => {';
const limitMarker = 'const limit = pathname === "/standalone-ai/settings" ? MAX_SETTINGS_BYTES : MAX_REQUEST_BYTES;';
const bodyMarker = 'const body = readsBody ? await readBody(req) : void 0;';
const whisperMarker = 'const system = petSystemPrompt(found);';
const chatGenerator = 'async function generateChat(input) {';
const whisperGenerator = 'async function generateWhisper(ctx, request) {';
const transport = 'async function* sdkTextStream(settings, request, signal, fetcher) {';
const normalize = 'function normalizeFailure(runtime, controller, error) {';
const textFactory = 'function createTextStream(runtime) {';
const leadingHistoryGuard = ' || messages[0].role !== "user"';

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== entry) return loaded;
    const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
    if ([marker, routeMarker, limitMarker, bodyMarker, chatGenerator, whisperGenerator, transport, normalize, textFactory, leadingHistoryGuard].some(text => source.split(text).length !== 2)
      || source.split(whisperMarker).length !== 3) {
      throw new Error('dsh-pet 人设适配点已改变，请使用 v0.4.1 并更新适配器。');
    }
    const adapted = source.replace(marker, `const system = petSystemPrompt({ ...found,
      pet: strongholdDailyPersonaPet(found.pet, text + '\\n' + list.map(m => m.content).join('\\n')),
    }, { historyTimes: list.length > 0 });`)
      .replaceAll(whisperMarker, 'const system = petSystemPrompt({ ...found, pet: strongholdDailyPersonaPet(found.pet) });')
      .replace(routeMarker, routeMarker + '\n if (rest === "stronghold/persona") return strongholdPersonaRoute(method, body);'
        + '\n if (rest.startsWith("stronghold/library")) return strongholdLibraryRoute(url, rest, method, body, signal, {getInput: petId => strongholdCompanionInput(deps, petId), generate: strongholdBaseChat, petIds: () => [...new Set(Object.values(readAllConfig(deps.configPaths)).flatMap(conf => (conf.pets || []).map(p => p.id)))]});'
        + '\n if (rest === "stronghold/chat-options") return strongholdChatOptionsRoute(method, body);'
        + '\n if (rest === "stronghold/idle-status" && method === "GET") return strongholdIdleStatusRoute(url.searchParams.get("pet") || "main");'
        + '\n if (rest === "stronghold/idle") return strongholdIdleChatRoute(method, body, signal, petId => strongholdCompanionInput(deps, petId), strongholdBaseChat);'
        + '\n if (rest === "stronghold/sources" && method === "GET") return strongholdSourcesRoute(url.searchParams.get("pet") || "main");'
        + '\n if (rest === "stronghold/open-source") return strongholdOpenSourceRoute(method, body);'
        + '\n if (rest === "stronghold/cancel" && method === "POST") return strongholdCancelConversation();')
      .replace('const generated = await generateChat({', 'const generated = await generateChat({ companionPetId: found.pet.id,')
      .replaceAll('text: generated.text,', 'text: generated.text, ...(generated.deliveryId ? { deliveryId: generated.deliveryId } : {}),')
      .replace(leadingHistoryGuard, '')
      .replace(chatGenerator, 'async function strongholdBaseChat(input) {')
      .replace(whisperGenerator, 'async function strongholdBaseWhisper(ctx, request) {')
      .replace(transport, 'async function* strongholdBaseTextStream(settings, request, signal, fetcher) {')
      .replace(normalize, 'function strongholdBaseNormalizeFailure(runtime, controller, error) {')
      .replace(textFactory, 'function strongholdBaseCreateTextStream(runtime) {')
      .replace('const deadline = AbortSignal.timeout(TIMEOUT_MS$1);', 'const deadline = AbortSignal.timeout(180000);')
      .replace('maxTokens: z.number().int().min(128).max(4096)', 'maxTokens: z.number().int().min(128).max(65536)')
      .replace('timeoutMs: z.number().int().min(1e3).max(6e4)', 'timeoutMs: z.number().int().min(1e3).max(300000)')
      .replace(bodyMarker, `const body = readsBody ? await (
        /\\/stronghold\\/(?:persona|library)$/.test(new URL(req.url ?? "/", "http://127.0.0.1").pathname)
          ? strongholdReadPersonaBody(req) : readBody(req)) : void 0;`)
      .replace(limitMarker, `const limit = /\\/stronghold\\/(?:persona|library)$/.test(pathname) ? ${MAX_PERSONA_BODY_BYTES}
        : pathname === "/standalone-ai/settings" ? MAX_SETTINGS_BYTES : MAX_REQUEST_BYTES;`);
    const at = adapted.startsWith('#!') ? adapted.indexOf('\n') + 1 : 0;
    const declaration = `import { dailyPersonaPet as strongholdDailyPersonaPet } from ${JSON.stringify(helper)};\n`
      + `import { standalonePersonaRoute as strongholdPersonaRoute, readPersonaBody as strongholdReadPersonaBody } from ${JSON.stringify(routeHelper)};\n`;
    const modes = `import { chatOptionsRoute as strongholdChatOptionsRoute, generatePetChat, generatePetWhisper } from ${JSON.stringify(optionsHelper)};\n`
      + 'async function generateChat(input) { return generatePetChat(strongholdBaseChat, input); }\n'
      + 'async function generateWhisper(ctx, request) { return generatePetWhisper(strongholdBaseWhisper, ctx, request); }\n';
    const requests = `import { resilientTextStream, normalizeAiFailure } from ${JSON.stringify(requestHelper)};\n`
      + `import { libraryRoute as strongholdLibraryRoute } from ${JSON.stringify(libraryHelper)};\n`
      + `import { petProfile as strongholdPetProfile, hasLibrary as strongholdHasLibrary } from ${JSON.stringify(profileHelper)};\n`
      + `import { idleChatRoute as strongholdIdleChatRoute, idleStatusRoute as strongholdIdleStatusRoute, warmIdleStartup } from ${JSON.stringify(idleHelper)};\nawait warmIdleStartup();\n`
      + `import { createAssistantTextStream, sourcesRoute as strongholdSourcesRoute, openSourceRoute as strongholdOpenSourceRoute, cancelConversation as strongholdCancelConversation } from ${JSON.stringify(conversationHelper)};\n`
      + 'function createTextStream(runtime) { return createAssistantTextStream(runtime, parseRequest); }\n'
      + 'async function* sdkTextStream(settings, request, signal, fetcher) { yield* resilientTextStream(strongholdBaseTextStream, settings, request, signal, fetcher, defaultLog); }\n'
      + 'function normalizeFailure(runtime, controller, error) { return normalizeAiFailure(error, strongholdBaseNormalizeFailure(runtime, controller, error), controller.signal, defaultLog); }\n';
    const inputFactory = `async function strongholdCompanionInput(deps, petId) {
      const found = findPetInstance(readAllConfig(deps.configPaths), petId);
      if (!found || deps.sleep.sleeping(petId)) return null;
      const profile = strongholdPetProfile(petId);
      const mem = await deps.readMemory();
      const history = strongholdHasLibrary() && profile.library ? profile.library.visibleHistory(profile.actorId).filter(e => ['user','assistant'].includes(e.type)).slice(-16).map(e => ({role:e.type,content:e.text,ts:e.at,source:{kind:e.sourceKind,id:e.id,topicId:e.topicId,topicFinal:e.topicFinal}}))
        : sliceMemoryRounds(mem[found.entry]?.[petId]?.messages || [], deps.memoryRounds(found.conf));
      const pet = strongholdDailyPersonaPet(found.pet, history.map(m => m.content).join('\\n'));
      return {ctx:deps.ctx,history,companionPetId:petId,storyCard:profile.card,playerPersona:profile.userPersona,speakerStyle:profile.preset?.style,requireDeliveryAck:true,personaKey:JSON.stringify([petId,profile.actorId,profile.revision]),preferred:configuredModel(found.conf,'chatModel'),
        system:composeSystemPrompt({prompt:petPersona(found.conf,pet),name:String(pet.name||''),id:String(pet.id||''),now:new Date(),historyTimes:history.length>0})};
    }\n`;
    return { ...loaded, source: adapted.slice(0, at) + declaration + modes + requests + inputFactory + adapted.slice(at) };
  },
});
