import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanupTestDB, setupTestApp, type TestContext } from "../../../tests/fixtures";
import { MyIpService } from "../my-ip";

describe("MyIpService", () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTestApp(MyIpService);
  });

  afterEach(() => {
    cleanupTestDB(context.sqlite);
  });

  it("returns the IP provided by Cloudflare and prevents caching", async () => {
    const response = await context.app.request("http://localhost/", {
      headers: { "CF-Connecting-IP": "203.0.113.42" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = (await response.json()) as { ip: string | null };
    expect(data.ip).toBe("203.0.113.42");
  });

  it("uses the first forwarded IP when Cloudflare does not provide one", async () => {
    const response = await context.app.request("http://localhost/", {
      headers: { "X-Forwarded-For": "203.0.113.42, 198.51.100.10" },
    });

    const data = (await response.json()) as { ip: string | null };
    expect(data.ip).toBe("203.0.113.42");
  });

  it("reports an unavailable IP when the request has no client IP headers", async () => {
    const response = await context.app.request("http://localhost/");

    const data = (await response.json()) as { ip: string | null };
    expect(data.ip).toBeNull();
  });
});
