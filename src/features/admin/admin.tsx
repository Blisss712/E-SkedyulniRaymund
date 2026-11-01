import { useMemo, useState } from "react"

import { Button, InputField } from "../../shared/ui"

import { useAdmin } from "./useAdmin"

import type {
  AdminEvent,
  EventDraft,
  EventStatus,
  Organization,
  OrganizationDraft,
  OrganizationStatus,
  Recurrence,
} from "./types"

export type AdminSection = "dashboard" | "organizations" | "events"

type AdminView = { name: "section"; section: AdminSection } | {
  name: "organization"
  id: string
} | { name: "organization-form"; id?: string } | {
  name: "event-form"
  id?: string
  organizationId?: string
}

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
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function AdminBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-white/10 ${
          compact ? "size-10" : "size-12"
        }`}
      >
        <svg
          className={compact ? "size-7" : "size-8"}
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <path
            className="text-gold"
            d="M16 3v5M13.5 5.5h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            className="text-white"
            d="M9 13h14v15H9zM13 28v-6h6v6M9 18h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <p
          className={`${
            compact ? "text-lg" : "text-xl"
          } font-extrabold tracking-tight text-white`}
        >
          E-Skedyul
        </p>
        <p className="text-xs font-medium text-white/70">Admin workspace</p>
      </div>
    </div>
  )
}

function AdminHeader({
  title,
  description,
  action,
}: {
  title: string

  description: string

  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gold">
          Administration
        </p>
        <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
          {title}
        </p>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: number
  detail: string
}) {
  return (
    <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted sm:text-sm">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-navy sm:mt-3 sm:text-4xl">
        {value}
      </p>
      <p className="mt-1 text-xs leading-snug text-muted sm:mt-2 sm:text-sm">
        {detail}
      </p>
    </div>
  )
}

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white px-6 py-12 text-center">
      <p className="text-xl font-bold text-text">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-muted">{detail}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

function Dashboard({
  admin,
  onEvents,
  memberDashboard,
}: {
  admin: ReturnType<typeof useAdmin>

  onEvents: () => void

  memberDashboard: React.ReactNode
}) {
  const nextEvents = admin.events

    .filter((event) => event.status === "published")

    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))

    .slice(0, 4)

  return (
    <div className="space-y-7">
      <AdminHeader
        title="Dashboard"
        description="Manage your organizations and events, and join upcoming schedules."
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Active organizations"
          value={admin.metrics.activeOrganizations}
          detail="Ready to publish events"
        />
        <MetricCard
          label="Published events"
          value={admin.metrics.publishedEvents}
          detail="Visible to participants"
        />
        <MetricCard
          label="Upcoming"
          value={admin.metrics.upcomingEvents}
          detail="Scheduled ahead"
        />
        <MetricCard
          label="Drafts"
          value={admin.metrics.draftEvents}
          detail="Waiting for review"
        />
      </div>
      <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-text">Upcoming events</p>
            <p className="mt-1 text-sm text-muted">
              The next published activities across organizations.
            </p>
          </div>
          <Button
            variant="ghost"
            size="compact"
            fullWidth={false}
            onClick={onEvents}
            className="shrink-0 whitespace-nowrap"
          >
            View all
          </Button>
        </div>
        <div className="divide-y divide-border">
          {nextEvents.map((event) => {
            const organization = admin.organizations.find(
              (item) => item.id === event.organizationId,
            )

            return (
              <div
                key={event.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-text">{event.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {organization?.name} · {formatDateTime(event.startsAt)}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </div>
            )
          })}
        </div>
      </div>
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-navy">Join a schedule</h2>
          <p className="mt-1 text-sm text-muted">
            Check your availability or volunteer for an open slot.
          </p>
        </div>
        {memberDashboard}
      </section>
    </div>
  )
}

function OrganizationList({
  admin,
  onCreate,
  onOpen,
}: {
  admin: ReturnType<typeof useAdmin>

  onCreate: () => void

  onOpen: (id: string) => void
}) {
  const [query, setQuery] = useState("")

  const [status, setStatus] = useState<"all" | OrganizationStatus>("all")

  const [sort, setSort] = useState<"name" | "newest">("name")

  const organizations = useMemo(
    () =>
      admin.organizations

        .filter((organization) =>
          organization.name.toLowerCase().includes(query.trim().toLowerCase()),
        )

        .filter(
          (organization) => status === "all" || organization.status === status,
        )

        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : b.createdAt.localeCompare(a.createdAt),
        ),

    [admin.organizations, query, sort, status],
  )

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Organizations"
        description="Create and maintain the organizations that own your events."
        action={
          <Button fullWidth={false} size="compact" onClick={onCreate}>
            Create organization
          </Button>
        }
      />
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <InputField
            id="organization-search"
            label="Search organizations"
            value={query}
            onChange={setQuery}
            placeholder="Search by name"
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Status</p>
            <div className="flex rounded-xl bg-bg p-1">
              {(["all", "active", "inactive"] as const).map((value) => (
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
              <Button
                variant={sort === "name" ? "tabActive" : "tabInactive"}
                size="compact"
                fullWidth={false}
                onClick={() => setSort("name")}
                className="min-h-10"
              >
                A–Z
              </Button>
              <Button
                variant={sort === "newest" ? "tabActive" : "tabInactive"}
                size="compact"
                fullWidth={false}
                onClick={() => setSort("newest")}
                className="min-h-10"
              >
                Newest
              </Button>
            </div>
          </div>
        </div>
      </div>
      {organizations.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <div className="hidden grid-cols-[1.5fr_1fr_1fr_auto] gap-4 border-b border-border bg-bg px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted md:grid">
            <p>Organization</p>
            <p>Category</p>
            <p>Events</p>
            <p>Status</p>
          </div>
          <div className="divide-y divide-border">
            {organizations.map((organization) => (
              <div
                key={organization.id}
                className="grid gap-4 px-5 py-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"
              >
                <div>
                  <p className="font-bold text-text">{organization.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    {organization.contactEmail}
                  </p>
                </div>
                <p className="text-sm font-medium text-text">
                  {organization.category}
                </p>
                <p className="text-sm text-muted">
                  {
                    admin.events.filter(
                      (event) => event.organizationId === organization.id,
                    ).length
                  }{" "}
                  events
                </p>
                <div className="flex items-center gap-3 md:justify-end">
                  <StatusBadge status={organization.status} />
                  <Button
                    variant="ghost"
                    size="compact"
                    fullWidth={false}
                    onClick={() => onOpen(organization.id)}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No organizations found"
          detail="Try another search term or status filter."
        />
      )}
    </div>
  )
}

function OrganizationDetails({
  organization,
  admin,
  onBack,
  onEdit,
  onCreateEvent,
}: {
  organization: Organization

  admin: ReturnType<typeof useAdmin>

  onBack: () => void

  onEdit: () => void

  onCreateEvent: () => void
}) {
  const organizationEvents = admin.events.filter(
    (event) => event.organizationId === organization.id,
  )

  function toggleStatus() {
    const action =
      organization.status === "active" ? "deactivate" : "reactivate"

    if (
      window.confirm(`Are you sure you want to ${action} ${organization.name}?`)
    ) {
      admin.toggleOrganization(organization.id)
    }
  }

  async function remove() {
    if (!window.confirm(`Permanently delete ${organization.name}?`)) return

    if (!(await admin.deleteOrganization(organization.id))) {
      window.alert(
        "This organization still has events. Delete or move those events before deleting the organization.",
      )

      return
    }

    onBack()
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="compact" fullWidth={false} onClick={onBack}>
        Back to organizations
      </Button>
      <AdminHeader
        title={organization.name}
        description={`${organization.category} · Created ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(organization.createdAt))}`}
        action={<StatusBadge status={organization.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-2">
          <p className="text-xl font-bold text-text">Organization profile</p>
          <p className="mt-3 leading-relaxed text-muted">
            {organization.description || "No description provided."}
          </p>
          <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
            {[
              ["Contact email", organization.contactEmail],

              ["Phone", organization.phone || "Not provided"],

              ["Timezone", organization.timezone],

              ["Address", organization.address || "Not provided"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {label}
                </p>
                <p className="mt-1 font-semibold text-text">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <p className="text-lg font-bold text-text">Actions</p>
          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={onEdit}>Edit organization</Button>
            <Button
              variant="secondary"
              onClick={onCreateEvent}
              disabled={organization.status === "inactive"}
            >
              Create event
            </Button>
            <Button variant="ghost" onClick={toggleStatus}>
              {organization.status === "active"
                ? "Deactivate organization"
                : "Reactivate organization"}
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete organization
            </Button>
          </div>
          {organization.status === "inactive" && (
            <p className="mt-4 rounded-xl bg-gold-light p-3 text-sm font-medium text-gold">
              New events cannot be created while this organization is inactive.
            </p>
          )}
        </div>
      </div>
      <div>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-text">Events</p>
            <p className="mt-1 text-sm text-muted">
              Activities belonging to this organization.
            </p>
          </div>
          <p className="text-sm font-bold text-muted">
            {organizationEvents.length} total
          </p>
        </div>
        {organizationEvents.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {organizationEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-bold text-text">{event.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(event.startsAt)} · {event.location}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No events yet"
            detail="Create the first event for this organization."
          />
        )}
      </div>
    </div>
  )
}

function OrganizationForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Organization

  onCancel: () => void

  onSave: (
    draft: OrganizationDraft,
    id?: string,
  ) => Promise<{ ok: boolean; message?: string }>
}) {
  const [form, setForm] = useState<OrganizationDraft>(
    initial ?? EMPTY_ORGANIZATION,
  )

  const [error, setError] = useState("")

  function update(field: keyof OrganizationDraft, value: string) {
    setForm((current) => ({ ...current, [field]: value }))

    setError("")
  }

  async function submit() {
    if (
      !form.name.trim() ||
      !form.contactEmail.trim() ||
      !form.timezone.trim()
    ) {
      setError("Organization name, contact email, and timezone are required.")

      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      setError("Enter a valid contact email address.")

      return
    }

    const result = await onSave(form, initial?.id)

    if (!result.ok)
      setError(result.message || "Unable to save the organization.")
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button
        variant="ghost"
        size="compact"
        fullWidth={false}
        onClick={onCancel}
      >
        Cancel and go back
      </Button>
      <AdminHeader
        title={initial ? "Edit organization" : "Create organization"}
        description="Keep the profile focused on the information needed to manage schedules and communication."
      />
      <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InputField
              id="org-name"
              label="Organization name"
              value={form.name}
              onChange={(value) => update("name", value)}
              placeholder="e.g. St. Joseph Parish"
            />
          </div>
          <InputField
            id="org-email"
            type="email"
            label="Contact email"
            value={form.contactEmail}
            onChange={(value) => update("contactEmail", value)}
            placeholder="office@example.org"
          />
          <InputField
            id="org-phone"
            type="tel"
            label="Phone number"
            value={form.phone}
            onChange={(value) => update("phone", value)}
            placeholder="Contact number"
          />
          <InputField
            id="org-category"
            label="Category"
            value={form.category}
            onChange={(value) => update("category", value)}
            placeholder="Parish, chapel, or community"
          />
          <InputField
            id="org-timezone"
            label="Timezone"
            value={form.timezone}
            onChange={(value) => update("timezone", value)}
            helper="Used as the default timezone for new events."
          />
          <div className="sm:col-span-2">
            <InputField
              id="org-address"
              label="Address"
              value={form.address}
              onChange={(value) => update("address", value)}
              placeholder="Full venue or office address"
            />
          </div>
          <div className="sm:col-span-2">
            <InputField
              id="org-description"
              label="Short description"
              value={form.description}
              onChange={(value) => update("description", value)}
              placeholder="What this organization serves or coordinates"
            />
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-light p-4 font-semibold text-red"
          >
            {error}
          </p>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth={false} onClick={onCancel}>
            Cancel
          </Button>
          <Button fullWidth={false} onClick={submit}>
            {initial ? "Save changes" : "Create organization"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EventList({
  admin,
  onCreate,
  onEdit,
}: {
  admin: ReturnType<typeof useAdmin>

  onCreate: () => void

  onEdit: (id: string) => void
}) {
  const [query, setQuery] = useState("")

  const [status, setStatus] = useState<"all" | EventStatus>("all")

  const events = useMemo(
    () =>
      admin.events

        .filter((event) =>
          event.title.toLowerCase().includes(query.trim().toLowerCase()),
        )

        .filter((event) => status === "all" || event.status === status)

        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),

    [admin.events, query, status],
  )

  async function duplicate(id: string) {
    const nextId = await admin.duplicateEvent(id)

    if (nextId) onEdit(nextId)
  }

  async function cancel(id: string) {
    if (window.confirm("Cancel this event? Its record will remain available."))
      await admin.cancelEvent(id)
  }

  async function remove(id: string) {
    if (
      window.confirm(
        "Permanently delete this event? This action cannot be undone.",
      )
    )
      await admin.deleteEvent(id)
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Events"
        description="Plan, publish, duplicate, and maintain events across organizations."
        action={
          <Button fullWidth={false} size="compact" onClick={onCreate}>
            Create event
          </Button>
        }
      />
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <InputField
            id="event-search"
            label="Search events"
            value={query}
            onChange={setQuery}
            placeholder="Search by event title"
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Status</p>
            <div className="flex flex-wrap rounded-xl bg-bg p-1">
              {([
                "all",
                "draft",
                "published",
                "cancelled",
                "completed",
              ] as const).map((value) => (
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
        </div>
      </div>
      {events.length ? (
        <div className="space-y-3">
          {events.map((event) => {
            const organization = admin.organizations.find(
              (item) => item.id === event.organizationId,
            )

            return (
              <div
                key={event.id}
                className="rounded-2xl border border-border bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-bold text-text">
                        {event.title}
                      </p>
                      <StatusBadge status={event.status} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-navy">
                      {organization?.name}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(event.startsAt)} · {event.location}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => onEdit(event.id)}
                      className="w-full sm:w-auto"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="compact"
                      onClick={() => duplicate(event.id)}
                      className="w-full sm:w-auto"
                    >
                      Duplicate
                    </Button>
                    {event.status !== "cancelled" && (
                      <Button
                        variant="secondary"
                        size="compact"
                        onClick={() => cancel(event.id)}
                        className="w-full whitespace-nowrap sm:w-auto"
                      >
                        Cancel event
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="compact"
                      onClick={() => remove(event.id)}
                      className="w-full sm:w-auto"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="No events found"
          detail="Try another search term or status filter."
        />
      )}
    </div>
  )
}

function EventForm({
  initial,
  organizationId,
  admin,
  onCancel,
  onSaved,
}: {
  initial?: AdminEvent

  organizationId?: string

  admin: ReturnType<typeof useAdmin>

  onCancel: () => void

  onSaved: () => void
}) {
  const activeOrganizations = admin.organizations.filter(
    (organization) =>
      organization.status === "active" ||
      organization.id === initial?.organizationId,
  )

  const defaultOrganization =
    organizationId ||
    initial?.organizationId ||
    activeOrganizations[0]?.id ||
    ""

  const [form, setForm] = useState<EventDraft>(
    initial ?? emptyEvent(defaultOrganization),
  )

  const [error, setError] = useState("")

  const conflict = admin.findConflict(form, initial?.id)

  function update<K extends keyof EventDraft>(field: K, value: EventDraft[K]) {
    setForm((current) => ({ ...current, [field]: value }))

    setError("")
  }

  async function submit(status: "draft" | "published") {
    if (
      !admin.organizations.some(
        (organization) => organization.id === form.organizationId,
      )
    ) {
      setError("Select an organization for this event.")

      return
    }

    if (
      !form.organizationId ||
      !form.title.trim() ||
      !form.startsAt ||
      !form.endsAt ||
      !form.location.trim()
    ) {
      setError("Organization, title, start, end, and location are required.")

      return
    }

    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError("The end date and time must be after the start.")

      return
    }

    if (
      form.registrationDeadline &&
      new Date(form.registrationDeadline) > new Date(form.startsAt)
    ) {
      setError("Registration must close before the event starts.")

      return
    }

    if (
      form.recurrence !== "none" &&
      (!form.repeatUntil ||
        new Date(`${form.repeatUntil}T23:59:59`) < new Date(form.startsAt))
    ) {
      setError("Repeat until must be on or after the event start date.")

      return
    }

    if (form.capacity < 1) {
      setError("Capacity must be at least 1.")

      return
    }

    const savedId = await admin.saveEvent({ ...form, status }, initial?.id)

    if (!savedId) {
      setError(admin.error || "Unable to save the event.")

      return
    }

    onSaved()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="compact"
        fullWidth={false}
        onClick={onCancel}
      >
        Cancel and go back
      </Button>
      <AdminHeader
        title={initial ? "Edit event" : "Create event"}
        description="Add the core schedule, location, registration, and publishing details."
      />
      <div className="rounded-2xl border border-border border-t-4 border-t-gold bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-sm font-semibold text-text">Organization</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {activeOrganizations.map((organization) => (
              <Button
                key={organization.id}
                variant={
                  form.organizationId === organization.id
                    ? "tabActive"
                    : "tabInactive"
                }
                size="compact"
                fullWidth={false}
                onClick={() => update("organizationId", organization.id)}
                className={
                  form.organizationId === organization.id
                    ? "ring-2 ring-navy"
                    : "border border-border"
                }
              >
                {organization.name}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InputField
              id="event-title"
              label="Event title"
              value={form.title}
              onChange={(value) => update("title", value)}
              placeholder="Name of the event"
            />
          </div>
          <div className="sm:col-span-2">
            <InputField
              id="event-description"
              label="Short description"
              value={form.description}
              onChange={(value) => update("description", value)}
              placeholder="Purpose or helpful attendee details"
            />
          </div>
          <InputField
            id="event-start"
            type="datetime-local"
            label="Starts"
            value={form.startsAt}
            onChange={(value) => update("startsAt", value)}
          />
          <InputField
            id="event-end"
            type="datetime-local"
            label="Ends"
            value={form.endsAt}
            onChange={(value) => update("endsAt", value)}
          />
          <InputField
            id="event-location"
            label="Location"
            value={form.location}
            onChange={(value) => update("location", value)}
            placeholder="Venue or meeting link"
          />
          <InputField
            id="event-capacity"
            type="number"
            label="Maximum attendees"
            value={String(form.capacity)}
            onChange={(value) => update("capacity", Number(value))}
          />
          <InputField
            id="registration-deadline"
            type="datetime-local"
            label="Registration deadline"
            value={form.registrationDeadline}
            onChange={(value) => update("registrationDeadline", value)}
            helper="Optional. Must be before the event starts."
          />
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Visibility</p>
            <div className="flex rounded-xl bg-bg p-1">
              {(["members", "public"] as const).map((value) => (
                <Button
                  key={value}
                  variant={
                    form.visibility === value ? "tabActive" : "tabInactive"
                  }
                  size="compact"
                  fullWidth={false}
                  onClick={() => update("visibility", value)}
                  className="capitalize"
                >
                  {value === "members" ? "Members only" : "Public"}
                </Button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold text-text">Repeats</p>
            <div className="flex flex-wrap gap-2">
              {(["none", "weekly", "monthly"] as Recurrence[]).map((value) => (
                <Button
                  key={value}
                  variant={
                    form.recurrence === value ? "tabActive" : "tabInactive"
                  }
                  size="compact"
                  fullWidth={false}
                  onClick={() => update("recurrence", value)}
                  className="border border-border capitalize"
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          {form.recurrence !== "none" && (
            <InputField
              id="repeat-until"
              type="date"
              label="Repeat until"
              value={form.repeatUntil}
              onChange={(value) => update("repeatUntil", value)}
            />
          )}
        </div>
        {conflict && (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold-light p-4">
            <p className="font-bold text-gold">Possible schedule conflict</p>
            <p className="mt-1 text-sm leading-relaxed text-text">
              This overlaps with “{conflict.title}” at {conflict.location}. You
              can still continue after reviewing the schedule.
            </p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-light p-4 font-semibold text-red"
          >
            {error}
          </p>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" fullWidth={false} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={() => submit("draft")}
          >
            Save as draft
          </Button>
          <Button fullWidth={false} onClick={() => submit("published")}>
            Publish event
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AdminScreen({
  onLogout,

  memberDashboard,

  adminName,

  adminEmail,

  onSwitchToMember,
}: {
  onLogout: () => void

  memberDashboard: React.ReactNode

  adminName?: string

  adminEmail?: string

  onSwitchToMember?: () => void
}) {
  const admin = useAdmin()

  const [view, setView] = useState<AdminView>({
    name: "section",
    section: "dashboard",
  })

  const activeSection: AdminSection =
    view.name === "section"
      ? view.section
      : view.name.startsWith("organization")
        ? "organizations"
        : "events"

  function openSection(section: AdminSection) {
    setView({ name: "section", section })
  }

  let content: React.ReactNode

  if (view.name === "organization-form") {
    const initial = view.id
      ? admin.organizations.find((organization) => organization.id === view.id)
      : undefined

    content = (
      <OrganizationForm
        initial={initial}
        onCancel={() => openSection("organizations")}
        onSave={async (draft, id) => {
          const result = await admin.saveOrganization(draft, id)

          if (result.ok && result.id)
            setView({ name: "organization", id: result.id })

          return result
        }}
      />
    )
  } else if (view.name === "organization") {
    const organization = admin.organizations.find((item) => item.id === view.id)

    content = organization ? (
      <OrganizationDetails
        organization={organization}
        admin={admin}
        onBack={() => openSection("organizations")}
        onEdit={() =>
          setView({ name: "organization-form", id: organization.id })
        }
        onCreateEvent={() =>
          setView({ name: "event-form", organizationId: organization.id })
        }
      />
    ) : null
  } else if (view.name === "event-form") {
    const initial = view.id
      ? admin.events.find((event) => event.id === view.id)
      : undefined

    content = (
      <EventForm
        initial={initial}
        organizationId={view.organizationId}
        admin={admin}
        onCancel={() => openSection("events")}
        onSaved={() => openSection("events")}
      />
    )
  } else if (view.section === "dashboard") {
    content = (
      <Dashboard
        admin={admin}
        onEvents={() => openSection("events")}
        memberDashboard={memberDashboard}
      />
    )
  } else if (view.section === "organizations") {
    content = (
      <OrganizationList
        admin={admin}
        onCreate={() => setView({ name: "organization-form" })}
        onOpen={(id) => setView({ name: "organization", id })}
      />
    )
  } else {
    content = (
      <EventList
        admin={admin}
        onCreate={() => setView({ name: "event-form" })}
        onEdit={(id) => setView({ name: "event-form", id })}
      />
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white shadow-sm lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <AdminBrand compact />
          <div className="flex items-center gap-2">
            {onSwitchToMember && (
              <Button
                variant="ghost"
                size="compact"
                fullWidth={false}
                onClick={onSwitchToMember}
                className="text-white text-xs hover:bg-white/10"
              >
                Member View
              </Button>
            )}
            <Button
              variant="ghost"
              size="compact"
              fullWidth={false}
              onClick={onLogout}
              className="text-white text-xs hover:bg-white/10"
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-screen max-w-screen-2xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy px-4 py-6 text-white lg:flex">
          <div className="px-3">
            <AdminBrand />
          </div>
          <div className="mx-3 mt-6 h-px bg-white/15" />
          <div className="mt-9 flex flex-1 flex-col gap-2">
            {(["dashboard", "organizations", "events"] as AdminSection[]).map(
              (section) => (
                <Button
                  key={section}
                  variant="ghost"
                  fullWidth
                  onClick={() => openSection(section)}
                  className={`justify-start ${
                    activeSection === section
                      ? "bg-white text-navy"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  {section}
                </Button>
              ),
            )}
          </div>
          <div className="border-t border-white/15 pt-4">
            <p className="px-3 text-sm font-semibold truncate">
              {adminName || "Administrator"}
            </p>
            <p className="px-3 text-xs text-white/60 truncate">
              {adminEmail || "admin@eskedyul.local"}
            </p>
            <div className="mt-3 flex flex-col gap-1">
              {onSwitchToMember && (
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={onSwitchToMember}
                  className="justify-start text-white hover:bg-white/10"
                >
                  Switch to Member View
                </Button>
              )}
              <Button
                variant="ghost"
                size="compact"
                onClick={onLogout}
                className="justify-start text-white hover:bg-white/10"
              >
                Sign out
              </Button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-7 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-6xl">
            {admin.loading && (
              <p className="mb-5 rounded-xl bg-gold-light p-4 font-semibold text-gold">
                Loading scheduling data…
              </p>
            )}
            {admin.error && (
              <p role="alert" className="mb-5 rounded-xl bg-red-light p-4 font-semibold text-red">
                {admin.error}
              </p>
            )}
            {content}
          </div>
        </main>
      </div>
      <nav className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-3 gap-1 rounded-3xl border border-white/70 bg-white/90 p-2 shadow-xl backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        {(["dashboard", "organizations", "events"] as AdminSection[]).map(
          (section) => (
            <Button
              key={section}
              variant="ghost"
              size="compact"
              fullWidth
              onClick={() => openSection(section)}
              ariaPressed={activeSection === section}
              className={`min-h-12 rounded-2xl px-1 text-xs capitalize sm:px-2 sm:text-sm ${
                activeSection === section
                  ? "bg-navy/10 text-navy shadow-sm ring-1 ring-navy/15"
                  : "text-muted hover:bg-bg hover:text-navy"
              }`}
            >
              {section}
            </Button>
          ),
        )}
      </nav>
    </div>
  )
}
