import idb from 'idb';

const staticCache = 'static-cache-v3';
const imageCache = 'image-cache-v1';
const allCaches = [staticCache, imageCache];

const dbPromise = idb.open('locations-db', 1, (upgradeDb) => {
  upgradeDb.createObjectStore('locations');
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(staticCache)
    .then(cache => cache.addAll([
      '/',
      '/index.html',
      '/build/js/main.js',
      '/build/js/restaurant_info.js',
      '/src/css/styles.css',
      '/restaurant.html',
    ])
      .catch((error) => {
        console.error(error);
      })));
});

self.addEventListener('fetch', (event) => {
  const servePhoto = (request) => {
    const storageUrl = request.url.replace(/-\d+px\.webp$/, '');
    return caches.open(imageCache)
      .then(cache => cache.match(storageUrl)
        .then(response => response || fetch(request)
          .then((sourcedPhoto) => {
            cache.put(storageUrl, sourcedPhoto.clone());
            return sourcedPhoto;
          })));
  };

  const handleLocalRequest = (event, requestUrl) => {
    // handle images
    if (requestUrl.pathname.startsWith('/build/img/')) {
      event.respondWith(servePhoto(event.request));
      return;
    }

    // fetch everything else
    event.respondWith(caches.match(event.request, { ignoreSearch: true })
      .then((response) => {
        // console.log(response);
        return response || fetch(event.request)
          .then((innerResponse) => {
            return caches.open(staticCache)
              .then((cache) => {
                if (event.request.url.indexOf('mapbox') === -1) {
                  cache.put(event.request, innerResponse.clone());
                }
                return innerResponse;
              });
          });
      })
      .catch((error) => {
        console.error(error);
      }));
  };

  const handleExternalRequest = (event, id) => {
    event.respondWith(dbPromise
      .then(db => db.transaction('locations').objectStore('locations').get(id))
      .then(data => (data) || fetch(event.request)
        .then(response => response.json())
        .then(json => dbPromise
          .then((db) => {
            const store = db.transaction('locations', 'readwrite').objectStore('locations');
            store.put(json, id);
            if (id === -1) { // if we got the full set,
              // store each element separately
              json.forEach((restaurant) => {
                store.put(restaurant, restaurant.id);
              });
            }
            return json;
          })))
      .then(response => new Response(JSON.stringify(response)))
      .catch(error => new Response(error)));
  };
  const requestUrl = new URL(event.request.url);
  if (requestUrl.port === '1337') {
    const last = requestUrl.pathname.match(/[^/]+$/)[0];
    const id = (last === 'restaurants') ? -1 : parseInt(last, 10);
    handleExternalRequest(event, id);
  } else {
    handleLocalRequest(event, requestUrl);
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then(cacheNames => Promise.all(cacheNames
      .filter(cacheName => cacheName.startsWith('static-') && !allCaches.includes(cacheName))
      .map(cacheName => caches.delete(cacheName)))));
});
