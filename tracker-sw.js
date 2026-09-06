self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const client = list[0];
    if (client) return client.focus();
    return clients.openWindow("./");
  }));
});
