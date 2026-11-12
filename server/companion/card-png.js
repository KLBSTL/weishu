import { deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), maxBytes = 8 * 1024 * 1024;
const table = Array.from({ length: 256 }, (_, i) => { let c = i; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
export function pngChunks(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maxBytes || !bytes.subarray(0, 8).equals(signature)) throw new Error('PNG格式或大小无效');
  const chunks = []; let offset = 8;
  for (; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset); if (size > bytes.length - offset - 12) throw new Error('PNG文件不完整');
    const type = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, offset + 8 + size), raw = bytes.subarray(offset, offset + size + 12);
    if (crc32(raw.subarray(4, size + 8)) !== raw.readUInt32BE(size + 8)) throw new Error('PNG校验失败，文件可能损坏');
    chunks.push({ type, data, raw }); offset += size + 12;
    if (type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks[0].data.length !== 13 || chunks.at(-1)?.type !== 'IEND' || !chunks.some(c => c.type === 'IDAT') || offset !== bytes.length) throw new Error('PNG文件结构不完整');
  return chunks;
}
/** Bounded metadata decoding, shared by import and full-document export. */
export function pngCardMetadata(bytes) {
  const metadata = new Map();
  for (const { type, data } of pngChunks(bytes)) {
    if (!['tEXt', 'zTXt', 'iTXt'].includes(type)) continue;
    const at = data.indexOf(0), key = data.subarray(0, at).toString('ascii').toLowerCase();
    if (at < 1 || at > 79 || !['chara', 'ccv3'].includes(key)) continue;
    let body;
    if (type === 'tEXt') body = data.subarray(at + 1);
    else if (type === 'zTXt') {
      if (data[at + 1] !== 0) throw new Error('PNG角色卡压缩方式无效');
      body = inflateSync(data.subarray(at + 2), { maxOutputLength: maxBytes });
    } else {
      const compressed = data[at + 1], method = data[at + 2], language = data.indexOf(0, at + 3), translated = language < 0 ? -1 : data.indexOf(0, language + 1);
      if (![0, 1].includes(compressed) || method !== 0 || translated < 0) throw new Error('PNG角色卡文本格式无效');
      body = data.subarray(translated + 1); if (compressed) body = inflateSync(body, { maxOutputLength: maxBytes });
    }
    if (body.length > maxBytes) throw new Error('PNG角色资料过大');
    metadata.set(key, body.toString('ascii'));
  }
  return metadata;
}
function chunk(type, data) {
  const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length); output.write(type, 4, 'ascii'); data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, data.length + 8)), data.length + 8); return output;
}
export function defaultCover() {
  const header = Buffer.alloc(13); header.writeUInt32BE(64, 0); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(64 * (1 + 64 * 4));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const at = y * 257 + 1 + x * 4; pixels.set([25 + y, 29 + x, 62 + y, 255], at); }
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
export function exportCardPng(document, original = defaultCover()) {
  const data = document.data || document, v3 = { ...document, spec: 'chara_card_v3', spec_version: '3.0', data }, v2 = { spec: 'chara_card_v2', spec_version: '2.0', data: structuredClone(data) };
  const text = [v3, v2].map((value, i) => chunk('tEXt', Buffer.from((i ? 'chara' : 'ccv3') + '\0' + Buffer.from(JSON.stringify(value)).toString('base64'), 'ascii')));
  const parts = [signature];
  for (const item of pngChunks(original)) {
    if (['tEXt', 'zTXt', 'iTXt'].includes(item.type) && /^(?:chara|ccv3)\0/iu.test(item.data.toString('ascii'))) continue;
    if (item.type === 'IEND') parts.push(...text);
    parts.push(item.raw);
  }
  const output = Buffer.concat(parts); if (output.length > maxBytes) throw new Error('导出的角色卡超过8MB，请减少资料或封面大小'); return output;
}
