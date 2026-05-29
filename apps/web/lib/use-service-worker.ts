'use client';

import * as React from 'react';

/**
 * Registers the Med-Tracker service worker for push reminders.
 * Returns the registration once available, or null if unsupported.
 */
export function useServiceWorker() {
  const [reg, setReg] = React.useState<ServiceWorkerRegistration | null>(null);

  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then(setReg)
      .catch((e) => console.warn('SW registration failed', e));
  }, []);

  return reg;
}

/** Request notification permission and return whether it was granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
