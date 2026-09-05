import {parseImport} from './core.js';
self.onmessage=async({data})=>{try{self.postMessage({result:await parseImport(data.text,data.ledgerId)});}catch(e){self.postMessage({error:e.message});}};
