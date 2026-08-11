const CACHE_NAME = 'planning-equipe-cache-r2';

/*
 * Fichiers statiques disponibles hors connexion.
 * index.html et ./ ne sont volontairement pas precharges ici :
 * la page principale doit toujours utiliser la strategie reseau d'abord.
 */
const APP_SHELL = [
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-48.png',
  './icons/web-icon-192.png',
  './icons/web-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => {
        console.error(
          '[Service Worker] Erreur pendant la creation du cache :',
          error
        );
      })
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  /* Les ressources externes, notamment Firebase et les CDN,
     restent gerees directement par le navigateur. */
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigationRequest =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    requestUrl.pathname.endsWith('/') ||
    requestUrl.pathname.endsWith('/index.html');

  if (isNavigationRequest) {
    event.respondWith(networkFirstPage(request));
    return;
  }

  event.respondWith(cacheFirstWithUpdate(request));
});

/*
 * Page HTML : reseau d'abord.
 * Une version en ligne recente est utilisee et sauvegardee pour le hors-ligne.
 */
async function networkFirstPage(request) {
  try {
    const freshRequest = new Request(request, {
      cache: 'reload'
    });

    const networkResponse = await fetch(freshRequest);

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('./index.html', networkResponse.clone());
    }

    return networkResponse;
  } catch (networkError) {
    console.warn(
      '[Service Worker] Reseau indisponible, utilisation du cache :',
      networkError
    );

    const cachedPage =
      (await caches.match('./index.html')) ||
      (await caches.match('./'));

    if (cachedPage) return cachedPage;

    return new Response(
      `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Planning Equipe</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      margin: 0;
      padding: max(24px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
      display: grid;
      place-items: center;
      background: #0a0e1a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(100%, 360px);
      padding: 24px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 24px;
      background: rgba(17,24,39,.92);
      text-align: center;
    }
    h1 { margin: 0 0 10px; font-size: 1.2rem; }
    p { margin: 0; color: #94a3b8; font-size: .85rem; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Planning Equipe indisponible</h1>
    <p>Aucune connexion reseau et aucune version locale de l'application n'est disponible.</p>
  </main>
</body>
</html>`,
      {
        status: 503,
        statusText: 'Application indisponible',
        headers: {
          'Content-Type': 'text/html; charset=UTF-8'
        }
      }
    );
  }
}

/*
 * Fichiers statiques : cache immediat, puis actualisation en arriere-plan.
 */
async function cacheFirstWithUpdate(request) {
  const cachedResponse = await caches.match(request);

  const networkPromise = fetch(request)
    .then(async networkResponse => {
      if (networkResponse && networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }

      return networkResponse;
    })
    .catch(error => {
      console.warn(
        '[Service Worker] Mise a jour reseau impossible :',
        request.url,
        error
      );

      return null;
    });

  if (cachedResponse) {
    eventWaitUntilSafe(networkPromise);
    return cachedResponse;
  }

  const networkResponse = await networkPromise;

  if (networkResponse) return networkResponse;

  return new Response('', {
    status: 504,
    statusText: 'Ressource indisponible'
  });
}

/* Evite une promesse rejetee non geree lorsque la reponse cachee est immediate. */
function eventWaitUntilSafe(promise) {
  promise.catch(() => undefined);
}

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
