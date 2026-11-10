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
import { fetchMyLeaderships, type LeaderMinistry } from "../organizations/leaders"

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * A project that has not run supabase/organization_leaders.sql has no
 * appointments table. That is not an error the member can act on, so it is
 * logged once and treated as "no coordinator assignments" rather than blocking
 * sign-in.
 */
let leadershipLookupWarned = false

async function loadLeaderships(userId: string): Promise<LeaderMinistry[]> {
  try {
    return await fetchMyLeaderships(userId)
  } catch (reason) {
    if (!leadershipLookupWarned) {
      leadershipLookupWarned = true
      console.warn(
        "Coordinator assignments are unavailable. Run supabase/organization_leaders.sql in the Supabase SQL editor to enable ministry coordinators.",
        reason,
      )
    }
    return []
  }
}

/** The `member_profiles` columns this app reads. */
type MemberProfileRow = {
  user_id: string
  email: string | null
  full_name: string | null
  active: boolean
  /** Added by supabase/member_onboarding.sql; absent in older projects. */
  onboarded?: boolean | null
}

const MEMBER_PROFILE_COLUMNS = "user_id, email, full_name, active"
const MEMBER_PROFILE_COLUMNS_WITH_ONBOARDED = `${MEMBER_PROFILE_COLUMNS}, onboarded`

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

/**
 * Whether the account setup wizard (name + group code) has been finished.
 *
 * A social sign-up arrives with the provider's name already filled in, so the
 * name cannot tell a brand-new account from a returning one â€” only a recorded
 * flag can. There are two places to look for it, strongest first:
 *
 *  1. `member_profiles.onboarded` (supabase/member_onboarding.sql), the durable
 *     record, when the project has that column.
 *  2. `user_metadata.onboarded`, written by completeOnboarding(), which works on
 *     projects that have not run the migration yet.
 *
 * When neither records anything the account is treated as new and goes through
 * setup once, which then records the flag. Guessing from `last_sign_in_at`
 * instead used to mislabel every account that had signed in before the flag
 * existed â€” those members skipped setup for good, even though they had never
 * been asked.
 */
function resolveOnboarded(
  rowOnboarded: boolean | null | undefined,
  hasOnboardedColumn: boolean,
  metadataOnboarded: boolean,
): boolean {
  if (metadataOnboarded) return true
  if (hasOnboardedColumn) return rowOnboarded === true
  return false
}

/** The onboarding flag kept in the auth record, for projects without the DB column. */
function metadataSaysOnboarded(user: User): boolean {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  return meta.onboarded === true
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

  /**
   * Guarantees the signed-in user has a `member_profiles` row.
   *
   * Availability, slot sign-ups and join requests all reference
   * `member_profiles(user_id)`, so a missing row makes those writes fail with a
   * foreign-key error. The database trigger normally creates the row; this is a
   * best-effort repair for projects where the trigger is not installed yet, so
   * failures are ignored rather than blocking sign-in.
   */
  async function ensureMemberProfile(
    userId: string,
    userEmail: string,
    fullName: string,
    onboarded: boolean,
  ) {
    const values = {
      user_id: userId,
      email: userEmail || null,
      full_name: fullName,
      active: true,
    }

    const { error } = await supabase.from("member_profiles").upsert(
      { ...values, onboarded },
      { onConflict: "user_id", ignoreDuplicates: true },
    )
    if (!error) return

    // Older projects have no `onboarded` column yet: retry without it so the
    // repair still creates the row the other member tables point at.
    const retry = await supabase.from("member_profiles").upsert(values, {
      onConflict: "user_id",
      ignoreDuplicates: true,
    })
    if (retry.error) {
      console.warn("Unable to ensure the member profile row:", retry.error.message)
    }
  }

  async function fetchProfile(
    user: User,
    fallbackEmail = "",
    nameOverride?: string,
  ): Promise<UserProfile | undefined> {
    if (!isSupabaseConfigured) return undefined

    const userId = user.id
    const userEmail = user.email || fallbackEmail
    const metaName = nameOverride || getProviderDisplayName(user)
    // Recorded only. Nothing recorded means this account has not been through
    // setup on this build, so it still needs the wizard.
    const metadataOnboarded = metadataSaysOnboarded(user)

    const fallbackName =
      metaName || userEmail.split("@")[0] || "Member"

    // Used when the profile tables cannot be reached at all; sign-in still
    // succeeds, just without coordinator access.
    const baseProfile: UserProfile = {
      id: userId,
      email: userEmail,
      fullName: fallbackName,
      role: "member",
      active: true,
      onboarded: metadataOnboarded,
      leaderOrganizations: [],
    }

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
          onboarded: true,
          leaderOrganizations: [],
        }
        setProfile(adminProfile)
        return adminProfile
      }

      // 2. Coordinator appointments. Read before the member row so the role can
      // be resolved once: an appointment is what grants the limited workspace.
      const leaderships = await loadLeaderships(userId)
      const role = leaderships.length > 0 ? "leader" : "member"

      const fallbackProfile: UserProfile = {
        id: userId,
        email: userEmail,
        fullName: fallbackName,
        role,
        active: true,
        onboarded: metadataOnboarded,
        leaderOrganizations: leaderships,
      }

      // 3. Check if user is a member
      let row: MemberProfileRow | null = null
      let hasOnboardedColumn = true

      const { data, error } = await supabase
        .from("member_profiles")
        .select(MEMBER_PROFILE_COLUMNS_WITH_ONBOARDED)
        .eq("user_id", userId)
        .maybeSingle()

      if (error) {
        // The project has not run supabase/member_onboarding.sql: read the row
        // without the new column. The auth metadata flag is the only record of
        // a finished setup then.
        hasOnboardedColumn = false
        const retry = await supabase
          .from("member_profiles")
          .select(MEMBER_PROFILE_COLUMNS)
          .eq("user_id", userId)
          .maybeSingle()
        if (retry.error) {
          console.warn("Unable to read the member profile:", retry.error.message)
        }
        row = (retry.data as MemberProfileRow | null) ?? null
      } else {
        row = (data as MemberProfileRow | null) ?? null
      }

      if (row) {
        const memberProfile: UserProfile = {
          id: row.user_id,
          email: row.email || userEmail,
          fullName:
            row.full_name ||
            metaName ||
            userEmail.split("@")[0] ||
            "Member",
          role,
          active: row.active,
          onboarded: resolveOnboarded(
            row.onboarded,
            hasOnboardedColumn,
            metadataOnboarded,
          ),
          leaderOrganizations: leaderships,
        }
        setProfile(memberProfile)
        return memberProfile
      }

      // 4. Repair the missing profile row, then fall back to user metadata
      await ensureMemberProfile(
        userId,
        userEmail,
        fallbackName,
        metadataOnboarded,
      )
      setProfile(fallbackProfile)
      return fallbackProfile
    } catch (err) {
      console.error("Error fetching user profile:", err)
      // Sign-in must succeed even if the profile tables are unreachable.
      setProfile(baseProfile)
      return baseProfile
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
        void fetchProfile(initialSession.user)
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
        await fetchProfile(newSession.user)
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
        userProfile = (await fetchProfile(data.user)) || null
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

  /**
   * Shared password check for the two separate workspace sign-in forms.
   *
   * `expected` decides which kind of account may continue: the admin form
   * accepts only an administrator, and the leader/coordinator form accepts only
   * an account an administrator appointed to a ministry. A valid password for
   * the wrong kind of account is signed out again with a message pointing at
   * the correct form.
   */
  async function signInToWorkspace(
    identifier: string,
    password: string,
    expected: "admin" | "leader",
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
    const isAdminForm = expected === "admin"
    const cleanId = identifier.trim()

    if (!cleanId || !password) {
      return {
        ok: false,
        error: isAdminForm
          ? "Enter your admin email or username and password."
          : "Enter the email and password of your coordinator account.",
      }
    }

    if (!isSupabaseConfigured) {
      return {
        ok: false,
        error: isAdminForm
          ? "Authentication is not configured. Add the Supabase environment variables."
          : "Coordinator sign in needs the Supabase environment variables.",
      }
    }

    // Supabase Auth only accepts an email address. `get_admin_email()` maps the
    // username stored in admin_profiles to that email before the password check.
    // Coordinators are ordinary members, so they sign in with their own email.
    let emailToUse = cleanId.toLowerCase()
    if (isAdminForm && !cleanId.includes("@")) {
      const { data: resolvedEmail, error: resolveError } = await supabase.rpc(
        "get_admin_email",
        { p_identifier: cleanId },
      )

      if (resolveError) {
        return {
          ok: false,
          error:
            "Administrator sign in is not available yet. Run supabase/admin_setup.sql in the Supabase SQL editor, then try again.",
        }
      }

      if (typeof resolvedEmail !== "string" || !resolvedEmail) {
        return {
          ok: false,
          error: `No administrator username "${cleanId}" was found.`,
        }
      }

      emailToUse = resolvedEmail
    } else if (!isAdminForm && !cleanId.includes("@")) {
      return {
        ok: false,
        error: "Coordinators sign in with the email address on their account.",
      }
    }

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

      // The password was valid, but the account also has to hold the role the
      // form is for.
      const resolvedProfile = await fetchProfile(data.user, emailToUse)
      const signedInEmail = data.user.email || emailToUse

      if (resolvedProfile?.role !== expected) {
        await supabase.auth.signOut()
        setUser(null)
        setSession(null)
        setProfile(null)

        if (resolvedProfile?.role === "admin") {
          return {
            ok: false,
            error: `${signedInEmail} is an administrator account. Use the Admin sign in.`,
          }
        }
        if (resolvedProfile?.role === "leader") {
          return {
            ok: false,
            error: `${signedInEmail} is a ministry coordinator account. Use the Leader/Coordinator sign in.`,
          }
        }
        return {
          ok: false,
          error: isAdminForm
            ? `${signedInEmail} signed in, but it is not an administrator. If you are a ministry coordinator, use the Leader/Coordinator sign in; otherwise an existing administrator must promote it with supabase/promote_to_admin.sql.`
            : `${signedInEmail} signed in, but it is not appointed as a ministry coordinator yet. Ask an administrator to appoint it in the Administrator Workspace → Coordinators.`,
        }
      }

      return { ok: true, profile: resolvedProfile }
    } catch (err: unknown) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during sign in.",
      }
    }
  }

  /** Administrator-only form: email/username + password. */
  async function signInAsAdmin(
    identifier: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
    return signInToWorkspace(identifier, password, "admin")
  }

  /** Leader/coordinator form: the account email + password. */
  async function signInAsCoordinator(
    identifier: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
    return signInToWorkspace(identifier, password, "leader")
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ ok: boolean; error?: string; profile?: UserProfile }> {
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

      let createdProfile: UserProfile | undefined
      if (data.user) {
        createdProfile =
          (await fetchProfile(data.user, "", fullName.trim())) || undefined
      }

      return { ok: true, profile: createdProfile }
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

      const userProfile = (await fetchProfile(data.user)) || null

      return { ok: true, profile: userProfile ?? undefined }
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "An unexpected error occurred.",
      }
    }
  }

  /**
   * Finishes the account setup wizard for the signed-in member: it stores the
   * name that was confirmed and records that onboarding is done, so the next
   * sign-in â€” including one that returns from Google or Facebook â€” opens the
   * dashboard instead of asking for the same details again.
   *
   * Both writes are best effort. `onboarded` needs
   * supabase/member_onboarding.sql; the auth metadata copy keeps the flag even
   * on a project that has not run it yet.
   */
  async function completeOnboarding(fullName: string): Promise<void> {
    // `full_name` is VARCHAR(150); a longer name would be rejected by the table.
    const trimmed = fullName.trim().slice(0, 150)

    setProfile(current =>
      current
        ? { ...current, fullName: trimmed || current.fullName, onboarded: true }
        : current,
    )

    if (!isSupabaseConfigured || !user) return

    try {
      const values: Record<string, unknown> = {
        user_id: user.id,
        email: user.email || null,
        active: true,
        onboarded: true,
      }
      if (trimmed) values.full_name = trimmed

      const { error } = await supabase
        .from("member_profiles")
        .upsert(values, { onConflict: "user_id" })

      if (error) {
        // Retry without the onboarding flag on projects missing the column.
        delete values.onboarded
        const retry = await supabase
          .from("member_profiles")
          .upsert(values, { onConflict: "user_id" })
        if (retry.error) {
          console.warn("Unable to save the member profile:", retry.error.message)
        }
      }

      // The metadata copy is what keeps a project without the column from
      // asking the same member for their name again, so write it even when the
      // name could not be read back.
      const metadata: Record<string, unknown> = { onboarded: true }
      if (trimmed) metadata.full_name = trimmed

      const { error: metadataError } = await supabase.auth.updateUser({
        data: metadata,
      })
      if (metadataError) {
        console.warn("Unable to update the account name:", metadataError.message)
      }
    } catch (err) {
      console.warn("Unable to finish onboarding:", err)
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

  /**
   * Re-reads the signed-in account's role and coordinator appointments.
   *
   * Appointments are made by an administrator while the coordinator may already
   * be signed in, so the workspace re-checks them instead of trusting the
   * profile loaded at sign-in.
   */
  async function refreshProfile(): Promise<UserProfile | null> {
    if (!user) return null
    return (await fetchProfile(user)) ?? null
  }

  const isAdmin = profile?.role === "admin"

  const isLeader = profile?.role === "leader"

  const needsName = Boolean(user && profile && isPlaceholderName(profile.fullName))

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAdmin,
        isLeader,
        loading,
        needsName,
        refreshProfile,
        signInWithEmail,
        signInAsAdmin,
        signInAsCoordinator,
        signUpWithEmail,
        signInWithProvider,
        signInWithPhone,
        verifyPhoneOtp,
        completeOnboarding,
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
