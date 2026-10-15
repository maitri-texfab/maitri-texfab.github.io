// The Maitri company app's service worker: it keeps the SCREENS on the phone so the app opens at once, and nothing else.
// Only the files listed here are ever stored. A call to an engine (a POST to Google) and anything from another site is not
// touched, not read and not kept: data is never in this cache.
const VERSION = 'ee4e31a · 15 Oct 26 22:06 · app 4891fd5', CACHE = 'maitri-' + VERSION;
const FILES = ['./', 'index.html', 'app.css', 'config.js', 'shell.js', 'modules/sy13.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.indexOf('maitri-') === 0 && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;   // not a screen: left to the network, never stored
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
