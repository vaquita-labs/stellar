import { useEffect } from 'react';

/**
 * Keeps Pollar's modals open on a click outside the card. Each one closes from its
 * backdrop (`.pollar-overlay` with `onClick: onClose`) and the SDK has no option to
 * turn that off, so a tap beside the card dropped a purchase, a sale or a pending
 * signature midway. They still close from their own X or Cancel.
 *
 * Stopped on the document in the capture phase, which runs before React's listener
 * on the root dispatches the click. Only a click whose target is the backdrop
 * itself is stopped; anything on the card has a child as its target.
 */
export function usePollarOverlayGuard(): void {
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.classList.contains('pollar-overlay')) event.stopPropagation();
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, []);
}
