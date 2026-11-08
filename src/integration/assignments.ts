import { isSupabaseConfigured, supabase } from "../lib/supabase"
import { isMemberApiConfigured, memberApi } from "../lib/memberApi"

export type Assignment = {
  id: string

  date: string // YYYY-MM-DD

  time: string // HH:MM 24h

  massName: string

  role: string
}

export async function getMyAssignments(userId?: string): Promise<Assignment[]> {
  if (isMemberApiConfigured && userId) {
    return memberApi.getAssignments()
  }

  if (isSupabaseConfigured && userId) {
    const { data, error } = await supabase
      .from("member_assignments")
      .select("id, assignment_date, assignment_time, mass_name, role")
      .eq("user_id", userId)
      .order("assignment_date")

    if (!error && data) {
      return data.map((assignment) => ({
        id: assignment.id,
        date: assignment.assignment_date,
        time: assignment.assignment_time.slice(0, 5),
        massName: assignment.mass_name,
        role: assignment.role,
      }))
    }
  }

  return [
    {
      id: "a1",
      date: "2026-10-04",
      time: "09:00",
      massName: "Sunday Mass",
      role: "Lector",
    },

    {
      id: "a2",
      date: "2026-10-07",
      time: "18:00",
      massName: "Weekday Mass",
      role: "Lector",
    },

    {
      id: "a3",
      date: "2026-10-11",
      time: "11:00",
      massName: "Sunday Mass",
      role: "Lector",
    },
  ]
}
