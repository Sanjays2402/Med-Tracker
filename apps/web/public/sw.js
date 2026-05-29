// Minimal service worker for Med-Tracker reminders.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Med-Tracker', body: 'Time to take a dose.' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png' }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/today'));
});
