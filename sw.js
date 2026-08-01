// Service Worker для PWA "BrainBod".
// Свіжість важливіша за офлайн: навігація завжди тягне мережу першою.

// APP_VERSION штампує build.ps1 при збірці (крок 1b). Значення нижче —
// заглушка для розробки; НЕ публікувати dist/ в обхід build.ps1, інакше
// Service Worker віддасть стару версію.
var APP_VERSION = '0.4.0+2026080112';
var CACHE_NAME = 'bb-' + APP_VERSION;

// Що можна класти в кеш одразу при встановленні.
var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Таймаут мережі для навігаційних запитів (мс).
var NAV_TIMEOUT_MS = 3000;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      // Не чекати закриття старих вкладок — активуємось одразу.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) {
            // Видаляємо всі наші кеші попередніх версій (bb-*) і, окремо,
            // усі старі кеші під колишнім префіксом trn- (до ребрендингу
            // на BrainBod) — інакше вони лишаться назавжди, бо на github.io
            // всі проєкти акаунта ділять один origin і ніхто інший їх не прибере.
            return (name.indexOf('bb-') === 0 && name !== CACHE_NAME) ||
              name.indexOf('trn-') === 0;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      // Одразу взяти під контроль усі відкриті клієнти.
      return self.clients.claim();
    })
  );
});

// Мережа з таймаутом: якщо мережа не відповіла за NAV_TIMEOUT_MS — падаємо в кеш.
function networkWithTimeout(request, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error('network timeout'));
    }, timeoutMs);

    fetch(request).then(function (response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Тільки свій origin. Чуже і POST не чіпаємо взагалі.
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.method !== 'GET') {
    return;
  }

  // Навігаційні запити (відкриття/оновлення сторінки) — network-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkWithTimeout(request, NAV_TIMEOUT_MS).then(function (response) {
        // Свіжу відповідь одразу кладемо в кеш на майбутнє офлайн-падіння.
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Решта (manifest, іконки тощо) — cache-first, бо не змінюються без зміни імені.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      });
    })
  );
});
