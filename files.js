/* Shared file validation. No storage, network or UI dependencies. */
(function (root) {
  'use strict';
  function accountsDocument(text) {
    let doc;
    try { doc = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (_) { throw Error('The accounts file is not valid JSON. Nothing was replaced.'); }
    const rows = Array.isArray(doc) ? doc : doc && doc.accounts;
    if (!Array.isArray(rows)) throw Error('Choose an accounts file containing an account list.');
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.name !== 'string' || !row.name.trim()) throw Error('Every account needs a name. Nothing was replaced.');
      const key = row.name.trim();
      if (seen.has(key)) throw Error('Account names must be unique before editing: ' + key);
      seen.add(key);
    }
    return doc;
  }
  function rowsOf(doc) { return Array.isArray(doc) ? doc : doc.accounts; }
  function dateValid(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00');
    return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(value.slice(0,4)) && d.getMonth()+1 === Number(value.slice(5,7)) && d.getDate() === Number(value.slice(8,10));
  }
  function editAccount(doc, index, fields) {
    const next = JSON.parse(JSON.stringify(doc));
    const rows = rowsOf(next);
    if (index !== null && (!Number.isInteger(index) || !rows[index])) throw Error('This account is no longer available. Reopen the editor.');
    const old = index === null ? {} : rows[index];
    const name = String(fields.name || '').trim();
    if (!name || name.length > 100) throw Error('Enter an account name of 1–100 characters.');
    if (index !== null && name !== old.name.trim()) throw Error('Existing account names are kept to preserve transaction links.');
    if (rows.some((row,i)=>i !== index && row.name.trim() === name)) throw Error('An account with this name already exists.');
    const currency = String(fields.currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw Error('Use a three-letter currency code, such as JPY or USD.');
    const type = String(fields.type || '').trim();
    if (!type) throw Error('Choose an account type.');
    if (index !== null && (currency !== String(old.currency || 'JPY').trim().toUpperCase() || type !== String(old.type || 'Account').trim())) throw Error('Existing currency and type are kept to preserve historical calculations.');
    const amount = String(fields.openingBalance ?? '').trim();
    if (amount && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) throw Error('Enter an opening balance without commas.');
    if (amount && !Number.isFinite(Number(amount))) throw Error('Enter a finite opening balance.');
    if (index === null && !amount) throw Error('Enter the new account’s opening balance, including zero.');
    const date = String(fields.openingDate || '');
    if (date && !dateValid(date)) throw Error('Choose a valid opening date.');
    if (index === null && !date) throw Error('Choose the new account’s opening date.');
    const updated = {...old, name: index === null ? name : old.name, type, currency, includeInAssets: Boolean(fields.includeInAssets)};
    // Preserve unknown metadata and the original envelope; never export computed balances.
    if (amount) updated.openingBalance = Number(amount); else delete updated.openingBalance;
    if (date) updated.openingDate = old.openingDate && String(old.openingDate).slice(0,10) === date ? old.openingDate : date; else delete updated.openingDate;
    if (index === null) rows.push(updated); else rows[index] = updated;
    return next;
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const api = {accountsDocument, rowsOf, dateValid, editAccount, canonical};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LedgerFiles = api;
})(globalThis);
