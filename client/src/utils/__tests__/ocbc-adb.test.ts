import { describe, expect, it } from "vitest";
import { calculateOcbcAdbTransfer } from "../ocbc-adb";

describe("calculateOcbcAdbTransfer", () => {
  it("calculates the transfer-out amount in the supplied July example", () => {
    const result = calculateOcbcAdbTransfer({
      currentAdb: 107_718.35,
      adbIncrease: 1_763.2,
      targetIncrease: 520,
      currentBalance: 125_636,
      transferDate: new Date(2026, 6, 24),
    });

    expect(result).toMatchObject({
      baselineAdb: 105_955.15,
      targetAdb: 106_475.15,
      targetCumulativeBalance: 3_300_729.65,
      accumulatedBalance: 2_477_522.05,
      requiredRemainingBalance: 823_207.6,
      requiredDailyBalance: 102_900.95,
      transferAmount: 22_735.05,
      daysElapsed: 23,
      daysRemaining: 8,
      daysInMonth: 31,
    });
  });

  it("returns a negative transfer amount when money needs to be transferred in", () => {
    const result = calculateOcbcAdbTransfer({
      currentAdb: 1_000,
      adbIncrease: 0,
      targetIncrease: 1_000,
      currentBalance: 1_000,
      transferDate: new Date(2026, 1, 1),
    });

    expect(result?.transferAmount).toBeCloseTo(-1_000);
    expect(result?.daysRemaining).toBe(28);
  });
});
