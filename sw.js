/* Lista — service worker for full offline use.
   Deployed to the lista repo as sw.js (sibling of index.html).
   Strategy:
     · navigation  → network-first with a 3s timeout, fall back to cached shell
                     (so you get updates when online, instant load when offline/poor signal)
     · assets/font → cache-first, revalidate in background (Victor Mono from Google is
                     cached on first online load, so even typography works offline) */
const CACHE = "lista-v2";
const SHELL = ["./", "./index.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function navigate(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
    ]);
    cache.put("./index.html", fresh.clone());
    return fresh;
  } catch (e) {
    return (await cache.match(req))
        || (await cache.match("./index.html"))
        || (await cache.match("./"))
        || Response.error();
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") { e.respondWith(navigate(req)); return; }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
