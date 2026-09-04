import fs from 'node:fs';import path from 'node:path';
export const PUBLIC_FILES=['index.html','boot.js','styles.css','app.js','core.js','store.js','import-worker.js','sw.js','manifest.json','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','docs/SHORTCUTS.md','docs/MIGRATION.md','docs/ARCHITECTURE.md'];
fs.mkdirSync('dist',{recursive:true});
// Never copy repository contents wholesale. Only these generic files are deployable.
for(const p of PUBLIC_FILES){fs.mkdirSync(path.dirname('dist/'+p),{recursive:true});fs.copyFileSync(p,'dist/'+p);}
fs.writeFileSync('dist/.nojekyll','');
const allowed=new Set([...PUBLIC_FILES,'.nojekyll']);function check(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())check(p);else{const rel=path.relative('dist',p).replaceAll('\\','/');if(!allowed.has(rel))throw Error('Unexpected file in deployment folder: '+rel);}}}check('dist');
console.log(`Built ${allowed.size} generic static files. No financial data included.`);
