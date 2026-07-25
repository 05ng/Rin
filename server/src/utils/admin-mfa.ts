import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext, JWTUtils } from "../core/hono-types";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const MFA_CHALLENGE_TTL_SECONDS = 60 * 5;
const MFA_CHALLENGE_COOKIE = "mfa_pending";

type MfaChallenge = {
  id: number;
  purpose: "admin-mfa";
  exp: number;
};

type MfaEnvironment = object;

export function getAdminTotpSecret(env: MfaEnvironment): string | null {
  const value = Reflect.get(env, "ADMIN_TOTP_SECRET");
  const secret = typeof value === "string" ? value.trim() : "";
  return secret || null;
}

export function isAdminMfaEnabled(env: MfaEnvironment): boolean {
  return getAdminTotpSecret(env) !== null;
}

export async function createAccessToken(jwt: JWTUtils, userId: number): Promise<string> {
  return jwt.sign({
    id: userId,
    purpose: "access",
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
  });
}

function useSecureCookies(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}
export async function setMfaChallengeCookie(c: AppContext, userId: number): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + MFA_CHALLENGE_TTL_SECONDS;
  const token = await c.get("jwt").sign({
    id: userId,
    purpose: "admin-mfa",
    exp: expiresAt,
  } satisfies MfaChallenge);

  setCookie(c, MFA_CHALLENGE_COOKIE, token, {
    expires: new Date(expiresAt * 1000),
    httpOnly: true,
    maxAge: MFA_CHALLENGE_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure: useSecureCookies(c),
  });
}

export function clearMfaChallengeCookie(c: AppContext): void {
  deleteCookie(c, MFA_CHALLENGE_COOKIE, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: useSecureCookies(c),
  });
}

export async function getMfaChallengeUserId(c: AppContext): Promise<number | null> {
  const token = getCookie(c, MFA_CHALLENGE_COOKIE);
  if (!token) {
    return null;
  }

  const payload = await c.get("jwt").verify(token);
  if (
    !payload ||
    payload.purpose !== "admin-mfa" ||
    !Number.isInteger(payload.id) ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return payload.id;
}

export function isMfaChallengePayload(payload: unknown): payload is MfaChallenge {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<MfaChallenge>;
  return candidate.purpose === "admin-mfa" && Number.isInteger(candidate.id);
}