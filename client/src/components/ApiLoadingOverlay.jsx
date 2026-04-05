import { useEffect, useState } from 'react';
import { subscribeApiLoading } from '../utils/apiLoadingBus';
import AppSpinner from './AppSpinner';

/**
 * Lightweight indicator when API requests are in flight (debounced). Does not block clicks.
 * Dashboard initial load skips the global counter via X-Skip-Global-Loading to avoid double spinners.
 */
export default function ApiLoadingOverlay() {
  const [count, setCount] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => subscribeApiLoading(setCount), []);

  useEffect(() => {
    if (count > 0) {
      const id = setTimeout(() => setShow(true), 280);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setShow(false), 100);
    return () => clearTimeout(id);
  }, [count]);

  if (!show) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center pb-8 pt-24 bg-gradient-to-t from-app-page/90 via-app-page/40 to-transparent"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none rounded-2xl border border-app-card bg-app-card/95 px-8 py-5 shadow-card backdrop-blur-md">
        <AppSpinner
          message="Working…"
          subMessage="Finishing your request."
          size="md"
          compact
        />
      </div>
    </div>
  );
}
