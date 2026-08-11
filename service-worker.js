const CACHE_NAME = 'planning-equipe-cache-2026';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/*
 * Installation
 *
 * Enregistre les fichiers essentiels de l’application dans le cache.
 * skipWaiting permet à cette nouvelle version du service worker
 * de passer immédiatement à l’étape d’activation.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(error => {
        console.error(
          '[Service Worker] Erreur pendant la création du cache :',
          error
        );
      })
  );

  self.skipWaiting();
});

/*
 * Activation
 *
 * Supprime tous les anciens caches de l’application.
 * clients.claim permet au nouveau service worker de contrôler
 * immédiatement les pages déjà ouvertes.
 */
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

/*
 * Requêtes réseau
 *
 * Les pages HTML utilisent une stratégie "réseau d’abord".
 * Les ressources statiques utilisent une stratégie
 * "cache d’abord avec actualisation réseau".
 */
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  /*
   * Le service worker ne gère que les ressources provenant
   * du même domaine que l’application.
   *
   * Firebase, Chart.js et les autres ressources externes
   * continuent à être gérés directement par le navigateur.
   */
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

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
 * Stratégie réseau d’abord pour index.html
 *
 * 1. Recherche la dernière version sur GitHub.
 * 2. Enregistre cette version dans le cache.
 * 3. Retourne immédiatement cette version.
 * 4. Si le réseau échoue, retourne la version mise en cache.
 */
async function networkFirstPage(request) {
  try {
    const networkResponse = await fetch(request, {
      cache: 'no-store'
    });

    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      const responseCopy = networkResponse.clone();

      await cache.put('./index.html', responseCopy);
    }

    return networkResponse;
  } catch (networkError) {
    console.warn(
      '[Service Worker] Réseau indisponible, utilisation du cache :',
      networkError
    );

    const cachedPage =
      (await caches.match('./index.html')) ||
      (await caches.match('./'));

    if (cachedPage) {
      return cachedPage;
    }

    return new Response(
      `
        <!DOCTYPE html>
        <html lang="fr">
          <head>
            <meta charset="UTF-8">
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, viewport-fit=cover"
            >
            <title>Planning Équipe</title>
            <style>
              :root {
                color-scheme: dark;
              }

              * {
                box-sizing: border-box;
              }

              body {
                min-height: 100vh;
                min-height: 100dvh;
                margin: 0;
                padding:
                  max(24px, env(safe-area-inset-top))
                  max(20px, env(safe-area-inset-right))
                  max(24px, env(safe-area-inset-bottom))
                  max(20px, env(safe-area-inset-left));
                display: grid;
                place-items: center;
                background:
                  radial-gradient(
                    circle at top left,
                    rgba(99, 102, 241, 0.22),
                    transparent 35%
                  ),
                  #0a0e1a;
                color: #f8fafc;
                font-family:
                  -apple-system,
                  BlinkMacSystemFont,
                  "Segoe UI",
                  sans-serif;
              }

              main {
                width: min(100%, 360px);
                padding: 24px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px;
                background: rgba(17, 24, 39, 0.88);
                box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
                text-align: center;
              }

              h1 {
                margin: 0 0 10px;
                font-size: 1.2rem;
              }

              p {
                margin: 0;
                color: #94a3b8;
                font-size: 0.85rem;
                line-height: 1.5;
              }
            </style>
          </head>

          <body>
            <main>
              <h1>Planning Équipe indisponible</h1>
              <p>
                Aucune connexion réseau et aucune version locale
                de l’application n’est disponible.
              </p>
            </main>
          </body>
        </html>
      `,
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
 * Stratégie cache d’abord avec mise à jour réseau
 *
 * Utilisée pour :
 * - le manifeste ;
 * - les icônes ;
 * - les autres fichiers statiques du même domaine.
 *
 * La réponse mise en cache est utilisée immédiatement.
 * Une copie plus récente est téléchargée et enregistrée
 * lorsqu’elle est disponible.
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
        '[Service Worker] Mise à jour réseau impossible :',
        request.url,
        error
      );

      return null;
    });

  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await networkPromise;

  if (networkResponse) {
    return networkResponse;
  }

  return new Response('', {
    status: 504,
    statusText: 'Ressource indisponible'
  });
}

/*
 * Message optionnel envoyé depuis l’application.
 *
 * Il permet de demander au service worker de prendre
 * immédiatement le contrôle, sans modifier le cache.
 */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
