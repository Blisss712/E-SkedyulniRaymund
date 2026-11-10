import type { Session, User } from "@supabase/supabase-js"

export type UserRole = "member" | "admin"

export type UserProfile = {
  id: string
  email: string
  fullName: string
  role: UserRole
  active: boolean
}

export type SocialProvider = "google" | "facebook" | "apple"

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

/** Input for turning a normal email/password member account into an administrator. */
export type AdminPromotionInput = {
  /** Administrator setup code stored in public.admin_settings. */
  code: string
  /** Optional admin username; defaults to the email local part. */
  username?: string
  /** Email/password of the member account when nobody is signed in yet. */
  email?: string
  password?: string
}

export type AdminPromotionResult = {
  ok: boolean
  error?: string
  profile?: UserProfile
}

export type AuthContextType = {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  loading: boolean
  needsName: boolean
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; profile?: UserProfile }>
  signInAsAdmin: (
    identifier: string,
    password: string,
  ) => Promise<{
    ok: boolean
    error?: string
    profile?: UserProfile
    notAdmin?: boolean
    email?: string
  }>
  promoteToAdmin: (input: AdminPromotionInput) => Promise<AdminPromotionResult>
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: boolean; error?: string; profile?: UserProfile }>
  signInWithProvider: (
    provider: SocialProvider,
  ) => Promise<{ ok: boolean; error?: string }>
  signInWithPhone: (
    phone: string,
  ) => Promise<{ ok: boolean; error?: string; message?: string }>
  verifyPhoneOtp: (
    phone: string,
    token: string,
  ) => Promise<{ ok: boolean; error?: string; profile?: UserProfile }>
  signOut: () => Promise<void>
}
