/**
 * sw.js — Service Worker
 * يخزّن ملفات الموقع الأساسية لتسريع التحميل،
 * لكن menu.json يتم جلبه دائماً من الإنترنت
 * حتى تظهر تحديثات المنيو والأسعار والأقسام مباشرة للزبائن.
 */

const CACHE_NAME = "lacasa-shell-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./config.js",
  "./assets/images/logo.png",
];

/* =========================
   INSTALL
========================= */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {
        // تجاهل أي ملف غير موجود
      })
  );

  // تفعيل النسخة الجديدة مباشرة
  self.skipWaiting();
});

/* =========================
   ACTIVATE
========================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  // السيطرة على الصفحات المفتوحة مباشرة
  self.clients.claim();
});

/* =========================
   FETCH
========================= */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  /* ---------------------------------
     menu.json
     دائماً من الإنترنت أولاً
  --------------------------------- */
  if (url.pathname.endsWith("/menu.json")) {
    event.respondWith(
      fetch(event.request, {
        cache: "no-store",
      })
        .then((response) => {
          return response;
        })
        .catch(() => {
          // إذا ماكو إنترنت، حاول استخدام نسخة قديمة إن وجدت
          return caches.match(event.request);
        })
    );

    return;
  }

  /* ---------------------------------
     باقي ملفات الموقع
     Cache First
  --------------------------------- */
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          // نخزن الملفات الجديدة بالكاش إذا كانت سليمة
          if (
            response &&
            response.status === 200 &&
            response.type === "basic"
          ) {
            const responseClone = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }

          return response;
        })
        .catch(() => {
          return cached;
        });
    })
  );
});
