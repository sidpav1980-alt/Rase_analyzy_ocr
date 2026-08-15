const CACHE='trail-analyzer-web-v098';
const CORE=[
  './',
  './index.html',
  './styles.css?v=240levels',
  './app.js?v=240levels',
  './manifest.webmanifest?v=075',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone());
    }
    return response;
  }catch(e){
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request);
  const network=fetch(request,{cache:'no-store'}).then(resp=>{
    if(resp && resp.ok) cache.put(request,resp.clone());
    return resp;
  }).catch(()=>null);
  return cached || (await network) || (await cache.match('./index.html'));
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  if(url.pathname.startsWith('/api/') || url.pathname==='/health') return;

  // Always check network for page navigation so a fresh deployment appears immediately.
  if(event.request.mode==='navigate' || url.pathname.endsWith('/index.html') || url.pathname==='/'){
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Versioned JS/CSS can be cache-first-ish; query string changes on every release.
  event.respondWith(staleWhileRevalidate(event.request));
});
