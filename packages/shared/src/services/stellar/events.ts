import { isStringJson } from '../../helpers';
import type { Deposit } from '../../types';
import { xdr, StrKey } from '@stellar/stellar-sdk';

export const getStellarDepositContractAddress = (deposit: Deposit) => {
    try {
      if (!isStringJson(deposit.transaction_event_raw)) {
        return '';
      }
      const transaction = JSON.parse(deposit.transaction_event_raw);
      const contractEvent = transaction?.final?.events?.contractEventsXdr?.at(-1)?.at(-1);
      if (typeof contractEvent !== 'string') {
        return '';
      }
      const parsedContractEvent = xdr.ContractEvent.fromXDR(contractEvent, 'base64');
      
      return StrKey.encodeContract(parsedContractEvent.contractId() as unknown as Buffer<ArrayBufferLike>);
    } catch (error) {
      console.error('getStellarDepositContractAddress', error);
      return '';
    }
};