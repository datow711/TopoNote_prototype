// 安裝 Service Worker
self.addEventListener('install', (e) => {
    console.log('[Service Worker] 安裝成功');
});

// 攔截網路請求 (目前設定為直接放行所有請求)
self.addEventListener('fetch', (e) => {
    e.respondWith(fetch(e.request));
});