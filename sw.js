const VERSION='personal-ledger-v2-shell-20260904-1';
const BASE=new URL('./',self.location.href);
const FILES=['./','index.html','boot.js','styles.css','app.js','core.js','store.js','import-worker.js','manifest.json','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','docs/SHORTCUTS.md','docs/MIGRATION.md','docs/ARCHITECTURE.md'];
const ALLOWED=new Set(FILES.map(p=>new URL(p,BASE).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll([...ALLOWED]))));
self.addEventListener('message',event=>{if(event.data==='activate-update')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k==='personal-ledger-shell-v1'||(k.startsWith('personal-ledger-v2-shell-')&&k!==VERSION)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);url.search='';url.hash='';
 if(event.request.method!=='GET'||!ALLOWED.has(url.href)){event.respondWith(Promise.resolve(new Response('This app only loads its static files.',{status:403})));return;}
 // Fetch a fixed allowlisted URL, never the incoming request or its query.
 event.respondWith(caches.open(VERSION).then(cache=>cache.match(url.href)).then(cached=>cached||fetch(url.href,{credentials:'omit',referrerPolicy:'no-referrer'})));
});
