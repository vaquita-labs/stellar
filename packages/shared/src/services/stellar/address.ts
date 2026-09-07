import { StrKey } from '@stellar/stellar-sdk';

/**
 * Address validators shared by the API routes.
 *
 * These used to live in the CCTP bridge service. They outlived it because they
 * answer a question nothing else in the repo answers: "is this string something
 * Stellar (or an EVM chain) would accept as a destination?" — asked by the legal
 * acceptance route before it writes a wallet address, and by the bridge before
 * it asks a quote for one.
 */

/**
 * True for any Stellar address that can RECEIVE: a G… account, a C… contract,
 * or an M… muxed account. Deliberately broader than `isValidEd25519PublicKey`:
 * a contract address is a legitimate recipient on Soroban, and rejecting muxed
 * accounts would break exchange deposits.
 */
export const isValidStellarAddress = (strkey: string): boolean =>
  StrKey.isValidEd25519PublicKey(strkey) ||
  StrKey.isValidContract(strkey) ||
  StrKey.isValidMed25519PublicKey(strkey);

/** True for a checksum-agnostic 20-byte EVM address. */
export const isValidEvmAddress = (address: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(address);
