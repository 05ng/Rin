import { SettingsCard, SettingsCardBody, SettingsCardHeader } from "@rin/ui";
import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { calculateOcbcAdbTransfer } from "../utils/ocbc-adb";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  month: "long",
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

function parseMoney(value: string) {
  const cleaned = value.replaceAll(",", "").trim();
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function CurrencyInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
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
          min="0"
          placeholder="0.00"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

export function OcbcAdbCalculatorZhCnPage() {
  const siteConfig = useSiteConfig();
  const [currentAdb, setCurrentAdb] = useState("");
  const [adbIncrease, setAdbIncrease] = useState("");
  const [targetIncrease, setTargetIncrease] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [transferDate, setTransferDate] = useState(() => toDateInputValue(new Date()));

  const calculation = useMemo(() => {
    const values = [currentAdb, adbIncrease, targetIncrease, currentBalance].map(parseMoney);
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
        <title>{`OCBC ADB 计算器 - ${siteConfig.name}`}</title>
      </Helmet>

      <section>
        <p className="text-sm font-medium text-theme">OCBC 规划工具</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">平均每日余额计算器</h1>
        <p className="mt-2 max-w-3xl text-neutral-600 dark:text-neutral-300">
          计算从今天至月底应保留的余额，以实现相较上月的目标平均每日余额增幅。
        </p>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SettingsCard>
          <SettingsCardHeader title="输入数据" description="请输入截至昨日显示的 ADB，以及今天可以转入或转出的账户余额。" />
          <SettingsCardBody>
            <div className="grid gap-5">
              <CurrencyInput
                id="current-adb"
                label="当前平均每日余额"
                hint="OCBC 显示的截至昨日的 ADB。"
                value={currentAdb}
                onChange={setCurrentAdb}
              />
              <CurrencyInput
                id="adb-increase"
                label="相较上月的 ADB 增幅"
                hint="OCBC 本月目前显示的增幅。"
                value={adbIncrease}
                onChange={setAdbIncrease}
              />
              <CurrencyInput
                id="target-increase"
                label="月底目标 ADB 增幅"
                hint="您希望在月底相较上月达成的准确增幅。"
                value={targetIncrease}
                onChange={setTargetIncrease}
              />
              <CurrencyInput
                id="current-balance"
                label="当前账户余额"
                hint="用于计算今天需要转入或转出的金额。"
                value={currentBalance}
                onChange={setCurrentBalance}
              />
              <label className="block" htmlFor="transfer-date">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">转账日期</span>
                <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                  计算器假设今天的转账会影响今天的账户余额。
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
                  ? "今日转出"
                  : transferDirection === "in"
                    ? "今日转入"
                    : transferDirection === "none"
                      ? "无需转账"
                      : "转账建议"
              }
              description={
                calculation
                  ? `${dateFormatter.format(parseDate(transferDate))}；本月剩余 ${calculation.daysRemaining} 天。`
                  : "完成所有输入后，即可计算转账金额。"
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
                      ? "转出此金额，然后在月底前保持剩余余额不变。"
                      : transferDirection === "in"
                        ? "转入此金额，然后在月底前保持账户余额不变。"
                        : "当前账户余额已等于余下日期所需保持的余额。"}
                  </p>
                  <div className="grid gap-3 border-t border-black/10 pt-4 text-sm dark:border-white/10 sm:grid-cols-2">
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">余下每日应保留的余额</p>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">{formatMoney(calculation.requiredDailyBalance)}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500 dark:text-neutral-400">目标月底 ADB</p>
                      <p className="mt-1 font-semibold text-neutral-900 dark:text-white">{formatMoney(calculation.targetAdb)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  转账金额等于当前账户余额减去余下日期所需的每日余额。
                </p>
              )}
            </SettingsCardBody>
          </SettingsCard>

          {calculation ? (
            <SettingsCard>
              <SettingsCardHeader title="计算明细" description="用于得出转账建议的计算数据。" />
              <SettingsCardBody>
                <dl className="divide-y divide-black/10 text-sm dark:divide-white/10">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">上月 ADB 基准</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.baselineAdb)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">目标累计余额（{calculation.daysInMonth} 天）</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.targetCumulativeBalance)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">已累计余额（{calculation.daysElapsed} 天）</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.accumulatedBalance)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-neutral-600 dark:text-neutral-300">余下日期所需总余额</dt>
                    <dd className="font-medium text-neutral-900 dark:text-white">{formatMoney(calculation.requiredRemainingBalance)}</dd>
                  </div>
                </dl>
              </SettingsCardBody>
            </SettingsCard>
          ) : null}
        </div>
      </div>

      <aside className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        这是用于规划的计算结果。它假设显示的 ADB 已包含转账日期前一天的余额、转账会计入转账当天的余额，并且之后不再发生余额变动。转账前请确认 OCBC 适用的 ADB 计算时间和交易截止时间。
      </aside>
    </main>
  );
}
