/* Read large NDJSON files off the main thread. Only explicitly selected files are read. */
importScripts('files.js');
self.onmessage = async ({data}) => {
  try {
    const transactions = [];
    let skipped = 0, nonempty = 0, ledgerIndex = 0, read = 0;
    const files = data.ledgerFiles || [];
    const totalBytes = files.reduce((n,f)=>n+f.size,0);
    const number = v => Number.isFinite(Number(v)) ? Number(v) : 0;
    const hasNumber = v => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));
    function record(t) {
      nonempty++;
      try {
        if (!t || typeof t !== 'object' || Array.isArray(t) || !t.date) throw Error();
        const dateObject = new Date(t.date);
        if (Number.isNaN(dateObject.getTime())) throw Error();
        transactions.push({...t, amount:number(t.amount), fxRate:number(t.fxRate), jpyAmount:hasNumber(t.jpyAmount)?Number(t.jpyAmount):NaN, dateObject, ledgerIndex:ledgerIndex++});
      } catch (_) { skipped++; }
    }
    function line(text) {
      text=text.replace(/^\uFEFF/,'').trim();
      if (!text) return;
      let value;
      try { value=JSON.parse(text); } catch (_) { nonempty++; skipped++; return; }
      record(value);
    }
    for (const file of files) {
      const reader = file.stream().getReader();
      const decoder = new TextDecoder('utf-8', {fatal:true});
      let pending = '', format = null;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        read += result.value.byteLength;
        pending += decoder.decode(result.value,{stream:true});
        if (!format && pending.trim()) format = pending.trimStart().startsWith('[') ? 'array' : 'ndjson';
        let newline;
        while (format === 'ndjson' && (newline=pending.indexOf('\n')) !== -1) {
          line(pending.slice(0,newline)); pending=pending.slice(newline+1);
        }
        // Bound individual NDJSON lines; JSON arrays are parsed as a complete document in this worker.
        if (format === 'ndjson' && pending.length > 4*1024*1024) throw Error('A ledger line is too large. Choose newline-delimited JSON or a JSON transaction array.');
        self.postMessage({kind:'progress',percent:totalBytes?Math.round(read/totalBytes*100):100});
      }
      pending += decoder.decode();
      if (format === 'array') {
        let array;
        try { array=JSON.parse(pending.replace(/^\uFEFF/,'')); } catch (_) { throw Error('The ledger JSON array could not be read. Nothing was replaced.'); }
        array.forEach(record);
      } else line(pending);
    }
    if (nonempty && !transactions.length) throw Error('No valid transactions were found. Choose a ledger containing one JSON transaction per line or a JSON transaction array.');
    transactions.sort((a,b)=>b.dateObject-a.dateObject || b.ledgerIndex-a.ledgerIndex);
    let accounts = null;
    if (data.accountsFile) accounts = LedgerFiles.accountsDocument(await data.accountsFile.text());
    self.postMessage({kind:'ready',transactions: files.length ? transactions : null, skipped, accounts, accountsFilename:data.accountsFile ? data.accountsFile.name : null});
  } catch (error) { self.postMessage({kind:'error',message:error.message || 'The selected files could not be read. Nothing was replaced.'}); }
};
