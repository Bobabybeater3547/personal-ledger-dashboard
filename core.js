// Pure data model shared by the import worker, dashboard and contract tests.
export const TYPES = ['Expense','Income','Transfer','Record Payment'];
const IDENTIFIER = /^[a-zA-Z0-9-]{1,80}$/;
export const stable = value => JSON.stringify(canonical(value));
function canonical(v) { if(Array.isArray(v)) return v.map(canonical); if(v && typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])); return v; }
export function identifier(v) { if(typeof v!=='string'||!IDENTIFIER.test(v)) throw Error('Invalid record identifier.'); return v; }
function number(v,label,positive=false){ if(v===''||v===null||typeof v==='boolean'||v===undefined)throw Error(`${label} is missing.`); const n=Number(v); if(!Number.isFinite(n)||Math.abs(n)>1e13||(positive && n<=0))throw Error(`${label} is invalid.`); return n; }
function text(v,max=200){const s=String(v??'').trim();if(s.length>max)throw Error(`Text exceeds ${max} characters.`);return s;}
export function day(value){
 const m=String(value??'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T ])/);if(!m)throw Error('Use a valid date, YYYY-MM-DD.');
 const [y,mo,d]=m.slice(1).map(Number), date=new Date(Date.UTC(y,mo-1,d));if(y<1900||y>2200||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)throw Error('Date is invalid.');
 return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function transaction(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Expected a transaction object.');
 let type=TYPES.find(t=>t.toLowerCase()===text(raw.type).toLowerCase());if(text(raw.type).toLowerCase()==='payment')type='Record Payment';if(!type)throw Error('Unsupported transaction type.');
 const currency=text(raw.currency).toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw Error('Currency must have three letters.');
 const amount=number(raw.amount,'Amount',true),fxRate=number(raw.fxRate,'FX rate',true),jpyAmount=number(raw.jpyAmount??amount*fxRate,'JPY value',true);
 if(currency==='JPY'&&fxRate!==1)throw Error('JPY exchange rate must be 1.');
 const account=text(raw.account),toAccount=text(raw.toAccount);if(!account)throw Error('Account is required.');
 if(['Transfer','Record Payment'].includes(type)&&(!toAccount||account===toAccount))throw Error('Choose two different accounts.');
 if(!['Transfer','Record Payment'].includes(type)&&toAccount)throw Error('Only transfers and payments have a destination.');
 const result={...raw,date:text(raw.date,80),type,account,toAccount,category:text(raw.category)||'Uncategorised',amount,currency,fxRate,jpyAmount,merchant:text(raw.merchant),note:text(raw.note,2000)};
 day(result.date);
 if(raw.toAmount!==undefined&&raw.toAmount!=='')result.toAmount=number(raw.toAmount,'Received amount',true);else delete result.toAmount;
 if(raw.taxTag!==undefined)result.taxTag=text(raw.taxTag,120);
 return result;
}
export function accountsData(raw){
 const list=Array.isArray(raw)?raw:raw?.accounts;if(!Array.isArray(list))throw Error('Expected an accounts list.');
 const names=new Set();return {accounts:list.map(a=>{
 const name=text(a.name);if(!name||names.has(name))throw Error('Account names must be unique.');names.add(name);
 const currency=text(a.currency||'JPY').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw Error('Invalid account currency.');
 const card=/credit|card/i.test(a.type||'');
 return {...a,name,currency,type:text(a.type||'Account'),openingBalance:a.openingBalance==null?null:number(a.openingBalance,'Opening balance'),openingDate:a.openingDate?day(a.openingDate):null,includeInAssets:card?false:a.includeInAssets!==false,valuationRate:a.valuationRate==null?null:number(a.valuationRate,'Valuation rate',true),valuationDate:a.valuationDate?day(a.valuationDate):null};
 })};
}
export function validateEvent(e){
 if(!e||e.schema!==2||e.kind!=='ledger-event')throw Error('Unsupported event format.');
 ['ledgerId','id','revision'].forEach(k=>identifier(e[k]));if(e.parent)identifier(e.parent);if(typeof e.parent!=='string')throw Error('Parent must be a string.');
 if(e.parent===e.revision)throw Error('A revision cannot be its own parent.');
 if(!['transaction','accounts'].includes(e.entity)||!['put','delete'].includes(e.operation))throw Error('Unsupported event operation.');
 if(e.entity==='accounts'&&(e.id!=='accounts'||e.operation!=='put'))throw Error('Invalid accounts revision.');
 if(e.entity==='transaction'&&e.id==='accounts')throw Error('Reserved account configuration identifier.');
 if(!e.parent&&e.operation==='delete')throw Error('Cannot delete a missing record.');
 if(!Number.isFinite(Date.parse(e.savedAt)))throw Error('Revision needs a saved timestamp.');
 const data=e.operation==='delete'?null:e.entity==='transaction'?transaction(e.data):accountsData(e.data);
 return {...e,data};
}
export function materialize(events){
 const groups=new Map(), revisions=new Map(),problems=[],active=[],deleted=[],heads=new Map();let accounts=[];
 for(const e of events){if(revisions.has(e.revision)&&stable(revisions.get(e.revision))!==stable(e))throw Error('A revision was changed after it was saved.');revisions.set(e.revision,e);const key=e.id; if(!groups.has(key))groups.set(key,[]);if(!groups.get(key).some(x=>x.revision===e.revision))groups.get(key).push(e);}
 for(const [id,rows] of groups){
  const byId=new Map(rows.map(e=>[e.revision,e])),parents=new Set(rows.map(e=>e.parent).filter(Boolean)), roots=rows.filter(e=>!e.parent), tips=rows.filter(e=>!parents.has(e.revision));
  if(rows.some(e=>e.entity!==rows[0].entity)||rows.some(e=>e.parent&&!byId.has(e.parent))){problems.push({id,reason:'Missing parent revision. Import complete history for this record.'});continue;}
  if(roots.length!==1||tips.length!==1){problems.push({id,reason:'Conflicting revisions. This record is excluded until reviewed.'});continue;}
  let walk=tips[0],seen=new Set();while(walk&&!seen.has(walk.revision)){seen.add(walk.revision);walk=byId.get(walk.parent);}
  if(seen.size!==rows.length){problems.push({id,reason:'Disconnected or cyclic revision history.'});continue;}
  const e=tips[0];heads.set(id,e);
  if(e.entity==='accounts'){accounts=e.data.accounts;continue;}
  const t={...e.data,id,revision:e.revision,deleted:e.operation==='delete',event:e};
  if(e.operation==='delete'){const p=byId.get(e.parent);let original=p;while(original?.operation==='delete')original=byId.get(original.parent);deleted.push({...original?.data,...t});}else active.push(t);
 }
 active.sort((a,b)=>day(b.date).localeCompare(day(a.date))||b.id.localeCompare(a.id));return {active,deleted,accounts,heads,problems};
}
async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function parseImport(source,ledgerId){
 const clean=source.replace(/^\uFEFF/,'').trim();if(!clean)throw Error('The selected file is empty.');
 let parsed;try{parsed=JSON.parse(clean);}catch{}
 if(parsed?.schema===2 && parsed.kind==='ledger-bundle'){
  identifier(parsed.ledgerId);if(!Array.isArray(parsed.events))throw Error('Bundle has no events.');
  if(parsed.events.length>150000)throw Error('Split this export into smaller files (maximum 150,000 revisions).');
  const events=parsed.events.map(validateEvent);if(events.some(e=>e.ledgerId!==parsed.ledgerId))throw Error('Mixed ledgers in one file.');
  return {ledgerId:parsed.ledgerId,events,legacy:false,exportedAt:parsed.exportedAt||null};
 }
 if(parsed?.kind==='ledger-event'){const e=validateEvent(parsed);return{ledgerId:e.ledgerId,events:[e],legacy:false};}
 if(parsed?.kind)throw Error('This is a request or migration file, not an iCloud export.');
 const id=ledgerId||crypto.randomUUID(),savedAt='2000-01-01T00:00:00.000Z';
 if(parsed?.accounts || (Array.isArray(parsed)&&parsed.length&&parsed[0].name&&!parsed[0].date)){
  const data=accountsData(parsed), revision='a-'+(await hash(stable(data))).slice(0,40);
  return{ledgerId:id,legacy:true,events:[{schema:2,kind:'ledger-event',ledgerId:id,entity:'accounts',id:'accounts',revision,parent:'',operation:'put',savedAt,data}]};
 }
 let rows;if(Array.isArray(parsed))rows=parsed;else if(Array.isArray(parsed?.transactions))rows=parsed.transactions;else if(parsed?.date)rows=[parsed];else rows=clean.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{try{return JSON.parse(line);}catch{throw Error(`Line ${i+1}: invalid JSON. Nothing was imported.`);}});
 const counts=new Map(),events=[];
 for(let i=0;i<rows.length;i++){
  let data;try{data=transaction(rows[i]);}catch(e){throw Error(`Record ${i+1}: ${e.message} Nothing was imported.`);}
  const canonicalRow=stable(data),count=(counts.get(canonicalRow)||0)+1;counts.set(canonicalRow,count);
  const recordId='legacy-'+(await hash(canonicalRow+'\n'+count)).slice(0,40);
  events.push({schema:2,kind:'ledger-event',ledgerId:id,entity:'transaction',id:recordId,revision:recordId,parent:'',operation:'put',savedAt,data});
 }
 return{ledgerId:id,events,legacy:true};
}
export function mergeEvents(old,incoming,ledgerId){
 const map=new Map(old.map(e=>[e.revision,e]));for(const e of incoming){if(e.ledgerId!==ledgerId)throw Error('This file belongs to another ledger. Clear this local view before switching ledgers.');const prior=map.get(e.revision);if(prior&&stable(prior)!==stable(e))throw Error('An immutable revision changed. Import cancelled.');map.set(e.revision,e);}return [...map.values()];
}
export function command(head,data,operation='put',ledgerId,entity='transaction'){
 const requestId=crypto.randomUUID();return{schema:2,kind:'ledger-command',ledgerId:identifier(ledgerId),requestId,id:head?.id||(entity==='accounts'?'accounts':crypto.randomUUID()),entity,parent:head?.revision||'',operation,data:operation==='delete'?null:entity==='accounts'?accountsData(data):transaction(data)};
}
// Reference validation for the native Shortcut contract. Never writes to iCloud from a browser.
export function approveCommand(c,events,ledgerId,now=new Date().toISOString()){
 if(c.schema!==2||c.kind!=='ledger-command'||c.ledgerId!==ledgerId)throw Error('Wrong command or ledger.');identifier(c.requestId);identifier(c.id);
 const prior=events.find(e=>e.revision===c.requestId);if(prior){if(prior.id!==c.id||prior.parent!==c.parent||prior.operation!==c.operation||prior.entity!==c.entity||stable(prior.data)!==stable(c.data))throw Error('Request identifier collision.');return prior;}
 const model=materialize(events);if(model.problems.some(p=>p.id===c.id))throw Error('Resolve record conflict first.');const head=model.heads.get(c.id);
 if((head?.revision||'')!==c.parent)throw Error('Stale edit. Import the latest iCloud revision and try again.');
 if(head&&head.entity!==c.entity)throw Error('Entity cannot change.');
 return validateEvent({schema:2,kind:'ledger-event',ledgerId,id:c.id,revision:c.requestId,parent:c.parent,entity:c.entity,operation:c.operation,data:c.data,savedAt:now});
}
export function periodBounds(mode,value){if(mode==='all')return['1900-01-01','2200-12-31'];const y=Number(value.slice(0,4));if(mode==='year')return[`${y}-01-01`,`${y}-12-31`];const m=Number(value.slice(5,7));return[`${value.slice(0,7)}-01`,`${value.slice(0,7)}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`];}
export const inRange=(t,start,end)=>day(t.date)>=start&&day(t.date)<=end;
export function summary(rows){const expense=sum(rows.filter(t=>t.type==='Expense')),income=sum(rows.filter(t=>t.type==='Income'));return{expense,income,net:income-expense,count:rows.length};}
export function sum(rows){return rows.reduce((a,t)=>a+t.jpyAmount,0);}
export function ranked(rows,key){const map=new Map();for(const t of rows){const name=t[key]||'Unspecified';let r=map.get(name)||{name,amount:0,count:0};r.amount+=t.jpyAmount;r.count++;map.set(name,r);}return[...map.values()].sort((a,b)=>b.amount-a.amount);}
export function months(rows,year,category=''){return Array.from({length:12},(_,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`;return{key,...summary(rows.filter(t=>day(t.date).startsWith(key)&&(!category||t.category===category)))};});}
export function recurrence(rows){
 const groups=new Map();for(const t of rows.filter(t=>t.type==='Expense'&&t.merchant)){const key=stable([t.merchant,t.currency,t.account]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const result=[];for(const items of groups.values()){
  items.sort((a,b)=>day(a.date).localeCompare(day(b.date)));if(items.length<3)continue;
  const gaps=items.slice(1).map((t,i)=>(Date.parse(day(t.date))-Date.parse(day(items[i].date)))/86400000);
  const sorted=[...gaps].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  const cadence=median>=6&&median<=8?'Weekly':median>=25&&median<=35?'Monthly':median>=350&&median<=380?'Yearly':null;
  if(!cadence||gaps.filter(g=>Math.abs(g-median)<=Math.max(3,median*.16)).length/gaps.length<.75)continue;
  result.push({merchant:items[0].merchant,account:items[0].account,cadence,count:items.length,latest:items.at(-1),mean:sum(items)/items.length,change:items.at(-1).jpyAmount-items.at(-2).jpyAmount});
 }return result.sort((a,b)=>b.mean-a.mean);
}
export function balances(rows,accounts,asOf){
 const eligible=rows.filter(t=>day(t.date)<=asOf),byName=new Map(accounts.map(a=>[a.name,a]));
 const unknown=new Set();for(const t of eligible){if(!byName.has(t.account))unknown.add(t.account);if(t.toAccount&&!byName.has(t.toAccount))unknown.add(t.toAccount);}
 const values=accounts.map(a=>{
  let amount=a.openingBalance??0;const issues=[];if(a.openingBalance==null)issues.push('Opening balance missing');if(!a.openingDate)issues.push('Opening date missing');if(a.openingDate&&a.openingDate>asOf)issues.push('Opening date is after this period');
  const card=/credit|card/i.test(a.type);
  if(card){
   // Activity uses recorded JPY values across currencies; it is not an amount owed.
   // Older Shortcuts place the card at either end of a Record Payment entry.
   const purchases=eligible.filter(t=>t.type==='Expense'&&t.account===a.name);
   const payments=eligible.filter(t=>t.type==='Record Payment'&&(t.account===a.name||t.toAccount===a.name));
   return {...a,includeInAssets:false,amount:null,jpy:null,issues:[],activity:{purchasesJPY:sum(purchases),purchaseCount:purchases.length,paymentsJPY:sum(payments),paymentCount:payments.length}};
  }
  for(const t of eligible.filter(t=>(!a.openingDate||day(t.date)>=a.openingDate)&&(t.account===a.name||t.toAccount===a.name))){
   let sign=t.type==='Income'?1:-1,delta;
   if(['Transfer','Record Payment'].includes(t.type)){
    let source=t.account,dest=t.toAccount;if(t.type==='Record Payment'&&/credit|card/i.test(byName.get(source)?.type||'')){[source,dest]=[dest,source];}
    sign=a.name===dest?1:-1;
    if(a.name===dest&&t.toAmount!==undefined)delta=t.toAmount;else if(a.currency===t.currency)delta=t.amount;else if(a.currency==='JPY')delta=t.jpyAmount;else issues.push('Cross-currency received amount missing');
   }else if(a.currency===t.currency)delta=t.amount;else issues.push('Transaction currency does not match account');
   if(delta!==undefined)amount+=sign*delta;
  }
  const fx=eligible.filter(t=>t.currency===a.currency).sort((a,b)=>day(b.date).localeCompare(day(a.date)))[0];
  const explicit=a.valuationRate&&a.valuationDate&&a.valuationDate<=asOf;
  const rate=a.currency==='JPY'?1:explicit?a.valuationRate:fx?.fxRate,rateDate=a.currency==='JPY'?null:explicit?a.valuationDate:fx?day(fx.date):null;
  if(!rate)issues.push('JPY valuation rate missing');
  return{...a,amount,jpy:rate?amount*rate:null,rate,rateDate,issues:[...new Set(issues)]};
 });return{values,unknown:[...unknown],complete:unknown.size===0&&values.filter(a=>a.includeInAssets).every(a=>!a.issues.length),total:values.filter(a=>a.includeInAssets&&a.jpy!==null).reduce((s,a)=>s+a.jpy,0)};
}
