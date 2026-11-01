import type { FormData } from "./types"

export const INITIAL_FORM: FormData = {
  name: "",

  groupCode: "",

  groupName: "",
}

export const EXAMPLE_GROUPS: Record<string, string> = {
  "LECT-2024": "Lectors Ministry",

  "ALTAR-01": "Altar Servers",

  "CHOIR-A": "Parish Choir",

  "YOUTH-GRP": "Youth Ministry",
}

export const PENDING_STEPS = [
  "Your request has been sent to the group leader.",
  "They will review and approve your request.",
]
