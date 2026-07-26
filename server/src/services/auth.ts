import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext, Variables } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { setJWTCookie } from "../core/hono-middleware";
import {
  clearMfaChallengeCookie,
  createAccessToken,
  getAdminTotpSecret,
  getMfaChallengeUserId,
  isAdminMfaEnabled,
  setMfaChallengeCookie,
} from "../utils/admin-mfa";
import { verifyTotp } from "../utils/totp";
import { users } from "../db/schema";
import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
} from "../errors";

type AuthenticatedUser = {
  id: number;
  username: string;
  avatar: string | null;
  permission: number | null;
};

// Hash password using SHA-256
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function finishLogin(c: AppContext, user: AuthenticatedUser) {
  const token = await profileAsync(c, "auth_access_token", () =>
    createAccessToken(c.get("jwt"), user.id),
  );
  setJWTCookie(c, token);

  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      permission: user.permission === 1,
    },
  });
}

async function startMfaChallenge(c: AppContext, userId: number) {
  await profileAsync(c, "auth_mfa_challenge", () => setMfaChallengeCookie(c, userId));
  return c.json({ success: false, mfaRequired: true });
}

export function PasswordAuthService(): Hono<{
  Bindings: Env;
  Variables: Variables;
}> {
  const app = new Hono<{
    Bindings: Env;
    Variables: Variables;
  }>();

  app.post("/login", async (c: AppContext) => {
    const db = c.get("db");
    const env = c.env;
    const adminUsername = env.ADMIN_USERNAME;
    const adminPassword = env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      throw new BadRequestError("Admin credentials not configured");
    }

    const { username, password } = (await profileAsync(c, "auth_login_parse", () =>
      c.req.json(),
    )) as { username: string; password: string };

    if (!username || !password) {
      throw new BadRequestError("Username and password are required");
    }

    const hashedPassword = await profileAsync(c, "auth_login_hash", () => hashPassword(password));

    if (username === adminUsername) {
      const expectedHash = await profileAsync(c, "auth_admin_hash", () =>
        hashPassword(adminPassword),
      );

      if (hashedPassword !== expectedHash) {
        throw new ForbiddenError("Invalid credentials");
      }

      let user = await profileAsync(c, "auth_admin_lookup", () =>
        db.query.users.findFirst({ where: eq(users.openid, "admin") }),
      );

      if (!user) {
        const result = await profileAsync(c, "auth_admin_insert", () =>
          db
            .insert(users)
            .values({
              username: adminUsername,
              openid: "admin",
              avatar: "",
              permission: 1,
              password: expectedHash,
            })
            .returning({ insertedId: users.id }),
        );

        if (!result || result.length === 0) {
          throw new InternalServerError("Failed to create admin user");
        }

        user = await profileAsync(c, "auth_admin_reload", () =>
          db.query.users.findFirst({ where: eq(users.id, result[0].insertedId) }),
        );
      }

      if (!user) {
        throw new InternalServerError("Failed to get admin user");
      }

      if (user.password !== expectedHash) {
        await profileAsync(c, "auth_admin_sync", () =>
          db
            .update(users)
            .set({ password: expectedHash, username: adminUsername })
            .where(eq(users.id, user.id)),
        );
      }

      if (isAdminMfaEnabled(env)) {
        return startMfaChallenge(c, user.id);
      }

      return finishLogin(c, user);
    }

    const user = await profileAsync(c, "auth_user_lookup", () =>
      db.query.users.findFirst({ where: eq(users.username, username) }),
    );

    if (!user || !user.password || user.password !== hashedPassword) {
      throw new ForbiddenError("Invalid credentials");
    }

    if (user.permission === 1 && isAdminMfaEnabled(env)) {
      return startMfaChallenge(c, user.id);
    }

    return finishLogin(c, user);
  });

  app.post("/mfa/verify", async (c: AppContext) => {
    const db = c.get("db");
    const secret = getAdminTotpSecret(c.env);

    if (!secret) {
      throw new BadRequestError("Admin MFA is not configured");
    }

    const { code } = (await profileAsync(c, "auth_mfa_parse", () =>
      c.req.json(),
    )) as { code?: unknown };
    if (typeof code !== "string") {
      throw new BadRequestError("Authentication code is required");
    }

    const userId = await profileAsync(c, "auth_mfa_challenge_verify", () =>
      getMfaChallengeUserId(c),
    );
    if (!userId) {
      clearMfaChallengeCookie(c);
      throw new ForbiddenError("MFA challenge expired. Sign in again.");
    }

    const user = await profileAsync(c, "auth_mfa_user_lookup", () =>
      db.query.users.findFirst({ where: eq(users.id, userId) }),
    );
    if (!user || user.permission !== 1) {
      clearMfaChallengeCookie(c);
      throw new ForbiddenError("MFA is only available for administrator accounts");
    }

    const validCode = await profileAsync(c, "auth_mfa_totp_verify", () =>
      verifyTotp(secret, code),
    );
    if (!validCode) {
      throw new ForbiddenError("Invalid authentication code");
    }

    clearMfaChallengeCookie(c);
    return finishLogin(c, user);
  });

  app.get("/status", async (c: AppContext) => {
    const env = c.env;

    return c.json({
      github: !!(env.RIN_GITHUB_CLIENT_ID && env.RIN_GITHUB_CLIENT_SECRET),
      google: !!(env.RIN_GOOGLE_CLIENT_ID && env.RIN_GOOGLE_CLIENT_SECRET),
      mfa: isAdminMfaEnabled(env),
      password: !!(env.ADMIN_USERNAME && env.ADMIN_PASSWORD),
    });
  });

  return app;
}