import { useEffect, useState } from "react"
import { Button, InputField } from "../../shared/ui"
import { useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured } from "../../lib/supabase"
import type { Organization } from "./types"
import {
  appointOrganizationLeader,
  fetchLeaderAppointments,
  revokeOrganizationLeader,
  searchMemberAccounts,
  type LeaderAppointment,
  type MemberAccount,
} from "../organizations/leaders"

/**
 * Administrator screen for appointing ministry coordinators.
 *
 * The administrator searches the member accounts by name or email (the same
 * `member_profiles` rows the member dashboard uses), picks one, and appoints
 * them to a ministry that account already belongs to. The appointment is stored
 * in `organization_leaders`; the Row-Level Security policies there and on
 * `events` then let the coordinator manage that ministry's events.
 */

function formatAppointed(value: string) {
  if (!value) return "Recently"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date)
}

function SectionHeader() {
  return (
    <div className="border-b border-border pb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gold">Administration</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Coordinators</p>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
        Appoint a member to coordinate one of their ministries. Coordinators can create and organise
        events for that ministry from their own Coordinator Workspace, without gaining administrator
        access.
      </p>
    </div>
  )
}

export function CoordinatorsSection({ organizations }: { organizations: Organization[] }) {
  const { user } = useAuth()
  /**
   * Appointments live in Supabase and are written under the administrator's own
   * Supabase session. An administrator signed in through the optional FastAPI
   * backend has no such session, so the section explains that instead of
   * failing with a permission error.
   */
  const canManage = isSupabaseConfigured && Boolean(user)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MemberAccount[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")

  const [selected, setSelected] = useState<MemberAccount | null>(null)
  const [targetOrganizationId, setTargetOrganizationId] = useState("")

  const [appointments, setAppointments] = useState<LeaderAppointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(true)
  const [appointmentError, setAppointmentError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyKey, setBusyKey] = useState("")

  const busy = Boolean(busyKey)

  async function loadAppointments() {
    setLoadingAppointments(true)
    try {
      setAppointments(await fetchLeaderAppointments())
      setAppointmentError("")
    } catch (reason) {
      setAppointmentError(
        reason instanceof Error
          ? reason.message
          : "Unable to load the coordinator appointments.",
      )
    } finally {
      setLoadingAppointments(false)
    }
  }

  useEffect(() => {
    if (!canManage) {
      setLoadingAppointments(false)
      return
    }
    void loadAppointments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  // Debounce the account search so a name is not looked up on every keystroke.
  useEffect(() => {
    if (!canManage) return
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      setSearchError("")
      setSearching(false)
      return
    }

    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchMemberAccounts(term)
        .then(accounts => {
          if (!active) return
          setResults(accounts)
          setSearchError("")
        })
        .catch(reason => {
          if (!active) return
          setResults([])
          setSearchError(
            reason instanceof Error ? reason.message : "Unable to search member accounts.",
          )
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, canManage])

  if (!canManage) {
    return (
      <div className="space-y-6">
        <SectionHeader />
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <p className="text-lg font-bold text-text">Coordinator appointments need Supabase</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Appointments are stored in Supabase and are made under an administrator&apos;s Supabase
            session. Sign in through the app&apos;s Supabase administrator account instead of the
            optional API sign-in to appoint coordinators.
          </p>
        </div>
      </div>
    )
  }

  const ledOrganizationIds = new Set(
    appointments
      .filter(appointment => appointment.userId === selected?.userId)
      .map(appointment => appointment.organizationId),
  )

  const ministriesOfSelected = selected
    ? organizations.filter(organization => selected.organizationIds.includes(organization.id))
    : []

  const availableOrganizations = ministriesOfSelected.filter(
    organization => !ledOrganizationIds.has(organization.id),
  )

  function selectAccount(account: MemberAccount) {
    const alreadyLed = new Set(
      appointments
        .filter(appointment => appointment.userId === account.userId)
        .map(appointment => appointment.organizationId),
    )
    const firstAvailable = organizations.find(
      organization =>
        account.organizationIds.includes(organization.id) && !alreadyLed.has(organization.id),
    )
    setSelected(account)
    setTargetOrganizationId(firstAvailable?.id ?? "")
    setNotice("")
    setAppointmentError("")
  }

  async function appoint() {
    if (!selected || !targetOrganizationId) return
    const key = `appoint:${selected.userId}:${targetOrganizationId}`
    setBusyKey(key)
    setNotice("")
    setAppointmentError("")
    try {
      await appointOrganizationLeader({
        organizationId: targetOrganizationId,
        userId: selected.userId,
        appointedBy: user?.id,
      })
      await loadAppointments()
      const ministry = organizations.find(organization => organization.id === targetOrganizationId)
      setNotice(
        `${selected.fullName} can now organise events for ${ministry?.name || "that ministry"}.`,
      )
      // Offer the next ministry this member belongs to, if there is one left.
      const next = organizations.find(
        organization =>
          organization.id !== targetOrganizationId &&
          selected.organizationIds.includes(organization.id) &&
          !appointments.some(
            appointment =>
              appointment.userId === selected.userId &&
              appointment.organizationId === organization.id,
          ),
      )
      setTargetOrganizationId(next?.id ?? "")
    } catch (reason) {
      setAppointmentError(
        reason instanceof Error ? reason.message : "Unable to appoint the coordinator.",
      )
    } finally {
      setBusyKey("")
    }
  }

  async function revoke(appointment: LeaderAppointment) {
    if (
      !window.confirm(
        `Remove ${appointment.memberName} as coordinator of ${appointment.organizationName}? Their member account stays the same.`,
      )
    ) {
      return
    }
    const key = `revoke:${appointment.organizationId}:${appointment.userId}`
    setBusyKey(key)
    setNotice("")
    setAppointmentError("")
    try {
      await revokeOrganizationLeader(appointment.organizationId, appointment.userId)
      await loadAppointments()
      setNotice(
        `${appointment.memberName} is no longer a coordinator of ${appointment.organizationName}.`,
      )
      if (selected?.userId === appointment.userId) {
        setTargetOrganizationId(appointment.organizationId)
      }
    } catch (reason) {
      setAppointmentError(
        reason instanceof Error ? reason.message : "Unable to remove the coordinator.",
      )
    } finally {
      setBusyKey("")
    }
  }

  const sortedAppointments = [...appointments].sort(
    (a, b) =>
      a.organizationName.localeCompare(b.organizationName) ||
      a.memberName.localeCompare(b.memberName),
  )

  return (
    <div className="space-y-6">
      <SectionHeader />

      {notice && (
        <div role="status" className="rounded-xl border border-green/30 bg-green-light px-4 py-3 text-sm font-semibold text-green">
          {notice}
        </div>
      )}
      {appointmentError && (
        <div role="alert" className="rounded-xl border border-red/30 bg-red-light px-4 py-3 text-sm text-red">
          {appointmentError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-lg font-bold text-text">Find a member account</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Search by name or email. Only members who already belong to a ministry can be appointed
            for it.
          </p>
          <div className="mt-4">
            <InputField
              id="coordinator-search"
              label="Search accounts"
              value={query}
              onChange={value => {
                setQuery(value)
                setNotice("")
              }}
              placeholder="e.g. Maria or maria@example.com"
            />
          </div>

          <div className="mt-4 space-y-2">
            {query.trim().length < 2 ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">
                Type at least two characters to search the member accounts.
              </p>
            ) : searching ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">Searching accounts…</p>
            ) : searchError ? (
              <p className="rounded-xl bg-red-light px-4 py-3 text-sm text-red">{searchError}</p>
            ) : results.length === 0 ? (
              <p className="rounded-xl bg-bg px-4 py-3 text-sm text-muted">
                No member account matches “{query.trim()}”.
              </p>
            ) : (
              results.map(account => {
                const isSelected = selected?.userId === account.userId
                const ministryCount = account.organizationIds.length
                return (
                  <button
                    key={account.userId}
                    type="button"
                    onClick={() => selectAccount(account)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-navy bg-navy-soft ring-2 ring-navy/20"
                        : "border-border bg-white hover:border-navy/40 hover:bg-bg"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-text">{account.fullName}</span>
                        {!account.active && (
                          <span className="rounded-full bg-gold-light px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold">
                            Inactive
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted">
                        {account.email || "No email on file"}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {ministryCount === 0
                          ? "Not a member of a ministry yet"
                          : ministryCount === 1
                            ? "Member of 1 ministry"
                            : `Member of ${ministryCount} ministries`}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-navy">
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-5 shadow-sm">
          <p className="text-lg font-bold text-text">Appointment</p>
          {!selected ? (
            <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm leading-relaxed text-muted">
              Choose a member account on the left, then pick the ministry they should coordinate.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-bg p-4">
                <p className="font-bold text-text">{selected.fullName}</p>
                <p className="mt-0.5 text-sm text-muted">{selected.email || "No email on file"}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-text">Ministries this member belongs to</p>
                {ministriesOfSelected.length === 0 ? (
                  <p className="mt-2 rounded-xl bg-gold-light p-3 text-sm leading-relaxed text-gold">
                    This member has not joined a ministry yet. Approve their join request in Join
                    requests first, then appoint them.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ministriesOfSelected.map(organization => (
                      <span
                        key={organization.id}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          ledOrganizationIds.has(organization.id)
                            ? "bg-green-light text-green"
                            : "bg-navy-soft text-navy"
                        }`}
                      >
                        {organization.name}
                        {ledOrganizationIds.has(organization.id) ? " · Coordinator" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {availableOrganizations.length > 0 ? (
                <div>
                  <label
                    htmlFor="coordinator-ministry"
                    className="text-sm font-semibold text-text"
                  >
                    Ministry to coordinate
                  </label>
                  <select
                    id="coordinator-ministry"
                    value={targetOrganizationId}
                    onChange={event => setTargetOrganizationId(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border-2 border-border bg-white px-3 text-base font-medium text-text focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
                  >
                    {availableOrganizations.map(organization => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                        {organization.status === "inactive" ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                  {availableOrganizations.some(organization => organization.status === "inactive") && (
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      An inactive ministry keeps its coordinator, but new events cannot be created
                      until an administrator reactivates it.
                    </p>
                  )}
                </div>
              ) : ministriesOfSelected.length > 0 ? (
                <p className="rounded-xl bg-green-light p-3 text-sm font-medium text-green">
                  This member already coordinates every ministry they belong to.
                </p>
              ) : null}

              <Button
                onClick={() => void appoint()}
                disabled={busy || loadingAppointments || !targetOrganizationId || !selected.active}
              >
                {busy && busyKey.startsWith("appoint")
                  ? "Appointing…"
                  : "Appoint as coordinator"}
              </Button>
              {!selected.active && (
                <p className="text-sm text-muted">
                  Reactivate this member account before appointing it as a coordinator.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-text">Appointed coordinators</p>
            <p className="mt-1 text-sm text-muted">
              Coordinators can add and organise events only for the ministry shown here.
            </p>
          </div>
          <span className="text-sm font-bold text-muted">{appointments.length} total</span>
        </div>

        {loadingAppointments ? (
          <p className="mt-4 rounded-xl bg-bg px-4 py-6 text-center text-sm text-muted">
            Loading appointments…
          </p>
        ) : sortedAppointments.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm leading-relaxed text-muted">
            No coordinators yet. Search for a member above to appoint the first one.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {sortedAppointments.map(appointment => {
              const key = `revoke:${appointment.organizationId}:${appointment.userId}`
              return (
                <div
                  key={`${appointment.organizationId}:${appointment.userId}`}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-text">{appointment.memberName}</p>
                      <span className="rounded-full bg-navy-soft px-3 py-1 text-xs font-bold text-navy">
                        Coordinator
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {appointment.memberEmail || "No email on file"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-navy">
                      {appointment.organizationName}
                      <span className="ml-2 font-normal text-muted">
                        appointed {formatAppointed(appointment.appointedAt)}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="compact"
                    fullWidth={false}
                    disabled={busy}
                    onClick={() => void revoke(appointment)}
                    className="shrink-0"
                  >
                    {busyKey === key ? "Removing…" : "Remove access"}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
