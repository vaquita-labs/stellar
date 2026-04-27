import {
  checkVaquitaPoolDepositData,
  getDepositsByNetworkId,
  getNetworkById,
  getTokenNetworkByNetworkIdTokenId,
} from '@vaquita/shared';

const BASE = 2;
const BASE_SEPOLIA = 8;
const TOKEN_USDC_ID = 7;

const NETWORK_ID = BASE;

const testing = async () => {
  const { data: networkData } = await getNetworkById(NETWORK_ID);
  const { data: deposits = [] } = await getDepositsByNetworkId(NETWORK_ID);
  const { data: tokenNetworkData } = await getTokenNetworkByNetworkIdTokenId(NETWORK_ID, TOKEN_USDC_ID);
  
  await checkVaquitaPoolDepositData(deposits, networkData!, tokenNetworkData!);
};

testing();
