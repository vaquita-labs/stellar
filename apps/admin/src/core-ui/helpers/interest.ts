/* eslint-disable @typescript-eslint/no-explicit-any */
import { NetworkResponseDTO } from "../types";

export const getInterestData = (network: NetworkResponseDTO, dataApy: any, depositAmount: number, lockPeriod: number) => {
    const isStellarTestnet = network?.name === 'Stellar Testnet';

    const protocolApy = dataApy?.protocolApy ?? 0;
    const vaquitaApy = dataApy?.vaquitaApy ?? 0;
    const protocolApyMultiplier = protocolApy / 100;
    const vaquitaApyMultiplier = vaquitaApy / 100;
    const lockPeriodInMilSeconds = lockPeriod;
    const lockPeriodInYears = lockPeriodInMilSeconds / 12 / 30 / 24 / 60 / 60 / 1000;
    const aaveInterest = !isStellarTestnet ? depositAmount * (protocolApyMultiplier * lockPeriodInYears) : 0;
    const blendInterest = isStellarTestnet ? depositAmount * (protocolApyMultiplier * lockPeriodInYears) : 0;
    const vaquitaInterest = depositAmount * (vaquitaApyMultiplier * lockPeriodInYears);
    const totalInterest = aaveInterest + vaquitaInterest + blendInterest;

    return {
        aaveInterest,
        blendInterest,
        vaquitaInterest,
        totalInterest,
    }
}