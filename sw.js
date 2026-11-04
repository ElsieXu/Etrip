// =========================================
// sw.js — 離線快取：沒有網路時也能打開行程
// 更新網站檔案後，記得把 CACHE 的版本號 +1
// =========================================

const CACHE = "etrip-v5";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png",
  "vendor/Sortable.min.js",
  "vendor/lz-string.min.js",
  "vendor/qrcode.js",
  "js/config.js",
  "js/utils.js",
  "js/store.js",
  "js/api.js",
  "js/ui.js",
  "js/plan.js",
  "js/today.js",
  "js/pocket.js",
  "js/tools.js",
  "js/demo.js",
  "js/trips.js",
  "js/sync.js",
  "js/app.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // 只處理本站的 GET；AI / 定位 API 一律走網路
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // 網頁本身：先試網路（3 秒內），拿不到就用快取
  if (req.mode === "navigate") {
    e.respondWith(
      Promise.race([
        fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("index.html", copy));
          return res;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
      ]).catch(() => caches.match("index.html").then(r => r || fetch(req)))
    );
    return;
  }

  // 其他檔案：先用快取（快），同時在背景更新
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
