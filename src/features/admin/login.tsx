import { useState } from "react"
import {
  BackButton,
  Button,
  Card,
  InputField,
  Logo,
  ScreenShell,
} from "../../shared/ui"
import { useAuth } from "../auth/AuthContext"

export function AdminLoginScreen({
  onBack,
  onAuthenticated,
}: {
  onBack: () => void
  onAuthenticated: () => void
}) {
  const { signInAsAdmin, profile, isAdmin, signOut } = useAuth()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function signIn(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError("")

    if (!identifier.trim() || !password) {
      setError("Please enter your admin email or username and password.")
      return
    }

    setLoading(true)

    const res = await signInAsAdmin(identifier, password)
    setLoading(false)

    if (!res.ok) {
      setError(
        res.error || "Unable to sign in with those administrator credentials.",
      )
      return
    }

    onAuthenticated()
  }

  return (
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="mb-7 flex justify-center">
        <Logo size="md" />
      </div>

      <Card>
        <div className="border-b border-[#D1D9E8] pb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#C9921A]">
            Administration
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1B3A6B]">
            Admin sign in
          </p>
          <p className="mt-2 text-base leading-relaxed text-[#64748B]">
            Sign in with your administrator account to manage organizations,
            events, and volunteer schedules.
          </p>
        </div>

        {/* If user is already authenticated as an administrator */}
        {isAdmin && profile ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-2xl border border-[#27AE60]/30 bg-[#27AE60]/10 p-5 text-center">
              <span className="inline-block rounded-full bg-[#27AE60] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                Active Admin Session
              </span>
              <p className="mt-3 text-xl font-bold text-[#1B3A6B]">
                {profile.fullName}
              </p>
              <p className="text-sm text-[#64748B]">{profile.email}</p>
            </div>
            <Button onClick={onAuthenticated}>Open Admin Workspace</Button>
            <Button variant="ghost" size="compact" onClick={() => signOut()}>
              Sign Out & Switch Account
            </Button>
          </div>
        ) : (
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-5">
            <InputField
              id="admin-username"
              label="Email or Username"
              value={identifier}
              onChange={(value) => {
                setIdentifier(value)
                setError("")
              }}
              placeholder="admin@example.com or admin"
              autoComplete="username"
            />
            <InputField
              id="admin-password"
              label="Password"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value)
                setError("")
              }}
              placeholder="Enter password"
              autoComplete="current-password"
            />

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-[#FDEDEC] p-4 text-sm font-semibold text-[#C0392B] border border-[#FADBD8]"
              >
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Authenticating..." : "Sign in to admin"}
            </Button>

          </form>
        )}
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-[#64748B]">
        This workspace is restricted to authorized parish and ministry
        administrators.
      </p>
    </ScreenShell>
  )
}
