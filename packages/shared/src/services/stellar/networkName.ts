/**
 * The two `networks.name` values that mean "this deposit lives on Stellar":
 * `'Stellar'` is mainnet, `'Stellar Testnet'` is testnet.
 *
 * The distinction matters for RPC endpoints and passphrases, never for whether
 * a Soroban read is possible at all — so anything asking "can I read this
 * on-chain?" must accept both. Checking `=== 'Stellar Testnet'` on its own is
 * the shape of an old bug: it silently returns zeros in production, where there
 * is no test wallet to notice.
 */
export function isStellarNetworkName(networkName: string | null | undefined): boolean {
  return networkName === 'Stellar' || networkName === 'Stellar Testnet';
}
