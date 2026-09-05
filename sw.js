const CACHE_NAME = "personal-ledger-shell-v1-update-v3-20260905-6";
const SHELL_FILES = ["./", "./index.html", "./styles.css", "./app.js", "./files.js", "./file-worker.js", "./manifest.json", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES.map((file) => new Request(file, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && (key === "personal-ledger-shell-v1" || key.startsWith("personal-ledger-shell-v1-recent") || key.startsWith("personal-ledger-shell-v1-update-") || key.startsWith("personal-ledger-v2-shell-"))).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: false }).then((cached) => cached || fetch(event.request)));
});
