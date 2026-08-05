/**
 * Push-only service worker. A propósito NO tiene handler de `fetch`: cachear
 * respuestas aquí pelearía con la persistencia de react-query en localStorage
 * (ver Providers.tsx). Sólo recibe pushes y abre la app al tocarlos.
 *
 * Payload esperado (JSON): { title, body, link?, tag? }
 * `link` es una ruta interna (p.ej. "/home") que se abre al tocar.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload no-JSON (p.ej. push de prueba plano): usarlo como body.
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Vaquita';
  const options = {
    body: data.body || '',
    icon: '/icons/pwa/icon-192.png',
    badge: '/icons/pwa/icon-192.png',
    // tag: dos pushes con el mismo tag colapsan en una sola notificación.
    tag: data.tag || undefined,
    data: { link: typeof data.link === 'string' ? data.link : '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const url = new URL(link, self.location.origin).href;

  // Reusar una ventana abierta de la app si existe; si no, abrir una nueva.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
