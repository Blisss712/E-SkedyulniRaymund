import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase, isSupabaseConfigured } from "../../lib/supabase"
import {
  isPlaceholderName,
  type SocialProvider,
  type AuthContextType,
  type UserProfile,
} from "./types"

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function getProviderDisplayName(user: User): string | undefined {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const direct = meta.full_name ?? meta.name ?? meta.given_name
  const value = Array.isArray(direct) ? undefined : direct
  if (typeof value === "string" && value.trim()) {
    return value.trim()
  }
  const firstName =
    typeof meta.first_name === "string" ? (meta.first_name as string).trim() : ""
  const lastName =
    typeof meta.last_name === "string" ? (meta.last_name as string).trim() : ""
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  }
  return undefined
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "")
  if (!cleaned) return ""
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`
  return withPlus
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(
    userId: string,
    userEmail: string,
    metaName?: string,
  ) {
    if (!isSupabaseConfigured) return

    try {
      // 1. Check if user is an admin
      const { data: adminData } = await supabase
        .from("admin_profiles")
        .select("user_id, username, email, full_name, role, active")
        .eq("user_id", userId)
        .maybeSingle()

      if (adminData && adminData.active) {
        const adminProfile: UserProfile = {
          id: adminData.user_id,
          email: adminData.email || userEmail,
          fullName:
            adminData.full_name || adminData.username || "Administrator",
          role: "admin",
          active: true,
        }
        setProfile(adminProfile)
        return adminProfile
      }

      // 2. Check if user is a member
      const { data: memberData } = await supabase
        .from("member_profiles")
        .select("user_id, email, full_name, active")
        .eq("user_id", userId)
        .maybeSingle()

      if (memberData) {
        const memberProfile: UserProfile = {
          id: memberData.user_id,
          email: memberData.email || userEmail,
          fullName:
            memberData.full_name ||
            metaName ||
            userEmail.split("@")[0] ||
            "Member",
          role: "member",
          active: memberData.active,
        }
        setProfile(memberProfile)
        return memberProfile
      }

      // 3. Fallback from user metadata
      const fallbackProfile: UserProfile = {
        id: userId,
        email: userEmail,
        fullName: metaName || userEmail.split("@")[0] || "Member",
        role: "member",
        active: true,
      }
      setProfile(fallbackProfile)
      return fallbackProfile
    } catch (err) {
      console.error("Error fetching user profile:", err)
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    // Get current session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      if (initialSession?.user) {
        const metaName = getProviderDisplayName(initialSession.user)
        fetchProfile(
          initialSession.user.id,
          initialSession.user.email || "",
          metaName,
        )
      }
      setLoading(false)
    })

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession?.user) {
        const metaName = getProviderDisplayName(newSession.user)
        await fetchProfile(
          newSession.user.id,
          newSession.user.email || "",
          metaName,
        )
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithEmail(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      let userProfile: UserProfile | null = null
      if (data.user) {
        const metaName = getProviderDisplayName(data.user)
        userProfile =
          (await fetchProfile(data.user.id, data.user.email || "", metaName)) ||
          null
      }

      return { ok: true, profile: userProfile ?? undefined }
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  async function signInAsAdmin(identifier: string, password: string): Promise<{
    ok: boolean
    error?: string
    profile?: UserProfile
    notAdmin?: boolean
    email?: string
  }> {
    const cleanId = identifier.trim()
    if (!cleanId || !password) {
      return {
        ok: false,
        error: "Enter your admin email or username and password.",
      }
    }

    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    // 2. Resolve username to email if no '@' present
    let emailToUse = cleanId
    if (!cleanId.includes("@")) {
      try {
        const { data: resolvedEmail, error: rpcErr } = await supabase.rpc(
          "get_admin_email",
          {
            p_identifier: cleanId,
          },
        )
        if (!rpcErr && resolvedEmail) {
          emailToUse = resolvedEmail
        } else {
          emailToUse = `${cleanId}@eskedyul.local`
        }
      } catch {
        emailToUse = `${cleanId}@eskedyul.local`
      }
    }

    // 3. Attempt Supabase Auth
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      if (!data.user) {
        return {
          ok: false,
          error: "No user returned from authentication service.",
        }
      }

      // 4. Verify admin role
      const metaName = getProviderDisplayName(data.user)
      const resolvedProfile = await fetchProfile(
        data.user.id,
        data.user.email || emailToUse,
        metaName,
      )

      if (resolvedProfile?.role !== "admin") {
        await supabase.auth.signOut()
        setUser(null)
        setSession(null)
        setProfile(null)
        return {
          ok: false,
          notAdmin: true,
          email: data.user.email || emailToUse,
          error: `Authenticated as ${data.user.email || emailToUse}, but this account does not have administrator privileges in admin_profiles.`,
        }
      }

      return { ok: true, profile: resolvedProfile }
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during admin sign in.",
      }
    }
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      // If Supabase has email confirmation enabled, data.session may be null until confirmed
      if (data.user && !data.session) {
        return {
          ok: true,
          error:
            "Account created! Please check your email inbox to confirm your registration before signing in.",
        }
      }

      if (data.user) {
        await fetchProfile(data.user.id, data.user.email || "", fullName.trim())
      }

      return { ok: true }
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  async function signInWithProvider(
    provider: SocialProvider,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      return { ok: true }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  async function signInWithPhone(
    phone: string,
  ): Promise<{ ok: boolean; error?: string; message?: string }> {
    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    const normalized = normalizePhone(phone)
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      return {
        ok: false,
        error: "Enter a valid phone number with country code, e.g. +63 917 123 4567.",
      }
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: {
          shouldCreateUser: true,
        },
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      return { ok: true, message: "Verification code sent." }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  async function verifyPhoneOtp(
    phone: string,
    token: string,
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: "Authentication is not configured. Add the Supabase environment variables.",
      }
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        type: "sms",
        phone: normalizePhone(phone),
        token: token.trim(),
      })

      if (error) {
        return { ok: false, error: error.message }
      }

      if (!data.user) {
        return {
          ok: false,
          error: "Unable to verify the code. Please try again.",
        }
      }

      const metaName = getProviderDisplayName(data.user)
      const userProfile =
        (await fetchProfile(data.user.id, data.user.email || "", metaName)) || null

      return { ok: true, profile: userProfile ?? undefined }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  async function signOut() {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  const isAdmin = profile?.role === "admin"

  const needsName = Boolean(user && profile && isPlaceholderName(profile.fullName))

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        loading,
        needsName,
        signInWithEmail,
        signInAsAdmin,
        signUpWithEmail,
        signInWithProvider,
        signInWithPhone,
        verifyPhoneOtp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
