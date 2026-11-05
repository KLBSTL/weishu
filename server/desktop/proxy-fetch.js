import { createRequire } from 'node:module';
import { resolve } from 'node:path';

function hostAgent(options) {
  try {
    // Resolve the installed standalone host's transport dependency, not the game package's dependencies.
    const { EnvHttpProxyAgent } = createRequire(resolve(process.argv[1]))('undici');
    return new EnvHttpProxyAgent(options);
  } catch (cause) {
    throw Object.assign(new Error('Configured proxy transport is unavailable.', { cause }), { code: 'SP_PROXY_UNAVAILABLE' });
  }
}

export function createProxyFetch(fetcher, { env = process.env, createAgent = hostAgent, log = () => {} } = {}) {
  let agent;
  return (url, init) => {
    const target = new URL(String(url));
    const local = target.hostname === 'localhost' || target.hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/u.test(target.hostname);
    const httpProxy = env.http_proxy || env.HTTP_PROXY || env.all_proxy || env.ALL_PROXY;
    const httpsProxy = env.https_proxy || env.HTTPS_PROXY || httpProxy;
    const enabled = target.protocol === 'https:' ? httpsProxy : httpProxy;
    if (local || !enabled) return fetcher(url, init);
    if (!agent) {
      agent = createAgent({ httpProxy, httpsProxy, noProxy: env.no_proxy || env.NO_PROXY || '' });
      log('info', '[desktop-ai] transport=env-proxy');
    }
    return fetcher(url, { ...init, dispatcher: agent });
  };
}
