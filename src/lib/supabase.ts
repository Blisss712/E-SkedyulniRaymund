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
    // Keep the member session across reloads so "Sign in" actually returns the
    // user to their account. The administrator workspace still requires a fresh
    // sign-in because its access is held in app state, not the Supabase session.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
