import type { Session, User } from "@supabase/supabase-js"

export type UserRole = "member" | "admin"

export type UserProfile = {
  id: string
  email: string
  fullName: string
  role: UserRole
  active: boolean
}

export type AuthContextType = {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  loading: boolean
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
  signUpWithEmail: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}
