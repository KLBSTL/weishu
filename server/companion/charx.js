import { inflateRawSync } from 'node:zlib';
import { crc32 } from './card-png.js';

/** Inspect a ZIP central directory and bounded card.json only. Never extract or execute assets. */
export function inspectCharx(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024) throw new Error('请选择8MB以内的资源包');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw new Error('资源包目录无效或为分卷格式');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  if (count > 1000 || offset + size > end) throw new Error('资源包目录过大或不完整');
  const entries = []; let position = offset;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) throw new Error('资源包条目不完整');
    const nameSize = bytes.readUInt16LE(position + 28), extra = bytes.readUInt16LE(position + 30), comment = bytes.readUInt16LE(position + 32);
    if (nameSize > 1024 || position + 46 + nameSize + extra + comment > offset + size) throw new Error('资源包文件名或目录无效');
    const name = bytes.toString('utf8', position + 46, position + 46 + nameSize), flags = bytes.readUInt16LE(position + 8);
    const unsafe = name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || /[\u0000-\u001f]/u.test(name) || /^[a-z]:/iu.test(name);
    entries.push({ name, size: bytes.readUInt32LE(position + 24), compressedSize: bytes.readUInt32LE(position + 20), method: bytes.readUInt16LE(position + 10),
      local: bytes.readUInt32LE(position + 42), crc: bytes.readUInt32LE(position + 16), encrypted: !!(flags & 1), unsafe });
    position += 46 + nameSize + extra + comment;
  }
  const card = entries.find(e => e.name === 'card.json' && !e.unsafe && !e.encrypted);
  let document;
  if (card) {
    if (card.size > 8 * 1024 * 1024 || card.local + 30 > offset || bytes.readUInt32LE(card.local) !== 0x04034b50) throw new Error('资源包角色资料大小或位置无效');
    const start = card.local + 30 + bytes.readUInt16LE(card.local + 26) + bytes.readUInt16LE(card.local + 28);
    if (start + card.compressedSize > offset || ![0, 8].includes(card.method)) throw new Error('资源包角色资料压缩方式暂不支持');
    const compressed = bytes.subarray(start, start + card.compressedSize), raw = card.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: 8 * 1024 * 1024 });
    if (raw.length !== card.size || crc32(raw) !== card.crc) throw new Error('资源包角色资料校验失败');
    document = JSON.parse(raw.toString('utf8')); if (!document || typeof document !== 'object') throw new Error('资源包角色资料格式无效');
  }
  const paths = new Set(entries.filter(e => !e.unsafe).map(e => e.name));
  const assets = (document?.data?.assets || document?.assets || []).map(asset => ({ name: String(asset.name || ''), uri: String(asset.uri || ''),
    available: /^https?:|^ccdefault:/u.test(asset.uri || '') ? null : paths.has(String(asset.uri || '').replace(/^embed:\/\//u, '')) }));
  return { name: document?.data?.name || document?.name || '资源包', entries: entries.map(({ name, size, unsafe, encrypted }) => ({ name, size, unsafe, encrypted })), assets,
    supported: false, reason: '当前只检查清单，不导入资源或运行脚本。' };
}
