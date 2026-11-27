/* MY BASE 서비스 워커
   - 인터넷이 끊겨도 마지막으로 본 화면을 열 수 있게 기본 파일을 저장해 둬요.
   - 알림을 누르면 사이트를 열어 줘요.
   사이트를 크게 고치면 아래 버전 숫자를 하나 올려 주세요. */
var CACHE = 'mybase-v11';
var PIN_CACHE = 'mybase-pins';   // 알림창에 띄운 메모 목록 (버전이 바뀌어도 지우지 않아요)
var CORE = [
  './', './index.html', './app.html', './share.html',
  './style.css', './script.js', './data.js', './public.js', './manifest.json',
  './icons/app-192.png', './icons/app-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 없는 파일이 있어도 나머지는 저장해요.
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== PIN_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* 먼저 인터넷에서 가져오고, 안 되면 저장해 둔 파일을 보여 줘요. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});

/* 알림을 누르면 열려 있는 사이트로 가거나 새로 열어요. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow ? self.clients.openWindow('./') : null;
  }));
});

/* 알림창에 띄운 메모를 밀어서 지우면 바로 다시 띄워요. 메모를 끝내거나 종을 끄면 목록에서 빠져서 다시 뜨지 않아요. */
self.addEventListener('notificationclose', function (e) {
  var n = e.notification;
  if (!/^memo-/.test(n.tag || '')) return;
  e.waitUntil(caches.open(PIN_CACHE).then(function (c) { return c.match('pins.json'); })
    .then(function (r) { return r ? r.json() : {}; })
    .then(function (want) {
      var title = want && want[n.tag];
      if (!title) return null;
      return self.registration.showNotification(title, { body: 'MY BASE 메모', tag: n.tag, silent: true, requireInteraction: true, icon: 'icons/app-192.png', badge: 'icons/app-192.png' });
    }).catch(function () {}));
});
