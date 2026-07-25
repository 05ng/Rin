import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { authMiddleware } from "../hono-middleware";
import type { Variables } from "../hono-types";
import { cleanupTestDB, createMockDB, createMockEnv } from "../../../tests/fixtures";
import type { Database } from "bun:sqlite";

describe("authMiddleware", () => {
  let db: ReturnType<typeof createMockDB>["db"];
  let sqlite: Database;

  beforeEach(() => {
    const mockDB = createMockDB();
    db = mockDB.db;
    sqlite = mockDB.sqlite;
    sqlite.exec(
      "INSERT INTO users (id, username, openid, avatar, permission) VALUES (1, 'admin', 'admin', '', 1)",
    );
  });

  afterEach(() => {
    cleanupTestDB(sqlite);
  });

  it("does not treat an MFA challenge as an authenticated admin session", async () => {
    const env = Object.assign(createMockEnv(), {
      ADMIN_TOTP_SECRET: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    });
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use("*", async (c, next) => {
      c.set("db", db as any);
      c.set("jwt", {
        sign: async () => "unused",
        verify: async () => ({
          id: 1,
          purpose: "admin-mfa",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      });
      c.set("admin", false);
      c.set("env", c.env);
      await next();
    });
    app.use("*", authMiddleware);
    app.get("/", (c) => c.json({ admin: c.get("admin"), uid: c.get("uid") }));

    const response = await app.request("/", {
      headers: { Authorization: "Bearer pending" },
    }, env);

    await expect(response.json()).resolves.toEqual({ admin: false });
  });
});