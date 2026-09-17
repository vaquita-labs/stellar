import { create } from 'zustand';

/**
 * Whether there is a USDC purchase waiting for the user to come back to it.
 *
 * Someone who closes the payment screen with the code alive did not give it up
 * — they left to pay it from the bank app, and the purchase is still open on the
 * server. Making them walk the deposit sheet and the country picker again to
 * reach the code they already have is asking them to find their way back to a
 * screen they never meant to leave, and every extra step is one more chance to
 * start a second purchase over the same payment.
 *
 * So the deposit button reads this and reopens the purchase directly. It is set
 * by the modal when it closes over an open purchase, and by the opening check,
 * which already asks the server which rows are still open and is what carries
 * the shortcut across a reload.
 */
type OnrampWaitingState = {
  /** There is an open purchase to go straight back to. */
  hasOpenPurchase: boolean;
};

export const useOnrampWaitingStore = create<OnrampWaitingState>(() => ({ hasOpenPurchase: false }));

/**
 * A plain function and not a store action: the callers are event handlers and
 * an async check, none of which render from this, and a setter read through the
 * hook would only drag them into dependency arrays.
 */
export const setOnrampWaiting = (hasOpenPurchase: boolean): void => useOnrampWaitingStore.setState({ hasOpenPurchase });
