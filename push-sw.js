/* Rosabaya ML Tournament — Web Push service worker (hiwalay sa sw.js, hindi niya ginagalaw ang offline cache) */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch(_){d={body:e.data?e.data.text():''}}
  const title=d.title||'Rosabaya ML Tournament';
  e.waitUntil(self.registration.showNotification(title,{
    body:d.body||'',
    icon:d.icon||'Rosabaya_Logo.jpg',
    badge:d.badge||'Rosabaya_Logo.jpg',
    tag:d.tag||'rb-upcoming',
    renotify:true,
    data:{url:d.url||'./'}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){try{c.navigate&&c.navigate(url)}catch(_){}return c.focus()}}
    return self.clients.openWindow(url);
  }));
});
