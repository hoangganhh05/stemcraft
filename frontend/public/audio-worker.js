// Only media requests are proxied. No audio or bearer token is cached on disk.
const credentials = new Map();
const idPattern =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const valid = (value) =>
  value &&
  new RegExp(`^${idPattern}$`).test(value.id) &&
  /^[0-9a-f]{64}$/.test(value.token);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener('message', (event) => {
  if (
    !event.source?.url ||
    new URL(event.source.url).origin !== self.location.origin
  )
    return;
  if (event.data?.type === 'AUTHORIZE' && valid(event.data)) {
    credentials.set(event.data.id, event.data.token);
    event.ports[0]?.postMessage({ ok: true });
  }
});
async function askClient(client, id) {
  return new Promise((done) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      done(null);
    }, 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      done(valid(event.data) && event.data.id === id ? event.data.token : null);
    };
    client.postMessage({ type: 'REQUEST_AUTH', id }, [channel.port2]);
  });
}
async function authenticate(event, id) {
  if (credentials.has(id)) return credentials.get(id);
  const source = event.clientId ? await self.clients.get(event.clientId) : null;
  const clients = source
    ? [source]
    : await self.clients.matchAll({ type: 'window' });
  const tokens = await Promise.all(
    clients.map((client) => askClient(client, id)),
  );
  const token = tokens.find(Boolean);
  if (token) credentials.set(id, token);
  return token;
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !url.pathname.startsWith('/media/')
  )
    return;
  event.respondWith(
    (async () => {
      const match = url.pathname.match(
        new RegExp(
          `^/media/jobs/(${idPattern})/(original|vocals|instrumental)$`,
        ),
      );
      if (!match || !['GET', 'HEAD'].includes(event.request.method))
        return new Response(null, { status: 404 });
      const [, id, stem] = match;
      const token = await authenticate(event, id);
      if (!token) return new Response(null, { status: 401 });
      const download = url.searchParams.get('download') === '1';
      if (download && stem === 'original')
        return new Response(null, { status: 400 });
      const headers = new Headers({ Authorization: `Bearer ${token}` });
      for (const name of ['Range', 'If-Range'])
        if (event.request.headers.has(name))
          headers.set(name, event.request.headers.get(name));
      try {
        return await fetch(
          `/api/v1/jobs/${id}/${download ? 'download' : 'preview'}?stem=${stem}`,
          {
            method: event.request.method,
            headers,
            cache: 'no-store',
            credentials: 'same-origin',
            signal: event.request.signal,
          },
        );
      } catch {
        return new Response(null, { status: 503 });
      }
    })(),
  );
});
