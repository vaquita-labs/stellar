import {
  GroupDocument,
  GroupMember,
  GroupPeriod,
  GroupResponseDTO,
  GroupStatus,
  GroupTablePaymentItemDTO,
  GroupWithdrawalType,
} from 'app/group/types';
import { addMonths, addWeeks } from 'date-fns';

export const getCollateralAmount = (amount: number, totalMembers: number) => amount * (totalMembers - 1);

export const getGroupStatus = (group: GroupDocument, myWithdrawals: GroupResponseDTO['myWithdrawals'], customerPublicKey: string) => {
  
  if (group.isPublic) {
    return GroupStatus.ACTIVE;
  }
  
  let depositedCollaterals = 0;
  let joinedUsers = 0;
  for (const member of Object.values(group.members || {})) {
    if (
      member.deposits?.[0]?.round === 0 &&
      member.deposits?.[0]?.amount === group.collateralAmount
    ) {
      depositedCollaterals++;
    }
    joinedUsers++;
  }
  
  if (depositedCollaterals == 0) {
    return GroupStatus.STARTING;
  } else if (depositedCollaterals < group.totalMembers) {
    // pending, abandoned
    // if (group.startsOnTimestamp >= Date.now()) {
    //   return GroupStatus.PENDING;
    // }
    // return GroupStatus.ABANDONED;
    
    return GroupStatus.PENDING;
  } else if (depositedCollaterals === group.totalMembers) {
    // active, concluded
    const endDate =
      group.period === GroupPeriod.MONTHLY
        ? addMonths(new Date(group.startsOnTimestamp), group.totalMembers)
        : addWeeks(new Date(group.startsOnTimestamp), group.totalMembers);
    const allWithdrawals = myWithdrawals.round.successfullyWithdrawn
      && myWithdrawals.collateral.successfullyWithdrawn
      && myWithdrawals.interest.successfullyWithdrawn;
    
    if (group.startsOnTimestamp > Date.now() && !allWithdrawals) {
      return GroupStatus.PENDING;
    }
    
    if (allWithdrawals) {
      return GroupStatus.CONCLUDED;
    }
    
    if (endDate.getTime() > Date.now() && !allWithdrawals) {
      return GroupStatus.ACTIVE;
    }
    
    return GroupStatus.CONCLUDED;
  }
  
  return GroupStatus.ABANDONED;
};

export const getGroupSlots = (group: Pick<GroupDocument, 'members' | 'collateralAmount' | 'totalMembers'>) => {
  let depositedCollaterals = 0;
  for (const member of Object.values(group.members || {})) {
    if (
      member.deposits?.[0]?.round === 0 &&
      member.deposits?.[0]?.amount === group.collateralAmount
    ) {
      depositedCollaterals++;
    }
  }
  
  return group.totalMembers - depositedCollaterals;
};

export const isSuccessTransaction = (deposit: GroupMember['deposits'][number] | GroupMember['withdrawals'][string] | undefined, amount: number | undefined) => {
  return (typeof amount === 'number' ? !!deposit?.amount && +deposit?.amount === +amount : true) && !!deposit?.timestamp && !!deposit?.transactionSignature;
};

export const toGroupResponseDTO = (
  group: GroupDocument,
  _customerPublicKey: string,
): GroupResponseDTO => {
  const customerPublicKey = _customerPublicKey.toLowerCase();
  const me = group.members?.[customerPublicKey];
  
  const countSuccessDeposits: { [key: number]: number } = {};
  let countSuccessRounds = 0;
  for (const member of Object.values(group.members || {})) {
    for (const deposit of Object.values(member.deposits || {})) {
      if (isSuccessTransaction(deposit, +deposit.round === 0 ? getCollateralAmount(group.amount, group.totalMembers) : group.amount)) {
        countSuccessDeposits[deposit.round] = (countSuccessDeposits[deposit.round] ?? 0) + 1;
      }
    }
  }
  
  for (let i = 0; i <= group.totalMembers; i++) {
    countSuccessRounds += +(countSuccessDeposits[i] === (group.totalMembers - (i === 0 ? 0 : 1)));
  }
  
  const myDeposits: GroupResponseDTO['myDeposits'] = {};
  for (const deposit of Object.values(me?.deposits || {})) {
    myDeposits[deposit.round] = {
      round: deposit.round,
      successfullyDeposited:
        deposit.round === 0
          ? deposit.amount === group.collateralAmount
          : deposit.amount === group.amount,
      amount: deposit.amount,
      timestamp: deposit.timestamp,
    };
  }
  
  // TODO: valid with dates
  const myWithdrawals: GroupResponseDTO['myWithdrawals'] = {
    [GroupWithdrawalType.COLLATERAL]: {
      amount: me?.withdrawals?.collateral?.amount ?? 0,
      type: GroupWithdrawalType.COLLATERAL,
      timestamp: me?.withdrawals?.collateral?.timestamp ?? 0,
      successfullyWithdrawn: isSuccessTransaction(me?.withdrawals?.collateral, group.collateralAmount),
      enabled: countSuccessRounds === group.totalMembers + 1,
      // @ts-ignore
      countSuccessRounds,
      countSuccessDeposits,
    },
    [GroupWithdrawalType.ROUND]: {
      amount: me?.withdrawals?.round?.amount ?? 0,
      type: GroupWithdrawalType.ROUND,
      timestamp: me?.withdrawals?.round?.timestamp ?? 0,
      successfullyWithdrawn: isSuccessTransaction(me?.withdrawals?.round, group.amount),
      enabled: // group.myPosition <= group.currentPosition &&
        countSuccessDeposits[me?.position || 0] === group.totalMembers - 1,
      // @ts-ignore
      countSuccessRounds,
      countSuccessDeposits,
    },
    [GroupWithdrawalType.INTEREST]: {
      amount: me?.withdrawals?.interest?.amount ?? 0,
      type: GroupWithdrawalType.INTEREST,
      timestamp: me?.withdrawals?.interest?.timestamp ?? 0,
      successfullyWithdrawn: isSuccessTransaction(me?.withdrawals?.interest, undefined),
      enabled: countSuccessRounds === group.totalMembers + 1,
      // @ts-ignore
      countSuccessRounds,
      countSuccessDeposits,
    },
  };
  myWithdrawals.collateral.enabled = myWithdrawals.collateral.enabled && !myWithdrawals.collateral.successfullyWithdrawn;
  myWithdrawals.round.enabled = myWithdrawals.round.enabled && !myWithdrawals.round.successfullyWithdrawn;
  myWithdrawals.interest.enabled = myWithdrawals.interest.enabled && !myWithdrawals.interest.successfullyWithdrawn;
  
  const response = {
    amount: group.amount,
    myDeposits,
    totalMembers: group.totalMembers,
    period: group.period,
    startsOnTimestamp: group.startsOnTimestamp,
    myPosition: me?.position || 0,
  };
  
  const { currentPosition } = getPaymentsTable(response);
  
  return {
    id: group._id.toString(),
    crypto: group.crypto,
    name: group.name,
    amount: group.amount,
    collateralAmount: group.collateralAmount,
    myDeposits,
    myWithdrawals,
    totalMembers: group.totalMembers,
    slots: getGroupSlots(group),
    joinedUsers: Object.values(group.members || {}).length,
    period: group.period,
    startsOnTimestamp: group.startsOnTimestamp,
    status: getGroupStatus(group, myWithdrawals, customerPublicKey),
    isOwner: customerPublicKey === group.ownerPublicKey,
    myPosition: me?.position || 0,
    currentPosition,
    isPublic: !!group.isPublic,
  };
};

export const getPaymentsTable = (
  group: Pick<
    GroupResponseDTO,
    | 'startsOnTimestamp'
    | 'totalMembers'
    | 'period'
    | 'amount'
    | 'myDeposits'
    | 'myPosition'
  >,
) => {
  const items: GroupTablePaymentItemDTO[] = [];
  let startDate = new Date(group.startsOnTimestamp || 0);
  let endDate = startDate;
  let firstUnpaidItemIndex = -1;
  let currentPosition = -1;
  for (let i = 0; i < (group.totalMembers || 0); i++) {
    if (group.period === GroupPeriod.MONTHLY) {
      endDate = addMonths(startDate, 1);
    } else {
      endDate = addWeeks(startDate, 1);
    }
    if (startDate.getTime() <= Date.now() && Date.now() < endDate.getTime()) {
      currentPosition = i + 1;
    }
    const round = i + 1;
    
    items.push({
      round,
      amount: group.amount || 0,
      paymentDeadlineTimestamp: endDate.getTime(),
      status: group.myDeposits[round]?.successfullyDeposited
        ? 'Paid'
        : firstUnpaidItemIndex === -1
          ? 'Pay'
          : 'Pending',
    });
    if (
      firstUnpaidItemIndex === -1 &&
      round !== group.myPosition &&
      !group.myDeposits[round]?.successfullyDeposited
    ) {
      firstUnpaidItemIndex = i;
    }
    startDate = endDate;
  }
  
  return { items, firstUnpaidItemIndex, currentPosition };
};
