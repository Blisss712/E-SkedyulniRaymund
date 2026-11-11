import { useMemo, useState } from "react"
import { Button, InputField } from "../../shared/ui"
import { useAdmin } from "./useAdmin"
import { CoordinatorsSection } from "./coordinators"
import { EventsTimeline } from "./eventsTimeline"
import { MessagesPanel } from "../messaging/messaging"
import { useMessaging } from "../messaging/MessagingContext"
import type { ChatConversation } from "../messaging/types"
import {
  MemberAvatar,
  MinistryStatusPill,
  OrganizationAvatar,
  OrganizationFilter,
  OrganizationGroupCard,
  groupItemsByOrganization,
  resolveRequestOrganization,
} from "./orgGroups"
import {
  combineDateTime,
  describeSchedule,
  eventSchedule,
  formatEventWhen,
  scheduleIssue,
  type EventSchedule,
} from "./eventSchedule"
import type {
  AdminEvent,
  EventDraft,
  EventStatus,
  JoinRequest,
  JoinRequestStatus,
  Organization,
  OrganizationDraft,
  OrganizationStatus,
  Recurrence,
} from "./types"
import type { TimetablePosition } from "../availability/types"

export type AdminSection = "dashboard" | "organizations" | "events" | "requests" | "coordinators" | "messages"
type AdminSectionItem = { value: AdminSection; label: string; short: string }
const ADMIN_SECTIONS: AdminSectionItem[] = [
  { value: "dashboard", label: "Dashboard", short: "Home" },
  { value: "organizations", label: "Organizations", short: "Orgs" },
  { value: "events", label: "Events", short: "Events" },
  { value: "requests", label: "Join requests", short: "Requests" },
  { value: "coordinators", label: "Coordinators", short: "Leaders" },
  { value: "messages", label: "Messages", short: "Chat" },
]
/**
 * A coordinator sees only their own ministries: no organization management and
 * no Coordinator appointments of their own, but they do review the join requests
 * of the ministries they lead.
 */
const COORDINATOR_SECTIONS: AdminSectionItem[] = [
  { value: "dashboard", label: "Dashboard", short: "Home" },
  { value: "organizations", label: "My ministries", short: "Ministries" },
  { value: "events", label: "Events", short: "Events" },
  { value: "requests", label: "Join requests", short: "Requests" },
  { value: "messages", label: "Messages", short: "Chat" },
]

/** Who is using the workspace: a full administrator or a ministry coordinator. */
export type AdminWorkspaceRole = "admin" | "leader"
type AdminView =
  | { name: "section"; section: AdminSection }
  | { name: "organization"; id: string }
  | { name: "organization-form"; id?: string }
  | { name: "event-form"; id?: string; organizationId?: string }

const EMPTY_ORGANIZATION: OrganizationDraft = {
  name: "",
  description: "",
  contactEmail: "",
  phone: "",
  timezone: "Asia/Manila",
  address: "",
  category: "Parish",
  status: "active",
}

function emptyEvent(organizationId: string): EventDraft {
  return {
    organizationId,
    title: "",
    description: "",
    startsAt: "",
    endsAt: "",
    location: "",
    capacity: 50,
    registrationDeadline: "",
    visibility: "members",
    recurrence: "none",
    repeatUntil: "",
    status: "draft",
  }
}

function formatDateTime(value: string) {
  if (!value) return "Not set"
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function StatusBadge({ status }: { status: OrganizationStatus | EventStatus }) {
  const styles: Record<OrganizationStatus | EventStatus, string> = {
    active: "bg-green-light text-green",
    inactive: "bg-slate-100 text-muted",
    published: "bg-green-light text-green",
    draft: "bg-gold-light text-gold",
    cancelled: "bg-red-light text-red",
    completed: "bg-navy-soft text-navy",
  }

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function RequestStatusBadge({ status }: { status: JoinRequestStatus }) {
  const styles: Record<JoinRequestStatus, string> = {
    pending: "bg-gold-light text-gold",
    approved: "bg-green-light text-green",
    rejected: "bg-red-light text-red",
  }
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function AdminBrand({ compact = false, role = "admin" }: { compact?: boolean; role?: AdminWorkspaceRole }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex shrink-0 items-center justify-center rounded-xl bg-white/10 ${compact ? "size-10" : "size-12"}`}>
        <svg className={compact ? "size-7" : "size-8"} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path className="text-gold" d="M16 3v5M13.5 5.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path className="text-white" d="M9 13h14v15H9zM13 28v-6h6v6M9 18h14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p className={`${compact ? "text-lg" : "text-xl"} font-extrabold tracking-tight text-white`}>E-Skedyul</p>
        <p className="text-xs font-medium text-white/70">
          {role === "leader" ? "Coordinator workspace" : "Admin workspace"}
        </p>
      </div>
    </div>
  )
}

function AdminHeader({ title, description, action, eyebrow = "Administration" }: {
  title: string
  description: string
  action?: React.ReactNode
  eyebrow?: string
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gold">{eyebrow}</p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{title}</p>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted sm:text-sm">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-navy sm:mt-3 sm:text-4xl">{value}</p>
      <p className="mt-1 text-xs leading-snug text-muted sm:mt-2 sm:text-sm">{detail}</p>
    </div>
  )
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
      <p className="text-xl font-bold text-text">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-muted">{detail}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

function Dashboard({ admin, requests, onEvents, onTimeline, onOpenOrganization, scoped }: {
  admin: ReturnType<typeof useAdmin>
  /** Pending join requests, so the dashboard points at the ministry that needs review. */
  requests: JoinRequest[]
  onEvents: () => void
  /** Opens the Events section on its timeline view. */
  onTimeline: () => void
  /** Opens one ministry's details from the at-a-glance list. */
  onOpenOrganization: (id: string) => void
  scoped: boolean
}) {
  const now = new Date()
  const nextEvents = admin.events
    .filter(event => event.status === "published" && new Date(event.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 4)

  // Both roles review membership for the ministries they can see; a coordinator's
  // request list is already scoped to the ministries they lead.
  const pendingByOrganization = new Map<string, number>()
  for (const request of requests) {
    if (request.status !== "pending") continue
    const organization = resolveRequestOrganization(request, admin.organizations)
    const key = organization?.id ?? `name:${request.groupName.trim().toLowerCase()}`
    pendingByOrganization.set(key, (pendingByOrganization.get(key) ?? 0) + 1)
  }

  // Ministries with something waiting on a decision come first: that is the
  // list an administrator is most likely to act on.
  const summaryOrganizations = [...admin.organizations].sort((a, b) =>
    (pendingByOrganization.get(b.id) ?? 0) - (pendingByOrganization.get(a.id) ?? 0) ||
    a.name.localeCompare(b.name),
  )

  return (
    <div className="space-y-7">
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title="Dashboard"
        description={scoped
          ? "Plan and organise the events of the ministries you coordinate."
          : "Manage your organizations and events from one workspace."}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label={scoped ? "My ministries" : "Active organizations"}
          value={admin.metrics.activeOrganizations}
          detail={scoped ? "Under your coordination" : "Ready to publish events"}
        />
        <MetricCard label="Published events" value={admin.metrics.publishedEvents} detail="Visible to participants" />
        <MetricCard label="Upcoming" value={admin.metrics.upcomingEvents} detail="Scheduled ahead" />
        <MetricCard label="Drafts" value={admin.metrics.draftEvents} detail="Waiting for review" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xl font-bold text-text">Upcoming events</p>
              <p className="mt-1 text-sm text-muted">
                {scoped
                  ? "The next published activities in your ministries."
                  : "The next published activities across organizations."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="compact" fullWidth={false} onClick={onTimeline} className="whitespace-nowrap">Timeline</Button>
              <Button variant="ghost" size="compact" fullWidth={false} onClick={onEvents} className="whitespace-nowrap">View all</Button>
            </div>
          </div>
          {nextEvents.length ? (
            <div className="divide-y divide-border">
              {nextEvents.map(event => {
                const organization = admin.organizations.find(item => item.id === event.organizationId)
                return (
                  <div key={event.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-text">{event.title}</p>
                      <p className="mt-1 text-sm text-muted">{organization?.name} · {formatEventWhen(event)}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              No upcoming published events. Create one from Events when the next activity is ready.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-2">
            <p className="text-xl font-bold text-text">
              {scoped ? "My ministries at a glance" : "Ministries at a glance"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {scoped
                ? "Pending join requests and event counts for the ministries you coordinate."
                : "Pending join requests and event counts, grouped by ministry."}
            </p>
          </div>
          {summaryOrganizations.length ? (
            <div className="divide-y divide-border">
              {summaryOrganizations.map(organization => {
                const pending = pendingByOrganization.get(organization.id) ?? 0
                const eventCount = admin.events.filter(
                  event => event.organizationId === organization.id,
                ).length
                return (
                  <button
                    key={organization.id}
                    type="button"
                    onClick={() => onOpenOrganization(organization.id)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-bg"
                  >
                    <OrganizationAvatar name={organization.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-text">{organization.name}</span>
                        <MinistryStatusPill status={organization.status} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {organization.category} · {eventCount} {eventCount === 1 ? "event" : "events"}
                      </span>
                    </span>
                    {pending > 0 && (
                      <span className="shrink-0 rounded-full bg-gold-light px-2.5 py-1 text-[11px] font-bold text-gold">
                        {pending} pending
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-bold text-navy">Open</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm leading-relaxed text-muted">
              {scoped
                ? "An administrator appoints you as coordinator of a ministry you belong to. Once appointed, it appears here."
                : "Create an organization to start grouping events and membership requests by ministry."}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function JoinRequestList({ requests, organizations, scoped, onApprove, onReject }: {
  requests: JoinRequest[]
  organizations: Organization[]
  /** True in a coordinator's workspace: only their ministries are reviewed. */
  scoped: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const [filter, setFilter] = useState<JoinRequestStatus | "all">("pending")
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [query, setQuery] = useState("")

  const queryText = query.trim().toLowerCase()

  // The organization is the grouping unit: a reviewer reads "St. Joseph Parish
  // - 3 pending" before reading a single member name.
  const groups = useMemo(
    () => groupItemsByOrganization(organizations, requests, request => ({
      organization: resolveRequestOrganization(request, organizations),
      fallbackName: request.groupName || "Unassigned ministry",
    })),
    [organizations, requests],
  )

  const pendingByGroup = useMemo(() => new Map(
    groups.map(group => [
      group.key,
      group.items.filter(request => request.status === "pending").length,
    ]),
  ), [groups])

  const statusCounts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter(request => request.status === "pending").length,
    approved: requests.filter(request => request.status === "approved").length,
    rejected: requests.filter(request => request.status === "rejected").length,
  }), [requests])

  const organizationOptions = [
    { value: "all", label: "All ministries", count: requests.length },
    ...groups
      .slice()
      .sort((a, b) =>
        (pendingByGroup.get(b.key) ?? 0) - (pendingByGroup.get(a.key) ?? 0) ||
        a.name.localeCompare(b.name),
      )
      .map(group => ({ value: group.key, label: group.name, count: group.items.length })),
  ]

  const statusRank: Record<JoinRequestStatus, number> = { pending: 0, approved: 1, rejected: 2 }

  const visibleGroups = groups
    .filter(group => organizationFilter === "all" || group.key === organizationFilter)
    .map(group => ({
      ...group,
      items: group.items
        .filter(request => filter === "all" || request.status === filter)
        .filter(request => !queryText || request.memberName.toLowerCase().includes(queryText))
        .sort((a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          b.requestedAt.localeCompare(a.requestedAt),
        ),
    }))
    .filter(group => group.items.length > 0)
    .sort((a, b) =>
      (pendingByGroup.get(b.key) ?? 0) - (pendingByGroup.get(a.key) ?? 0) ||
      a.name.localeCompare(b.name),
    )

  const visibleCount = visibleGroups.reduce((total, group) => total + group.items.length, 0)
  const pendingGroups = groups
    .filter(group => (pendingByGroup.get(group.key) ?? 0) > 0)
    .sort((a, b) => (pendingByGroup.get(b.key) ?? 0) - (pendingByGroup.get(a.key) ?? 0))

  /** Approves every pending request of one ministry after one confirmation. */
  function approveAll(organizationName: string, ids: string[]) {
    if (!ids.length) return
    if (!window.confirm(
      `Approve all ${ids.length} pending requests for ${organizationName}? Each member will join that ministry.`,
    )) return
    ids.forEach(id => onApprove(id))
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title="Member join requests"
        description={scoped
          ? "Members asking to join the ministries you coordinate, grouped by ministry so you can decide one organization at a time."
          : "Every member is grouped under the ministry they asked to join, so you can review one organization at a time instead of matching names by hand."}
      />
      {statusCounts.pending > 0 && (
        <section className="rounded-2xl border border-gold/40 bg-gold-light p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-bold text-gold">
              {statusCounts.pending} {statusCounts.pending === 1 ? "request is" : "requests are"} waiting for review
            </p>
            <p className="text-sm font-medium text-gold">
              Pick a ministry to see only its members.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingGroups.map(group => {
              const pending = pendingByGroup.get(group.key) ?? 0
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => {
                    setOrganizationFilter(group.key)
                    setFilter("pending")
                    setQuery("")
                  }}
                  className="flex items-center gap-2 rounded-full border border-gold/40 bg-white px-3 py-1.5 text-sm font-bold text-text transition-colors hover:border-gold hover:bg-gold-light"
                >
                  <span>{group.name}</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-extrabold text-navy">
                    {pending}
                  </span>
                </button>
              )
            })}
            {(organizationFilter !== "all" || filter !== "pending") && (
              <Button
                variant="ghost"
                size="compact"
                fullWidth={false}
                onClick={() => {
                  setOrganizationFilter("all")
                  setFilter("pending")
                  setQuery("")
                }}
                className="text-gold hover:bg-white/60"
              >
                Show all ministries
              </Button>
            )}
          </div>
        </section>
      )}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <InputField
            id="request-search"
            label="Search members"
            value={query}
            onChange={setQuery}
            placeholder="Search by member name"
          />
          <OrganizationFilter
            id="request-organization"
            label="Ministry"
            value={organizationFilter}
            onChange={setOrganizationFilter}
            options={organizationOptions}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Status</p>
            <div className="flex flex-wrap rounded-xl bg-bg p-1">
              {(["pending", "approved", "rejected", "all"] as const).map(value => (
                <Button
                  key={value}
                  variant={filter === value ? "tabActive" : "tabInactive"}
                  size="compact"
                  fullWidth={false}
                  onClick={() => setFilter(value)}
                  className="capitalize"
                >
                  {value === "all" ? "All" : value} ({statusCounts[value]})
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!visibleGroups.length ? (
        <EmptyState
          title={
            !requests.length
              ? "No join requests"
              : filter === "pending" && statusCounts.pending === 0 && organizationFilter === "all"
                ? "No pending requests"
                : "No matching requests"
          }
          detail={
            !requests.length
              ? "New membership requests will appear here, grouped under the ministry they asked to join."
              : filter === "pending" && statusCounts.pending === 0 && organizationFilter === "all"
                ? "Every request has been reviewed. Open the Approved or All tab to look back at past decisions."
                : "There are no requests matching this ministry, status, and search."
          }
          action={requests.length ? (
            <Button
              fullWidth={false}
              size="compact"
              onClick={() => {
                setOrganizationFilter("all")
                setFilter("all")
                setQuery("")
              }}
            >
              Show all requests
            </Button>
          ) : undefined}
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-text">
                {filter === "all" ? "All requests" : `${filter[0].toUpperCase()}${filter.slice(1)} requests`} by ministry
              </p>
              <p className="mt-1 text-sm text-muted">
                {filter === "pending"
                  ? "Approve or reject a whole ministry's pending requests at once, or one member at a time."
                  : "Review the status of submitted membership requests, grouped by ministry."}
              </p>
            </div>
            <p className="text-sm font-bold text-muted">{visibleCount} shown</p>
          </div>
          {visibleGroups.map(group => {
            const pendingIds = group.items
              .filter(request => request.status === "pending")
              .map(request => request.id)
            const joinCode = group.organization?.joinCode || group.items[0]?.groupCode
            return (
              <OrganizationGroupCard
                key={group.key}
                name={group.name}
                badges={group.organization && <MinistryStatusPill status={group.organization.status} />}
                subtitle={[
                  group.organization?.category,
                  `${group.items.length} ${group.items.length === 1 ? "request" : "requests"} shown`,
                  joinCode ? `Join code ${joinCode}` : undefined,
                ].filter(Boolean).join(" · ")}
                action={pendingIds.length > 1 ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    fullWidth={false}
                    onClick={() => approveAll(group.name, pendingIds)}
                    className="whitespace-nowrap"
                  >
                    Approve all {pendingIds.length}
                  </Button>
                ) : undefined}
              >
                <div className="divide-y divide-border">
                  {group.items.map(request => (
                    <div
                      key={request.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <MemberAvatar name={request.memberName} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-text">{request.memberName}</p>
                            <RequestStatusBadge status={request.status} />
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted">
                            Wants to join{" "}
                            <span className="font-semibold text-navy">{group.name}</span>
                            {request.groupCode ? (
                              <> · code <span className="font-mono font-semibold text-text">{request.groupCode}</span></>
                            ) : (
                              " · no join code"
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Submitted {formatDateTime(request.requestedAt)}
                          </p>
                        </div>
                      </div>
                      {request.status === "pending" ? (
                        <div className="flex shrink-0 gap-2 pl-13 sm:pl-0">
                          <Button size="compact" fullWidth={false} onClick={() => onApprove(request.id)}>
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            size="compact"
                            fullWidth={false}
                            onClick={() => onReject(request.id)}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <p className="shrink-0 pl-13 text-sm font-semibold text-muted sm:pl-0">
                          {request.status === "approved" ? "Approved" : "Rejected"}
                          {request.reviewedAt ? ` · ${formatDateTime(request.reviewedAt)}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </OrganizationGroupCard>
            )
          })}
        </section>
      )}
    </div>
  )
}

function OrganizationList({ admin, requests, onCreate, onOpen, scoped }: {
  admin: ReturnType<typeof useAdmin>
  /** Pending join requests, summarised on each ministry row. */
  requests: JoinRequest[]
  onCreate: () => void
  onOpen: (id: string) => void
  scoped: boolean
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | OrganizationStatus>("all")
  const [sort, setSort] = useState<"name" | "newest">("name")

  const organizations = useMemo(() => admin.organizations
    .filter(organization => organization.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(organization => status === "all" || organization.status === status)
    .sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : b.createdAt.localeCompare(a.createdAt)),
  [admin.organizations, query, sort, status])

  const pendingByOrganization = useMemo(() => {
    const counts = new Map<string, number>()
    for (const request of requests) {
      if (request.status !== "pending") continue
      const organization = resolveRequestOrganization(request, admin.organizations)
      if (!organization) continue
      counts.set(organization.id, (counts.get(organization.id) ?? 0) + 1)
    }
    return counts
  }, [admin.organizations, requests])

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title={scoped ? "My ministries" : "Organizations"}
        description={scoped
          ? "The ministries you coordinate. You can add and organise their events and review their join requests; an administrator manages the ministry profile."
          : "Create and maintain the organizations that own your events."}
        action={scoped ? undefined : <Button fullWidth={false} size="compact" onClick={onCreate}>Create organization</Button>}
      />
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <InputField
            id="organization-search"
            label={scoped ? "Search my ministries" : "Search organizations"}
            value={query}
            onChange={setQuery}
            placeholder="Search by name"
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Status</p>
            <div className="flex rounded-xl bg-bg p-1">
              {(["all", "active", "inactive"] as const).map(value => (
                <Button
                  key={value}
                  variant={status === value ? "tabActive" : "tabInactive"}
                  size="compact"
                  fullWidth={false}
                  onClick={() => setStatus(value)}
                  className="min-h-10 capitalize"
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Sort</p>
            <div className="flex rounded-xl bg-bg p-1">
              <Button variant={sort === "name" ? "tabActive" : "tabInactive"} size="compact" fullWidth={false} onClick={() => setSort("name")} className="min-h-10">A–Z</Button>
              <Button variant={sort === "newest" ? "tabActive" : "tabInactive"} size="compact" fullWidth={false} onClick={() => setSort("newest")} className="min-h-10">Newest</Button>
            </div>
          </div>
        </div>
      </div>
      {organizations.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="hidden grid-cols-[1.5fr_1fr_1fr_auto] gap-4 border-b border-border bg-bg px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted md:grid">
            <p>{scoped ? "Ministry" : "Organization"}</p><p>Category</p><p>Events</p><p>Status</p>
          </div>
          <div className="divide-y divide-border">
            {organizations.map(organization => (
              <div key={organization.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center">
                <div>
                  <p className="font-bold text-text">{organization.name}</p>
                  <p className="mt-1 text-sm text-muted">{organization.contactEmail || "No contact email"}</p>
                </div>
                <p className="text-sm font-medium text-text">{organization.category}</p>
                <div>
                  <p className="text-sm text-muted">
                    {admin.events.filter(event => event.organizationId === organization.id).length} events
                  </p>
                  {(pendingByOrganization.get(organization.id) ?? 0) > 0 && (
                    <p className="mt-1 text-xs font-bold text-gold">
                      {pendingByOrganization.get(organization.id)} pending{" "}
                      {pendingByOrganization.get(organization.id) === 1 ? "request" : "requests"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <StatusBadge status={organization.status} />
                  <Button variant="ghost" size="compact" fullWidth={false} onClick={() => onOpen(organization.id)}>View</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : admin.loading ? (
        <EmptyState title={scoped ? "Loading your ministries" : "Loading organizations"} detail="Reading the ministries from your workspace." />
      ) : admin.organizations.length ? (
        <EmptyState title={scoped ? "No ministries found" : "No organizations found"} detail="Try another search term or status filter." />
      ) : scoped ? (
        <EmptyState
          title="No ministries yet"
          detail="An administrator appoints you as coordinator of a ministry you belong to. Once appointed, it appears here."
        />
      ) : (
        <EmptyState
          title="No organizations yet"
          detail="Create the first organization, then add the events it runs."
          action={<Button fullWidth={false} size="compact" onClick={onCreate}>Create organization</Button>}
        />
      )}
    </div>
  )
}

function OrganizationDetails({ organization, admin, onBack, onEdit, onCreateEvent, scoped }: {
  organization: Organization
  admin: ReturnType<typeof useAdmin>
  onBack: () => void
  onEdit: () => void
  onCreateEvent: () => void
  scoped: boolean
}) {
  const organizationEvents = admin.events.filter(event => event.organizationId === organization.id)

  function toggleStatus() {
    const action = organization.status === "active" ? "deactivate" : "reactivate"
    if (window.confirm(`Are you sure you want to ${action} ${organization.name}?`)) {
      admin.toggleOrganization(organization.id)
    }
  }

  function remove() {
    if (!window.confirm(`Permanently delete ${organization.name}?`)) return
    if (!admin.deleteOrganization(organization.id)) {
      window.alert("This organization still has events. Delete or move those events before deleting the organization.")
      return
    }
    onBack()
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="compact" fullWidth={false} onClick={onBack}>
        {scoped ? "Back to my ministries" : "Back to organizations"}
      </Button>
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title={organization.name}
        description={`${organization.category} · Created ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(organization.createdAt))}`}
        action={<StatusBadge status={organization.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-2">
          <p className="text-xl font-bold text-text">Organization profile</p>
          <p className="mt-3 leading-relaxed text-muted">{organization.description || "No description provided."}</p>
          {organization.joinCode && (
            <div className="mt-5 rounded-xl border border-border bg-[#F4F6FB] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Group join code</p>
              <p className="mt-1 font-mono text-lg font-bold text-text">{organization.joinCode}</p>
              <p className="mt-1 text-sm text-muted">Share this code with members so they can request to join this organization.</p>
            </div>
          )}
          <div className="mt-5 rounded-xl border border-border bg-[#F4F6FB] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Ministry group chat</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              A group chat named “{organization.name}” is created automatically. Every approved
              member, and every administrator assigned to this organization, joins it
              automatically; members who leave are removed.
            </p>
          </div>
          <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
            {[
              ["Contact email", organization.contactEmail || "Not provided"],
              ["Phone", organization.phone || "Not provided"],
              ["Timezone", organization.timezone],
              ["Address", organization.address || "Not provided"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 font-semibold text-text">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-lg font-bold text-text">{scoped ? "Coordinator access" : "Actions"}</p>
          {scoped ? (
            <div className="mt-4 flex flex-col gap-3">
              <p className="rounded-xl bg-bg p-3 text-sm leading-relaxed text-muted">
                You can add and organise events and review join requests for this ministry. Only an
                administrator can change the ministry profile, its status, or its coordinators.
              </p>
              <Button variant="secondary" onClick={onCreateEvent} disabled={organization.status === "inactive"}>
                Create event
              </Button>
              {organization.status === "inactive" && (
                <p className="rounded-xl bg-gold-light p-3 text-sm font-medium text-gold">
                  This ministry is inactive, so new events cannot be created until an administrator
                  reactivates it.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <Button onClick={onEdit}>Edit organization</Button>
              <Button variant="secondary" onClick={onCreateEvent} disabled={organization.status === "inactive"}>
                Create event
              </Button>
              <Button variant="ghost" onClick={toggleStatus}>
                {organization.status === "active" ? "Deactivate organization" : "Reactivate organization"}
              </Button>
              <Button variant="danger" onClick={remove}>Delete organization</Button>
              {organization.status === "inactive" && (
                <p className="mt-1 rounded-xl bg-gold-light p-3 text-sm font-medium text-gold">
                  New events cannot be created while this organization is inactive.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-text">Events</p>
            <p className="mt-1 text-sm text-muted">Activities belonging to this organization.</p>
          </div>
          <p className="text-sm font-bold text-muted">{organizationEvents.length} total</p>
        </div>
        {organizationEvents.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {organizationEvents.map(event => (
              <div key={event.id} className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-text">{event.title}</p>
                  <p className="mt-1 text-sm text-muted">{formatEventWhen(event)} · {event.location}</p>
                </div>
                <StatusBadge status={event.status} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No events yet" detail="Create the first event for this organization." />
        )}
      </div>
    </div>
  )
}

function OrganizationForm({ initial, onCancel, onSave }: {
  initial?: Organization
  onCancel: () => void
  onSave: (draft: OrganizationDraft, id?: string) => { ok: boolean; message?: string }
}) {
  const [form, setForm] = useState<OrganizationDraft>(initial ?? EMPTY_ORGANIZATION)
  const [error, setError] = useState("")

  function update(field: keyof OrganizationDraft, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    setError("")
  }

  function submit() {
    if (!form.name.trim() || !form.timezone.trim()) {
      setError("Organization name and timezone are required.")
      return
    }
    // The contact email is optional (organizations created in the database may
    // not have one yet), but a malformed address is still rejected.
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      setError("Enter a valid contact email address.")
      return
    }
    const result = onSave(form, initial?.id)
    if (!result.ok) setError(result.message || "Unable to save the organization.")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="compact" fullWidth={false} onClick={onCancel}>Back to Organizations</Button>
      <AdminHeader
        title={initial ? "Edit organization" : "Create organization"}
        description="Keep the profile focused on the information needed to manage schedules and communication. Every new organization automatically gets a group chat for its members."
      />
      <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InputField id="org-name" label="Organization name" value={form.name} onChange={value => update("name", value)} placeholder="e.g. St. Joseph Parish" />
          </div>
          <InputField id="org-email" type="email" label="Contact email" value={form.contactEmail} onChange={value => update("contactEmail", value)} placeholder="office@example.org" />
          <InputField id="org-phone" type="tel" label="Phone number" value={form.phone} onChange={value => update("phone", value)} placeholder="Contact number" />
          <InputField id="org-category" label="Category" value={form.category} onChange={value => update("category", value)} placeholder="Parish, chapel, or community" />
          <InputField id="org-timezone" label="Timezone" value={form.timezone} onChange={value => update("timezone", value)} helper="Used as the default timezone for new events." />
          <div className="sm:col-span-2">
            <InputField id="org-address" label="Address" value={form.address} onChange={value => update("address", value)} placeholder="Full venue or office address" />
          </div>
          <div className="sm:col-span-2">
            <InputField id="org-description" label="Short description" value={form.description} onChange={value => update("description", value)} placeholder="What this organization serves or coordinates" />
          </div>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-light p-4 font-semibold text-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth={false} onClick={onCancel}>Cancel</Button>
          <Button fullWidth={false} onClick={submit}>{initial ? "Save changes" : "Create organization"}</Button>
        </div>
      </div>
    </div>
  )
}

function EventList({ admin, onCreate, onCreateForOrganization, onEdit, scoped, view, onViewChange, position, onPositionChange }: {
  admin: ReturnType<typeof useAdmin>
  onCreate: () => void
  /** Opens the event form with a ministry already chosen. */
  onCreateForOrganization: (organizationId: string) => void
  onEdit: (id: string) => void
  scoped: boolean
  /** List or timeline; kept by the workspace so an event form returns to it. */
  view: "list" | "timeline"
  onViewChange: (view: "list" | "timeline") => void
  position: TimetablePosition
  onPositionChange: (change: Partial<TimetablePosition>) => void
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | EventStatus>("all")
  const [organizationFilter, setOrganizationFilter] = useState("all")

  const events = useMemo(() => admin.events
    .filter(event => event.title.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(event => status === "all" || event.status === status)
    .filter(event => organizationFilter === "all" || event.organizationId === organizationFilter)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  [admin.events, organizationFilter, query, status])

  const organizationOptions = [
    { value: "all", label: "All ministries", count: admin.events.length },
    ...admin.organizations
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(organization => ({
        value: organization.id,
        label: organization.name,
        count: admin.events.filter(event => event.organizationId === organization.id).length,
      })),
  ]

  // Events are grouped by the ministry that runs them; an event whose ministry
  // was removed is kept in one "unassigned" group rather than vanishing.
  const groups = useMemo(
    () => groupItemsByOrganization(admin.organizations, events, event => ({
      organization: admin.organizations.find(organization => organization.id === event.organizationId),
      fallbackName: "Unassigned ministry",
    })),
    [admin.organizations, events],
  )

  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name))

  function clearFilters() {
    setQuery("")
    setStatus("all")
    setOrganizationFilter("all")
  }

  function duplicate(id: string) {
    const nextId = admin.duplicateEvent(id)
    if (nextId) onEdit(nextId)
  }

  function cancel(id: string) {
    if (window.confirm("Cancel this event? Its record will remain available.")) admin.cancelEvent(id)
  }

  function remove(id: string) {
    if (window.confirm("Permanently delete this event? This action cannot be undone.")) admin.deleteEvent(id)
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title="Events"
        description={scoped
          ? "The events of the ministries you coordinate, grouped so you can read one ministry at a time."
          : "Plan, publish, duplicate, and maintain events. Each event is listed under the ministry that runs it."}
        action={<Button fullWidth={false} size="compact" onClick={onCreate}>Create event</Button>}
      />
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_auto] xl:items-end">
          <InputField id="event-search" label="Search events" value={query} onChange={setQuery} placeholder="Search by event title" />
          <OrganizationFilter
            id="event-organization"
            label="Ministry"
            value={organizationFilter}
            onChange={setOrganizationFilter}
            options={organizationOptions}
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Status</p>
            <div className="flex flex-wrap rounded-xl bg-bg p-1">
              {(["all", "draft", "published", "cancelled", "completed"] as const).map(value => (
                <Button
                  key={value}
                  variant={status === value ? "tabActive" : "tabInactive"}
                  size="compact"
                  fullWidth={false}
                  onClick={() => setStatus(value)}
                  className="min-h-10 capitalize"
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-text">View</p>
            <div className="flex rounded-xl bg-bg p-1" role="group" aria-label="How to show the schedule">
              <Button
                variant={view === "list" ? "tabActive" : "tabInactive"}
                size="compact"
                fullWidth={false}
                onClick={() => onViewChange("list")}
                ariaPressed={view === "list"}
                className="min-h-10"
              >
                List
              </Button>
              <Button
                variant={view === "timeline" ? "tabActive" : "tabInactive"}
                size="compact"
                fullWidth={false}
                onClick={() => onViewChange("timeline")}
                ariaPressed={view === "timeline"}
                className="min-h-10"
              >
                Timeline
              </Button>
            </div>
          </div>
        </div>
      </div>
      {!events.length ? (
        admin.loading ? (
          <EmptyState title="Loading events" detail="Reading the schedule from your workspace." />
        ) : admin.events.length ? (
          <EmptyState
            title="No events found"
            detail="No event matches this ministry, status, and search."
            action={<Button fullWidth={false} size="compact" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState
            title="No events yet"
            detail={scoped
              ? "Create an event for one of the ministries you coordinate to start scheduling."
              : "Create an event for one of your organizations to start scheduling."}
            action={<Button fullWidth={false} size="compact" onClick={onCreate}>Create event</Button>}
          />
        )
      ) : view === "timeline" ? (
        <EventsTimeline
          events={events}
          organizations={admin.organizations}
          position={position}
          onPositionChange={onPositionChange}
          onEdit={onEdit}
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-text">Events by ministry</p>
              <p className="mt-1 text-sm text-muted">
                Each ministry's schedule sits in one place, ordered by start time.
              </p>
            </div>
            <p className="text-sm font-bold text-muted">{events.length} shown</p>
          </div>
          {sortedGroups.map(group => {
            const publishedCount = group.items.filter(event => event.status === "published").length
            const draftCount = group.items.filter(event => event.status === "draft").length
            const organization = group.organization
            return (
              <OrganizationGroupCard
                key={group.key}
                name={group.name}
                badges={(
                  <>
                    {organization && <MinistryStatusPill status={organization.status} />}
                    {draftCount > 0 && (
                      <span className="inline-flex rounded-full bg-gold-light px-2.5 py-0.5 text-[11px] font-bold text-gold">
                        {draftCount} {draftCount === 1 ? "draft" : "drafts"}
                      </span>
                    )}
                  </>
                )}
                subtitle={[
                  organization?.category,
                  `${group.items.length} ${group.items.length === 1 ? "event" : "events"}`,
                  `${publishedCount} published`,
                ].filter(Boolean).join(" · ")}
                action={organization?.status === "active" ? (
                  <Button
                    variant="ghost"
                    size="compact"
                    fullWidth={false}
                    onClick={() => onCreateForOrganization(organization.id)}
                    className="whitespace-nowrap"
                  >
                    New event
                  </Button>
                ) : undefined}
              >
                <div className="divide-y divide-border">
                  {group.items.map(event => (
                    <div
                      key={event.id}
                      className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-text">{event.title}</p>
                          <StatusBadge status={event.status} />
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          {formatEventWhen(event)} · {event.location}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="compact"
                          fullWidth={false}
                          onClick={() => onEdit(event.id)}
                          className="border border-border"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="compact"
                          fullWidth={false}
                          onClick={() => duplicate(event.id)}
                          className="border border-border"
                        >
                          Duplicate
                        </Button>
                        {event.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="compact"
                            fullWidth={false}
                            onClick={() => cancel(event.id)}
                            className="border border-border"
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="compact"
                          fullWidth={false}
                          onClick={() => remove(event.id)}
                          className="border border-red/30 text-red hover:bg-red-light"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </OrganizationGroupCard>
            )
          })}
        </section>
      )}
    </div>
  )
}

function EventForm({ initial, organizationId, admin, onCancel, onSaved, scoped }: {
  initial?: AdminEvent
  organizationId?: string
  admin: ReturnType<typeof useAdmin>
  onCancel: () => void
  onSaved: () => void
  scoped: boolean
}) {
  const activeOrganizations = admin.organizations.filter(organization => organization.status === "active")
  // An event that already belongs to a now-inactive ministry can still be
  // edited; it just cannot be moved to another inactive one.
  const selectableOrganizations = initial && !activeOrganizations.some(organization => organization.id === initial.organizationId)
    ? [...activeOrganizations, ...admin.organizations.filter(organization => organization.id === initial.organizationId)]
    : activeOrganizations
  const defaultOrganization = organizationId || initial?.organizationId || activeOrganizations[0]?.id || ""
  const [form, setForm] = useState<EventDraft>(initial ?? emptyEvent(defaultOrganization))
  const [schedule, setSchedule] = useState<EventSchedule>(() =>
    eventSchedule(initial ?? emptyEvent(defaultOrganization)),
  )
  const [error, setError] = useState("")
  const conflict = admin.findConflict(form, initial?.id)

  function update<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setForm(current => ({ ...current, [field]: value }))
    setError("")
  }

  /**
   * The dates and the daily time range are edited independently: changing one
   * never discards the other. This is what lets a two-day event run 1:00–3:00
   * PM on both days instead of becoming one 26-hour block.
   */
  function updateSchedule(patch: Partial<EventSchedule>) {
    const next: EventSchedule = { ...schedule, ...patch }
    // Keep a new event's end date in step with its start date until the
    // coordinator picks one explicitly.
    if (patch.startDate && !next.endDate) next.endDate = patch.startDate
    setSchedule(next)
    setForm(current => ({
      ...current,
      startsAt: combineDateTime(next.startDate, next.startTime),
      endsAt: combineDateTime(next.endDate, next.endTime),
    }))
    setError("")
  }

  function submit(status: "draft" | "published") {
    if (!form.organizationId || !form.title.trim() || !form.location.trim()) {
      setError("Organization, title, and location are required.")
      return
    }
    const issue = scheduleIssue(schedule)
    if (issue) {
      setError(issue)
      return
    }
    const startsAt = combineDateTime(schedule.startDate, schedule.startTime)
    const endsAt = combineDateTime(schedule.endDate, schedule.endTime)
    if (form.registrationDeadline && new Date(form.registrationDeadline) > new Date(startsAt)) {
      setError("Registration must close before the event starts.")
      return
    }
    if (form.capacity < 1) {
      setError("Capacity must be at least 1.")
      return
    }
    const result = admin.saveEvent({ ...form, startsAt, endsAt, status }, initial?.id)
    if (!result.ok) {
      setError(result.message || "Unable to save the event.")
      return
    }
    onSaved()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="compact" fullWidth={false} onClick={onCancel}>Back to Events</Button>
      <AdminHeader
        eyebrow={scoped ? "Coordination" : "Administration"}
        title={initial ? "Edit event" : "Create event"}
        description={scoped
          ? "Add the schedule, location, registration, and publishing details for this ministry event."
          : "Add the core schedule, location, registration, and publishing details."}
      />
      <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-sm font-semibold text-text">{scoped ? "Ministry" : "Organization"}</p>
          {selectableOrganizations.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectableOrganizations.map(organization => (
                <Button
                  key={organization.id}
                  variant={form.organizationId === organization.id ? "tabActive" : "tabInactive"}
                  size="compact"
                  fullWidth={false}
                  onClick={() => update("organizationId", organization.id)}
                  className={form.organizationId === organization.id ? "ring-2 ring-navy" : "border border-border"}
                >
                  {organization.name}
                  {organization.status === "inactive" ? " (inactive)" : ""}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-gold-light p-3 text-sm leading-relaxed text-gold">
              {scoped
                ? "You have no active ministry to schedule yet. Ask an administrator to activate your ministry."
                : "There is no active organization to schedule. Activate or create an organization first."}
            </p>
          )}
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InputField id="event-title" label="Event title" value={form.title} onChange={value => update("title", value)} placeholder="Name of the event" />
          </div>
          <div className="sm:col-span-2">
            <InputField id="event-description" label="Short description" value={form.description} onChange={value => update("description", value)} placeholder="Purpose or helpful attendee details" />
          </div>
          <div className="rounded-2xl border border-border bg-bg/60 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-bold text-text">Event dates</p>
              <p className="text-xs font-semibold text-muted">The days the event runs</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <InputField id="event-start-date" type="date" label="Start date" value={schedule.startDate} onChange={value => updateSchedule({ startDate: value })} />
              <InputField id="event-end-date" type="date" label="End date" value={schedule.endDate} min={schedule.startDate || undefined} onChange={value => updateSchedule({ endDate: value })} />
            </div>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-bold text-text">Daily time range</p>
              <p className="text-xs font-semibold text-muted">The same time on every day</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <InputField id="event-start-time" type="time" label="Start time" value={schedule.startTime} onChange={value => updateSchedule({ startTime: value })} />
              <InputField id="event-end-time" type="time" label="End time" value={schedule.endTime} onChange={value => updateSchedule({ endTime: value })} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              A two-day event from 1:00 PM to 3:00 PM runs 1:00–3:00 PM on both days.
            </p>
            {!scheduleIssue(schedule) && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-navy">
                {describeSchedule(schedule)}
              </p>
            )}
          </div>
          <InputField id="event-location" label="Location" value={form.location} onChange={value => update("location", value)} placeholder="Venue or meeting link" />
          <InputField id="event-capacity" type="number" label="Maximum attendees" value={String(form.capacity)} onChange={value => update("capacity", Number(value))} />
          <InputField id="registration-deadline" type="datetime-local" label="Registration deadline" value={form.registrationDeadline} onChange={value => update("registrationDeadline", value)} helper="Optional. Must be before the event starts." />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Visibility</p>
            <div className="flex rounded-xl bg-bg p-1">
              {(["members", "public"] as const).map(value => (
                <Button key={value} variant={form.visibility === value ? "tabActive" : "tabInactive"} size="compact" fullWidth={false} onClick={() => update("visibility", value)} className="capitalize">
                  {value === "members" ? "Members only" : "Public"}
                </Button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold text-text">Repeats</p>
            <div className="flex flex-wrap gap-2">
              {(["none", "weekly", "monthly"] as Recurrence[]).map(value => (
                <Button key={value} variant={form.recurrence === value ? "tabActive" : "tabInactive"} size="compact" fullWidth={false} onClick={() => update("recurrence", value)} className="border border-border capitalize">
                  {value}
                </Button>
              ))}
            </div>
          </div>
          {form.recurrence !== "none" && (
            <InputField id="repeat-until" type="date" label="Repeat until" value={form.repeatUntil} onChange={value => update("repeatUntil", value)} helper="Optional. Leave blank to keep repeating." />
          )}
        </div>
        {conflict && (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold-light p-4">
            <p className="font-bold text-gold">Possible schedule conflict</p>
            <p className="mt-1 text-sm leading-relaxed text-text">
              This overlaps with “{conflict.title}” at {conflict.location}. You can still continue after reviewing the schedule.
            </p>
          </div>
        )}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-light p-4 font-semibold text-red">{error}</p>}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth={false} onClick={onCancel}>Cancel</Button>
          <Button variant="secondary" fullWidth={false} onClick={() => submit("draft")}>Save as draft</Button>
          <Button fullWidth={false} onClick={() => submit("published")}>Publish event</Button>
        </div>
      </div>
    </div>
  )
}

export function AdminScreen({
  onLogout,
  logoutLabel = "Sign out",
  adminName,
  requests,
  requestError,
  onApproveRequest,
  onRejectRequest,
  role = "admin",
  leaderOrganizationIds = [],
  onOpenConversation,
  initialSection = "dashboard",
  onSectionChange,
}: {
  onLogout: () => void
  /** What leaving the workspace means: a sign out, or a coordinator's way back. */
  logoutLabel?: string
  adminName?: string
  requests: JoinRequest[]
  requestError?: string
  onApproveRequest: (id: string) => void
  onRejectRequest: (id: string) => void
  role?: AdminWorkspaceRole
  /** The ministries a coordinator is allowed to see and schedule. */
  leaderOrganizationIds?: string[]
  /** Opens a conversation on the shared chat screen, returning here afterwards. */
  onOpenConversation: (conversation: ChatConversation) => void
  /** The section to show on mount, restored after returning from a chat. */
  initialSection?: AdminSection
  /** Lets the parent remember the open section across screens. */
  onSectionChange?: (section: AdminSection) => void
}) {
  const scoped = role === "leader"
  const admin = useAdmin(scoped ? { organizationIds: leaderOrganizationIds } : {})
  const messaging = useMessaging()
  const sections = scoped ? COORDINATOR_SECTIONS : ADMIN_SECTIONS
  // The pending queue is the workspace's most time-sensitive work, so the
  // navigation shows its size instead of hiding it inside the section. For a
  // coordinator the list already contains only their ministries' requests.
  const pendingRequestCount = requests.filter(request => request.status === "pending").length
  // The phone layout keeps the original five (or three) bottom tabs and reaches
  // Messages from the chat button in the header instead.
  const mobileSections = sections.filter(section => section.value !== "messages")
  const [view, setView] = useState<AdminView>({
    name: "section",
    section: initialSection,
  })
  // The Events section's list/timeline choice and its place on the timeline are
  // held here, so opening an event form and saving returns to the same view
  // instead of falling back to the list of the current week.
  const [eventsView, setEventsView] = useState<"list" | "timeline">("list")
  const [timelinePosition, setTimelinePosition] = useState<TimetablePosition>({
    weekOffset: 0,
    view: "week",
    dayIndex: 0,
  })

  function changeTimelinePosition(change: Partial<TimetablePosition>) {
    setTimelinePosition(current => ({ ...current, ...change }))
  }

  const activeSection: AdminSection =
    view.name === "section"
      ? view.section
      : view.name.startsWith("organization")
        ? "organizations"
        : "events"

  function openSection(section: AdminSection) {
    setView({ name: "section", section })
    onSectionChange?.(section)
  }

  let content: React.ReactNode
  if (view.name === "organization-form" && !scoped) {
    const initial = view.id ? admin.organizations.find(organization => organization.id === view.id) : undefined
    content = (
      <OrganizationForm
        initial={initial}
        onCancel={() => openSection("organizations")}
        onSave={(draft, id) => {
          const result = admin.saveOrganization(draft, id)
          if (result.ok && result.id) setView({ name: "organization", id: result.id })
          return result
        }}
      />
    )
  } else if (view.name === "organization") {
    const organization = admin.organizations.find(item => item.id === view.id)
    content = organization ? (
      <OrganizationDetails
        organization={organization}
        admin={admin}
        scoped={scoped}
        onBack={() => openSection("organizations")}
        onEdit={() => setView({ name: "organization-form", id: organization.id })}
        onCreateEvent={() => setView({ name: "event-form", organizationId: organization.id })}
      />
    ) : null
  } else if (view.name === "event-form") {
    const initial = view.id ? admin.events.find(event => event.id === view.id) : undefined
    content = (
      <EventForm
        initial={initial}
        organizationId={view.organizationId}
        admin={admin}
        scoped={scoped}
        onCancel={() => openSection("events")}
        onSaved={() => openSection("events")}
      />
    )
  } else if (view.name === "section" && view.section === "requests") {
    content = (
      <JoinRequestList
        requests={requests}
        organizations={admin.organizations}
        scoped={scoped}
        onApprove={onApproveRequest}
        onReject={onRejectRequest}
      />
    )
  } else if (!scoped && view.name === "section" && view.section === "coordinators") {
    content = <CoordinatorsSection organizations={admin.organizations} />
  } else if (view.name === "section" && view.section === "messages") {
    content = (
      <MessagesPanel
        conversations={messaging.conversations}
        loading={messaging.loading}
        error={messaging.error}
        onOpen={onOpenConversation}
        variant="admin"
      />
    )
  } else if (view.name === "section" && view.section === "dashboard") {
    content = (
      <Dashboard
        admin={admin}
        requests={requests}
        scoped={scoped}
        onEvents={() => openSection("events")}
        onTimeline={() => {
          setEventsView("timeline")
          openSection("events")
        }}
        onOpenOrganization={id => setView({ name: "organization", id })}
      />
    )
  } else if (view.name === "section" && view.section === "organizations") {
    content = (
      <OrganizationList
        admin={admin}
        requests={requests}
        scoped={scoped}
        onCreate={() => setView({ name: "organization-form" })}
        onOpen={id => setView({ name: "organization", id })}
      />
    )
  } else {
    content = (
      <EventList
        admin={admin}
        scoped={scoped}
        view={eventsView}
        onViewChange={setEventsView}
        position={timelinePosition}
        onPositionChange={changeTimelinePosition}
        onCreate={() => setView({ name: "event-form" })}
        onCreateForOrganization={organizationId => setView({ name: "event-form", organizationId })}
        onEdit={id => setView({ name: "event-form", id })}
      />
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white shadow-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <AdminBrand compact role={role} />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openSection("messages")}
              aria-label={
                messaging.unreadTotal > 0
                  ? `Messages, ${messaging.unreadTotal} unread`
                  : "Messages"
              }
              className={`relative flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                activeSection === "messages"
                  ? "border-white bg-white text-navy"
                  : "border-white/25 text-white hover:bg-white/10"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 18.5 4 21l.9-4.1A8 8 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.6 0-3.1-.5-4.5-1.5Z"
                />
              </svg>
              {messaging.unreadTotal > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-extrabold text-white ring-2 ring-navy">
                  {messaging.unreadTotal > 99 ? "99+" : messaging.unreadTotal}
                </span>
              )}
            </button>
            <Button variant="ghost" size="compact" fullWidth={false} onClick={onLogout} className="hidden text-white hover:bg-white/10 sm:flex">{logoutLabel}</Button>
            <button
              type="button"
              onClick={onLogout}
              aria-label={logoutLabel}
              title={logoutLabel}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 text-white transition-colors hover:bg-white/10 sm:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M10 12h10m0 0-3-3m3 3-3 3"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-screen max-w-screen-2xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy px-4 py-6 text-white lg:flex">
          <div className="px-3"><AdminBrand role={role} /></div>
          <div className="mx-3 mt-6 h-px bg-white/15" />
          <div className="mt-9 flex flex-1 flex-col gap-2">
            {sections.map(({ value, label }) => (
              <Button
                key={value}
                variant="ghost"
                fullWidth
                onClick={() => openSection(value)}
                className={`justify-start ${activeSection === value ? "bg-white text-navy" : "text-white hover:bg-white/10"}`}
              >
                <span className="flex-1 text-left">{label}</span>
                {value === "requests" && pendingRequestCount > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-extrabold text-navy"
                    aria-label={`${pendingRequestCount} pending requests`}
                  >
                    {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                  </span>
                )}
                {value === "messages" && messaging.unreadTotal > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0392B] px-1.5 text-[10px] font-extrabold text-white">
                    {messaging.unreadTotal > 99 ? "99+" : messaging.unreadTotal}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <div className="border-t border-white/15 pt-4">
            <p className="px-3 text-sm font-semibold">{adminName?.trim() || (scoped ? "Coordinator" : "Administrator")}</p>
            <p className="px-3 text-xs text-white/60">{scoped ? "Ministry coordinator" : "Administrator"}</p>
            <Button variant="ghost" size="compact" onClick={onLogout} className="mt-3 justify-start text-white hover:bg-white/10">
              {logoutLabel}
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-7 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-6xl">
            {(admin.error || requestError) && (
              <div role="alert" className="mb-5 rounded-xl border border-red/30 bg-red-light px-4 py-3 text-sm text-red">
                {admin.error || requestError}
              </div>
            )}
            {content}
          </div>
        </main>
      </div>
      <nav
        className="fixed bottom-3 left-3 right-3 z-40 grid gap-1 rounded-3xl border border-white/70 bg-white/90 p-2 shadow-xl backdrop-blur-xl backdrop-saturate-150 lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileSections.length}, minmax(0, 1fr))` }}
      >
        {mobileSections.map(({ value, label, short }) => (
          <Button
            key={value}
            variant="ghost"
            size="compact"
            fullWidth
            onClick={() => openSection(value)}
            ariaLabel={label}
            ariaPressed={activeSection === value}
            className={`relative min-h-12 rounded-2xl px-1 text-xs sm:px-2 sm:text-sm ${
              activeSection === value
                ? "bg-navy/10 text-navy shadow-sm ring-1 ring-navy/15"
                : "text-muted hover:bg-bg hover:text-navy"
            }`}
          >
            {short}
            {value === "requests" && pendingRequestCount > 0 && (
              <span
                className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-navy"
                aria-label={`${pendingRequestCount} pending requests`}
              >
                {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
              </span>
            )}
          </Button>
        ))}
      </nav>
    </div>
  )
}
