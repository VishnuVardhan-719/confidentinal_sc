import { z } from "zod";
import { fail, ok, type ApiResult } from "@/lib/api/result";
import type { AuthApi } from "./api";
import { createJsonClient, toApiResult, validateInput, type HttpAdapterOptions } from "./http-client";
import { isRole, localeSchema, type Role } from "./roles";
import { loginSchema, otpVerifySchema, signupSchema } from "./schemas";
import type { Identity, Session, SessionTokens, Workspace } from "./types";

/**
 * HTTP adapter for AuthApi. Endpoints: I01 `task/I01-auth-rls` route handlers
 * (`/api/auth/signup|login|refresh|logout|me`). Phone OTP has no contract yet, so OTP
 * methods return `gated` (logged in docs/frontend/REQUESTS.md). No speculative endpoints.
 */

const meResponseSchema = z.object({
  profile: z.object({
    id: z.uuid(),
    display_name: z.string().max(100),
    locale: localeSchema,
    version: z.int().positive(),
  }),
  roles: z.array(z.string()).max(50),
});

const tokensResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.int().nullable().optional(),
});

const signupResponseSchema = z.object({ status: z.literal("signup_received") });
const logoutResponseSchema = z.object({ status: z.literal("signed_out") });

/**
 * I01 `identity_roles()` returns 'patient' for any active account and a provider category
 * only when approved+active+publishable (I02). It does not report questionnaire completion,
 * so the patient workspace is `unknown` (fail closed) until the server says otherwise.
 */
export function identityFromMe(me: z.infer<typeof meResponseSchema>): Identity {
  const roles = [...new Set(me.roles.filter(isRole))] as Role[];
  const workspaces: Workspace[] = roles.map((role) =>
    role === "patient"
      ? { role, state: "unknown" }
      : role === "admin"
        ? { role, state: "active" }
        : { role, state: "active", providerStatus: "active" },
  );
  return { userId: me.profile.id, displayName: me.profile.display_name, locale: me.profile.locale, workspaces };
}

const toTokens = (t: z.infer<typeof tokensResponseSchema>): SessionTokens => ({
  accessToken: t.accessToken,
  refreshToken: t.refreshToken,
  expiresAt: t.expiresAt ?? null,
});

export function createHttpAuthApi(options: HttpAdapterOptions = {}): AuthApi {
  const client = createJsonClient(options);

  return {
    async getSession(): Promise<ApiResult<Session>> {
      const result = await client.request({ method: "GET", path: "/api/auth/me", schema: meResponseSchema });
      if (result.ok) return ok({ kind: "authenticated", identity: identityFromMe(result.data) });
      if (result.error.code === "unauthenticated") return ok({ kind: "anonymous" });
      if (result.error.code === "forbidden" && result.serverCode === "inactive_account") {
        return ok({ kind: "restricted", reason: "account_disabled" });
      }
      return toApiResult(result);
    },

    async signup(input) {
      const valid = validateInput(signupSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.method === "phone_otp") return fail("gated");
      // Only credentials are sent. Role intent and consent never become server claims here.
      const result = await client.request({
        method: "POST",
        path: "/api/auth/signup",
        body: { email: valid.data.email, password: valid.data.password },
        schema: signupResponseSchema,
        auth: false,
      });
      return result.ok ? ok({ kind: "received" }) : toApiResult(result);
    },

    async verifyOtp(input) {
      const valid = validateInput(otpVerifySchema, input);
      if (!valid.ok) return valid.result;
      return fail("gated");
    },

    async resendOtp() {
      return fail("gated");
    },

    async login(input) {
      const valid = validateInput(loginSchema, input);
      if (!valid.ok) return valid.result;
      if (valid.data.method === "phone_otp") return fail("gated");
      const result = await client.request({
        method: "POST",
        path: "/api/auth/login",
        body: { email: valid.data.email, password: valid.data.password },
        schema: tokensResponseSchema,
        auth: false,
      });
      return result.ok ? ok({ kind: "signed_in", session: toTokens(result.data) }) : toApiResult(result);
    },

    async refresh(refreshToken) {
      const valid = validateInput(z.string().min(1).max(8192), refreshToken);
      if (!valid.ok) return valid.result;
      const result = await client.request({
        method: "POST",
        path: "/api/auth/refresh",
        body: { refreshToken: valid.data },
        schema: tokensResponseSchema,
        auth: false,
      });
      return result.ok ? ok(toTokens(result.data)) : toApiResult(result);
    },

    async logout() {
      const result = await client.request({ method: "POST", path: "/api/auth/logout", schema: logoutResponseSchema });
      return result.ok ? ok({ status: "signed_out" }) : toApiResult(result);
    },
  };
}
