import { useState } from "react"
import { BackButton, Button, Card, InputField, Logo, ScreenShell } from "../../shared/ui"
import { useAuth } from "../auth/AuthContext"
import type { UserProfile } from "../auth/types"
import { isSupabaseConfigured } from "../../lib/supabase"

/**
 * The leader/coordinator sign-in screen.
 *
 * It is deliberately separate from the administrator sign-in: an account only
 * gets in here when an administrator has appointed it to coordinate at least one
 * ministry (see supabase/organization_leaders.sql). The account is an ordinary
 * member account, so it uses the member's email and password.
 */
export function CoordinatorLoginScreen({ onBack, onAuthenticated, onAdmin }: {
  onBack: () => void
  onAuthenticated: (profile?: UserProfile) => void
  /** Opens the separate administrator sign-in screen. */
  onAdmin?: () => void
}) {
  const { signInAsCoordinator } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const accountsAvailable = isSupabaseConfigured

  async function signIn(event?: React.FormEvent) {
    event?.preventDefault()
    setError("")

    const cleanEmail = email.trim()
    if (!cleanEmail || !password) {
      setError("Enter the email and password of your coordinator account.")
      return
    }
    if (!cleanEmail.includes("@")) {
      setError("Enter the email address on your member account, not your name.")
      return
    }

    setLoading(true)
    try {
      const result = await signInAsCoordinator(cleanEmail, password)
      if (!result.ok) {
        setError(result.error || "The email or password is incorrect.")
        return
      }
      onAuthenticated(result.profile)
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
          <p className="text-xs font-bold uppercase tracking-widest text-gold">Ministry coordination</p>
          <p className="mt-2 text-2xl font-bold text-navy">Leader / Coordinator sign in</p>
          <p className="mt-2 text-base leading-relaxed text-muted">
            For members appointed by an administrator to coordinate a ministry. You can add and
            organise events for the ministries you lead.
          </p>
        </div>

        {!accountsAvailable && (
          <div className="mt-5 rounded-xl border border-gold/30 bg-gold-light p-4">
            <p className="text-sm font-bold text-gold">Coordinator accounts are not connected</p>
            <p className="mt-1 text-sm leading-relaxed text-text">
              Coordinator access is stored in Supabase. Add{" "}
              <span className="font-mono">VITE_SUPABASE_URL</span> and{" "}
              <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to{" "}
              <span className="font-mono">.env.local</span> to enable this sign in.
            </p>
          </div>
        )}

        <form onSubmit={signIn} className="mt-6 flex flex-col gap-5">
          <InputField
            id="coordinator-email"
            label="Coordinator email"
            type="email"
            value={email}
            onChange={value => {
              setEmail(value)
              setError("")
            }}
            placeholder="you@example.com"
            autoComplete="username"
            helper="Use the email on the member account an administrator appointed."
          />
          <InputField
            id="coordinator-password"
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

          <Button type="submit" disabled={loading || !accountsAvailable}>
            {loading ? "Signing in..." : "Sign in as coordinator"}
          </Button>
        </form>

        {onAdmin && (
          <div className="mt-5 border-t border-border pt-5">
            <button
              type="button"
              onClick={onAdmin}
              className="w-full text-center text-sm font-bold text-navy hover:underline cursor-pointer"
            >
              Administrator? Admin sign in →
            </button>
          </div>
        )}
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-muted">
        Your access is limited to the ministries you lead. If you have not been appointed yet, ask
        an administrator in the Administrator Workspace → Coordinators.
      </p>
    </ScreenShell>
  )
}
