import { isSupabaseConfigured, supabase } from "../../lib/supabase"

/**
 * Ministry coordinators ("leaders").
 *
 * A coordinator is an existing member account that an administrator appoints to
 * one ministry (organization). The appointment lives in
 * `organization_leaders` (see supabase/organization_leaders.sql) and is what the
 * Row-Level Security policies use to let that member create and organise the
 * ministry's events.
 *
 *   organization_leaders.organization_id -> organizations.id
 *   organization_leaders.user_id         -> member_profiles.user_id
 *   organization_leaders.appointed_by    -> admin_profiles.user_id
 *
 * The database rejects an appointment unless the member already belongs to that
 * ministry, so "if they are in the certain ministry group" is enforced on the
 * server as well as in the appointment screen.
 */

/** A ministry (organization) the signed-in member coordinates. */
export type LeaderMinistry = {
  id: string
  name: string
  category: string
  /** False for a ministry an administrator has deactivated. */
  active: boolean
}

/** A member account returned by the administrator's account search. */
export type MemberAccount = {
  userId: string
  fullName: string
  email: string
  active: boolean
  /** The ministries this member already belongs to. */
  organizationIds: string[]
}

/** One appointment as the administrator's Coordinators screen shows it. */
export type LeaderAppointment = {
  organizationId: string
  organizationName: string
  userId: string
  memberName: string
  memberEmail: string
  appointedAt: string
}

type EmbeddedOrganization = {
  id?: string | null
  name?: string | null
  category?: string | null
  status?: string | null
}

type EmbeddedProfile = {
  full_name?: string | null
  email?: string | null
}

/** PostgREST returns a to-one embed as an object, but an array on some clients. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function describe(error: { code?: string; message?: string } | null, fallback: string) {
  // A project that has not run supabase/organization_leaders.sql reports the
  // missing table in a way nobody can act on. Say what to run instead.
  const message = error?.message?.trim() || ""
  if (
    error?.code === "PGRST205" ||
    /could not find the table 'public\.organization_leaders'/i.test(message)
  ) {
    return new Error(
      "Coordinator appointments are not set up yet. Run supabase/organization_leaders.sql in the Supabase SQL editor, then reload the app.",
    )
  }
  return new Error(message || fallback)
}

type LeadershipRow = {
  organization_id: string
  organizations?: EmbeddedOrganization | EmbeddedOrganization[] | null
}

/**
 * The ministries the signed-in member coordinates.
 *
 * Called from the auth context on every sign-in. A project that has not run
 * supabase/organization_leaders.sql has no table: that is treated as "no
 * appointments" (the member just stays a member), so the app keeps working
 * before the migration is applied.
 */
export async function fetchMyLeaderships(userId: string): Promise<LeaderMinistry[]> {
  if (!isSupabaseConfigured || !userId) return []

  const { data, error } = await supabase
    .from("organization_leaders")
    .select("organization_id, organizations(id, name, category, status)")
    .eq("user_id", userId)

  if (error) throw describe(error, "Unable to load your coordinator assignments.")

  return ((data ?? []) as unknown as LeadershipRow[]).map(row => {
    const organization = firstOf(row.organizations)
    return {
      id: organization?.id || row.organization_id,
      name: organization?.name || "Ministry",
      category: organization?.category || "Ministry",
      active: organization?.status !== "inactive",
    }
  })
}

type MemberRow = {
  user_id: string
  full_name: string | null
  email: string | null
  active: boolean | null
}

type MembershipRow = {
  user_id: string
  organization_id: string
}

/**
 * Searches member accounts by name or email for the appointment screen.
 *
 * Administrator accounts are filtered out (they already have the full
 * workspace), and each result carries the ministries the member belongs to, so
 * the administrator can only appoint the member to a ministry they are in.
 */
export async function searchMemberAccounts(rawQuery: string): Promise<MemberAccount[]> {
  if (!isSupabaseConfigured) return []

  // PostgREST splits `or=(...)` on commas and treats some characters as
  // operators, so keep only ordinary search characters in the term.
  const query = rawQuery
    .replace(/[,()"%*_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
  if (query.length < 2) return []

  const pattern = `%${query}%`
  const [membersResult, adminsResult] = await Promise.all([
    supabase
      .from("member_profiles")
      .select("user_id, full_name, email, active")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("full_name", { ascending: true })
      .limit(20),
    supabase.from("admin_profiles").select("user_id"),
  ])

  if (membersResult.error) {
    throw describe(membersResult.error, "Unable to search member accounts.")
  }

  const adminIds = new Set(
    ((adminsResult.data ?? []) as { user_id: string }[]).map(row => row.user_id),
  )
  const members = ((membersResult.data ?? []) as MemberRow[]).filter(
    row => !adminIds.has(row.user_id),
  )
  if (members.length === 0) return []

  // Only memberships of the accounts just found (RLS lets an administrator read
  // every membership row).
  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_member_accounts")
    .select("user_id, organization_id")
    .in(
      "user_id",
      members.map(row => row.user_id),
    )
  if (membershipError) {
    throw describe(membershipError, "Unable to read the member's ministries.")
  }

  const ministriesByUser = new Map<string, string[]>()
  for (const row of (membershipData ?? []) as MembershipRow[]) {
    const list = ministriesByUser.get(row.user_id) ?? []
    list.push(row.organization_id)
    ministriesByUser.set(row.user_id, list)
  }

  return members.map(row => ({
    userId: row.user_id,
    fullName: row.full_name?.trim() || "Member",
    email: row.email?.trim() || "",
    active: row.active !== false,
    organizationIds: ministriesByUser.get(row.user_id) ?? [],
  }))
}

type AppointmentRow = {
  organization_id: string
  user_id: string
  appointed_at: string | null
  member_profiles?: EmbeddedProfile | EmbeddedProfile[] | null
  organizations?: EmbeddedOrganization | EmbeddedOrganization[] | null
}

/** Every coordinator appointment, for the administrator's Coordinators screen. */
export async function fetchLeaderAppointments(): Promise<LeaderAppointment[]> {
  if (!isSupabaseConfigured) return []

  const { data, error } = await supabase
    .from("organization_leaders")
    .select(
      "organization_id, user_id, appointed_at, member_profiles(full_name, email), organizations(name)",
    )
    .order("appointed_at", { ascending: false })

  if (error) throw describe(error, "Unable to load coordinator appointments.")

  return ((data ?? []) as unknown as AppointmentRow[]).map(row => {
    const profile = firstOf(row.member_profiles)
    const organization = firstOf(row.organizations)
    return {
      organizationId: row.organization_id,
      organizationName: organization?.name || "Ministry",
      userId: row.user_id,
      memberName: profile?.full_name?.trim() || "Member",
      memberEmail: profile?.email?.trim() || "",
      appointedAt: row.appointed_at || "",
    }
  })
}

export async function appointOrganizationLeader(input: {
  organizationId: string
  userId: string
  /** The administrator making the appointment, stored for auditing. */
  appointedBy?: string
}): Promise<void> {
  const { error } = await supabase.from("organization_leaders").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    appointed_by: input.appointedBy || null,
  })
  if (!error) return

  if (error.code === "23505") {
    throw new Error("That member already coordinates this ministry.")
  }
  throw describe(error, "Unable to appoint the coordinator.")
}

export async function revokeOrganizationLeader(
  organizationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("organization_leaders")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
  if (error) throw describe(error, "Unable to remove the coordinator.")
}
