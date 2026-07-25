import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";

export function ToolsPage() {
  const siteConfig = useSiteConfig();
  const { i18n } = useTranslation();
  const isChinese = i18n.resolvedLanguage === "zh-CN";

  const copy = isChinese
    ? {
        title: "工具",
        description: "实用的小工具。",
        calculatorTitle: "OCBC 平均每日余额计算器",
        calculatorDescription: "计算今天需要转入或转出的金额，以达到月末目标平均每日余额增幅。",
        open: "打开计算器",
      }
    : {
        title: "Tools",
        description: "Useful tools and calculators.",
        calculatorTitle: "OCBC Average Daily Balance Calculator",
        calculatorDescription: "Calculate the amount to transfer in or out today to reach your target month-end ADB increase.",
        open: "Open calculator",
      };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-4">
      <Helmet>
        <title>{`${copy.title} - ${siteConfig.name}`}</title>
      </Helmet>

      <section>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">{copy.title}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">{copy.description}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/ocbc-adb-calculator"
          className="group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme/10 text-xl text-theme">
              <i className="ri-calculator-line" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-neutral-900 group-hover:text-theme dark:text-white">{copy.calculatorTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{copy.calculatorDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-theme">
                {copy.open}
                <i className="ri-arrow-right-line" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}
