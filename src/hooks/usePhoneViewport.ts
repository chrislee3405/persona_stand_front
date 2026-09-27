import { useSyncExternalStore } from 'react';

export const PHONE_VIEWPORT = '(max-width: 767.98px)';

function subscribe(notify: () => void) {
  const query = window.matchMedia?.(PHONE_VIEWPORT);
  query?.addEventListener('change', notify);
  return () => query?.removeEventListener('change', notify);
}

/** CSS viewport width, so resizing and orientation changes are supported. */
export function usePhoneViewport() {
  return useSyncExternalStore(subscribe,
    () => window.matchMedia?.(PHONE_VIEWPORT).matches ?? false,
    () => false);
}
