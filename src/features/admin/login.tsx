import { useState } from "react"
import { BackButton, Button, Card, InputField, Logo, ScreenShell } from "../../shared/ui"
import { isAdminApiConfigured, loginAdmin } from "./api"
import { useAuth } from "../auth/AuthContext"
import type { UserProfile } from "../auth/types"
import { isSupabaseConfigured } from "../../lib/supabase"

const DEMO_USERNAME = "admin"
const DEMO_PASSWORD = "admin123"

/**
 * How this build can verify an administrator:
 * - "api": the optional FastAPI service issues its own access token.
 * - "supabase": Supabase Auth checks the password, and `admin_profiles` grants
 *   administrator access (email or admin username).
 * - "demo": neither is configured, so only the offline demo account works.
 */
type SignInMode = "api" | "supabase" | "demo"

function resolveMode(): SignInMode {
  if (isAdminApiConfigured) return "api"
  if (isSupabaseConfigured) return "supabase"
  return "demo"
}

export function AdminLoginScreen({ onBack, onAuthenticated, onCoordinator }: {
  onBack: () => void
  onAuthenticated: (profile?: UserProfile) => void
  /** Opens the separate leader/coordinator sign-in screen. */
  onCoordinator?: () => void
}) {
  const { signInAsAdmin } = useAuth()
  const mode = resolveMode()

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)


  async function signIn(event?: React.FormEvent) {
    event?.preventDefault()
    setError("")

    const id = identifier.trim()
    if (!id || !password) {
      setError("Enter your email or username and password.")
      return
    }

    setLoading(true)
    try {
      if (mode === "api") {
        try {
          await loginAdmin(id, password)
          onAuthenticated()
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "The username or password is incorrect.")
        }
        return
      }

      if (mode === "supabase") {
        const result = await signInAsAdmin(id, password)
        if (!result.ok) {
          setError(result.error || "The email/username or password is incorrect.")
          return
        }
        onAuthenticated(result.profile)
        return
      }

      if (id !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
        setError("The username or password is incorrect.")
        return
      }
      onAuthenticated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="mb-7 flex justify-center">
        <Logo size="md" />
      </div>
      <Card>
        <div className="border-b border-border pb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-gold">Administration</p>
          <p className="mt-2 text-2xl font-bold text-navy">Admin sign in</p>
          <p className="mt-2 text-base leading-relaxed text-muted">
            Administrators only. Manage organizations, events, join requests, and ministry
            coordinators.
          </p>
        </div>

        <form onSubmit={signIn} className="mt-6 flex flex-col gap-5">
          <InputField
            id="admin-username"
            label="Admin email or username"
            value={identifier}
            onChange={value => {
              setIdentifier(value)
              setError("")
            }}
            placeholder={mode === "demo" ? "admin" : "admin@example.com or admin"}
            autoComplete="username"
            helper={
              mode === "supabase"
                ? "Use the email of an administrator account, or the admin username stored with it."
                : undefined
            }
          />
          <InputField
            id="admin-password"
            label="Password"
            type="password"
            value={password}
            onChange={value => {
              setPassword(value)
              setError("")
            }}
            placeholder="Enter password"
            autoComplete="current-password"
          />

          {error && (
            <p role="alert" className="rounded-xl bg-red-light p-4 text-sm font-semibold text-red">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in as administrator"}
          </Button>
        </form>

        {mode === "demo" && (
          <p className="mt-4 rounded-xl bg-gold-light p-3 text-sm leading-relaxed text-gold">
            No account provider is connected in this build, so only the offline demo account works:
            <span className="font-bold"> admin / admin123</span>. Add the Supabase environment
            variables to sign in with real accounts.
          </p>
        )}

        {onCoordinator && (
          <div className="mt-5 border-t border-border pt-5">
            <button
              type="button"
              onClick={onCoordinator}
              className="w-full text-center text-sm font-bold text-navy hover:underline cursor-pointer"
            >
              Ministry coordinator? Leader/Coordinator sign in →
            </button>
          </div>
        )}
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-muted">
        This workspace is restricted to authorized administrators.
      </p>
    </ScreenShell>
  )
}
