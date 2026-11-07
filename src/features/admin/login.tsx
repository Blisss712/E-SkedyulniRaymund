import { useState } from "react"
import { BackButton, Button, Card, InputField, Logo, ScreenShell } from "../../shared/ui"
import { isAdminApiConfigured, loginAdmin } from "./api"

const DEMO_USERNAME = "admin"
const DEMO_PASSWORD = "admin123"

export function AdminLoginScreen({ onBack, onAuthenticated }: {
  onBack: () => void
  onAuthenticated: (token?: string) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function signIn() {
    if (!username.trim() || !password) {
      setError("Enter your username and password.")
      return
    }
    setLoading(true)
    if (isAdminApiConfigured) {
      try {
        const result = await loginAdmin(username.trim(), password)
        setError("")
        onAuthenticated(result.access_token)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The username or password is incorrect.")
      } finally {
        setLoading(false)
      }
      return
    }
    if (username.trim() !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
      setError("The username or password is incorrect.")
      return
    }
    setError("")
    onAuthenticated()
    setLoading(false)
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
            Sign in with your administrator account to manage organizations and events.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-5">
          <InputField
            id="admin-username"
            label="Username"
            value={username}
            onChange={value => {
              setUsername(value)
              setError("")
            }}
            placeholder="Enter username"
            autoComplete="username"
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
          <Button onClick={() => void signIn()} disabled={loading}>{loading ? "Signing in..." : "Sign in to admin"}</Button>
        </div>
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-muted">
        This workspace is restricted to authorized administrators.
      </p>
    </ScreenShell>
  )
}
