import { useEffect, useRef, useState } from "react"
import { useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"
import { isMemberApiConfigured, memberApi } from "../../lib/memberApi"

import type { Slot } from "../../shared/slot"

import type { SlotsScreen } from "./navigation"

import { SAMPLE_SLOTS } from "./data"
import {
  fetchSlotSignups,
  fetchVolunteerSlots,
  formatSlotTime,
  parseStoredSlotLabel,
} from "./volunteerSlotsApi"

const SLOTS_KEY = "eskedyul_slots"

function readSlots() {
  if (typeof window === "undefined") return SAMPLE_SLOTS
  try {
    const stored = window.localStorage.getItem(SLOTS_KEY)
    return stored ? JSON.parse(stored) : SAMPLE_SLOTS
  } catch {
    return SAMPLE_SLOTS
  }
}

export function useSlots() {
  const { user } = useAuth()
  const userId = user?.id ?? ""
  // With a database connected the server owns the slots, so the browser keeps
  // no per-account copy. Local storage is only the offline demo's store.
  const [slots, setSlots] = useState<Slot[]>(() =>
    isSupabaseConfigured ? [] : readSlots(),
  )

  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const loadedUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    // Clear the previous account's slots before the new ones arrive, but keep
    // the current list while a plain refresh is in flight (no empty flash).
    const userChanged = loadedUserRef.current !== userId
    loadedUserRef.current = userId
    if (userChanged) {
      setSlots([])
      setActiveSlot(null)
    }
    setError("")

    if (!userId) return

    let active = true
    if (isMemberApiConfigured) {
      void memberApi.getSlots().then(savedSlots => {
        if (!active) return
        // The optional backend predates event-linked slots, so it may still
        // return a compatibility marker as part of the label.
        setSlots(
          savedSlots.map(slot => ({
            ...slot,
            massName: parseStoredSlotLabel(slot.massName).label,
          })),
        )
        setError("")
      }).catch(reason => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : "Unable to load volunteer slots.")
      })
      return () => {
        active = false
      }
    }

    void (async () => {
      try {
        const savedSlots = await fetchVolunteerSlots()
        // Signups are read in one request and counted per slot, so the list
        // shows the same "N of M spots filled" that the roster uses.
        const signups = await fetchSlotSignups(savedSlots.map(slot => slot.id))
        if (!active) return
        setSlots(
          savedSlots.map((slot) => {
            const count = signups.filter((signup) => signup.slotId === slot.id).length
            const serving = signups.some(
              (signup) => signup.slotId === slot.id && signup.userId === userId,
            )
            return {
              id: slot.id,
              date: slot.date,
              time: formatSlotTime(slot.time),
              massName: slot.label,
              totalSpots: slot.totalSpots,
              filledSpots: count,
              status: serving
                ? "serving"
                : count >= slot.totalSpots
                  ? "filled"
                  : "open",
              eventId: slot.eventId,
            }
          }),
        )
        setError("")
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : "Unable to load volunteer slots.")
      }
    })()

    return () => {
      active = false
    }
  }, [userId, reloadKey])

  useEffect(() => {
    if (isSupabaseConfigured) {
      // Drop any copy left by an older build now that the server owns this data.
      window.localStorage.removeItem(SLOTS_KEY)
      return
    }
    window.localStorage.setItem(SLOTS_KEY, JSON.stringify(slots))
  }, [slots])

  return {
    slots,

    activeSlot,

    setActiveSlot,

    error,

    /** Re-reads the slots, e.g. when the member opens the Open Slots tab. */
    refresh() {
      setReloadKey(key => key + 1)
    },

    /** Selects a slot from the list and returns the screen that matches its status. */

    openSlot(slot: Slot): SlotsScreen {
      setActiveSlot(slot)

      return slot.status === "filled"
        ? "slot-filled"
        : slot.status === "serving"
          ? "slot-serving"
          : "slot-volunteer"
    },

    async volunteer() {
      if (!activeSlot) return { ok: false, message: "No slot selected." }

      if (isMemberApiConfigured && user) {
        try {
          await memberApi.volunteerForSlot(activeSlot.id)
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Unable to volunteer for this slot."
          setError(message)
          return { ok: false, message }
        }
      } else if (isSupabaseConfigured && user) {
        const result = await supabase.from("slot_signups").insert({
          slot_id: activeSlot.id,
          user_id: user.id,
        })
        if (result.error) {
          const message =
            result.error.code === "23503"
              ? "This slot is no longer available."
              : result.error.message
          setError(message)
          return { ok: false, message }
        }
      }

      setError("")
      setSlots((prev) =>
        prev.map((s) =>
          s.id === activeSlot.id
            ? { ...s, status: "serving", filledSpots: s.filledSpots + 1 }
            : s,
        ),
      )

      setActiveSlot((prev) =>
        prev
          ? { ...prev, status: "serving", filledSpots: prev.filledSpots + 1 }
          : prev,
      )
      return { ok: true }
    },

    async cancelSpot() {
      if (!activeSlot) return { ok: false, message: "No slot selected." }

      if (isMemberApiConfigured && user) {
        try {
          await memberApi.cancelSlotSignup(activeSlot.id)
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Unable to cancel this signup."
          setError(message)
          return { ok: false, message }
        }
      } else if (isSupabaseConfigured && user) {
        const result = await supabase
          .from("slot_signups")
          .delete()
          .eq("slot_id", activeSlot.id)
          .eq("user_id", user.id)
        if (result.error) {
          setError(result.error.message)
          return { ok: false, message: result.error.message }
        }
      }

      setError("")
      setSlots((prev) =>
        prev.map((s) =>
          s.id === activeSlot.id
            ? {
                ...s,
                status: "open",
                filledSpots: Math.max(0, s.filledSpots - 1),
              }
            : s,
        ),
      )
      return { ok: true }
    },
  }
}
