export type OrganizationStatus = "active" | "inactive"

export type EventStatus = "draft" | "published" | "cancelled" | "completed"

export type EventVisibility = "public" | "members"

export type Recurrence = "none" | "weekly" | "monthly"

export type Organization = {
  id: string

  name: string

  joinCode?: string

  description: string

  contactEmail: string

  phone: string

  timezone: string

  address: string

  category: string

  status: OrganizationStatus

  createdAt: string
}

export type OrganizationDraft = Omit<Organization, "id" | "createdAt">

export type AdminEvent = {
  id: string

  organizationId: string

  title: string

  description: string

  startsAt: string

  endsAt: string

  location: string

  capacity: number

  registrationDeadline: string

  visibility: EventVisibility

  recurrence: Recurrence

  repeatUntil: string

  status: EventStatus

  createdAt: string
}

export type EventDraft = Omit<AdminEvent, "id" | "createdAt">

export type JoinRequestStatus = "pending" | "approved" | "rejected"

export type JoinRequest = {
  id: string
  memberName: string
  groupCode: string
  groupName: string
  status: JoinRequestStatus
  requestedAt: string
  reviewedAt?: string | null
}
