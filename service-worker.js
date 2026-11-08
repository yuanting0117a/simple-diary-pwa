// Firebase Web Push integration. Firebase config is public web-app configuration only.
importScripts('./firebase-config.js');

const firebaseConfig = self.FIREBASE_CONFIG || {};
const hasFirebaseConfig = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('請填入') &&
  firebaseConfig.projectId && !firebaseConfig.projectId.includes('請填入');

if (hasFirebaseConfig) {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(firebaseConfig);
  // Firebase Messaging registers the background push handler for this service worker.
  firebase.messaging();
}

const CACHE_NAME = 'simple-diary-pwa-v32';
const APP_SHELL = ['./', './index.html', './manifest.json', './icons/icon.svg', './firebase-config.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network first: get the latest app files whenever online; use cache only when offline.
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then(cached => {
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
