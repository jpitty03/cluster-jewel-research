import { useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface OptimizerDisclosureProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  testId: string;
  className?: string;
  keepMountedAfterOpen?: boolean;
}

export function OptimizerDisclosure({
  title,
  description,
  badge,
  open,
  onToggle,
  children,
  testId,
  className = '',
  keepMountedAfterOpen = false,
}: OptimizerDisclosureProps) {
  const generatedId = useId();
  const panelId = `${testId}-${generatedId.replace(/:/g, '')}`;
  const hasOpenedRef = useRef(open);
  if (open) hasOpenedRef.current = true;
  const shouldMount = !keepMountedAfterOpen || open || hasOpenedRef.current;

  return (
    <section
      className={`optimizer-disclosure ${open ? 'is-open' : ''} ${className}`.trim()}
      data-testid={testId}
    >
      <button
        type="button"
        className="optimizer-disclosure-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
      >
        <span className="optimizer-disclosure-copy">
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </span>
        <span className="optimizer-disclosure-meta">
          {badge}
          <span aria-hidden="true" className="optimizer-disclosure-chevron">⌄</span>
        </span>
      </button>
      <div id={panelId} className="optimizer-disclosure-panel" hidden={!open}>
        {shouldMount ? children : null}
      </div>
    </section>
  );
}
