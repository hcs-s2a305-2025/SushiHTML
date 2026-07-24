// ★重要：アプリを更新した時は、vXXの部分を修正する。
const CACHE_NAME = 'sushi-log-v60'; 

const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// 1. インストール処理
self.addEventListener('install', (event) => {
    // ⚠️ self.skipWaiting(); はここから削除します（画面からの合図で実行するため）
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

// 2. アクティベート処理（古いキャッシュの確実な削除）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. 画面側(script.js)からの「待機をスキップして！」という合図を受信する
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 4. フェッチ処理（iOSの強力なキャッシュ対策）
self.addEventListener('fetch', (event) => {
    // 【キャッシュファースト戦略】
    // SWが管理する最新バージョンのキャッシュを最優先で返し、無ければネットワークへ
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});