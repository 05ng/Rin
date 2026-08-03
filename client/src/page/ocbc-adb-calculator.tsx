import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "@rin/ui";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { OcbcAdbCalculatorZhCnPage } from "./ocbc-adb-calculator-zh-cn";
import { calculateOcbcAdbTransfer } from "../utils/ocbc-adb";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const moneyFormatter = new Intl.NumberFormat("en-SG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return `SGD ${moneyFormatter.format(value)}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function parseMoney(value: string, allowNegative = false) {
  const cleaned = value.replaceAll(",", "").trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && (allowNegative || amount >= 0) ? amount : null;
}

function CurrencyInput({
  id,
  label,
  hint,
  value,
  onChange,
  allowNegative = false,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</span>
      <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
      <div className="relative mt-2">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-neutral-500 dark:text-neutral-400">
          SGD
        </span>
        <input
          id={id}
          className="w-full rounded-xl border border-black/10 bg-white py-2 pl-14 pr-4 text-neutral-900 shadow-none transition-colors placeholder:text-neutral-400 focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 dark:bg-dark dark:text-white dark:focus:border-white/20"
          inputMode="decimal"
          min={allowNegative ? undefined : "0"}
          placeholder={allowNegative ? "-0.00" : "0.00"}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

export function OcbcAdbCalculatorPage() {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === "zh-CN" ? <OcbcAdbCalculatorZhCnPage /> : <OcbcAdbCalculatorEnglishPage />;
}

function OcbcAdbCalculatorEnglishPage() {
  const siteConfig = useSiteConfig();
  const [currentAdb, setCurrentAdb] = useState("");
  const [adbIncrease, setAdbIncrease] = useState("");
  const [targetIncrease, setTargetIncrease] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [transferDate, setTransferDate] = useState(() => toDateInputValue(new Date()));

  const calculation = useMemo(() => {
    const values = [
      parseMoney(currentAdb),
      parseMoney(adbIncrease, true),
      parseMoney(targetIncrease),
      parseMoney(currentBalance),
    ];
    if (values.some((value) => value === null)) return null;

    return calculateOcbcAdbTransfer({
      currentAdb: values[0] as number,
      adbIncrease: values[1] as number,
      targetIncrease: values[2] as number,
      currentBalance: values[3] as number,
      transferDate: parseDate(transferDate),
    });
  }, [adbIncrease, currentAdb, currentBalance, targetIncrease, transferDate]);

  const transferDirection = calculation
    ? Math.abs(calculation.transferAmount) < 0.005
      ? "none"
      : calculation.transferAmount > 0
        ? "out"
        : "in"
    : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-4">
      <Helmet>
        <title>{`OCBC ADB Calculator - ${siteConfig.name}`}</title>
      </Helmet>

      <section>
        <p className="text-sm font-medium text-theme">OCBC planning tool</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">Average Daily Balance Calculator</h1>
        <p className="mt-2 max-w-3xl text-neutral-600 dark:text-neutral-300">
          Work out the balance to hold from today through month-end to reach your target ADB increase against last month.
        </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SettingsCard>
          <SettingsCardHeader title="Your figures" description="Enter the ADB reported through yesterday and your balance available to move today." />
          <SettingsCardBody>
            <div className="grid gap-5">
              <CurrencyInput
                id="current-adb"
                label="Current average daily balance"
                hint="The ADB shown by OCBC as of yesterday."
                value={currentAdb}
                onChange={setCurrentAdb}
              />
              <CurrencyInput
                id="adb-increase"
                label="ADB increase vs last month"
                hint="The increase OCBC currently reports for this month."
                value={adbIncrease}
                onChange={setAdbIncrease}
                allowNegative
              />
              <CurrencyInput
                id="target-increase"
                label="Target ADB increase by month-end"
                hint="The exact increase over last month that you want to finish with."
                value={targetIncrease}
                onChange={setTargetIncrease}
              />
              <CurrencyInput
                id="current-balance"
                label="Current account balance"
                hint="Required to work out the amount to transfer in or out today."
                value={currentBalance}
                onChange={setCurrentBalance}
              />
              <label className="block" htmlFor="transfer-date">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">Transfer date</span>
                <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  The calculator assumes today’s transfer affects today’s balance.
                </span>
                <input
                  id="transfer-date"
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-neutral-900 shadow-none transition-colors focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 dark:bg-dark dark:text-white dark:focus:border-white/20"
                  type="date"
                  value={transferDate}
                  onChange={(event) => setTransferDate(event.target.value)}
                />
              </label>
            </div>
          </SettingsCardBody>
        </SettingsCard>

        <div className="flex flex-col gap-5">
          <SettingsCard
            tone={
              transferDirection === "out" ? "warning" : transferDirection === "in" ? "danger" : transferDirection === "none" ? "success" : "default"
            }
          >
            <SettingsCardHeader
              title={
                transferDirection === "out"
                  ? "Transfer out today"
                  : transferDirection === "in"
                    ? "Transfer in today"
                    : transferDirection === "none"
                      ? "No transfer needed"
                      : "Your recommendation"
              }
              description={
                calculation
                  ? `For ${dateFormatter.format(parseDate(transferDate))}, with ${calculation.daysRemaining} day${calculation.daysRemaining === 1 ? "" : "s"} remaining in the month.`
                  : "Complete all fields to calculate the transfer amount."
              }
            />
            <SettingsCardBody>
              {calculation ? (
                <div className="space-y-4">
                  <p className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                    {formatMoney(Math.abs(calculation.transferAmount))}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    {transferDirection === "out"
                      ? "Move this amount out, then leave the remaining balance unchanged through month-end."
                      : transferDirection === "in"
                        ? "Add this amount, then leave the resulting balance unchanged through month-end."
                        : "Your current balance already matches the required balance for the rest of the month."}
                  </p>
                  <div className="grid gap-3 border-t border-black/10 pt-4 text-sm dark:border-white/10 sm:grid-cols-2">
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">Balance to hold each remaining day</p>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">{formatMoney(calculation.requiredDailyBalance)}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">Target month-end ADB</p>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">{formatMoney(calculation.targetAdb)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  The transfer amount is calculated from your current balance minus the required daily balance for the remaining days.
                </p>
              )}
            </SettingsCardBody>
          </SettingsCard>

          {calculation ? (
            <SettingsCard>
              <SettingsCardHeader title="Calculation details" description="The figures used to derive the recommendation." />
              <SettingsCardBody>
                <dl className="divide-y divide-black/10 text-sm dark:divide-white/10">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">Last month’s baseline ADB</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.baselineAdb)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">Target cumulative balance ({calculation.daysInMonth} days)</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.targetCumulativeBalance)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">Already accumulated ({calculation.daysElapsed} days)</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.accumulatedBalance)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">Required across remaining days</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.requiredRemainingBalance)}</dd>
                  </div>
                </dl>
              </SettingsCardBody>
            </SettingsCard>
          ) : null}
        </div>
      </div>

      <aside className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        This is a planning calculation. It assumes the displayed ADB includes balances through the day before the transfer date, the transfer counts for the whole transfer day, and there are no further balance changes. Confirm OCBC’s applicable ADB timing and transaction cut-off before moving funds.
      </aside>
    </main>
  );
}
