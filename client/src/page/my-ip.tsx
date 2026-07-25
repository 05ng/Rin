import { API_PATHS, type MyIpResponse } from "@rin/api";
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSiteConfig } from "../hooks/useSiteConfig";

type IpStatus = "loading" | "ready" | "unavailable" | "error";

export function MyIpPage() {
  const siteConfig = useSiteConfig();
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<IpStatus>("loading");
  const [ip, setIp] = useState<string | null>(null);
  const isChinese = i18n.resolvedLanguage === "zh-CN";

  const copy = isChinese
    ? {
        title: "我的 IP",
        description: "查看此设备当前的公网 IP 地址。",
        loading: "正在读取你的 IP 地址…",
        unavailable: "暂时无法读取你的 IP 地址。",
        error: "读取你的 IP 地址时发生错误。",
        privacy: "此工具不会储存或分享你的 IP 地址。",
      }
    : {
        title: "My IP",
        description: "See the public IP address currently used by this device.",
        loading: "Finding your IP address…",
        unavailable: "Your IP address is not available.",
        error: "We could not retrieve your IP address.",
        privacy: "This tool does not store or share your IP address.",
      };

  useEffect(() => {
    let cancelled = false;

    async function loadIp() {
      try {
        const response = await fetch(API_PATHS.MY_IP, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`IP lookup failed with ${response.status}`);

        const data = (await response.json()) as MyIpResponse;
        if (cancelled) return;

        setIp(data.ip);
        setStatus(data.ip ? "ready" : "unavailable");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void loadIp();
    return () => {
      cancelled = true;
    };
  }, []);

  const message = status === "loading" ? copy.loading : status === "unavailable" ? copy.unavailable : copy.error;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-4">
      <Helmet>
        <title>{`${copy.title} - ${siteConfig.name}`}</title>
      </Helmet>

      <section>
        <p className="text-sm font-medium text-theme">{isChinese ? "网络工具" : "Network tool"}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">{copy.title}</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">{copy.description}</p>
      </section>

      <section className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-dark">
        {status === "ready" && ip ? (
          <p className="break-all font-mono text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">{ip}</p>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-300">{message}</p>
        )}
      </section>

      <p className="text-sm text-neutral-500 dark:text-neutral-400">{copy.privacy}</p>
    </main>
  );
}
