import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { PasswordAuthService } from "../auth";
import { generateTotp } from "../../utils/totp";
import {
  createMockDB,
  createMockEnv,
  cleanupTestDB,
} from "../../../tests/fixtures";
import { createTestClient } from "../../../tests/test-api-client";
import type { Database } from "bun:sqlite";
import type { Variables } from "../../core/hono-types";

describe("PasswordAuthService", () => {
  let db: any;
  let sqlite: Database;
  let env: Env;
  let app: Hono<{ Bindings: Env; Variables: Variables }>;
  let api: ReturnType<typeof createTestClient>;
  let issuedTokens: Map<string, Record<string, unknown>>;
  let tokenSequence: number;

  beforeEach(async () => {
    issuedTokens = new Map();
    tokenSequence = 1;
    const mockDB = createMockDB();
    db = mockDB.db;
    sqlite = mockDB.sqlite;
    env = createMockEnv({
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "admin123",
    });

    // Setup Hono app with mock db
    app = new Hono<{ Bindings: Env; Variables: Variables }>();

    // Add middleware to inject test dependencies
    app.use(async (c: any, next: any) => {
      c.set("db", db);
      c.set("jwt", {
        sign: async (payload: Record<string, unknown>) => {
          const token = `mock_token_${payload.id}_${tokenSequence++}`;
          issuedTokens.set(token, payload);
          return token;
        },
        verify: async (token: string) => issuedTokens.get(token) ?? null,
      });
      c.set("env", env);
      await next();
    });

    // Register service with prefix
    app.route('/auth', PasswordAuthService());

    // Add error handler
    app.onError((err: any, c: any) => {
      if (err.code && err.statusCode) {
        return c.json(
          {
            success: false,
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
          },
          err.statusCode,
        );
      }
      return c.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: err.message || "An unexpected error occurred",
          },
        },
        500,
      );
    });

    api = createTestClient(app, env);
  });

  afterEach(() => {
    cleanupTestDB(sqlite);
  });

  describe("POST /auth/login - Login with credentials", () => {
    it("should login with admin credentials", async () => {
      const result = await api.auth.login({
        username: "admin",
        password: "admin123",
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.success).toBe(true);
      expect(result.data?.token).toBeDefined();
      expect(result.data?.user.username).toBe("admin");
      expect(result.data?.user.permission).toBe(true);
    });

    it("should create admin user on first login", async () => {
      // First login - admin user doesn't exist yet
      const result = await api.auth.login({
        username: "admin",
        password: "admin123",
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.success).toBe(true);
      expect(result.data?.user.id).toBeDefined();

      // Verify admin user was created in database
      const dbResult = sqlite.prepare(`SELECT * FROM users WHERE openid = 'admin'`).all() as any[];
      expect(dbResult.length).toBe(1);
      expect(dbResult[0].username).toBe("admin");
      expect(dbResult[0].permission).toBe(1);
    });

    it("should reject invalid admin password", async () => {
      const result = await api.auth.login({
        username: "admin",
        password: "wrongpassword",
      });

      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(403);
      const errorData = result.error?.value as any;
      expect(errorData.error.message).toBe("Invalid credentials");
    });

    it("should login with regular user credentials", async () => {
      // Create a regular user with password
      sqlite.exec(`
        INSERT INTO users (id, username, avatar, openid, password, permission) 
        VALUES (2, 'regularuser', 'avatar.png', 'user_2', '${await hashPassword('userpass')}', 0)
      `);

      const result = await api.auth.login({
        username: "regularuser",
        password: "userpass",
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.success).toBe(true);
      expect(result.data?.user.username).toBe("regularuser");
      expect(result.data?.user.permission).toBe(false);
    });

    it("should reject non-existent user", async () => {
      const result = await api.auth.login({
        username: "nonexistent",
        password: "somepassword",
      });

      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(403);
      const errorData = result.error?.value as any;
      expect(errorData.error.message).toBe("Invalid credentials");
    });

    it("should require username and password", async () => {
      const result = await api.auth.login({
        username: "",
        password: "",
      });

      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(400);
      const errorData = result.error?.value as any;
      expect(errorData.error.message).toBe("Username and password are required");
    });

    it("should return 400 if admin credentials not configured", async () => {
      const envNoCreds = createMockEnv({
        ADMIN_USERNAME: "",
        ADMIN_PASSWORD: "",
      });

      const honoAppNoCreds = new Hono<{
        Bindings: Env;
        Variables: Variables;
      }>();
      honoAppNoCreds.use(async (c: any, next: any) => {
        c.set("db", db);
        c.set("jwt", {
          sign: async (payload: any) => `mock_token_${payload.id}`,
          verify: async (token: string) => {
            const match = token.match(/mock_token_(\d+)/);
            return match ? { id: parseInt(match[1]) } : null;
          },
        });
        c.set("env", envNoCreds);
        await next();
      });

      honoAppNoCreds.route('/auth', PasswordAuthService());

      // Add error handler
      honoAppNoCreds.onError((err: any, c: any) => {
        if (err.code && err.statusCode) {
          return c.json(
            {
              success: false,
              error: {
                code: err.code,
                message: err.message,
                details: err.details,
              },
            },
            err.statusCode,
          );
        }
        return c.json(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: err.message || "An unexpected error occurred",
            },
          },
          500,
        );
      });

      const appNoCreds = {
        ...honoAppNoCreds,
        fetch: (request: Request, env: Env) =>
          honoAppNoCreds.fetch(request, { ...env, DB: db }),
      };

      const apiNoCreds = createTestClient(appNoCreds, envNoCreds);

      const result = await apiNoCreds.auth.login({
        username: "admin",
        password: "admin123",
      });

      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(400);
      const errorData = result.error?.value as any;
      expect(errorData.error.message).toBe("Admin credentials not configured");
    });

    it("should reject user without password", async () => {
      // Create a user without password
      sqlite.exec(`
        INSERT INTO users (id, username, avatar, openid, password, permission) 
        VALUES (3, 'nopassworduser', 'avatar.png', 'user_3', NULL, 0)
      `);

      const result = await api.auth.login({
        username: "nopassworduser",
        password: "anypassword",
      });

      expect(result.error).toBeDefined();
      expect(result.error?.status).toBe(403);
      const errorData = result.error?.value as any;
      expect(errorData.error.message).toBe("Invalid credentials");
    });
  });

  describe("POST /auth/mfa/verify", () => {
    it("requires a valid authenticator code before issuing an admin token", async () => {
      Object.assign(env, { ADMIN_TOTP_SECRET: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" });

      const loginResponse = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" }),
      }, env);
      const loginData = await loginResponse.json() as { success: boolean; mfaRequired?: boolean; token?: string };
      const challengeCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];

      expect(loginData.success).toBe(false);
      expect(loginData.mfaRequired).toBe(true);
      expect(loginData.token).toBeUndefined();
      expect(challengeCookie).toStartWith("mfa_pending=");

      const invalidResponse = await app.request("/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: challengeCookie!,
        },
        body: JSON.stringify({ code: "000000" }),
      }, env);
      expect(invalidResponse.status).toBe(403);

      const code = await generateTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
      const verificationResponse = await app.request("/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: challengeCookie!,
        },
        body: JSON.stringify({ code }),
      }, env);
      const verificationData = await verificationResponse.json() as { success: boolean; token?: string };

      expect(verificationResponse.status).toBe(200);
      expect(verificationData.success).toBe(true);
      expect(verificationData.token).toBeDefined();
    });
  });
  describe("GET /auth/status - Check auth availability", () => {
    it("should return github and password status", async () => {
      const result = await api.auth.status();

      expect(result.error).toBeUndefined();
      expect(result.data?.github).toBe(true); // Has GitHub credentials in env
      expect(result.data?.password).toBe(true); // Has admin credentials
    });

    it("should return false when credentials not configured", async () => {
      const envNoCreds = createMockEnv({
        RIN_GITHUB_CLIENT_ID: "",
        RIN_GITHUB_CLIENT_SECRET: "",
        ADMIN_USERNAME: "",
        ADMIN_PASSWORD: "",
      });

      const honoAppNoCreds = new Hono<{
        Bindings: Env;
        Variables: Variables;
      }>();
      honoAppNoCreds.use(async (c: any, next: any) => {
        c.set("db", db);
        c.set("env", envNoCreds);
        await next();
      });
      honoAppNoCreds.route('/auth', PasswordAuthService());

      // Add error handler
      honoAppNoCreds.onError((err: any, c: any) => {
        if (err.code && err.statusCode) {
          return c.json(
            {
              success: false,
              error: {
                code: err.code,
                message: err.message,
                details: err.details,
              },
            },
            err.statusCode,
          );
        }
        return c.json(
          {
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: err.message || "An unexpected error occurred",
            },
          },
          500,
        );
      });

      // Add fetch method for test client compatibility
      const appNoCreds = {
        ...honoAppNoCreds,
        fetch: (request: Request, env: Env) =>
          honoAppNoCreds.fetch(request, { ...env, DB: db }),
      };

      const apiNoCreds = createTestClient(appNoCreds, envNoCreds);

      const result = await apiNoCreds.auth.status();

      expect(result.error).toBeUndefined();
      expect(result.data?.github).toBe(false);
      expect(result.data?.password).toBe(false);
    });
  });
});

// Hash password using SHA-256
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
