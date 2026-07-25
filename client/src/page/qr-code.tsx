import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { normalizeWebsiteUrl } from "../utils/qr-code";

export function QrCodePage() {
  const siteConfig = useSiteConfig();
  const { i18n } = useTranslation();
  const [value, setValue] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState(false);
  const isChinese = i18n.resolvedLanguage === "zh-CN";
  const normalizedUrl = useMemo(() => normalizeWebsiteUrl(value), [value]);

  const copy = isChinese
    ? {
        title: "网站二维码",
        description: "为网站链接生成静态二维码。",
        label: "网站链接",
        placeholder: "https://example.com",
        hint: "请输入以 http:// 或 https:// 开头的完整网址。",
        invalid: "请输入有效的网站链接，例如 https://example.com。",
        ready: "扫描此二维码即可打开该网站。",
        generating: "正在生成二维码…",
        error: "暂时无法生成二维码，请检查链接后重试。",
        download: "下载二维码",
        static: "二维码直接包含此网址，不使用跳转链接。",
        privacy: "本网站不会储存任何信息或生成的二维码。",
      }
    : {
        title: "Website QR Code",
        description: "Generate a static QR code for a website link.",
        label: "Website link",
        placeholder: "https://example.com",
        hint: "Enter a complete URL that begins with http:// or https://.",
        invalid: "Enter a valid website link, such as https://example.com.",
        ready: "Scan this QR code to open the website.",
        generating: "Generating your QR code…",
        error: "We could not generate the QR code. Check the link and try again.",
        download: "Download QR code",
        static: "The QR code directly encodes this URL and does not use a redirect.",
        privacy: "This website does not save any information or generated QR codes.",
      };

  useEffect(() => {
    let cancelled = false;

    async function generateQrCode() {
      if (!normalizedUrl) {
        setQrCode(null);
        setGenerationError(false);
        return;
      }

      setQrCode(null);
      setGenerationError(false);

      try {
        const dataUrl = await QRCode.toDataURL(normalizedUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 512,
        });
        if (!cancelled) setQrCode(dataUrl);
      } catch {
        if (!cancelled) setGenerationError(true);
      }
    }

    void generateQrCode();
    return () => {
      cancelled = true;
    };
  }, [normalizedUrl]);

  const hasValue = value.trim().length > 0;
  const message = !hasValue
    ? copy.hint
    : !normalizedUrl
      ? copy.invalid
      : generationError
        ? copy.error
        : qrCode
          ? copy.ready
          : copy.generating;

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

      <section className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-dark">
        <label className="block" htmlFor="website-url">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{copy.label}</span>
          <input
            id="website-url"
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2 text-neutral-900 transition-colors placeholder:text-neutral-400 focus:border-black/20 focus:outline-none focus:ring-2 focus:ring-theme/10 dark:border-white/10 dark:bg-dark dark:text-white dark:focus:border-white/20"
            inputMode="url"
            placeholder={copy.placeholder}
            type="url"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <p className={`mt-2 text-sm ${hasValue && !normalizedUrl ? "text-rose-600 dark:text-rose-300" : "text-neutral-500 dark:text-neutral-400"}`}>
          {message}
        </p>
      </section>

      {normalizedUrl ? (
        <section className="flex flex-col items-center rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-dark">
          {qrCode ? <img alt={`${copy.title}: ${normalizedUrl}`} className="w-full max-w-sm rounded-xl" src={qrCode} /> : null}
          {qrCode ? (
            <a
              className="mt-5 inline-flex rounded-full bg-theme px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              download="website-qr-code.png"
              href={qrCode}
            >
              {copy.download}
            </a>
          ) : null}
          <p className="mt-4 break-all text-center text-sm text-neutral-500 dark:text-neutral-400">{copy.static}</p>
          <p className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">{copy.privacy}</p>
        </section>
      ) : null}
    </main>
  );
}
