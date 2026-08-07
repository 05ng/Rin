import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();
const getStorageObject = mock();

function installDefaultStorageMock() {
  getStorageObject.mockImplementation(async (env: Env, key: string) => {
    const object = await env.R2_BUCKET?.get(key);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      return new Response(object.body ?? null, {
        headers,
      });
    }

    if (/favicon|originFavicon/.test(key)) {
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Type": "image/webp",
        },
      });
    }

    return null;
  });
}

installDefaultStorageMock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

function getMockStoragePublicUrl(env: Env, key: string, baseUrl?: string) {
  if (env.S3_ACCESS_HOST) {
    return `${env.S3_ACCESS_HOST}/${key}`;
  }

  return `${baseUrl || "http://localhost"}/api/blob/${key}`;
}

function validateMockS3Env(env: Env) {
  if (env.R2_BUCKET) {
    return;
  }

  if (!env.S3_ENDPOINT) {
    throw new Error("S3_ENDPOINT is not defined");
  }
  if (!env.S3_ACCESS_KEY_ID) {
    throw new Error("S3_ACCESS_KEY_ID is not defined");
  }
  if (!env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3_SECRET_ACCESS_KEY is not defined");
  }
  if (!env.S3_BUCKET) {
    throw new Error("S3_BUCKET is not defined");
  }
}

async function putMockStorageObjectAtKey(
  env: Env,
  key: string,
  body: Blob | ArrayBuffer | Uint8Array | string,
  contentType?: string,
  baseUrl?: string,
) {
  if (env.R2_BUCKET) {
    await env.R2_BUCKET.put(key, body, {
      httpMetadata: contentType ? { contentType } : undefined,
    });
  } else {
    validateMockS3Env(env);
  }

  return { key, url: getMockStoragePublicUrl(env, key, baseUrl) };
}

mock.module("../../utils/storage", () => ({
  getStorageObject,
  getStoragePublicUrl: getMockStoragePublicUrl,
  headStorageObject: async () => null,
  putStorageObject: async (
    env: Env,
    key: string,
    body: Blob | ArrayBuffer | Uint8Array | string,
    contentType?: string,
    baseUrl?: string,
  ) => putMockStorageObjectAtKey(env, `${env.S3_FOLDER || ""}${key}`, body, contentType, baseUrl),
  putStorageObjectAtKey: putMockStorageObjectAtKey,
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
    getStorageObject.mockReset();
    installDefaultStorageMock();
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

  it("serves prerendered article HTML to normal users when cached", async () => {
    getStorageObject.mockResolvedValue(new Response("<html>article</html>", {
      headers: {
        "Content-Type": "text/html",
      },
    }));

    const { handleFetch } = await import("../fetch-handler");

    const response = await handleFetch(
      new Request("https://agenticlife.org/welcome"),
      {
        S3_CACHE_FOLDER: "cache/",
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    expect(await response.text()).toBe("<html>article</html>");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300");
    expect(response.headers.get("Vary")).toBeNull();
    expect(response.headers.get("X-Rin-Prerender")).toBe("HIT");
    expect(getStorageObject).toHaveBeenCalledWith(expect.anything(), "cache/welcome");
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


  it("rewrites stale prerendered asset references to the current build assets", async () => {
    getStorageObject.mockResolvedValue(new Response(
      '<!doctype html><html lang="en"><head><script type="module" src="/assets/index-old.js"></script><link rel="stylesheet" href="/assets/index-old.css"></head><body><main>content</main></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    ));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response(
      '<!doctype html><html><head><script type="module" src="/assets/index-new.js"></script><link rel="stylesheet" crossorigin href="/assets/index-new.css"></head><body></body></html>',
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    ));

    const response = await handleFetch(
      new Request("https://agenticlife.org/welcome", {
        headers: {
          "User-Agent": "Twitterbot",
        },
      }),
      {
        S3_CACHE_FOLDER: "cache/",
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      {
        waitUntil: () => {},
        passThroughOnException: () => {},
      } as unknown as ExecutionContext
    );

    const html = await response.text();
    expect(html).toContain('src="/assets/index-new.js"');
    expect(html).toContain('href="/assets/index-new.css"');
    expect(html).not.toContain("index-old");
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


  it("returns 404 when a missing static asset falls through to the SPA shell", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("<html>app shell</html>", {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    }));

    const response = await handleFetch(
      new Request("http://localhost/assets/missing.js"),
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

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("serves the SPA shell for dotted article aliases", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("<html>app shell</html>", {
      status: 200,
      headers: {
        "Content-Type": "text/html",
      },
    }));

    const response = await handleFetch(
      new Request("http://localhost/release.v1"),
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

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>app shell</html>");
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
