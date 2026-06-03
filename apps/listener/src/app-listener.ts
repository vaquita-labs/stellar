// The Base/EVM on-chain listener was removed during the Stellar-only migration.
// A Stellar/Soroban event listener has not been implemented here yet — on-chain
// deposit/withdrawal syncing currently lives outside this app. This entrypoint is
// intentionally a no-op placeholder so the service stays buildable.
console.info('[listener] no active listeners — Stellar listener not yet implemented');
