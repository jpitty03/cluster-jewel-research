import React, { useEffect, useRef } from 'react';

export interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trapping and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="onboarding-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <div
        ref={modalRef}
        className="onboarding-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-header">
          <h2 id="onboarding-modal-title">✨ Welcome to the Cluster Jewel Crafting Optimizer</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close Onboarding Guide"
          >
            ✕
          </button>
        </div>

        <div className="onboarding-body">
          <section className="onboarding-section">
            <h3>🎯 1. Mathematical Optimality & Markov Policies</h3>
            <p>
              Unlike static craft calculators, this engine formulates crafting as a Markov Decision Process.
              Every roll, promote, fracture attempt, and recovery decision is solved with Bellman value iteration
              to find the mathematically cheapest, fastest, or fewest-action route to your exact target affixes.
            </p>
          </section>

          <section className="onboarding-section">
            <h3>🔬 2. Method Portfolio & Explainability</h3>
            <p>
              We evaluate multiple crafting disciplines simultaneously: conventional Alt/Aug/Regal/Exalt, Harvest reforges,
              and self-fracturing every eligible target modifier. You can see not just the winner, but also why alternatives were rejected
              or dominated.
            </p>
          </section>

          <section className="onboarding-section">
            <h3>🛡️ 3. Full-Route Accounting & Price Provenance</h3>
            <p>
              Every total cost includes the clean base, preparation materials, failed attempts, and wrong-fracture recoveries.
              Prices are sourced from bundled trade snapshots with explicit age indicators, clearly distinguishing verified market rates from research fallbacks.
            </p>
          </section>

          <section className="onboarding-section">
            <h3>⚠️ 4. Known Limitations & Proof Budgets</h3>
            <p>
              For 4-affix targets with vast combinatorial search spaces, the optimizer finds the best executable route within your configured state/time budget.
              If a route is labeled <em>Best resolved route found</em>, you can click <strong>Retry Deeper</strong> to allocate additional search rounds.
            </p>
          </section>
        </div>

        <div className="onboarding-footer">
          <button type="button" className="primary" onClick={onClose}>
            Got it, let's craft!
          </button>
        </div>
      </div>
    </div>
  );
};
