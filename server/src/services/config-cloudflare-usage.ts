type UsageStatus = "success" | "warning" | "danger" | "unavailable";
type UsagePeriod = "daily" | "monthly";

type ConfigReaderLike = {
  get(key: string): Promise<unknown>;
};

export interface CloudflareUsageMetric {
  id: string;
  label: string;
  description: string;
  unit: string;
  period: UsagePeriod;
  used: number | null;
  limit: number;
  percentage: number | null;
  status: UsageStatus;
}

export interface CloudflareUsageProduct {
  id: "d1" | "r2" | "workers-ai";
  title: string;
  status: UsageStatus;
  configured: boolean;
  summary: string;
  details: string[];
  metrics: CloudflareUsageMetric[];
}

export interface CloudflareUsageResponse {
  generatedAt: string;
  credentialsConfigured: boolean;
  accountConfigured: boolean;
  tokenConfigured: boolean;
  period: {
    dayStart: string;
    monthStart: string;
    end: string;
  };
  products: CloudflareUsageProduct[];
  errors: string[];
}

interface CloudflareAccountUsage {
  d1AnalyticsAdaptiveGroups?: Array<{ sum?: Record<string, unknown> }>;
  r2OperationsAdaptiveGroups?: Array<{
    sum?: { requests?: unknown };
    dimensions?: { actionType?: unknown };
  }>;
  aiInferenceAdaptiveGroups?: Array<{ sum?: { totalNeurons?: unknown } }>;
}

interface CloudflareGraphQLResponse {
  data?: {
    viewer?: {
      accounts?: CloudflareAccountUsage[];
    };
  };
  errors?: Array<{ message?: string }>;
}

const D1_FREE_LIMITS = {
  rowsReadAndWrittenPerDay: 5_000_000,
};

const R2_FREE_LIMITS = {
  classAOperationsPerMonth: 1_000_000,
  classBOperationsPerMonth: 10_000_000,
};

const WORKERS_AI_FREE_LIMITS = {
  neuronsPerDay: 10_000,
};

const R2_CLASS_A_ACTIONS = new Set([
  "PutObject",
  "CopyObject",
  "ListObjects",
  "ListBuckets",
  "CreateMultipartUpload",
  "CompleteMultipartUpload",
  "UploadPart",
]);

const R2_CLASS_B_ACTIONS = new Set([
  "GetObject",
  "HeadObject",
  "UsageSummary",
]);

const USAGE_QUERY = `
  query getUsage($accountId: string, $startOfMonth: string, $startOfDay: string, $end: string) {
    viewer {
      accounts(filter: { accountTag: $accountId }) {
        d1AnalyticsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
          sum {
            readQueries
            writeQueries
            rowsRead
            rowsWritten
          }
        }
        r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfMonth, datetime_leq: $end }) {
          dimensions {
            actionType
          }
          sum {
            requests
          }
        }
        aiInferenceAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
          sum {
            totalNeurons
          }
        }
      }
    }
  }
`;

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumField(groups: Array<{ sum?: Record<string, unknown> }> | undefined, field: string): number {
  return (groups ?? []).reduce((total, group) => total + toNumber(group.sum?.[field]), 0);
}

function metricStatus(used: number | null, limit: number): UsageStatus {
  if (used === null) return "unavailable";
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  if (percentage >= 90) return "danger";
  if (percentage >= 70) return "warning";
  return "success";
}

function createMetric(
  id: string,
  label: string,
  description: string,
  unit: string,
  period: UsagePeriod,
  used: number | null,
  limit: number,
): CloudflareUsageMetric {
  return {
    id,
    label,
    description,
    unit,
    period,
    used,
    limit,
    percentage: used === null || limit <= 0 ? null : Math.min(100, (used / limit) * 100),
    status: metricStatus(used, limit),
  };
}

function productStatus(configured: boolean, metrics: CloudflareUsageMetric[]): UsageStatus {
  if (!configured) return "danger";
  if (metrics.some((metric) => metric.status === "danger")) return "danger";
  if (metrics.some((metric) => metric.status === "warning")) return "warning";
  if (metrics.some((metric) => metric.status === "unavailable")) return "unavailable";
  return "success";
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function getCredentials(env: Env, serverConfig?: ConfigReaderLike) {
  const storedAccountId = serverConfig ? normalizeString(await serverConfig.get("CLOUDFLARE_ACCOUNT_ID")) : undefined;
  const storedApiToken = serverConfig ? normalizeString(await serverConfig.get("CLOUDFLARE_API_TOKEN")) : undefined;

  return {
    accountId: normalizeString(env.CLOUDFLARE_ACCOUNT_ID) ?? storedAccountId,
    apiToken: normalizeString(env.CLOUDFLARE_API_TOKEN) ?? storedApiToken,
  };
}

async function queryCloudflareAnalytics(env: Env, serverConfig: ConfigReaderLike | undefined, now: Date) {
  const { accountId, apiToken } = await getCredentials(env, serverConfig);

  if (!accountId || !apiToken) {
    return { account: null, accountId, apiToken, period: buildPeriod(now) };
  }

  const period = buildPeriod(now);
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: USAGE_QUERY,
      variables: {
        accountId,
        startOfMonth: period.monthStart,
        startOfDay: period.dayStart,
        end: period.end,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare analytics request failed with status ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as CloudflareGraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "Cloudflare GraphQL request failed");
  }

  return {
    account: payload.data?.viewer?.accounts?.[0] ?? null,
    accountId,
    apiToken,
    period,
  };
}

function buildPeriod(now: Date) {
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return {
    dayStart: startOfDay.toISOString(),
    monthStart: startOfMonth.toISOString(),
    end: now.toISOString(),
  };
}

export async function buildCloudflareUsageResponse(
  env: Env,
  serverConfig?: ConfigReaderLike,
  now = new Date(),
): Promise<CloudflareUsageResponse> {
  const errors: string[] = [];
  let result: Awaited<ReturnType<typeof queryCloudflareAnalytics>> = {
    account: null,
    accountId: undefined,
    apiToken: undefined,
    period: buildPeriod(now),
  };

  try {
    result = await queryCloudflareAnalytics(env, serverConfig, now);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const d1Configured = Boolean(env.DB);
  const r2Configured = Boolean(env.R2_BUCKET || env.S3_BUCKET?.trim());
  const workersAiConfigured = Boolean(env.AI && typeof env.AI.run === "function");

  const d1RowsRead = sumField(result.account?.d1AnalyticsAdaptiveGroups, "rowsRead");
  const d1RowsWritten = sumField(result.account?.d1AnalyticsAdaptiveGroups, "rowsWritten");
  const d1Metrics = [
    createMetric(
      "rows-read-written",
      "Rows read and written",
      "D1 row operations since 00:00 UTC.",
      "rows",
      "daily",
      result.account ? d1RowsRead + d1RowsWritten : null,
      D1_FREE_LIMITS.rowsReadAndWrittenPerDay,
    ),
  ];
  const d1Status = productStatus(d1Configured, d1Metrics);

  const r2ClassA = result.account?.r2OperationsAdaptiveGroups?.reduce((total, group) => {
    const action = String(group.dimensions?.actionType ?? "");
    return total + (R2_CLASS_A_ACTIONS.has(action) ? toNumber(group.sum?.requests) : 0);
  }, 0) ?? null;
  const r2ClassB = result.account?.r2OperationsAdaptiveGroups?.reduce((total, group) => {
    const action = String(group.dimensions?.actionType ?? "");
    return total + (R2_CLASS_B_ACTIONS.has(action) ? toNumber(group.sum?.requests) : 0);
  }, 0) ?? null;
  const r2Metrics = [
    createMetric("class-a", "Class A operations", "R2 write/list operations in the current UTC month.", "requests", "monthly", r2ClassA, R2_FREE_LIMITS.classAOperationsPerMonth),
    createMetric("class-b", "Class B operations", "R2 read/head operations in the current UTC month.", "requests", "monthly", r2ClassB, R2_FREE_LIMITS.classBOperationsPerMonth),
  ];
  const r2Status = productStatus(r2Configured, r2Metrics);

  const workersAiNeurons = result.account?.aiInferenceAdaptiveGroups?.reduce((total, group) => total + toNumber(group.sum?.totalNeurons), 0) ?? null;
  const workersAiMetrics = [
    createMetric("neurons", "Workers AI neurons", "Workers AI neuron usage since 00:00 UTC.", "neurons", "daily", workersAiNeurons, WORKERS_AI_FREE_LIMITS.neuronsPerDay),
  ];
  const workersAiStatus = productStatus(workersAiConfigured, workersAiMetrics);

  return {
    generatedAt: now.toISOString(),
    credentialsConfigured: Boolean(result.accountId && result.apiToken),
    accountConfigured: Boolean(result.accountId),
    tokenConfigured: Boolean(result.apiToken),
    period: result.period,
    errors,
    products: [
      {
        id: "d1",
        title: "D1",
        status: d1Status,
        configured: d1Configured,
        summary: d1Configured ? "D1 binding is configured." : "D1 binding is missing.",
        details: [
          `Reads: ${d1RowsRead.toLocaleString()}. Writes: ${d1RowsWritten.toLocaleString()}.`,
        ],
        metrics: d1Metrics,
      },
      {
        id: "r2",
        title: "R2",
        status: r2Status,
        configured: r2Configured,
        summary: r2Configured ? "R2 storage is configured." : "R2 bucket configuration is missing.",
        details: [
          "Class A and Class B operation calculations follow the ticket project's Cloudflare cost API implementation.",
        ],
        metrics: r2Metrics,
      },
      {
        id: "workers-ai",
        title: "Workers AI",
        status: workersAiStatus,
        configured: workersAiConfigured,
        summary: workersAiConfigured ? "Workers AI binding is configured." : "Workers AI binding is missing.",
        details: [
          "Neuron usage is read from Cloudflare aiInferenceAdaptiveGroups.totalNeurons.",
        ],
        metrics: workersAiMetrics,
      },
    ],
  };
}
