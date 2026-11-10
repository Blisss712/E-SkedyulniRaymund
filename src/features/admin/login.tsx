import { useState } from "react"
import { BackButton, Button, Card, InputField, Logo, ScreenShell } from "../../shared/ui"
import { isAdminApiConfigured, loginAdmin } from "./api"
import { useAuth } from "../auth/AuthContext"
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

export function AdminLoginScreen({ onBack, onAuthenticated }: {
  onBack: () => void
  onAuthenticated: (token?: string) => void
}) {
  const { user, signInAsAdmin, promoteToAdmin } = useAuth()
  const mode = resolveMode()
  // Promotion is a Supabase-side capability, so it is offered whenever accounts
  // are connected, even when the optional FastAPI admin API handles sign-in.
  const accountsAvailable = isSupabaseConfigured

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [showActivation, setShowActivation] = useState(false)
  const [activationEmail, setActivationEmail] = useState("")
  const [activationPassword, setActivationPassword] = useState("")
  const [activationUsername, setActivationUsername] = useState("")
  const [activationCode, setActivationCode] = useState("")
  const [activationError, setActivationError] = useState("")
  const [activationSuccess, setActivationSuccess] = useState("")
  const [activationLoading, setActivationLoading] = useState(false)

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
          const result = await loginAdmin(id, password)
          onAuthenticated(result.access_token)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "The username or password is incorrect.")
        }
        return
      }

      if (mode === "supabase") {
        const result = await signInAsAdmin(id, password)
        if (!result.ok) {
          setError(result.error || "The email/username or password is incorrect.")
          if (result.notAdmin) setShowActivation(true)
          return
        }
        onAuthenticated()
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

  async function activateAdministrator(event?: React.FormEvent) {
    event?.preventDefault()
    setActivationError("")
    setActivationSuccess("")

    if (!activationCode.trim()) {
      setActivationError("Enter the administrator setup code.")
      return
    }

    if (!user && (!activationEmail.trim() || !activationPassword)) {
      setActivationError("Enter the email and password of the member account to promote.")
      return
    }

    setActivationLoading(true)
    try {
      const result = await promoteToAdmin({
        code: activationCode,
        username: activationUsername,
        email: user ? undefined : activationEmail,
        password: user ? undefined : activationPassword,
      })

      if (!result.ok) {
        setActivationError(result.error || "Unable to activate administrator access.")
        return
      }

      setActivationPassword("")
      setActivationCode("")

      if (mode === "supabase") {
        onAuthenticated()
        return
      }

      // With the FastAPI admin API the workspace still needs its own token, so
      // fill in the promoted account and let the administrator sign in.
      setIdentifier(result.profile?.email || activationEmail)
      setPassword("")
      setActivationSuccess(
        "Administrator access activated. Sign in above with that account's password.",
      )
    } finally {
      setActivationLoading(false)
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
            Sign in with an administrator account to manage organizations and events.
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
            {loading ? "Signing in..." : "Sign in to admin"}
          </Button>
        </form>

        {mode === "demo" && (
          <p className="mt-4 rounded-xl bg-gold-light p-3 text-sm leading-relaxed text-gold">
            No account provider is connected in this build, so only the offline demo account works:
            <span className="font-bold"> admin / admin123</span>. Add the Supabase environment
            variables to sign in with real accounts.
          </p>
        )}

        {accountsAvailable && (
          <div className="mt-6 border-t border-border pt-5">
            <button
              type="button"
              aria-expanded={showActivation}
              onClick={() => {
                setShowActivation(current => !current)
                setActivationError("")
                setActivationSuccess("")
                setError("")
              }}
              className="text-sm font-bold text-navy hover:underline cursor-pointer"
            >
              {showActivation
                ? "Hide administrator activation"
                : "Not an administrator yet? Activate admin access →"}
            </button>

            {showActivation && (
              <form
                onSubmit={activateAdministrator}
                className="mt-4 flex flex-col gap-4 rounded-xl border border-gold/30 bg-gold-light p-4"
              >
                <div>
                  <p className="text-base font-bold text-navy">Activate administrator access</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Turns a normal email account into an administrator. Use the administrator setup
                    code stored in <span className="font-mono text-xs">admin_settings</span>; the
                    account you promote must already be registered.
                  </p>
                </div>

                {user ? (
                  <p className="rounded-xl border border-border bg-white p-3 text-sm text-text">
                    Signed in as <span className="font-bold">{user.email || user.phone || "your account"}</span>.
                    Enter the setup code to promote this account.
                  </p>
                ) : (
                  <>
                    <InputField
                      id="activation-email"
                      type="email"
                      label="Member email address"
                      value={activationEmail}
                      onChange={value => {
                        setActivationEmail(value)
                        setActivationError("")
                      }}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    <InputField
                      id="activation-password"
                      type="password"
                      label="Member password"
                      value={activationPassword}
                      onChange={value => {
                        setActivationPassword(value)
                        setActivationError("")
                      }}
                      placeholder="The password for that account"
                      autoComplete="current-password"
                    />
                  </>
                )}

                <InputField
                  id="activation-code"
                  label="Administrator setup code"
                  value={activationCode}
                  onChange={value => {
                    setActivationCode(value)
                    setActivationError("")
                  }}
                  placeholder="Code from Supabase admin_settings"
                  helper="Ask the current administrator, or read it in the Supabase SQL editor."
                />
                <InputField
                  id="activation-username"
                  label="Admin username (optional)"
                  value={activationUsername}
                  onChange={value => {
                    setActivationUsername(value)
                    setActivationError("")
                  }}
                  placeholder="Defaults to the part before @"
                  helper="Used for username sign in. It is made unique automatically."
                />

                {activationError && (
                  <p role="alert" className="rounded-xl bg-red-light p-3 text-sm font-semibold text-red">
                    {activationError}
                  </p>
                )}

                {activationSuccess && (
                  <p role="status" className="rounded-xl bg-green-light p-3 text-sm font-semibold text-green">
                    {activationSuccess}
                  </p>
                )}

                <Button type="submit" variant="secondary" disabled={activationLoading}>
                  {activationLoading ? "Activating..." : "Activate administrator access"}
                </Button>
              </form>
            )}
          </div>
        )}
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-muted">
        This workspace is restricted to authorized administrators.
      </p>
    </ScreenShell>
  )
}
