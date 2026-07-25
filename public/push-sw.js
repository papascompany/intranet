self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "더스토리지 근태";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "새 근태 알림이 있습니다.",
    data: { url: safeRelativeUrl(payload.url) },
    icon: typeof payload.icon === "string" ? payload.icon : "/pwa-icon-192.png",
    tag: typeof payload.tag === "string" ? payload.tag : "attendance-notification"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(safeRelativeUrl(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("navigate" in client) await client.navigate(targetUrl);
        if ("focus" in client) return await client.focus();
      }
      return await self.clients.openWindow(targetUrl);
    })
  );
});

function safeRelativeUrl(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
