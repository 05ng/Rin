import { SettingsBadge, SettingsCard, SettingsCardBody, SettingsCardHeader } from "@rin/ui";
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import ReactLoading from "react-loading";
import type { CloudflareUsageMetric, CloudflareUsageProduct } from "../api/client";
import { client } from "../app/runtime";
import { useSiteConfig } from "../hooks/useSiteConfig";

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(Math.round(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${formatNumber(value)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size = size / 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(size)} ${units[unitIndex]}`;
}

function formatUsageValue(metric: CloudflareUsageMetric, value: number | null, unavailable: string) {
  if (value === null) return unavailable;
  if (metric.unit === "bytes") return formatBytes(value);
  return formatNumber(value);
}

function toneFromStatus(status: CloudflareUsageMetric["status"] | CloudflareUsageProduct["status"]) {
  if (status === "danger") return "danger";
  if (status === "warning") return "warning";
  if (status === "success") return "success";
  return "default";
}

function badgeToneFromStatus(status: CloudflareUsageMetric["status"] | CloudflareUsageProduct["status"]) {
  if (status === "success") return "success";
  if (status === "warning" || status === "danger") return "warning";
  return "neutral";
}

function UsageMetricRow({ metric }: { metric: CloudflareUsageMetric }) {
  const { t } = useTranslation();
  const percentage = metric.percentage ?? 0;

  return (
    <div className="rounded-lg border border-black/5 p-4 dark:border-white/5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold t-primary">{metric.label}</p>
            <SettingsBadge tone={badgeToneFromStatus(metric.status)}>
              {t(`cloudflare_usage.status.${metric.status}`)}
            </SettingsBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{metric.description}</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm font-semibold t-primary">
            {formatUsageValue(metric, metric.used, t("cloudflare_usage.unavailable"))} / {formatUsageValue(metric, metric.limit, t("cloudflare_usage.unavailable"))}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t(`cloudflare_usage.period.${metric.period}`)}
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
        <div
          className={`h-full rounded-full ${
            metric.status === "danger"
              ? "bg-rose-500"
              : metric.status === "warning"
                ? "bg-amber-500"
                : metric.status === "success"
                  ? "bg-emerald-500"
                  : "bg-neutral-300 dark:bg-neutral-700"
          }`}
          style={{ width: `${metric.percentage === null ? 0 : Math.max(2, Math.min(100, percentage))}%` }}
        />
      </div>
    </div>
  );
}

function UsageProductCard({ product }: { product: CloudflareUsageProduct }) {
  const { t } = useTranslation();

  return (
    <SettingsCard tone={toneFromStatus(product.status)}>
      <SettingsCardHeader
        title={product.title}
        description={product.summary}
        badge={<SettingsBadge tone={badgeToneFromStatus(product.status)}>{t(`cloudflare_usage.status.${product.status}`)}</SettingsBadge>}
      />
      <SettingsCardBody>
        {product.details.length ? (
          <ul className="mb-4 space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {product.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-3">
          {product.metrics.map((metric) => (
            <UsageMetricRow key={metric.id} metric={metric} />
          ))}
        </div>
      </SettingsCardBody>
    </SettingsCard>
  );
}

export function CloudflareUsagePage() {
  const { t } = useTranslation();
  const siteConfig = useSiteConfig();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [accountConfigured, setAccountConfigured] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [products, setProducts] = useState<CloudflareUsageProduct[]>([]);

  useEffect(() => {
    client.config
      .getCloudflareUsage()
      .then(({ data, error }) => {
        if (error) {
          setError(error.value);
          return;
        }
        if (data) {
          setGeneratedAt(data.generatedAt);
          setCredentialsConfigured(data.credentialsConfigured);
          setAccountConfigured(data.accountConfigured);
          setTokenConfigured(data.tokenConfigured);
          setErrors(Array.isArray(data.errors) ? data.errors : []);
          setProducts(Array.isArray(data.products) ? data.products : []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        acc[product.status] += 1;
        return acc;
      },
      { success: 0, warning: 0, danger: 0, unavailable: 0 },
    );
  }, [products]);

  return (
    <div className="flex w-full flex-col gap-4">
      <Helmet>
        <title>{`${t("cloudflare_usage.title")} - ${siteConfig.name}`}</title>
      </Helmet>

      <div className="grid gap-4 md:grid-cols-4">
        <SettingsCard tone={credentialsConfigured ? "success" : "warning"}>
          <SettingsCardHeader
            title={credentialsConfigured ? t("cloudflare_usage.credentials.ready") : t("cloudflare_usage.credentials.missing")}
            description={t("cloudflare_usage.credentials.description", {
              account: accountConfigured ? t("cloudflare_usage.credentials.present") : t("cloudflare_usage.credentials.absent"),
              token: tokenConfigured ? t("cloudflare_usage.credentials.present") : t("cloudflare_usage.credentials.absent"),
            })}
          />
        </SettingsCard>
        <SettingsCard tone="success">
          <SettingsCardHeader title={String(summary.success)} description={t("cloudflare_usage.summary.success")} />
        </SettingsCard>
        <SettingsCard tone="warning">
          <SettingsCardHeader title={String(summary.warning + summary.unavailable)} description={t("cloudflare_usage.summary.watch")} />
        </SettingsCard>
        <SettingsCard tone="danger">
          <SettingsCardHeader title={String(summary.danger)} description={t("cloudflare_usage.summary.danger")} />
        </SettingsCard>
      </div>

      {generatedAt ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t("cloudflare_usage.generated_at", { date: new Date(generatedAt).toLocaleString() })}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 py-8 text-sm text-neutral-500 dark:text-neutral-400">
          <ReactLoading width="1.25em" height="1.25em" type="spin" color="#FC466B" />
          <span>{t("cloudflare_usage.loading")}</span>
        </div>
      ) : null}

      {error ? (
        <SettingsCard tone="danger">
          <SettingsCardHeader title={t("cloudflare_usage.load_failed")} description={error} />
        </SettingsCard>
      ) : null}

      {!loading && !error && errors.length > 0 ? (
        <SettingsCard tone="warning">
          <SettingsCardHeader title={t("cloudflare_usage.partial_title")} description={t("cloudflare_usage.partial_description")} />
          <SettingsCardBody>
            <ul className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              {errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SettingsCardBody>
        </SettingsCard>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {products.map((product) => (
            <UsageProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
