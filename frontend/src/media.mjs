let registration;
export const mediaUrl = (id, stem, download = false) =>
  `/media/jobs/${id}/${stem}${download ? '?download=1' : ''}`;

function message(controller, data) {
  return new Promise((done, fail) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      fail(new Error('Media handshake timed out'));
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      event.data?.ok ? done() : fail(new Error('Media unavailable'));
    };
    controller.postMessage(data, [channel.port2]);
  });
}

export async function connectMedia(session) {
  if (!('serviceWorker' in navigator))
    throw new Error('Media streaming unsupported');
  registration ??= navigator.serviceWorker.register('/audio-worker.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  await registration;
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((done, fail) => {
      const listener = () => {
        if (navigator.serviceWorker.controller) {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener(
            'controllerchange',
            listener,
          );
          done();
        }
      };
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          listener,
        );
        fail(new Error('Media controller unavailable'));
      }, 7000);
      navigator.serviceWorker.addEventListener('controllerchange', listener);
      listener();
    });
  }
  await message(navigator.serviceWorker.controller, {
    type: 'AUTHORIZE',
    id: session.id,
    token: session.token,
  });
}

export function answerMediaAuth(session) {
  if (!('serviceWorker' in navigator)) return () => {};
  const listener = (event) => {
    if (event.data?.type === 'REQUEST_AUTH' && event.data.id === session.id)
      event.ports[0]?.postMessage({ id: session.id, token: session.token });
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}
