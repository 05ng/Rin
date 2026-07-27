import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();
const getStorageObject = mock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

mock.module("../../utils/storage", () => ({
  getStorageObject,
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
    getStorageObject.mockReset();
  });

  it("redirects the production apex host from HTTP to HTTPS", async () => {
    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("http://agenticlife.org/about?ref=test"),
      {} as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://agenticlife.org/about?ref=test");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("redirects the www host to the canonical apex host", async () => {
    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("https://www.agenticlife.org/en/about"),
      {} as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://agenticlife.org/en/about");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("uses CANONICAL_HOST when redirecting production hosts", async () => {
    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("https://www.example.com/en/about"),
      {
        CANONICAL_HOST: "example.com",
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("https://example.com/en/about");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("serves prerendered HTML to social link preview crawlers", async () => {
    getStorageObject.mockResolvedValue(new Response("<html>preview</html>", {
      headers: {
        "Content-Type": "text/html",
      },
    }));

    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("https://agenticlife.org/en/about", {
        headers: {
          "User-Agent": "facebookexternalhit/1.1",
        },
      }),
      {
        S3_CACHE_FOLDER: "cache/",
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(await response.text()).toBe("<html>preview</html>");
    expect(response.headers.get("Vary")).toBe("User-Agent");
    expect(getStorageObject).toHaveBeenCalledWith(expect.anything(), "cache/en/about");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("normalizes stale prerendered SEO HTML before serving it", async () => {
    getStorageObject.mockResolvedValue(new Response(
      '<!doctype html><html lang="en"><head><title>Old</title><meta property="og:type" content="article"><meta property="og:site_name" content=""><meta name="og:description" content="desc"><link rel="canonical" href="https://agenticlife.org/en/lumina-tick"></head><body><a href="/en/lumina-tick">Read</a><p>Use <script> tags safely.</script></p></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    ));

    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("https://agenticlife.org/en/lumina-tick", {
        headers: {
          "User-Agent": "Googlebot",
        },
      }),
      {
        S3_CACHE_FOLDER: "cache/",
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('property="og:site_name" content="Agentic Life"');
    expect(html).toContain('property="og:description" content="desc"');
    expect(html).toContain('href="https://agenticlife.org/lumina-tick"');
    expect(html).toContain('href="/lumina-tick"');
    expect(html).toContain("&lt;script> tags safely.&lt;/script>");
  });

  it("serves static assets directly when the asset exists", async () => {
    getAppFetch.mockResolvedValue(new Response("app-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 200 }));

    const response = await handleFetch(
      new Request("http://localhost/assets/app.js"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(await response.text()).toBe("asset-body");
    expect(assetFetch).toHaveBeenCalledTimes(1);
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("routes /api/blob requests to the app before static assets", async () => {
    getAppFetch.mockResolvedValue(new Response("blob-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 404 }));

    const response = await handleFetch(
      new Request("http://localhost/api/blob/images/test.txt"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(await response.text()).toBe("blob-body");
    expect(getAppFetch).toHaveBeenCalledTimes(1);
    expect(assetFetch).toHaveBeenCalledTimes(0);
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/blob/images/test.txt");
  });
});
