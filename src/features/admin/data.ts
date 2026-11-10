import type { AdminEvent, Organization } from "./types"

export const INITIAL_ORGANIZATIONS: Organization[] = [
  {
    id: "st-joseph",

    name: "St. Joseph Parish",

    description:
      "A welcoming parish community serving local families and ministries.",

    contactEmail: "office@stjoseph.example",

    phone: "(02) 8123 4567",

    timezone: "Asia/Manila",

    address: "24 Mabini Street, Quezon City",

    category: "Parish",

    status: "active",

    createdAt: "2026-07-12",
  },

  {
    id: "holy-family",

    name: "Holy Family Chapel",

    description: "Community chapel coordinating worship and outreach programs.",

    contactEmail: "admin@holyfamily.example",

    phone: "(02) 8456 7890",

    timezone: "Asia/Manila",

    address: "18 Sampaguita Road, Makati City",

    category: "Chapel",

    status: "active",

    createdAt: "2026-08-03",
  },

  {
    id: "sacred-heart",

    name: "Sacred Heart Community",

    description: "Faith community supporting youth and neighborhood programs.",

    contactEmail: "hello@sacredheart.example",

    phone: "(02) 8789 0123",

    timezone: "Asia/Manila",

    address: "7 Rizal Avenue, Pasig City",

    category: "Community",

    status: "inactive",

    createdAt: "2026-05-18",
  },
]

export const INITIAL_EVENTS: AdminEvent[] = [
  {
    id: "sunday-mass",

    organizationId: "st-joseph",

    title: "Sunday Mass",

    description:
      "Weekly parish celebration with assigned liturgical ministries.",

    startsAt: "2026-10-04T09:00",

    endsAt: "2026-10-04T10:30",

    location: "Main Church",

    capacity: 240,

    registrationDeadline: "2026-10-03T18:00",

    visibility: "public",

    recurrence: "weekly",

    repeatUntil: "2026-12-27",

    status: "published",

    createdAt: "2026-09-10",
  },

  {
    id: "choir-rehearsal",

    organizationId: "st-joseph",

    title: "Choir Rehearsal",

    description: "Final rehearsal for the Sunday liturgy.",

    startsAt: "2026-10-03T17:00",

    endsAt: "2026-10-03T19:00",

    location: "Parish Hall",

    capacity: 40,

    registrationDeadline: "2026-10-02T17:00",

    visibility: "members",

    recurrence: "weekly",

    repeatUntil: "2026-12-19",

    status: "published",

    createdAt: "2026-09-11",
  },

  {
    id: "youth-assembly",

    organizationId: "holy-family",

    title: "Youth Ministry Assembly",

    description: "Monthly formation and planning session.",

    startsAt: "2026-10-10T14:00",

    endsAt: "2026-10-10T16:00",

    location: "Formation Room",

    capacity: 60,

    registrationDeadline: "2026-10-09T12:00",

    visibility: "members",

    recurrence: "monthly",

    repeatUntil: "2027-03-13",

    status: "draft",

    createdAt: "2026-09-22",
  },
]
