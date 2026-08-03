export type OcbcAdbCalculationInput = {
  currentAdb: number;
  adbIncrease: number;
  targetIncrease: number;
  currentBalance: number;
  transferDate: Date;
};

export type OcbcAdbCalculation = {
  baselineAdb: number;
  targetAdb: number;
  targetCumulativeBalance: number;
  accumulatedBalance: number;
  requiredRemainingBalance: number;
  requiredDailyBalance: number;
  transferAmount: number;
  daysElapsed: number;
  daysRemaining: number;
  daysInMonth: number;
};

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function toCents(value: number) {
  return Math.round(value * 100);
}

export function calculateOcbcAdbTransfer({
  currentAdb,
  adbIncrease,
  targetIncrease,
  currentBalance,
  transferDate,
}: OcbcAdbCalculationInput): OcbcAdbCalculation | null {
  if (
    !Number.isFinite(transferDate.getTime())
    || !Number.isFinite(adbIncrease)
    || [currentAdb, targetIncrease, currentBalance].some((value) => !Number.isFinite(value) || value < 0)
  ) {
    return null;
  }

  const values = [currentAdb, adbIncrease, targetIncrease, currentBalance];

  const [currentAdbCents, adbIncreaseCents, targetIncreaseCents, currentBalanceCents] = values.map(toCents);
  const daysInMonth = getDaysInMonth(transferDate);
  const daysElapsed = transferDate.getDate() - 1;
  const daysRemaining = daysInMonth - daysElapsed;
  const baselineAdbCents = currentAdbCents - adbIncreaseCents;
  const targetAdbCents = baselineAdbCents + targetIncreaseCents;
  const targetCumulativeCents = targetAdbCents * daysInMonth;
  const accumulatedCents = currentAdbCents * daysElapsed;
  const requiredRemainingCents = targetCumulativeCents - accumulatedCents;
  const requiredDailyBalance = requiredRemainingCents / (daysRemaining * 100);

  return {
    baselineAdb: baselineAdbCents / 100,
    targetAdb: targetAdbCents / 100,
    targetCumulativeBalance: targetCumulativeCents / 100,
    accumulatedBalance: accumulatedCents / 100,
    requiredRemainingBalance: requiredRemainingCents / 100,
    requiredDailyBalance,
    transferAmount: (currentBalanceCents - requiredRemainingCents / daysRemaining) / 100,
    daysElapsed,
    daysRemaining,
    daysInMonth,
  };
}
