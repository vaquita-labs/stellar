import { describe, expect, it } from 'vitest';
import {
  buildErc20AllowanceCall,
  buildErc20ApproveTx,
  buildEvmToStellarBurnTx,
  CCTP_FAST_FINALITY_THRESHOLD,
} from './evm';
import { buildCctpForwarderHookData, stellarStrkeyToBytes32 } from './index';

const owner = '0x1111111111111111111111111111111111111111';

describe('EVM CCTP transaction builders', () => {
  it('builds ERC-20 allowance and approval calls for TokenMessengerV2', () => {
    const allowance = buildErc20AllowanceCall('ethereum-sepolia', owner);
    const approval = buildErc20ApproveTx('ethereum-sepolia', 1_000_000n);

    expect(allowance).toMatchObject({
      to: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      data: expect.stringMatching(/^0xdd62ed3e/),
    });
    expect(allowance.data).toContain(owner.slice(2).toLowerCase().padStart(64, '0'));
    expect(allowance.data).toContain('8fe6b999dc680ccfdd5bf7eb0974218be2542daa'.padStart(64, '0'));

    expect(approval).toEqual({
      to: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      data: `0x095ea7b3${'8fe6b999dc680ccfdd5bf7eb0974218be2542daa'.padStart(64, '0')}${'f4240'.padStart(64, '0')}`,
    });
  });

  it('builds an Ethereum Sepolia depositForBurnWithHook transaction to Stellar forwarder', () => {
    const tx = buildEvmToStellarBurnTx({
      sourceNetwork: 'ethereum-sepolia',
      destinationNetwork: 'stellar-testnet',
      amount: 1_000_000n,
      forwardRecipientStrkey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });

    expect(tx.to).toBe('0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA');
    expect(tx.data).toMatch(/^0x779b432d/);
    expect(tx.data).toContain('1b'.padStart(64, '0'));
    expect(tx.data).toContain(CCTP_FAST_FINALITY_THRESHOLD.toString(16).padStart(64, '0'));
    expect(tx.data.toLowerCase()).toContain('1c7d4b196cb0c7b01d743fbc6116a902379c7238'.padStart(64, '0'));
    expect(tx.data.toLowerCase()).toContain(stellarStrkeyToBytes32('CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ').slice(2));
    expect(tx.data.toLowerCase()).toContain(buildCctpForwarderHookData('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF').slice(2));
  });
});
