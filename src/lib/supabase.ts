import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || ""
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ""

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://YOUR_PROJECT_REF.supabase.co" &&
    !supabaseUrl.includes("YOUR_PROJECT_REF"),
)

// Fallback dummy URL and key to prevent createClient from crashing if unconfigured
const clientUrl = isSupabaseConfigured
  ? supabaseUrl
  : "https://placeholder.supabase.co"
const clientKey = isSupabaseConfigured ? supabaseAnonKey : "placeholder-key"

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    // Do not reopen the app in a previous administrator or member session.
    // Authentication remains active for the current app session.
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
