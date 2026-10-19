import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {APP_VERSION} from '../shared/constants.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('source distribution tracks no downloaded art, vendor or installed npm packages',()=>{
  const files=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
  assert.deepEqual(files.filter(f=>/^(?:node_modules|public\/(?:assets|fonts|vendor))\//.test(f)),[]);
  for(const dir of ['node_modules/','public/assets/','public/fonts/','public/vendor/'])assert.ok(read('.gitignore').split(/\r?\n/).includes(dir));
});
test('release version and fork support links agree with the lockfile',()=>{
  const pkg=JSON.parse(read('package.json')),lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version,lock.version);assert.equal(pkg.version,lock.packages[''].version);
  assert.equal(pkg.version,APP_VERSION);
  assert.equal(pkg.repository.url,'git+https://github.com/KLBSTL/weishu.git');
  assert.equal(pkg.bugs.url,'https://github.com/KLBSTL/weishu/issues');
});
test('entry documents resolve their relative file links and preserve legal separation',()=>{
  for(const file of ['README.md','NOTICE.md','THIRD-PARTY-NOTICES.md','docs/LOCAL-EXPANSION.md','docs/core-release-20261019.md']){
    for(const [,target]of read(file).matchAll(/\]\(([^)\s]+)\)/g)){
      if(/^(?:[a-z]+:|#)/i.test(target))continue;
      assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),target.split('#')[0])),`${file}: ${target}`);
    }
  }
  assert.match(read('NOTICE.md'),/Additional permission under GNU GPL version 3 section 7/);
  assert.match(read('README.md'),/Source code/);
  assert.match(read('README.md'),/同版本完整 Release/);
});
