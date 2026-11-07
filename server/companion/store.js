import { Worker } from 'node:worker_threads';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** SQLite is authoritative. The bounded view only bridges synchronous DSH 0.4.1 prompt hooks. */
export class CompanionStore {
  constructor(directory, seed) { this.directory = directory; this.seed = seed; this.cache = seed; this.serial = 0; this.pending = new Map(); }
  snapshot() {
    const file = join(this.directory, 'companion-view.json');
    try {
      const stat = statSync(file, { bigint: true }), stamp = stat.mtimeNs + ':' + stat.size;
      if (stamp !== this.stamp) { this.cache = JSON.parse(readFileSync(file, 'utf8')); this.stamp = stamp; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const data = structuredClone(this.cache);
    for (const asset of data.assets) if (asset.originalPath && /^[a-f0-9]{64}\.(?:png|json)$/u.test(asset.originalPath)) {
      Object.defineProperty(asset, 'originalBytes', { enumerable: false, get: () => readFileSync(join(this.directory, 'companion-assets', asset.originalPath)).toString('base64') });
    }
    return data;
  }
  call(operation, payload) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./store-worker.js', import.meta.url), { execArgv: [] });
      this.worker.on('message', message => {
        const item = this.pending.get(message.id); if (!item) return;
        this.pending.delete(message.id);
        if (message.error) item.reject(Object.assign(new Error(message.error.message), message.error)); else item.resolve(message.result);
        if (!this.pending.size) this.worker?.unref();
      });
      this.worker.on('error', error => { for (const item of this.pending.values()) item.reject(error); this.pending.clear(); this.worker = null; });
      this.worker.unref();
    }
    this.worker.ref(); const id = ++this.serial;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, directory: this.directory, operation, payload }); });
  }
  ready() { return this.started ||= this.call('init', this.seed).then(data => { this.cache = data; return this; }); }
  async close() { await this.worker?.terminate(); this.worker = null; }
}
