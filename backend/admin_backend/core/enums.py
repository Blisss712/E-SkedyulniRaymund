from enum import StrEnum

class OrganizationStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"

class EventStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

class EventVisibility(StrEnum):
    PUBLIC = "public"
    MEMBERS = "members"

class Recurrence(StrEnum):
    NONE = "none"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
