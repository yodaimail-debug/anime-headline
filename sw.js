/* アニメ業界ヘッドライン：ホーム画面から開くための Service Worker
   - ページ（HTML）はネット優先。つながらないときは、前に開いたときの保存分を出す
   - 画像・フォントなどは保存分を先に出し、裏で新しいものに入れ替える */
const VER = "ahl-v1";
const BASE = "/anime-headline/";
const CORE = [BASE, BASE + "manifest.webmanifest", BASE + "og.png",
  BASE + "icons/icon-192.png", BASE + "icons/icon-512.png", BASE + "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function key(req) { const u = new URL(req.url); u.hash = ""; return u.href; }

async function networkFirst(req) {
  const cache = await caches.open(VER);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key(req), res.clone());
    return res;
  } catch (_) {
    return (await cache.match(key(req))) || (await cache.match(key(req), { ignoreSearch: true }))
      || (await cache.match(BASE)) || Response.error();
  }
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(VER);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => hit || Response.error());
  if (hit) { e.waitUntil(net); return hit; }
  return net;
}

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  const same = url.origin === self.location.origin && url.pathname.startsWith(BASE);
  // バックナンバーの有無を確かめる HEAD：つながらないときは保存済みなら「ある」と答える
  if (req.method === "HEAD" && same) {
    e.respondWith(fetch(req).catch(async () =>
      (await caches.match(key(req))) ? new Response(null, { status: 200 }) : new Response(null, { status: 404 })));
    return;
  }
  if (req.method !== "GET") return;
  if (same && (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html"))) {
    e.respondWith(networkFirst(req));
  } else if (same || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(req, e));
  }
});
