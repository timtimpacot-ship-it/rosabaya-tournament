/* Rosabaya ML Tournament - offline support.
   Keeps the page, intro video and logos on the phone so the app opens
   (intro -> login form) even without internet. Supabase data is never cached.
   v3: only touches viewer files (never the admin page), does not download the
   video during install, and streams the video straight from the network when online. */
const CACHE = 'rosabaya-v3';
const SMALL = ['viewer.html', 'config.js', 'Rosabaya_Logo.jpg', 'Gemini_Generated_Image_lzvitjlzvitjlzvi.jpg'];
const VIDEO = 'Heroes_Intro3.mp4';
const MINE = new Set(SMALL.concat(VIDEO));

self.addEventListener('install', e => {
  /* small files only: the big intro video is saved later by the page, after the intro has played */
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SMALL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
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

/* Offline only: answer video byte-range requests from the saved copy (Safari/iOS needs this). */
async function rangeFromCache(req) {
  const c = await caches.open(CACHE);
  const res = await c.match(VIDEO, { ignoreSearch: true });
  if (!res) return new Response('', { status: 504 });
  const blob = await res.blob();
  const total = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = 0, end = total - 1;
  if (m) {
    if (m[1] !== '') { start = +m[1]; if (m[2] !== '') end = +m[2]; }
    else if (m[2] !== '') { start = Math.max(0, total - +m[2]); }
  }
  end = Math.min(end, total - 1);
  return new Response(blob.slice(start, end + 1), {
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

/* Online: go straight to the network (fast). Offline: fall back to the saved video. */
async function videoRange(req) {
  try { return await fetch(req); }
  catch (err) { return rangeFromCache(req); }
}

/* Page + config: network first (so updates arrive), saved copy if slow/offline. */
async function networkFirst(req, key) {
  const c = await caches.open(CACHE);
  try {
    const net = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 2500))
    ]);
    if (net && net.ok && net.status === 200) c.put(key, net.clone());
    return net;
  } catch (err) {
    const hit = await c.match(key, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  }
}

async function cacheFirst(req, key) {
  const c = await caches.open(CACHE);
  const hit = await c.match(key, { ignoreSearch: true });
  if (hit) return hit;
  const net = await fetch(req);
  if (net && net.ok && net.status === 200) c.put(key, net.clone());
  return net;
}

/* The page sends 'cache-video' after the intro has played: save the video for offline use then (not during install). */
self.addEventListener('message', e => {
  if (e.data !== 'cache-video') return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    if (await c.match(VIDEO)) return;
    const r = await fetch(VIDEO, { cache: 'reload' });
    if (r.ok && r.status === 200) await c.put(VIDEO, r);
  })().catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           /* Supabase, LiveKit etc. go straight to the network */
  const file = url.pathname.split('/').pop();
  if (!MINE.has(file)) return;                          /* admin page (index.html) and everything else: untouched */
  if (file === VIDEO) {
    if (req.headers.has('range')) e.respondWith(videoRange(req));
    else e.respondWith(cacheFirst(req, file));
    return;
  }
  if (file === 'viewer.html' || file === 'config.js') { e.respondWith(networkFirst(req, file)); return; }
  e.respondWith(cacheFirst(req, file));
});
