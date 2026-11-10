import type { Session, User } from "@supabase/supabase-js"
import type { LeaderMinistry } from "../organizations/leaders"

export type UserRole = "member" | "leader" | "admin"

export type UserProfile = {
  id: string
  email: string
  fullName: string
  role: UserRole
  active: boolean
  /**
   * False until the member has been through the account setup wizard (name +
   * join code). Social sign-ups arrive with their provider name already filled
   * in, so the name alone cannot tell a new account from a returning one.
   */
  onboarded: boolean
  /**
   * The ministries this account coordinates. Empty for ordinary members, and
   * the list the Coordinator Workspace is limited to for a `leader`.
   */
  leaderOrganizations: LeaderMinistry[]
}

export type SocialProvider = "google" | "facebook" | "apple"

/**
 * Why an auth call failed, so the screen can offer the right next step instead
 * of a bare "Invalid login credentials".
 *
 * `invalid_credentials` also covers a Google/Facebook sign-up: Supabase creates
 * those accounts without a password, so the email/password check has nothing to
 * compare against until one is set through the recovery link.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_exists"
  | "rate_limited"
  | "weak_password"
  | "recovery_link_invalid"
  | "unavailable"
  | "unknown"

export type AuthResult = {
  ok: boolean
  error?: string
  code?: AuthErrorCode
  profile?: UserProfile
}

/**
 * Heuristic used to detect whether a signed-in user still lacks a real name
 * (e.g. a first-time Google/Facebook/phone user whose profile only holds an
 * email address or phone-number fallback).
 */
export function isPlaceholderName(name?: string | null): boolean {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return true
  const lower = trimmed.toLowerCase()
  if (lower === "member" || lower === "administrator") return true
  // Multi-word names ("Maria Santos") or capitalized single names ("John")
  // are real names; all-lowercase single tokens usually come from an
  // email/phone local-part fallback.
  const hasSpaceOrCaps = /\s/.test(trimmed) || trimmed !== trimmed.toLowerCase()
  return !hasSpaceOrCaps
}

export type AuthContextType = {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  /** True when the account coordinates at least one ministry. */
  isLeader: boolean
  loading: boolean
  needsName: boolean
  /** Re-reads the profile (and coordinator appointments) from the database. */
  refreshProfile: () => Promise<UserProfile | null>
  /** True while the session came from a "set/reset password" email link. */
  passwordRecovery: boolean
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<AuthResult>
  signInAsAdmin: (
    identifier: string,
    password: string,
  ) => Promise<AuthResult>
  /** The separate leader/coordinator form; only appointed coordinators pass. */
  signInAsCoordinator: (
    email: string,
    password: string,
  ) => Promise<AuthResult>
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<AuthResult>
  signInWithProvider: (
    provider: SocialProvider,
  ) => Promise<{ ok: boolean; error?: string }>
  signInWithPhone: (
    phone: string,
    options?: { createUser?: boolean },
  ) => Promise<{ ok: boolean; error?: string; message?: string }>
  /**
   * Leader/coordinator phone sign-in, step 1: text a code to a number that
   * already belongs to an account. Never creates an account.
   */
  sendCoordinatorPhoneCode: (
    phone: string,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>
  /**
   * Leader/coordinator phone sign-in, step 2: verify the code and require that
   * the account is appointed to a ministry, like the password form does.
   */
  verifyCoordinatorPhoneOtp: (
    phone: string,
    token: string,
  ) => Promise<AuthResult>
  verifyPhoneOtp: (
    phone: string,
    token: string,
  ) => Promise<{ ok: boolean; error?: string; profile?: UserProfile }>
  /**
   * Emails a recovery link. For a Google/Facebook account this is also how the
   * account gains a password, so it can sign in with email afterwards.
   */
  sendPasswordReset: (email: string) => Promise<AuthResult>
  /** Saves the new password for the signed-in recovery session. */
  updatePassword: (password: string) => Promise<AuthResult>
  /** Saves the confirmed name and marks the account setup wizard as finished. */
  completeOnboarding: (fullName: string) => Promise<void>
  signOut: () => Promise<void>
}
