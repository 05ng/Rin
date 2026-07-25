import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
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
        myIpTitle: "我的 IP",
        myIpDescription: "查看此设备当前使用的公网 IP 地址。",
        openMyIp: "查看我的 IP",
        qrCodeTitle: "网站二维码",
        qrCodeDescription: "为有效的网站链接生成静态二维码。",
        openQrCode: "生成二维码",
        isbnBarcodeTitle: "ISBN 条形码",
        isbnBarcodeDescription: "验证 ISBN 并以所选标准生成条形码。",
        openIsbnBarcode: "生成条形码",
      }
    : {
        title: "Tools",
        description: "Useful tools and calculators.",
        calculatorTitle: "OCBC Average Daily Balance Calculator",
        calculatorDescription: "Calculate the amount to transfer in or out today to reach your target month-end ADB increase.",
        open: "Open calculator",
        myIpTitle: "My IP",
        myIpDescription: "View the public IP address currently used by your device.",
        openMyIp: "View my IP",
        qrCodeTitle: "Website QR Code",
        qrCodeDescription: "Generate a static QR code for any valid website link.",
        openQrCode: "Generate QR code",
        isbnBarcodeTitle: "ISBN Barcode",
        isbnBarcodeDescription: "Validate an ISBN and generate a barcode in your chosen standard.",
        openIsbnBarcode: "Generate barcode",
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
        <Link
          href="/my-ip"
          className="group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme/10 text-xl text-theme">
              <i className="ri-global-line" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-neutral-900 group-hover:text-theme dark:text-white">{copy.myIpTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{copy.myIpDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-theme">
                {copy.openMyIp}
                <i className="ri-arrow-right-line" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>
        <Link
          href="/qr-code"
          className="group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme/10 text-xl text-theme">
              <i className="ri-qr-code-line" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-neutral-900 group-hover:text-theme dark:text-white">{copy.qrCodeTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{copy.qrCodeDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-theme">
                {copy.openQrCode}
                <i className="ri-arrow-right-line" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>
        <Link
          href="/isbn-barcode"
          className="group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark"
        >
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-theme/10 text-xl text-theme">
              <i className="ri-barcode-line" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-neutral-900 group-hover:text-theme dark:text-white">{copy.isbnBarcodeTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{copy.isbnBarcodeDescription}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-theme">
                {copy.openIsbnBarcode}
                <i className="ri-arrow-right-line" aria-hidden="true" />
              </span>
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}
