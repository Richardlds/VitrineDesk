const CACHE_NAME = 'vitrinedesk-v17';

const urlsToCache = [
    '/css/reset.css',
    '/css/components.css',
    '/css/layout.css',
    '/cliente/css/vitrine.css',
    '/js/config.js',
    '/js/utils.js',
    '/js/tenant.js',
    '/js/services.js',
    '/js/appointments.js',
    '/cliente/js/vitrine.js',
    '/cliente/js/calendario.js'
];

// Instalação
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
            );
        })
    );
});

// Estratégia: Network First com fallback para cache
self.addEventListener('fetch', (event) => {
    // Só cache para GET
    if (event.request.method !== 'GET') return;

    // Não cachear APIs do Supabase
    if (event.request.url.includes('supabase.co')) {
        return fetch(event.request);
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, clonedResponse);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});