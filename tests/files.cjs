const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const api=require('../files.js');
const original={version:'legacy',accounts:[{name:'Bank',currency:'JPY',type:'Bank',openingBalance:1000,openingDate:'2026-01-01',valuationRate:1,custom:{retain:true}}]};
const fields={name:'Bank',currency:'JPY',type:'Bank',openingBalance:'1000',openingDate:'2026-09-03',includeInAssets:true};
test('editing opening date preserves envelope, metadata and original',()=>{
 const next=api.editAccount(original,0,fields);assert.equal(next.version,'legacy');assert.deepEqual(next.accounts[0].custom,{retain:true});assert.equal(next.accounts[0].openingDate,'2026-09-03');assert.equal(original.accounts[0].openingDate,'2026-01-01');
 assert.equal(next.accounts[0].valuationRate,1);
});
test('new accounts round trip through existing array format',()=>{
 const next=api.editAccount([],null,{...fields,name:'Savings'});assert.equal(next[0].name,'Savings');assert.deepEqual(api.accountsDocument(JSON.stringify(next)),next);
});
test('duplicate names, identity changes, invalid dates and invalid numbers rejected',()=>{
 assert.throws(()=>api.editAccount(original,null,fields),/already exists/);
 assert.throws(()=>api.editAccount(original,0,{...fields,name:'Renamed'}),/transaction links/);
 assert.throws(()=>api.editAccount(original,0,{...fields,currency:'USD'}),/historical/);
 assert.throws(()=>api.editAccount(original,0,{...fields,openingDate:'2026-02-30'}),/valid opening date/);
 assert.throws(()=>api.editAccount(original,0,{...fields,openingBalance:'Infinity'}),/balance/);
 assert.throws(()=>api.accountsDocument('{"accounts":[{"name":"A"},{"name":" A "}]}'),/unique/);
});
test('canonical verification ignores JSON formatting and object key order',()=>{assert.equal(api.canonical({accounts:[],x:1}),api.canonical({x:1,accounts:[]}));});
async function worker(data) {
 const context={TextDecoder,LedgerFiles:api,importScripts(){},self:{}};
 const done=new Promise(resolve=>context.self.postMessage=message=>{if(message.kind!=='progress')resolve(message);});
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../file-worker.js'),'utf8'),context);context.self.onmessage({data});return done;
}
test('streamed 100,000-line import exceeds practical URL transport sizes',async()=>{
 const count=100000;const row=JSON.stringify({date:'2026-09-03',type:'Expense',amount:5,currency:'JPY',merchant:'合成データ'});
 const result=await worker({ledgerFiles:[new File([Array(count).fill(row).join('\n')],'ledger.txt')],accountsFile:new File([JSON.stringify(original)],'accounts.json')});
 assert.equal(result.kind,'ready');assert.equal(result.transactions.length,count);assert.equal(result.transactions[0].ledgerIndex,count-1);assert.equal(result.accounts.accounts[0].name,'Bank');
});
test('file reader skips malformed lines, handles CRLF and UTF-8, and preserves missing JPY fallback',async()=>{
 const result=await worker({ledgerFiles:[new File(['\uFEFF'+JSON.stringify({date:'2026-09-03',amount:100,currency:'USD',fxRate:150,merchant:'喫茶店'})+'\r\nBAD\n'],'ledger.txt')]});
 assert.equal(result.kind,'ready');assert.equal(result.skipped,1);assert.equal(result.transactions[0].merchant,'喫茶店');assert.ok(Number.isNaN(result.transactions[0].jpyAmount));
});
test('invalid account file rejects entire selection; accounts-only import leaves ledger untouched',async()=>{
 const bad=await worker({ledgerFiles:[new File(['{"date":"2026-09-03"}'],'ledger.txt')],accountsFile:new File(['{}'],'accounts.json')});assert.equal(bad.kind,'error');
 const only=await worker({ledgerFiles:[],accountsFile:new File(['[]'],'accounts.json')});assert.equal(only.transactions,null);assert.equal(only.accounts.length,0);
});
test('ledger.json arrays and accounts.txt are accepted without renaming',async()=>{
 const rows=[{date:'2026-09-03',amount:10},{date:'2026-09-04',amount:20}];
 const result=await worker({ledgerFiles:[new File([JSON.stringify(rows,null,2)],'ledger.json')],accountsFile:new File([JSON.stringify(original)],'accounts.txt')});
 assert.equal(result.kind,'ready');assert.equal(result.transactions.length,2);assert.equal(result.transactions[0].amount,20);assert.equal(result.accountsFilename,'accounts.txt');
});
test('ledger.json also accepts newline-delimited JSON, independent of extension',async()=>{
 const result=await worker({ledgerFiles:[new File(['{"date":"2026-09-03","amount":10}\n{"date":"2026-09-04","amount":20}'],'ledger.json')]});assert.equal(result.kind,'ready');assert.equal(result.transactions.length,2);
});
test('malformed JSON arrays reject the import, while empty arrays are valid',async()=>{
 const bad=await worker({ledgerFiles:[new File(['[{"date":"2026-09-03"},'],'ledger.json')]});assert.equal(bad.kind,'error');
 const empty=await worker({ledgerFiles:[new File(['[]'],'ledger.json')]});assert.equal(empty.kind,'ready');assert.equal(empty.transactions.length,0);
});
