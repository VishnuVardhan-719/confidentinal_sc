import type { ApiResult } from "@/lib/api/result";
import type { LoginInput, LoginOutcome, OtpChallenge, OtpVerifyInput, SignupInput, SignupOutcome } from "./schemas";
import type { Session, SessionTokens } from "./types";

/**
 * Identity module API. UI code talks only to this interface; adapters live in
 * http.ts (real `/api/auth/*`) and fixture.ts (synthetic). Inputs are re-validated
 * at runtime by every adapter, so casting around the types does not bypass rules.
 */
export interface AuthApi {
  /** Current session view model. Anonymous on 401; restricted on disabled account. */
  getSession(): Promise<ApiResult<Session>>;
  signup(input: SignupInput): Promise<ApiResult<SignupOutcome>>;
  verifyOtp(input: OtpVerifyInput): Promise<ApiResult<{ kind: "verified"; session: SessionTokens }>>;
  resendOtp(challengeId: string): Promise<ApiResult<OtpChallenge>>;
  /** SERVER-ONLY caller: the outcome may contain bearer tokens. */
  login(input: LoginInput): Promise<ApiResult<LoginOutcome<SessionTokens>>>;
  /** SERVER-ONLY caller. */
  refresh(refreshToken: string): Promise<ApiResult<SessionTokens>>;
  logout(): Promise<ApiResult<{ status: "signed_out" }>>;
}
