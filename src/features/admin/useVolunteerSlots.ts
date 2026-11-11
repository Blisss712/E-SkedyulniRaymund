import { useCallback, useEffect, useMemo, useState } from "react"
import { isSupabaseConfigured } from "../../lib/supabase"
import {
  createVolunteerSlot,
  deleteVolunteerSlot,
  fetchSlotSignups,
  fetchSlotVolunteers,
  fetchVolunteerSlots,
  isEventColumnReady,
  removeSlotVolunteer,
  resetEventColumnState,
  type NewVolunteerSlot,
  type SlotSignupRecord,
  type SlotVolunteer,
  type VolunteerSlotRecord,
} from "../slots/volunteerSlotsApi"

export type VolunteerSlotScope = {
  /** A coordinator's workspace only manages the slots of these ministries. */
  organizationIds?: string[]
}

/**
 * Loads the volunteer slots of the ministries in scope together with the people
 * signed up for them. The event roster is built from these three lists, so the
 * events screen, the slots screen, and the member's signup all agree.
 */
export function useVolunteerSlots(scope: VolunteerSlotScope = {}) {
  const scopeKey = scope.organizationIds
    ? [...scope.organizationIds].sort().join(",")
    : ""
  const scopeIds = useMemo(
    () => scope.organizationIds ?? null,
    // The parent may rebuild the array on every render; compare its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  )

  const [slots, setSlots] = useState<VolunteerSlotRecord[]>([])
  const [signups, setSignups] = useState<SlotSignupRecord[]>([])
  const [volunteers, setVolunteers] = useState<SlotVolunteer[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState("")
  const [schemaReady, setSchemaReady] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => {
    // Re-probe the column as well: an administrator may have just applied the
    // database update while this workspace was open.
    resetEventColumnState()
    setReloadKey((key) => key + 1)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSlots([])
      setSignups([])
      setVolunteers([])
      setLoading(false)
      return
    }
    if (scopeIds && scopeIds.length === 0) {
      setSlots([])
      setSignups([])
      setVolunteers([])
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    void (async () => {
      try {
        const savedSlots = await fetchVolunteerSlots(scopeIds ?? undefined)
        const savedSignups = await fetchSlotSignups(
          savedSlots.map((slot) => slot.id),
        )
        const people = await fetchSlotVolunteers(
          savedSlots.map((slot) => slot.id),
          savedSignups,
        )
        if (!active) return
        setSlots(savedSlots)
        setSignups(savedSignups)
        setVolunteers(people)
        setSchemaReady(isEventColumnReady())
        setError("")
      } catch (reason) {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load volunteer slots.",
        )
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [scopeKey, reloadKey])

  function volunteersForSlot(slotId: string) {
    return volunteers.filter((volunteer) => volunteer.slotId === slotId)
  }

  function signupsForSlot(slotId: string) {
    return signups.filter((signup) => signup.slotId === slotId)
  }

  async function createSlot(input: NewVolunteerSlot) {
    try {
      const saved = await createVolunteerSlot(input)
      setSchemaReady(isEventColumnReady())
      refresh()
      return { ok: true as const, id: saved.id }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Unable to open this slot."
      // The form shows this next to the button; no need to repeat it at the top.
      return { ok: false as const, message }
    }
  }

  async function deleteSlot(id: string) {
    setSlots((current) => current.filter((slot) => slot.id !== id))
    setSignups((current) => current.filter((signup) => signup.slotId !== id))
    setVolunteers((current) =>
      current.filter((volunteer) => volunteer.slotId !== id),
    )
    try {
      await deleteVolunteerSlot(id)
      return { ok: true as const }
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Unable to delete this slot."
      setError(message)
      refresh()
      return { ok: false as const, message }
    }
  }

  async function removeVolunteer(slotId: string, userId: string) {
    const previousVolunteers = volunteers
    const previousSignups = signups
    setVolunteers((current) =>
      current.filter(
        (volunteer) =>
          !(volunteer.slotId === slotId && volunteer.userId === userId),
      ),
    )
    setSignups((current) =>
      current.filter(
        (signup) => !(signup.slotId === slotId && signup.userId === userId),
      ),
    )
    try {
      await removeSlotVolunteer(slotId, userId)
      return { ok: true as const }
    } catch (reason) {
      setVolunteers(previousVolunteers)
      setSignups(previousSignups)
      const message =
        reason instanceof Error
          ? reason.message
          : "Unable to remove this volunteer."
      setError(message)
      return { ok: false as const, message }
    }
  }

  return {
    slots,
    signups,
    volunteers,
    loading,
    error,
    schemaReady,
    refresh,
    createSlot,
    deleteSlot,
    removeVolunteer,
    volunteersForSlot,
    signupsForSlot,
    setError,
  }
}
