import { useEffect, useState } from "react"
import { useAuth } from "../auth/AuthContext"
import { isSupabaseConfigured, supabase } from "../../lib/supabase"

import type { Slot } from "../../shared/slot"

import type { SlotsScreen } from "./navigation"

import { SAMPLE_SLOTS } from "./data"

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
  const [slots, setSlots] = useState<Slot[]>(readSlots)

  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [serverBacked, setServerBacked] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return

    let active = true
    Promise.all([
      supabase
        .from("volunteer_slots")
        .select("id, slot_date, slot_time, mass_name, total_spots")
        .order("slot_date")
        .order("slot_time"),
      supabase.from("slot_signups").select("slot_id, user_id"),
    ]).then(([slotResult, signupResult]) => {
      if (!active || slotResult.error || signupResult.error) return
      const signups = signupResult.data ?? []
      setSlots(
        (slotResult.data ?? []).map((slot) => {
          const count = signups.filter((signup) => signup.slot_id === slot.id).length
          const serving = signups.some(
            (signup) => signup.slot_id === slot.id && signup.user_id === user.id,
          )
          return {
            id: slot.id,
            date: slot.slot_date,
            time: new Date(`1970-01-01T${slot.slot_time}`).toLocaleTimeString(
              "en-US",
              { hour: "numeric", minute: "2-digit" },
            ),
            massName: slot.mass_name,
            totalSpots: slot.total_spots,
            filledSpots: count,
            status: serving
              ? "serving"
              : count >= slot.total_spots
                ? "filled"
                : "open",
          }
        }),
      )
      setServerBacked(true)
    })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (isSupabaseConfigured && user && !serverBacked) return
    window.localStorage.setItem(SLOTS_KEY, JSON.stringify(slots))
  }, [serverBacked, slots, user])

  return {
    slots,

    activeSlot,

    setActiveSlot,

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
      if (!activeSlot) return

      if (isSupabaseConfigured && user) {
        await supabase.from("slot_signups").insert({
          slot_id: activeSlot.id,
          user_id: user.id,
        })
      }

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
    },

    async cancelSpot() {
      if (!activeSlot) return

      if (isSupabaseConfigured && user) {
        await supabase
          .from("slot_signups")
          .delete()
          .eq("slot_id", activeSlot.id)
          .eq("user_id", user.id)
      }

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
    },
  }
}
