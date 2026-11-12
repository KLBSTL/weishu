import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { companionLibrary } from '../server/companion/library.js';
import { libraryRoute } from '../server/companion/routes.js';
import { resolvePromptSettings } from '../server/companion/prompts.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folder = resolve(process.argv[2] || join(repo, 'desktop-pet/cards/exusiai-lungmen-1.0.0'));
const home = await mkdtemp(join(tmpdir(), 'ark-public-card-check-'));
process.env.DSH_HOME = home;
const library = companionLibrary(join(home, 'dsh-pet')), checks = []; let server, browser;
try {
  await library.ready();
  server = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const part of request) raw += part;
      const name = new URL(request.url, 'http://127.0.0.1').pathname.replace(/^\/dsh-pet-7340\//u, '');
      const result = await libraryRoute({}, name, request.method, raw, undefined, {});
      response.statusCode = result.status || 200; response.setHeader('Content-Type', result.contentType || 'application/json');
      response.end(result.kind === 'file' ? readFileSync(result.file) : JSON.stringify(result.obj));
    } catch { response.statusCode = 500; response.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { default: puppeteer } = await import(pathToFileURL(createRequire(join(repo, 'package.json')).resolve('puppeteer-core')).href);
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/dsh-pet-7340/stronghold/library-ui#token=public-card-check`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.click('[data-page="people"]'); await page.click('[data-section="actors"]');
  await (await page.$('#cardFile')).uploadFile(join(folder, '能天使-下班后的龙门.png'));
  await page.waitForFunction(() => document.querySelectorAll('#cardShelf [data-asset]').length > 0);
  await page.click('#cardShelf [data-asset]'); await page.click('#applyCard');
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('角色卡已应用'));
  assert.equal(library.actor().name, '能天使');
  assert.equal(library.card().character_book.entries.length, 16);
  checks.push('实际页面上传PNG并应用；唯一主体为能天使，16条世界书保留');
  const resolvedSettings = () => resolvePromptSettings(library.snapshot(), library.actor());
  assert.equal(resolvedSettings().blocks.length, 4);
  assert.equal(resolvedSettings().origins['custom-continuity'], 'card');
  assert.equal(library.snapshot().promptSettings?.characters?.[library.actor().characterId], undefined);
  await page.click('[data-page="settings"]'); await page.click('[data-section="promptSettings"]');
  await page.waitForFunction(() => document.querySelectorAll('#promptBlockList option').length === 4);
  await page.click('[data-tab="preview"]'); await page.type('#promptQuestion', '拜松是企鹅物流员工吗？'); await page.click('#promptCompile');
  await page.waitForFunction(() => document.getElementById('promptOutput').value.includes('不是'));
  await page.click('#promptDetails');
  const preview = await page.$eval('#promptOutput', node => JSON.parse(node.value));
  assert.ok(JSON.stringify(preview.messages).includes('峯驰'));
  assert.ok(preview.blocks.some(block => block.id === 'custom-continuity'));
  checks.push('仅导入PNG即可继承4个提示块；编排预览包含内嵌提示与世界书资料');
  await page.click('[data-tab="blocks"]'); await page.click('#promptRemoveBlock');
  assert.equal(resolvedSettings().blocks.length, 4);
  await page.click('#promptSave'); await page.waitForFunction(() => document.getElementById('notice').textContent === '已保存。');
  assert.equal(resolvedSettings().blocks.length, 3);
  await page.click('#promptReset');
  await page.waitForFunction(() => document.querySelectorAll('#promptBlockList option').length === 4);
  assert.equal(resolvedSettings().origins['custom-continuity'], 'card');
  checks.push('人物层的改动须显式保存；恢复本层默认后重新使用卡内4个提示块');
  const book = JSON.parse(await readFile(join(folder, '龙门日常.worldbook.json'), 'utf8'));
  const imported = await libraryRoute({}, 'stronghold/library', 'POST', JSON.stringify({ action: 'save-book', book, expectedRevision: library.snapshot().revision }), undefined, {});
  assert.equal(imported.status, 200); assert.equal(library.snapshot().assets.find(a => a.kind === 'lorebook').book.entries.length, 16);
  checks.push('独立世界书可另存且未重复绑定');
  assert.deepEqual(errors, []); checks.push('实际页面没有脚本错误；未请求外部模型');
  await page.click('[data-tab="blocks"]');
  const captures = join(repo, 'test/e2e/out/public-card-check'); await mkdir(captures, { recursive: true });
  await page.screenshot({ path: join(captures, '提示预设导入.png') });
  await writeFile(join(captures, '验收.md'), '# 公开角色包导入验收\n\n' + new Date().toISOString() + '。隐藏Chrome＋真实应用HTTP路由＋隔离SQLite，无外部模型请求。\n\n' + checks.map(c => '- 通过：' + c).join('\n') + '\n\n命令：`node tools/check-public-card.mjs`。\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await library.close(); assert.ok(home.startsWith(join(tmpdir(), 'ark-public-card-check-'))); await rm(home, { recursive: true, force: true });
}
