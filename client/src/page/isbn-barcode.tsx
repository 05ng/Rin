import JsBarcode from "jsbarcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { type BarcodeStandard, getBarcodeValue, parseIsbn } from "../utils/isbn";

const barcodeStandards: Array<{ value: BarcodeStandard; label: string }> = [
  { value: "EAN13", label: "EAN-13 (ISBN Bookland)" },
  { value: "CODE128", label: "Code 128" },
  { value: "CODE39", label: "Code 39" },
];

export function IsbnBarcodePage() {
  const siteConfig = useSiteConfig();
  const { i18n } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [value, setValue] = useState("");
  const [standard, setStandard] = useState<BarcodeStandard>("EAN13");
  const [generationError, setGenerationError] = useState(false);
  const isChinese = i18n.resolvedLanguage === "zh-CN";
  const isbn = useMemo(() => parseIsbn(value), [value]);
  const barcodeValue = isbn ? getBarcodeValue(isbn, standard) : null;

  const copy = isChinese
    ? {
        title: "ISBN 条形码",
        description: "验证 ISBN 并以所选的条形码标准生成条形码。",
        isbnLabel: "ISBN",
        isbnHint: "支持有效的 ISBN-10 或 ISBN-13，可包含空格或连字符。",
        standardLabel: "条形码标准",
        invalid: "请输入有效的 ISBN-10 或 ISBN-13。",
        ready: "已生成条形码。",
        error: "暂时无法生成条形码，请检查 ISBN 和所选标准。",
        eanHint: "EAN-13 会将有效的 ISBN-10 转换为 978 开头的 Bookland 条码。",
        download: "下载条形码",
        privacy: "本网站不会储存任何信息或生成的条形码。",
      }
    : {
        title: "ISBN Barcode",
        description: "Validate an ISBN and generate a barcode in your chosen standard.",
        isbnLabel: "ISBN",
        isbnHint: "Enter a valid ISBN-10 or ISBN-13. Spaces and hyphens are accepted.",
        standardLabel: "Barcode standard",
        invalid: "Enter a valid ISBN-10 or ISBN-13.",
        ready: "Your barcode is ready.",
        error: "We could not generate the barcode. Check the ISBN and selected standard.",
        eanHint: "EAN-13 converts a valid ISBN-10 into its 978-prefixed Bookland barcode.",
        download: "Download barcode",
        privacy: "This website does not save any information or generated barcodes.",
      };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (!barcodeValue) {
      svg.replaceChildren();
      setGenerationError(false);
      return;
    }

    try {
      JsBarcode(svg, barcodeValue, {
        format: standard,
        displayValue: true,
        fontOptions: "bold",
        height: 120,
        lineColor: "#171717",
        margin: 12,
        width: 2,
      });
      setGenerationError(false);
    } catch {
      svg.replaceChildren();
      setGenerationError(true);
    }
  }, [barcodeValue, standard]);

  const hasValue = value.trim().length > 0;
  const message = !hasValue ? copy.isbnHint : !isbn ? copy.invalid : generationError ? copy.error : copy.ready;

  function downloadBarcode() {
    const svg = svgRef.current;
    if (!svg || !barcodeValue) return;

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `isbn-barcode-${barcodeValue}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-4">
      <Helmet>
        <title>{`${copy.title} - ${siteConfig.name}`}</title>
      </Helmet>

      <section>
        <p className="text-sm font-medium text-theme">{isChinese ? "实用工具" : "Utility"}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">{copy.title}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">{copy.description}</p>
      </section>

      <section className="grid gap-5 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-dark">
        <label className="block" htmlFor="isbn">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{copy.isbnLabel}</span>
          <input
            id="isbn"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-neutral-900 transition-colors placeholder:text-neutral-400 focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 dark:bg-dark dark:text-white dark:focus:border-white/20"
            inputMode="text"
            placeholder="978-0-306-40615-7"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>

        <label className="block" htmlFor="barcode-standard">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{copy.standardLabel}</span>
          <select
            id="barcode-standard"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-neutral-900 transition-colors focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 dark:bg-dark dark:text-white dark:focus:border-white/20"
            value={standard}
            onChange={(event) => setStandard(event.target.value as BarcodeStandard)}
          >
            {barcodeStandards.map((barcodeStandard) => (
              <option key={barcodeStandard.value} value={barcodeStandard.value}>
                {barcodeStandard.label}
              </option>
            ))}
          </select>
        </label>

        <p className={`text-sm ${hasValue && !isbn ? "text-rose-600 dark:text-rose-300" : "text-neutral-500 dark:text-neutral-400"}`}>{message}</p>
        {standard === "EAN13" ? <p className="text-sm text-neutral-500 dark:text-neutral-400">{copy.eanHint}</p> : null}
      </section>

      {isbn && !generationError ? (
        <section className="flex flex-col items-center rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-dark">
          <svg ref={svgRef} aria-label={`${copy.title}: ${barcodeValue}`} className="w-full max-w-xl overflow-visible" role="img" />
          <button
            className="mt-5 rounded-full bg-theme px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            type="button"
            onClick={downloadBarcode}
          >
            {copy.download}
          </button>
          <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{copy.privacy}</p>
        </section>
      ) : (
        <svg ref={svgRef} className="hidden" aria-hidden="true" />
      )}
    </main>
  );
}
