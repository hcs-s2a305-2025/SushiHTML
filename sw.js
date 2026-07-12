// ★重要：アプリを更新した時は、vOOの部分を修正する。
// バージョンを変えないと、ブラウザで変更を検知してくれません。

//バージョン改変後修正忘れず
const CACHE_NAME = 'sushi-log-v49'; 

const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// インストール処理（キャッシュへの保存）
self.addEventListener('install', (event) => {
    // 新しいバージョンが見つかったら、すぐに待機状態をスキップしてインストールする
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

// アクティベート処理（古いキャッシュの削除）
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 現在のバージョン（sushi-log-v2）以外の古いキャッシュを見つけたら削除する
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 新しいService Workerをすぐにページ全体に反映させる
    self.clients.claim();
});

// フェッチ処理（ネットワーク通信の制御）
self.addEventListener('fetch', (event) => {
    event.respondWith(
        // まずはインターネット（ネットワーク）から最新のファイルを取ろうと試みる
        fetch(event.request).catch(() => {
            // オフラインなどで通信に失敗したら、キャッシュからファイルを返す
            return caches.match(event.request);
        })
    );
});