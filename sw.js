// =========================================
// sw.js — 離線快取：沒有網路時也能打開行程
// 更新網站檔案後，記得把 CACHE 的版本號 +1
// =========================================

const CACHE = "etrip-v13";
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
  "js/travel.js",
  "js/expenses.js",
  "js/packing.js",
  "js/plan.js",
  "js/today.js",
  "js/pocket.js",
  "js/tools.js",
  "js/demo.js",
  "js/trips.js",
  "js/sync.js",
  "js/safety.js",
  "js/guide.js",
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
  // 只處理本站的 GET；AI / 天氣 / 匯率等外部服務一律走網路
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // 一律「先試網路」：有網路時拿到的一定是最新版（網站更新後不會先跑到舊版）；
  // 網路太慢（3 秒）或離線時，才用存在手機裡的版本
  const key = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(
    Promise.race([
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(key, copy));
        }
        return res;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
    ]).catch(() => caches.match(key, { ignoreSearch: true }).then(r => r || fetch(req)))
  );
});
