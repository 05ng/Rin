import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";

function getClientIp(headers: Headers): string | null {
  const cloudflareIp = headers.get("cf-connecting-ip");
  if (cloudflareIp) return cloudflareIp;

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export function MyIpService(): Hono {
  const app = new Hono();

  app.get("/", (c: AppContext) => {
    c.header("Cache-Control", "no-store");
    return c.json({ ip: getClientIp(c.req.raw.headers) });
  });

  return app;
}
