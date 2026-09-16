/**
 * Which open ramp rows to close as settled when the app opens.
 *
 * Ramp status only moves from the browser, so a purchase paid from the bank app
 * — or a withdrawal the provider paid out — while this app was closed is still
 * open on the server. On the next load the app asks the provider about each
 * one. Only a `completed` answer closes anything: a pending one waits for the
 * next load, a failed one is left to the modals that explain failures, and a
 * read that failed says nothing at all.
 */

export interface ReopenRow {
  providerTxId: string;
}

/**
 * `statuses` maps a provider transaction id to what the provider answered, or
 * to null when the read failed. A row missing from the map was not asked about.
 */
export function settledOnReopen<T extends ReopenRow>(rows: T[], statuses: ReadonlyMap<string, string | null>): T[] {
  return rows.filter((row) => !!row.providerTxId && statuses.get(row.providerTxId) === 'completed');
}

/**
 * The rows still worth asking about again: the provider answered `pending` or
 * `processing`, so the answer can still change.
 *
 * A failed row is not one of them — it is over — and neither is one whose read
 * failed, because a provider we cannot reach would otherwise keep the check
 * running against a wall.
 */
export function openAfterCheck<T extends ReopenRow>(rows: T[], statuses: ReadonlyMap<string, string | null>): T[] {
  return rows.filter((row) => {
    const status = row.providerTxId ? statuses.get(row.providerTxId) : null;
    return status === 'pending' || status === 'processing';
  });
}

/**
 * How long a still-open row is worth polling for. The QR is valid about fifteen
 * minutes and the expiry grace adds three, so half an hour covers the whole
 * window in which a bank payment can still show up.
 */
export const WATCH_WINDOW_MS = 30 * 60_000;

/**
 * Whether to keep re-checking. Past the window the row is not closed — it is
 * left to the 24h abandon rule — it just stops costing a request every half
 * minute on a tab somebody left open all day.
 */
export function shouldKeepWatching(rows: readonly { createdAt: string }[], now: Date): boolean {
  return rows.some((row) => {
    const createdAt = new Date(row.createdAt).getTime();
    return Number.isFinite(createdAt) && now.getTime() - createdAt < WATCH_WINDOW_MS;
  });
}
