// The ONE version constant. Loaded by the page (index.html, classic script before the app) and by the
// service worker (importScripts), so Settings and the cache name can never disagree.
// The service worker update check also compares this imported file, so changing it ships an update.
self.APP_VERSION = '2.0.0';
