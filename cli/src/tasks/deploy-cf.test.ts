import { describe, expect, it } from "bun:test";
import {
  buildWranglerCustomDomainConfig,
  buildWranglerObservabilityConfig,
  buildWranglerQueueConfig,
  buildWranglerTriggersConfig,
  buildWranglerVectorizeConfig,
  buildWranglerWorkflowConfig,
  collectWorkerSecrets,
} from "./deploy-cf";

describe("collectWorkerSecrets", () => {
  it("includes supported non-empty worker secrets", () => {
    const secrets = collectWorkerSecrets({
      CLOUDFLARE_API_TOKEN: "cf-token",
      CLOUDFLARE_ACCOUNT_ID: "cf-account",
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      ADMIN_TOTP_SECRET: "totp-seed",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
      UNUSED: "ignored",
    });

    expect(secrets).toEqual({
      CLOUDFLARE_ACCOUNT_ID: "cf-account",
      JWT_SECRET: "jwt-secret",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "password",
      ADMIN_TOTP_SECRET: "totp-seed",
      RIN_GITHUB_CLIENT_ID: "client-id",
      RIN_GITHUB_CLIENT_SECRET: "client-secret",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
  });

  it("omits empty secret values", () => {
    const secrets = collectWorkerSecrets({
      JWT_SECRET: "",
      ADMIN_USERNAME: undefined,
      ADMIN_PASSWORD: "password",
      ADMIN_TOTP_SECRET: "",
    });

    expect(secrets).toEqual({
      ADMIN_PASSWORD: "password",
    });
  });
});

describe("buildWranglerTriggersConfig", () => {
  it("omits cron triggers for preview deploys", () => {
    expect(buildWranglerTriggersConfig(true)).toBe("");
  });

  it("includes cron triggers for production deploys", () => {
    expect(buildWranglerTriggersConfig(false)).toContain("[triggers]");
    expect(buildWranglerTriggersConfig(false)).toContain('crons = ["*/20 * * * *"]');
  });
});

describe("buildWranglerCustomDomainConfig", () => {
  it("omits custom domains for preview deploys", () => {
    expect(buildWranglerCustomDomainConfig("agenticlife.org", true)).toBe("");
  });

  it("includes apex and www custom domains for production deploys", () => {
    const config = buildWranglerCustomDomainConfig("agenticlife.org", false);

    expect(config).toContain('pattern = "agenticlife.org"');
    expect(config).toContain('pattern = "www.agenticlife.org"');
    expect(config).toContain("custom_domain = true");
  });
});

describe("buildWranglerQueueConfig", () => {
  it("includes queue consumers for preview deploys", () => {
    const config = buildWranglerQueueConfig("rin-preview-tasks", true);
    expect(config).toContain('queue = "rin-preview-tasks"');
    expect(config).toContain("[[queues.consumers]]");
  });

  it("includes queue consumers for production deploys", () => {
    const config = buildWranglerQueueConfig("rin-tasks", false);
    expect(config).toContain("[[queues.producers]]");
    expect(config).toContain("[[queues.consumers]]");
  });
});

describe("buildWranglerObservabilityConfig", () => {
  it("enables invocation logs and disables traces for preview deploys", () => {
    const config = buildWranglerObservabilityConfig(true);
    expect(config).toContain("[observability]");
    expect(config).toContain("[observability.logs]");
    expect(config).toContain("enabled = true");
    expect(config).toContain("invocation_logs = true");
    expect(config).toContain("[observability.traces]");
    expect(config).toContain("enabled = false");
  });

  it("omits observability overrides for production deploys", () => {
    expect(buildWranglerObservabilityConfig(false)).toBe("");
  });
});


describe("buildWranglerVectorizeConfig", () => {
  it("binds the article Vectorize index", () => {
    const config = buildWranglerVectorizeConfig("rin-server-articles");

    expect(config).toContain('binding = "ARTICLE_VECTORIZE"');
    expect(config).toContain('index_name = "rin-server-articles"');
  });
});

describe("buildWranglerWorkflowConfig", () => {
  it("includes SEO and article vectorization workflows", () => {
    const config = buildWranglerWorkflowConfig();

    expect(config).toContain('binding = "SEO_WORKFLOW"');
    expect(config).toContain('class_name = "SEORenderWorkflow"');
    expect(config).toContain('binding = "ARTICLE_VECTORIZE_WORKFLOW"');
    expect(config).toContain('class_name = "ArticleVectorizeWorkflow"');
  });
});
