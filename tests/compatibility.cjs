// Synthetic fixtures only. Run with: node --test tests/compatibility.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function ledger() {
  const context = { window: {}, TextDecoder, URLSearchParams, atob };
  vm.createContext(context);
  vm.runInContext(source.replace('  init();', '  globalThis.api = { state, readFragment, parseLedger, parseAccounts, transactionPage, transactionSelection, rhythmData, accountBalances, assetSummary, periodRange, trailingMonths };'), context);
  return context.api;
}
const tx = (extra = {}) => ({date:'2026-09-03T12:00:00+09:00',type:'Expense',account:'Bank',category:'Food',currency:'JPY',amount:100,...extra});
function seed(api, rows, accounts) {
  api.state.transactions = api.parseLedger(rows.map(x=>JSON.stringify(x)).join('\n')).transactions;
  api.state.accounts = api.parseAccounts(JSON.stringify(accounts));
}
test('legacy base64 and JSON envelope transports preserve Unicode', ()=>{
 const api=ledger(); const text=JSON.stringify(tx({merchant:'喫茶店'}));
 const encoded=Buffer.from(text).toString('base64');
 assert.equal(api.readFragment(new URLSearchParams({ledger:encoded}).toString()).ledgerText,text);
 assert.equal(api.readFragment(encodeURIComponent(JSON.stringify({ledger:text,accounts:[]}))).ledgerText,text);
});
test('malformed lines skipped; same-day entries retain reverse append order', ()=>{
 const api=ledger();const result=api.parseLedger(JSON.stringify(tx({amount:1}))+'\nBAD\n'+JSON.stringify(tx({amount:2})));
 assert.equal(result.skipped,1);assert.equal(result.transactions[0].amount,2);
});
test('ten-row pagination, jumps, final page and bounds', ()=>{
 const api=ledger();const rows=Array.from({length:37},(_,i)=>i);
 assert.equal(api.transactionPage(rows,2).rows[0],10);
 assert.equal(api.transactionPage(rows,4).rows.length,7);
 assert.equal(api.transactionPage(rows,99).current,4);
 assert.equal(api.transactionPage(rows,-1).current,1);
 assert.equal(api.transactionPage([],1).pages,1);
});
test('rhythms selection filters only expense category and month', ()=>{
 const api=ledger(); seed(api,[tx(),tx({type:'Income'}),tx({category:'Home'}),tx({date:'2025-09-03'})],[]);
 api.state.transactionFilter={year:2026,month:8,category:'Food'};
 assert.equal(api.transactionSelection({transactions:[]}).transactions.length,1);
 assert.equal(api.rhythmData(2026).find(x=>x.name==='Food').total,100);
});
test('asset subtotal excludes credit cards and opt-out accounts', ()=>{
 const api=ledger(); seed(api,[tx()],[{name:'Bank',openingBalance:1000},{name:'Card',type:'Credit card',openingBalance:300},{name:'Excluded',includeInAssets:false,openingBalance:500}]);
 assert.equal(api.assetSummary(api.accountBalances()).total,900);
});
test('both legacy payment directions reduce bank and card balance', ()=>{
 for(const reversed of [false,true]) {
  const api=ledger();seed(api,[tx({type:'Record Payment',account:reversed?'Card':'Bank',toAccount:reversed?'Bank':'Card'})],[{name:'Bank',openingBalance:1000},{name:'Card',type:'Credit card',openingBalance:300}]);
  const balances=api.accountBalances();assert.equal(balances[0].balance,900);assert.equal(balances[1].balance,200);
 }
});
test('opening-date boundary and native destination transfer amount', ()=>{
 const api=ledger();seed(api,[tx({date:'2026-09-02'}),tx(),tx({type:'Transfer',toAccount:'Foreign',amount:150,toAmount:1})],[{name:'Bank',openingBalance:1000,openingDate:'2026-09-03'},{name:'Foreign',currency:'USD',openingBalance:10}]);
 const balances=api.accountBalances();assert.equal(balances[0].balance,750);assert.equal(balances[1].balance,11);
});
test('missing FX and duplicate names remain unavailable', ()=>{
 const api=ledger();seed(api,[],[{name:'Foreign',currency:'USD',openingBalance:10},{name:'Duplicate',openingBalance:10},{name:'Duplicate',openingBalance:10}]);
 const balances=api.accountBalances();assert.equal(balances[1].balanceKnown,false);assert.equal(api.assetSummary(balances).count,0);
});
test('active dashboard has no persistent financial storage or remote requests', ()=>{
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|sendBeacon/);
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(html,/(?:src|href)=["']https?:/);
 assert.match(html,/history\.replaceState/);
});

test('custom month ranges include leap day and cross year boundaries',()=>{
 const api=ledger();api.state.customYear=2024;api.state.customMonth=1;
 const range=api.periodRange('customMonth');assert.equal(range.start.getMonth(),1);assert.equal(range.end.getDate(),1);assert.equal(range.end.getMonth(),2);
 assert.ok(new Date('2024-02-29T12:00:00')>=range.start && new Date('2024-02-29T12:00:00')<range.end);
 api.state.customMonth=11;assert.equal(api.periodRange('customMonth').end.getFullYear(),2025);
});
test('whole-year selection and trend match the selected historical year',()=>{
 const api=ledger();api.state.period='customYear';api.state.customYear=2023;
 const range=api.periodRange('customYear');assert.equal(range.end.getFullYear(),2024);
 const months=api.trailingMonths();assert.equal(months[0].start.getFullYear(),2023);assert.equal(months[0].start.getMonth(),0);assert.equal(months[11].start.getMonth(),11);
});
