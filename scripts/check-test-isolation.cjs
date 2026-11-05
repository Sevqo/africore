const fs=require('node:fs');
const path=require('node:path');
const failures=[];
for(const name of fs.readdirSync('src/__tests__').filter(name=>name.endsWith('.test.ts'))){
 const source=fs.readFileSync(path.join('src/__tests__',name),'utf8');
 const setup=/^\s*configureTestEnv\(/m.exec(source);if(!setup)continue;
 const prefix=source.slice(0,setup.index);
 for(const imported of prefix.matchAll(/import\s+(?!type\s)(?:[^;]*?\sfrom\s*)?['"]([^'"]+)['"]/g)){
  if(imported[1].startsWith('.')&&imported[1]!=='./helpers')failures.push(name+': configure the disposable database before importing '+imported[1]);
 }
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log('Backend fixture import order checked; application modules follow test environment configuration.');
