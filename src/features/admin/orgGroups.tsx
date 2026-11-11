import { useState, type ReactNode } from "react"
import type { JoinRequest, Organization, OrganizationStatus } from "./types"

/**
 * Organization-first building blocks for the workspace.
 *
 * Join requests, events, and coordinator appointments are all read best one
 * ministry at a time. These helpers turn the flat lists into ministry groups,
 * so a reader sees "St. Joseph Parish - 3 pending" before reading any member
 * row, and never has to match a name to an organization in their head.
 */

/** Two-letter monogram used by ministry and member avatars. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  return words
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? "")
    .join("")
}

export type OrganizationGroup<T> = {
  /** The organization id, or a `name:` key for legacy rows with no match. */
  key: string
  name: string
  organization?: Organization
  items: T[]
}

export type OrganizationFilterOption = {
  value: string
  label: string
  count?: number
}

/**
 * Groups items under the organizations they belong to.
 *
 * Organizations with no items are dropped, so the result only contains the
 * ministries the current filter actually touches. Rows whose organization can
 * no longer be found (a legacy request, a deleted ministry) are kept in a
 * fallback group instead of disappearing.
 */
export function groupItemsByOrganization<T>(
  organizations: Organization[],
  items: T[],
  resolve: (item: T) => { organization?: Organization; fallbackName: string },
): OrganizationGroup<T>[] {
  const groups = new Map<string, OrganizationGroup<T>>()
  for (const organization of organizations) {
    groups.set(organization.id, {
      key: organization.id,
      name: organization.name,
      organization,
      items: [],
    })
  }
  for (const item of items) {
    const { organization, fallbackName } = resolve(item)
    const name = fallbackName.trim() || "Unassigned ministry"
    const key = organization?.id ?? `name:${name.toLowerCase()}`
    let group = groups.get(key)
    if (!group) {
      group = { key, name: organization?.name ?? name, organization, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()].filter(group => group.items.length > 0)
}

/**
 * Finds the organization a join request belongs to. Requests written by the
 * optional API only carry the group name and code, so both are used as a
 * fallback before the request is shown as an unlinked group.
 */
export function resolveRequestOrganization(
  request: JoinRequest,
  organizations: Organization[],
): Organization | undefined {
  if (request.organizationId) {
    const byId = organizations.find(organization => organization.id === request.organizationId)
    if (byId) return byId
  }
  const name = request.groupName.trim().toLowerCase()
  if (name) {
    const byName = organizations.find(
      organization => organization.name.trim().toLowerCase() === name,
    )
    if (byName) return byName
  }
  const code = request.groupCode.trim().toLowerCase()
  if (code) {
    return organizations.find(
      organization => organization.joinCode?.trim().toLowerCase() === code,
    )
  }
  return undefined
}

/** Rounded monogram used beside a ministry name. */
export function OrganizationAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-navy-soft font-extrabold text-navy ${
        size === "sm" ? "size-9 text-xs" : "size-11 text-sm"
      }`}
    >
      {initials(name)}
    </span>
  )
}

/** A person's monogram, used on request and coordinator rows. */
export function MemberAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gold-light text-sm font-extrabold text-gold"
    >
      {initials(name)}
    </span>
  )
}

/** Small active/inactive pill shared by the grouped sections. */
export function MinistryStatusPill({ status }: { status: OrganizationStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
        status === "active" ? "bg-green-light text-green" : "bg-slate-100 text-muted"
      }`}
    >
      {status}
    </span>
  )
}

/**
 * Collapsible ministry group.
 *
 * The header is the collapse control; `action` stays outside it so an
 * "Approve all" or "New event" button never triggers a collapse. Groups start
 * open: the whole point is to read a ministry's rows at a glance.
 */
export function OrganizationGroupCard({
  name,
  subtitle,
  badges,
  action,
  defaultOpen = true,
  children,
}: {
  name: string
  subtitle?: ReactNode
  badges?: ReactNode
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-[#F8FAFD] px-4 py-3.5 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 basis-full items-center gap-3 text-left sm:basis-0"
        >
          <OrganizationAvatar name={name} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-base font-bold text-text sm:text-lg">{name}</span>
              {badges}
            </span>
            {subtitle && (
              <span className="mt-0.5 block text-xs leading-relaxed text-muted sm:text-sm">
                {subtitle}
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
            </svg>
          </span>
        </button>
        {action && <div className="shrink-0 max-sm:ml-auto">{action}</div>}
      </div>
      {open && <div className="border-t border-border">{children}</div>}
    </section>
  )
}

/**
 * Ministry picker shared by Join requests, Events, and Coordinators.
 *
 * A native select keeps the long ministry lists compact on a phone while still
 * showing each ministry's item count in the option label.
 */
export function OrganizationFilter({
  id,
  label = "Ministry",
  value,
  onChange,
  options,
}: {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  options: OrganizationFilterOption[]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-text">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border-2 border-border bg-white px-3 text-base font-medium text-text transition-colors hover:border-[#9BA8C0] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
            {typeof option.count === "number" ? ` (${option.count})` : ""}
          </option>
        ))}
      </select>
    </div>
  )
}
