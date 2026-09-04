// Compatibility capture must run before any app resources. No private query transport.
window.__ledgerFragment = location.hash.slice(1);
if (location.hash || location.search) history.replaceState(null, '', location.pathname);
