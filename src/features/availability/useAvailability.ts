import { useEffect, useState } from "react"
import { useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"

import type {
  RecurringAvail,
  OneTimeOverride,
  AvailEditTarget,
  TimetablePosition,
} from "./types"

import { INITIAL_RECURRING, INITIAL_OVERRIDES } from "./data"

const RECURRING_KEY = "eskedyul_recurring_availability"
const OVERRIDES_KEY = "eskedyul_availability_overrides"

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

// This week, on today. Phones start on the one-day view (big and easy to read); tablets and computers show the whole week.

function initialTimetablePosition(): TimetablePosition {
  return {
    weekOffset: 0,

    view: window.matchMedia("(min-width: 640px)").matches ? "week" : "day",

    dayIndex: (new Date().getDay() + 6) % 7,
  }
}

export function useAvailability() {
  const { user } = useAuth()
  const [recurringEntries, setRecurringEntries] =
    useState<RecurringAvail[]>(() =>
      readStored(RECURRING_KEY, INITIAL_RECURRING),
    )

  const [overrides, setOverrides] =
    useState<OneTimeOverride[]>(() =>
      readStored(OVERRIDES_KEY, INITIAL_OVERRIDES),
    )

  const [editTarget, setEditTarget] = useState<AvailEditTarget | null>(null)

  // Kept here so the timetable shows the same week and view after an add/edit screen.

  const [timetablePosition, setTimetablePosition] = useState(
    initialTimetablePosition,
  )
  const [loadedFromServer, setLoadedFromServer] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return

    let active = true
    Promise.all([
      supabase
        .from("member_recurring_availability")
        .select("id, days, start_time, end_time")
        .eq("user_id", user.id),
      supabase
        .from("member_availability_overrides")
        .select("id, override_date, override_type, start_time, end_time")
        .eq("user_id", user.id),
    ]).then(([recurring, overrides]) => {
      if (!active || recurring.error || overrides.error) return
      setRecurringEntries(
        (recurring.data ?? []).map((entry) => ({
          id: entry.id,
          days: entry.days,
          startTime: entry.start_time.slice(0, 5),
          endTime: entry.end_time.slice(0, 5),
        })),
      )
      setOverrides(
        (overrides.data ?? []).map((entry) => ({
          id: entry.id,
          date: entry.override_date,
          type: entry.override_type,
          startTime: entry.start_time?.slice(0, 5),
          endTime: entry.end_time?.slice(0, 5),
        })),
      )
      setLoadedFromServer(true)
    })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!loadedFromServer && isSupabaseConfigured && user) return
    window.localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringEntries))
  }, [loadedFromServer, recurringEntries, user])

  useEffect(() => {
    if (!loadedFromServer && isSupabaseConfigured && user) return
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
  }, [loadedFromServer, overrides, user])

  return {
    recurringEntries,

    overrides,

    timetablePosition,

    editingRecurring:
      editTarget?.kind === "recurring" ? editTarget.entry : undefined,

    editingOverride:
      editTarget?.kind === "override" ? editTarget.entry : undefined,

    error,

    changePosition(change: Partial<TimetablePosition>) {
      setTimetablePosition((current) => ({ ...current, ...change }))
    },

    resetPosition() {
      setTimetablePosition(initialTimetablePosition())
    },

    /** Pass an entry to edit it, or nothing to add a new one. */

    startRecurring(entry?: RecurringAvail) {
      setEditTarget(entry ? { kind: "recurring", entry } : null)
    },

    startOverride(entry?: OneTimeOverride) {
      setEditTarget(entry ? { kind: "override", entry } : null)
    },

    async saveRecurring(entry: RecurringAvail) {
      if (isSupabaseConfigured && user) {
        const result = await supabase.from("member_recurring_availability").upsert({
          id: entry.id,
          user_id: user.id,
          days: entry.days,
          start_time: entry.startTime,
          end_time: entry.endTime,
        })
        if (result.error) {
          setError(result.error.message)
          return { ok: false, message: result.error.message }
        }
      }
      setError("")
      setRecurringEntries((prev) =>
        prev.find((e) => e.id === entry.id)
          ? prev.map((e) => (e.id === entry.id ? entry : e))
          : [...prev, entry],
      )
      return { ok: true }
    },

    async saveOverride(entry: OneTimeOverride) {
      if (isSupabaseConfigured && user) {
        const result = await supabase.from("member_availability_overrides").upsert({
          id: entry.id,
          user_id: user.id,
          override_date: entry.date,
          override_type: entry.type,
          start_time: entry.startTime || null,
          end_time: entry.endTime || null,
        })
        if (result.error) {
          setError(result.error.message)
          return { ok: false, message: result.error.message }
        }
      }
      setError("")
      setOverrides((prev) =>
        prev.find((e) => e.id === entry.id)
          ? prev.map((e) => (e.id === entry.id ? entry : e))
          : [...prev, entry],
      )
      return { ok: true }
    },

    async removeRecurring(id: string) {
      if (isSupabaseConfigured && user) {
        const result = await supabase
          .from("member_recurring_availability")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id)
        if (result.error) {
          setError(result.error.message)
          return { ok: false, message: result.error.message }
        }
      }
      setError("")
      setRecurringEntries((prev) => prev.filter((e) => e.id !== id))
      return { ok: true }
    },

    async removeOverride(id: string) {
      if (isSupabaseConfigured && user) {
        const result = await supabase
          .from("member_availability_overrides")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id)
        if (result.error) {
          setError(result.error.message)
          return { ok: false, message: result.error.message }
        }
      }
      setError("")
      setOverrides((prev) => prev.filter((e) => e.id !== id))
      return { ok: true }
    },
  }
}
