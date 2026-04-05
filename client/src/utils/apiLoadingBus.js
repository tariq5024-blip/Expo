/**
 * Ref-count in-flight API calls; subscribers receive the current count.
 */

let active = 0;
const listeners = new Set();

const notify = () => {
  listeners.forEach((fn) => {
    try {
      fn(active);
    } catch {
      /* ignore */
    }
  });
};

export function subscribeApiLoading(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getApiLoadingCount() {
  return active;
}

function hasSkipGlobalLoadingHeader(headers) {
  if (!headers) return false;
  if (typeof headers.get === 'function') {
    return Boolean(
      headers.get('X-Skip-Global-Loading')
      || headers.get('x-skip-global-loading')
    );
  }
  return Boolean(
    headers['X-Skip-Global-Loading']
    || headers['x-skip-global-loading']
  );
}

function shouldSkipGlobalLoading(config) {
  if (!config) return true;
  if (hasSkipGlobalLoadingHeader(config.headers)) return true;
  const url = String(config.url || '');
  return (
    url.includes('/auth/csrf-token')
    || url.includes('/healthz')
    || url.includes('/readyz')
    || url.includes('/system/public-config')
  );
}

export function apiLoadingOnRequest(config) {
  if (shouldSkipGlobalLoading(config)) return;
  config.__expoGlobalLoading = true;
  active += 1;
  notify();
}

export function apiLoadingOnSettled(config) {
  if (!config?.__expoGlobalLoading) return;
  delete config.__expoGlobalLoading;
  active = Math.max(0, active - 1);
  notify();
}
