const MODULE_ERROR = /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk .* failed/i;

/** A missing component is recoverable only when the trace identifies the route importer. */
export function isStaleRouteError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { message?: unknown; stack?: unknown };
  const message = typeof details.message === 'string' ? details.message : '';
  const stack = typeof details.stack === 'string' ? details.stack : '';
  return MODULE_ERROR.test(message) || (/Cannot read properties of undefined.*reading ['"]component['"]/.test(message) && /lazyRouteComponent/.test(stack));
}

export function claimRouteReload(storage: Pick<Storage, 'getItem' | 'setItem'>, path: string): boolean {
  const key = `shitaa-route-recovery:v1:${path}`;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
    return true;
  } catch { return false; }
}

export const ROUTE_RECOVERY_SCRIPT = `(()=>{const matches=${isStaleRouteError.toString().replace('MODULE_ERROR.test(message)', `${MODULE_ERROR.toString()}.test(message)`)};const claim=${claimRouteReload.toString()};function recover(error){if(matches(error)&&claim(sessionStorage,location.pathname))location.reload()}window.addEventListener('vite:preloadError',event=>{event.preventDefault();recover(event.payload)});window.addEventListener('unhandledrejection',event=>recover(event.reason));window.addEventListener('error',event=>recover(event.error))})();`;