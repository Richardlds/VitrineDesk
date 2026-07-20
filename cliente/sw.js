const CACHE_NAME = 'vitrinedesk-v2';

// Arquivos base para colocar em cache inicial
const INITIAL_CACHED_RESOURCES = [
  './',
  './index.html',
  './css/global.css',
  './css/layout.css',
  './css/cliente.css',
  './css/modais.css',
  './css/components.css',
  './css/auth.css',
  './css/booking.css',
  './css/agendamentos.css',
  './js/app.js',
  './js/utils.js',
  './js/auth.js',
  './js/booking.js',
  './js/agendamentos.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Usar Promise.allSettled para não falhar se 1 arquivo der 404
      return Promise.allSettled(
        INITIAL_CACHED_RESOURCES.map(url => 
          fetch(url).then(response => {
            if (response.ok) return cache.put(url, response);
            throw new Error('Falha ao baixar ' + url);
          })
        )
      ).then(() => {
        console.log('SW: Instalação concluída (mesmo que alguns assets falhem)');
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Stale-While-Revalidate com Fallback Correto
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Não faz cache de requisições à API Supabase no Service Worker
  if (url.hostname.includes('supabase.co') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => {
        // Se a rede falhou e o cache não existe, precisamos obrigatoriamente retornar um Response
        // ou deixar falhar controladamente.
        if (cachedResponse) return cachedResponse;
        return new Response('Network error & Not in cache', { status: 503, statusText: 'Service Unavailable' });
      });

      return cachedResponse || fetchPromise;
    })
  );
});
