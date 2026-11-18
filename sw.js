/* Rosabaya ML Tournament - offline support.
   Keeps the page, intro video and logo on the phone so the app opens
   (intro -> login form) even without internet. Supabase data is never cached. */
const CACHE = 'rosabaya-v1';
const CORE = [
  'viewer.html',
  'config.js',
  'Heroes_Intro3.mp4',
  'Rosabaya_Logo.jpg',
  'Gemini_Generated_Image_lzvitjlzvitjlzvi.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Safari/iOS asks for videos in byte ranges, so answer ranges from the cached file. */
async function rangeResponse(req) {
  const c = await caches.open(CACHE);
  let res = await c.match(req.url, { ignoreSearch: true });
  if (!res) {
    try {
      const net = await fetch(req.url);
      if (!net.ok) return net;
      await c.put(req.url, net.clone());
      res = net;
    } catch (err) { return new Response('', { status: 504 }); }
  }
  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0, end = total - 1;
  if (m) {
    if (m[1] !== '') { start = +m[1]; if (m[2] !== '') end = +m[2]; }
    else if (m[2] !== '') { start = total - +m[2]; }
  }
  end = Math.min(end, total - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
      'Content-Length': String(end - start + 1),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Accept-Ranges': 'bytes'
    }
  });
}

/* Page + config: try the network first (so updates arrive), fall back to the saved copy. */
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const net = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
    ]);
    if (net && net.ok) c.put(req.mode === 'navigate' ? 'viewer.html' : req, net.clone());
    return net;
  } catch (err) {
    const hit = await c.match(req.mode === 'navigate' ? 'viewer.html' : req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const net = await fetch(req);
  if (net && net.ok) c.put(req, net.clone());
  return net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           /* Supabase etc. go straight to the network */
  if (req.headers.has('range')) { e.respondWith(rangeResponse(req)); return; }
  if (req.mode === 'navigate' || /\.(html|js)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req));
});
