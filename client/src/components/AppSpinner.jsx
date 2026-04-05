import PropTypes from 'prop-types';

const SIZE_MAP = { sm: 36, md: 44, lg: 56 };

/**
 * Vector spinner only (no box-shadow on rotating layers) to avoid ghosting/smear when animating.
 */
export default function AppSpinner({
  message,
  subMessage,
  size = 'lg',
  className = '',
  compact = false
}) {
  const px = SIZE_MAP[size] || SIZE_MAP.lg;
  const gap = compact ? 'gap-3' : 'gap-5';

  return (
    <div
      className={`flex flex-col items-center justify-center ${gap} ${className}`}
      role="status"
      aria-busy="true"
      aria-label={message || 'Loading'}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        className="shrink-0 motion-reduce:animate-none animate-spin text-[rgb(var(--accent-color))]"
        style={{ animationDuration: '0.85s' }}
        aria-hidden
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="rgb(var(--border-color))"
          strokeOpacity="0.45"
          strokeWidth="3"
        />
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="31.4 94.2"
          transform="rotate(-90 24 24)"
        />
      </svg>
      {(message || subMessage) && (
        <div className="max-w-[18rem] space-y-1.5 text-center antialiased">
          {message ? (
            <p className="text-[15px] font-semibold tracking-tight text-app-main">{message}</p>
          ) : null}
          {subMessage ? (
            <p className="text-xs leading-relaxed text-app-muted">{subMessage}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

AppSpinner.propTypes = {
  message: PropTypes.string,
  subMessage: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  compact: PropTypes.bool
};
