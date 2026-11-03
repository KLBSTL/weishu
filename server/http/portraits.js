// Same-server cosmetic images. Raster-only, bounded, content-addressed; no user filenames or arbitrary paths.
import { mkdir, readdir, stat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { TokenBucket } from '../net.js';
import { PORTRAIT_LIMITS, isUploadedPortrait } from '../../shared/standbyArt.js';
import { sendJson } from './common.js';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc32 = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) n = CRC_TABLE[(n ^ b) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
};
const failure = (status, code) => Object.assign(new Error(code), { status, code });

/** Verify the actual raster, not the browser's MIME hint, and discard ancillary metadata. */
export function normalizePortrait(bytes) {
  const bad = () => { throw failure(415, 'INVALID_IMAGE'); };
  if (bytes.length > PORTRAIT_LIMITS.uploadBytes || bytes.length < 57 || !bytes.subarray(0, 8).equals(SIGNATURE)) bad();
  let width = 0, height = 0, channels = 0, ended = false, pixelsStarted = false, pixelsEnded = false;
  const chunks = [SIGNATURE], pixels = [];
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) bad();
    const size = bytes.readUInt32BE(offset), end = offset + size + 12;
    if (end > bytes.length) bad();
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) bad();
    if (offset === 8 && type !== 'IHDR') bad();
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13) bad();
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      const color = bytes[offset + 17];
      if (!width || !height || width > PORTRAIT_LIMITS.width || height > PORTRAIT_LIMITS.height
        || bytes[offset + 16] !== 8 || ![2, 6].includes(color)
        || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) bad();
      channels = color === 6 ? 4 : 3;
      chunks.push(bytes.subarray(offset, end));
    } else if (type === 'IDAT') {
      if (pixelsEnded) bad();
      pixelsStarted = true;
      pixels.push(bytes.subarray(offset + 8, end - 4)); chunks.push(bytes.subarray(offset, end));
    } else if (type === 'IEND') {
      if (size || !pixelsStarted || end !== bytes.length) bad();
      chunks.push(bytes.subarray(offset, end)); ended = true;
    } else {
      // Unknown critical chunks and animated PNGs are not the static RGB/RGBA canvas export we accept.
      if (type[0] === type[0].toUpperCase() || ['acTL', 'fcTL', 'fdAT'].includes(type)) bad();
      if (pixelsStarted) pixelsEnded = true;
    }
    offset = end;
  }
  if (!ended) bad();
  const stride = width * channels + 1, expected = stride * height;
  let raw;
  try { raw = inflateSync(Buffer.concat(pixels), { maxOutputLength: expected + 1 }); } catch { bad(); }
  if (raw.length !== expected) bad();
  for (let row = 0; row < height; row++) if (raw[row * stride] > 4) bad();
  return Buffer.concat(chunks);
}

export async function createPortraitStore(dir, { maxBytes = 128 * 1024 * 1024, maxFiles = 256 } = {}) {
  const files = new Map();
  let used = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    const id = entry.name.replace(/\.png$/, '');
    if (!entry.isFile() || !entry.name.endsWith('.png') || !isUploadedPortrait(id)) continue;
    const size = (await stat(path.join(dir, entry.name))).size;
    if (!size || size > PORTRAIT_LIMITS.uploadBytes) continue;
    files.set(id, size); used += size;
  }
  let queue = Promise.resolve();
  return {
    has: id => isUploadedPortrait(id) && files.has(id),
    read: id => files.has(id) && isUploadedPortrait(id) ? readFile(path.join(dir, `${id}.png`)) : null,
    put(bytes) {
      const job = queue.then(async () => {
        const png = normalizePortrait(bytes);
        const id = `upload_${createHash('sha256').update(png).digest('hex').slice(0, 48)}`;
        if (files.has(id)) return id;
        if (files.size >= maxFiles || used + png.length > maxBytes) throw failure(507, 'STORAGE_FULL');
        await mkdir(dir, { recursive: true });
        const temporary = path.join(dir, `.${id}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, png, { flag: 'wx' });
          await rename(temporary, path.join(dir, `${id}.png`));
        } finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
        files.set(id, png.length); used += png.length;
        return id;
      });
      queue = job.then(() => {}, () => {});
      return job;
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true; clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > PORTRAIT_LIMITS.uploadBytes) finish(failure(413, 'IMAGE_TOO_LARGE'));
      else chunks.push(chunk);
    };
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onError = () => finish(failure(400, 'INVALID_IMAGE'));
    const onAbort = () => finish(failure(400, 'INVALID_IMAGE'));
    const timer = setTimeout(() => finish(failure(408, 'UPLOAD_TIMEOUT')), 15000);
    timer.unref();
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
  });
}

export function createPortraitHandler({ portraits, registry, lobby }) {
  const limits = new WeakMap(), active = new Set();
  return async (req, res, rawPath) => {
    if (rawPath.startsWith('/portraits/')) {
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); sendJson(req, res, 405, { code: 'METHOD_NOT_ALLOWED' }); return true; }
      const id = rawPath.slice('/portraits/'.length).replace(/\.png$/, '');
      if (rawPath !== `/portraits/${id}.png` || !portraits.has(id)) { sendJson(req, res, 404, { code: 'NOT_FOUND' }); return true; }
      const bytes = await portraits.read(id);
      const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: `"${id}"` };
      if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, headers); res.end(); return true; }
      res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes); return true;
    }
    if (rawPath !== '/api/room-portrait') return false;
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); sendJson(req, res, 405, { code: 'METHOD_NOT_ALLOWED' }); return true; }
    const reject = (status, code) => { req.resume(); sendJson(req, res, status, { code }); return true; };
    const session = registry.byToken(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!session?.connected) return reject(401, 'UNAUTHORIZED');
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reject(403, 'BAD_ORIGIN'); }
      catch { return reject(403, 'BAD_ORIGIN'); }
    }
    if (lobby.roomOf(session)?.match) return reject(409, 'ROOM_STARTED');
    if (req.headers['content-type'] !== 'image/png') return reject(415, 'INVALID_IMAGE');
    if (Number(req.headers['content-length']) > PORTRAIT_LIMITS.uploadBytes) return reject(413, 'IMAGE_TOO_LARGE');
    if (!limits.has(session)) limits.set(session, new TokenBucket(1 / 3, 3, Date.now()));
    if (!limits.get(session).take(Date.now()) || active.has(session) || active.size >= 4) return reject(429, 'RATE_LIMITED');
    active.add(session);
    try { sendJson(req, res, 200, { avatarId: await portraits.put(await readBody(req)) }); }
    catch (error) { if (!error.status) throw error; sendJson(req, res, error.status, { code: error.code }); }
    finally { active.delete(session); }
    return true;
  };
}
