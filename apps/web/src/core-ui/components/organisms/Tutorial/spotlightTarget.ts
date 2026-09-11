/**
 * The first element matching `selector` that is actually laid out on screen.
 *
 * `querySelector` alone is not enough here. Some home anchors exist twice, one
 * copy per layout: the daily chest floats over the map on a phone and sits in
 * the sidebar on a desktop, and the copy the current breakpoint hides with
 * `display: none` is still in the DOM. That copy measures as a 0×0 box at the
 * viewport's origin, so a step that lands on it rings a corner of nothing and
 * parks its card in the top-left. Skipping every empty box leaves the copy the
 * user can see.
 */
export function findSpotlightTarget(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) return el;
  }
  return null;
}
