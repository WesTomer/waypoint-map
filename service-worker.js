const CACHE="waypoint-map-v1";
const APP=["./","./index.html","./app.js","./style.css","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(caches.match(e.request).then(cached=>{
    if(cached)return cached;
    return fetch(e.request).then(resp=>{
      const copy=resp.clone();
      if(new URL(e.request.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(e.request,copy));
      return resp;
    }).catch(()=>cached);
  }));
});
