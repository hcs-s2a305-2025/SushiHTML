// キャッシュ名（バージョンを上げるとキャッシュが更新されます）
const CACHE_NAME = 'sushi-log-v42b';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['./', './index.html', './style.css', './script.js']);
        })
    );
});

// オフライン時はキャッシュを返し、オンライン時は常に最新を取得する（Network First戦略）
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});