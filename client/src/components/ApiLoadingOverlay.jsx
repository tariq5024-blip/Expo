import { useEffect, useState } from 'react';
import { subscribeApiLoading } from '../utils/apiLoadingBus';
import LoadingLogo from './LoadingLogo';

/**
 * Shows branded spinner when API requests are in flight (debounced), without blocking interaction.
 */
export default function ApiLoadingOverlay() {
  const [count, setCount] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => subscribeApiLoading(setCount), []);

  useEffect(() => {
    if (count > 0) {
      const id = setTimeout(() => setShow(true), 200);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setShow(false), 120);
    return () => clearTimeout(id);
  }, [count]);

  if (!show) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-app-page/55 backdrop-blur-[2px] transition-opacity"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none rounded-2xl bg-white/90 px-10 py-8 shadow-lg dark:bg-slate-900/90">
        <LoadingLogo
          message="Working…"
          subMessage="Please wait while we finish your request."
          className="text-slate-700 dark:text-slate-200"
          sizeClass="w-20 h-20"
        />
      </div>
    </div>
  );
}
