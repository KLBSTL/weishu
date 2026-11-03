import { useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button } from './components.js';
import { identity } from '../net.js';
import { rememberUpload } from './standbyState.js';
import { toast, toastError } from './toasts.js';
import { PORTRAIT_LIMITS, isUploadedPortrait } from '../../../shared/standbyArt.js';
import { t } from '../../../shared/i18n.js';

async function preparePortrait(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(t('请选择 PNG、JPG 或 WebP 图片。'));
  if (!file.size || file.size > PORTRAIT_LIMITS.sourceBytes) throw new Error(t('图片大小不能超过 20 MiB。'));
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(t('无法读取这张图片，请换一张图片。')); }
  try {
    if (bitmap.width * bitmap.height > 32_000_000) throw new Error(t('图片尺寸过大，请先缩小图片。'));
    const scale = Math.min(1, PORTRAIT_LIMITS.width / bitmap.width, PORTRAIT_LIMITS.height / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t('无法读取这张图片，请换一张图片。'));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > PORTRAIT_LIMITS.uploadBytes) throw new Error(t('图片尺寸过大，请先缩小图片。'));
    return blob;
  } finally { bitmap.close(); }
}

async function uploadPortrait(file) {
  const token = identity.getToken();
  if (!token) throw new Error(t('连接尚未就绪，请稍后重试。'));
  const body = await preparePortrait(file);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch('/api/room-portrait', { method: 'POST', body, signal: controller.signal,
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` } });
  } catch { throw new Error(t('卡面上传失败，请检查连接或服务器版本。')); }
  finally { clearTimeout(timer); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !isUploadedPortrait(result.avatarId)) {
    if (response.status === 401) throw new Error(t('连接尚未就绪，请稍后重试。'));
    if (response.status === 409) throw new Error(t('模拟进行中，结束后可更换卡面。'));
    if (response.status === 429) throw new Error(t('上传过于频繁，请稍后重试。'));
    if (response.status === 507) throw new Error(t('服务器卡面空间已满，请联系房主。'));
    throw new Error(t('卡面上传失败，请检查连接或服务器版本。'));
  }
  return result.avatarId;
}

export function PortraitUpload({ disabled = false, onSelect, onBusy = () => {} }) {
  const input = useRef(null), pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const choose = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || pending.current || disabled) return;
    pending.current = true; setLoading(true); onBusy(true);
    try {
      const id = await uploadPortrait(file);
      rememberUpload(id);
      if (await onSelect(id)) toast(t('本地卡面已应用'), 'success');
    } catch (error) { toastError(error); }
    finally { pending.current = false; setLoading(false); onBusy(false); }
  };
  return html`<span class="portrait-upload">
    <input ref=${input} type="file" hidden accept="image/png,image/jpeg,image/webp" data-testid="portrait-file" onChange=${choose} />
    <${Button} disabled=${disabled} loading=${loading} onClick=${() => input.current?.click()}>${t('上传本地卡面')}<//>
  </span>`;
}
