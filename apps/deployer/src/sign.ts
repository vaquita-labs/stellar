import { Keypair, StrKey, TransactionBuilder, xdr } from "@stellar/stellar-sdk";

export function signTransactionXdr(
  unsignedXdr: string,
  secretKey: string,
  networkPassphrase: string,
): string {
  const tx = TransactionBuilder.fromXDR(unsignedXdr, networkPassphrase);
  tx.sign(Keypair.fromSecret(secretKey));
  return tx.toXDR();
}

/**
 * The DeFindex /send endpoint returns `returnValue` as a pre-decoded contract
 * address string (C...) in the observed response shape. For safety we also
 * handle the case where it comes back as a base64-encoded ScVal wrapping an
 * ScAddress, which is what a raw Soroban RPC response would contain.
 */
export function extractVaultAddress(returnValue: string): string {
  if (StrKey.isValidContract(returnValue)) {
    return returnValue;
  }

  let scVal: xdr.ScVal;
  try {
    scVal = xdr.ScVal.fromXDR(returnValue, "base64");
  } catch (err) {
    throw new Error(
      `returnValue is neither a contract address nor a valid base64 ScVal XDR: "${returnValue}" (${(err as Error).message})`,
    );
  }

  if (scVal.switch() !== xdr.ScValType.scvAddress()) {
    throw new Error(
      `returnValue ScVal is not an address (got ${scVal.switch().name})`,
    );
  }
  const addr = scVal.address();
  if (addr.switch() !== xdr.ScAddressType.scAddressTypeContract()) {
    throw new Error(
      `returnValue address is not a contract (got ${addr.switch().name})`,
    );
  }

  return StrKey.encodeContract(addr.contractId() as unknown as Buffer);
}
