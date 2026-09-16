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
