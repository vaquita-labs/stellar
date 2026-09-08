// Declarative config for the guided tour of the home screen: a coach mark per
// button, explaining what it does. To change the tour, edit only this file —
// the engine (HomeTour.tsx) walks this list and knows nothing about the steps.
//
// This is NOT the /tutorial walkthrough: that one is a simulated deposit on its
// own route, with its own steps in tutorialConfig.ts. This tour runs on the
// REAL home and never touches the user's money, so every step is read-only: the
// highlighted element is shown but not clickable, and the user advances with
// the card's button.

export interface HomeTourStep {
  /** Stable id, used as a React key and to debug which step is on screen. */
  id: string;
  /**
   * i18n keys for the copy (not the text itself), so the tour follows the
   * active language. The strings live in the locale dictionaries.
   */
  titleKey: string;
  bodyKey: string;
  /**
   * CSS selector of the real home element to spotlight. Anchored by
   * `data-tutorial="…"` on the production components.
   */
  spotlight: string;
  /**
   * Padding (px) of the cutout around the element. The default suits a single
   * button; groups of buttons need more air so the ring does not clip a label.
   */
  pad?: number;
  /**
   * Pin the guide card near the top of the viewport instead of next to the
   * element. Used when the element sits low on screen and the card would cover
   * the very thing being explained.
   */
  pinTop?: boolean;
}

// Anchors on the real home components (data-tutorial="…").
export const HOME_TOUR_ANCHOR_ACTIONS = 'home-tour-actions';
export const HOME_TOUR_ANCHOR_BALANCE = 'home-tour-balance';
export const HOME_TOUR_ANCHOR_CHEST = 'home-tour-chest';
export const HOME_TOUR_ANCHOR_QUICK_ACTIONS = 'home-tour-quick-actions';
export const HOME_TOUR_ANCHOR_PROFILE = 'home-tour-profile';
export const HOME_TOUR_ANCHOR_HELP = 'home-tour-help';

const spot = (anchor: string) => `[data-tutorial="${anchor}"]`;

/**
 * The tour, in order. It opens on the pair of buttons that move money (what we
 * want the user to do first) and closes on the two header buttons, which sit
 * side by side, so the last leg of the tour barely moves.
 *
 * The side rail is a SINGLE step covering Explore, Leaderboard and Shop: three
 * consecutive coach marks on three small icons read as nagging, and the three
 * share one idea (places to go that are not the map).
 */
export const HOME_TOUR_STEPS: HomeTourStep[] = [
  {
    id: 'actions',
    titleKey: 'homeTour.steps.actions.title',
    bodyKey: 'homeTour.steps.actions.body',
    spotlight: spot(HOME_TOUR_ANCHOR_ACTIONS),
    // The row is pinned to the bottom of the screen, so the card goes up top.
    pinTop: true,
  },
  {
    id: 'balance',
    titleKey: 'homeTour.steps.balance.title',
    bodyKey: 'homeTour.steps.balance.body',
    spotlight: spot(HOME_TOUR_ANCHOR_BALANCE),
  },
  {
    id: 'chest',
    titleKey: 'homeTour.steps.chest.title',
    bodyKey: 'homeTour.steps.chest.body',
    spotlight: spot(HOME_TOUR_ANCHOR_CHEST),
  },
  {
    id: 'quickActions',
    titleKey: 'homeTour.steps.quickActions.title',
    bodyKey: 'homeTour.steps.quickActions.body',
    spotlight: spot(HOME_TOUR_ANCHOR_QUICK_ACTIONS),
    // Wider cutout: the three buttons carry a label under each icon.
    pad: 10,
  },
  {
    id: 'profile',
    titleKey: 'homeTour.steps.profile.title',
    bodyKey: 'homeTour.steps.profile.body',
    spotlight: spot(HOME_TOUR_ANCHOR_PROFILE),
  },
  {
    id: 'help',
    titleKey: 'homeTour.steps.help.title',
    bodyKey: 'homeTour.steps.help.body',
    spotlight: spot(HOME_TOUR_ANCHOR_HELP),
  },
];
