import { useState } from "react"
import {
  BackButton,
  Button,
  Card,
  InputField,
  Logo,
  ScreenShell,
} from "../../shared/ui"
import { useAuth } from "./AuthContext"

import type { UserProfile } from "./types"

type AuthTab = "signin" | "signup"

export function AuthScreen({
  onSuccess,
  onBack,
  onAdmin,
  defaultTab = "signin",
}: {
  onSuccess: (profile?: UserProfile) => void
  onBack: () => void
  onAdmin?: () => void
  defaultTab?: AuthTab
}) {
  const { signInWithEmail, signUpWithEmail } = useAuth()
  const [tab, setTab] = useState<AuthTab>(defaultTab)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError("")
    setInfoMessage("")

    if (!email.trim() || !password) {
      setError("Please provide both email and password.")
      return
    }

    if (tab === "signup" && !fullName.trim()) {
      setError("Please provide your full name.")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setLoading(true)

    if (tab === "signin") {
      const res = await signInWithEmail(email, password)
      setLoading(false)
      if (!res.ok) {
        setError(
          res.error || "Unable to sign in. Please verify your credentials.",
        )
      } else {
        onSuccess(res.profile)
      }
    } else {
      const res = await signUpWithEmail(email, password, fullName)
      setLoading(false)
      if (!res.ok) {
        setError(res.error || "Unable to register. Please check your details.")
      } else if (res.error) {
        // Confirmation notice message
        setInfoMessage(res.error)
      } else {
        onSuccess()
      }
    }
  }

  return (
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="mb-6 flex justify-center">
        <Logo size="md" />
      </div>

      <Card>
        <div className="mb-6 flex rounded-xl bg-[#F0F4FA] p-1">
          <button
            type="button"
            onClick={() => {
              setTab("signin")
              setError("")
              setInfoMessage("")
            }}
            className={`flex-1 rounded-lg py-2.5 text-center text-sm font-bold transition-all cursor-pointer ${
              tab === "signin"
                ? "bg-white text-[#1B3A6B] shadow-sm"
                : "text-[#64748B] hover:text-[#1B3A6B]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("signup")
              setError("")
              setInfoMessage("")
            }}
            className={`flex-1 rounded-lg py-2.5 text-center text-sm font-bold transition-all cursor-pointer ${
              tab === "signup"
                ? "bg-white text-[#1B3A6B] shadow-sm"
                : "text-[#64748B] hover:text-[#1B3A6B]"
            }`}
          >
            Create Account
          </button>
        </div>

        <div className="mb-5 border-b border-[#D1D9E8] pb-4">
          <p className="text-2xl font-bold text-[#1B3A6B]">
            {tab === "signin" ? "Welcome back" : "Join E-Skedyul"}
          </p>
          <p className="mt-1 text-sm text-[#64748B]">
            {tab === "signin"
              ? "Sign in with your email to view and manage your ministry schedule."
              : "Register your ministry account to set availability and sign up for mass slots."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {tab === "signup" && (
            <InputField
              id="auth-fullname"
              label="Full Name"
              value={fullName}
              onChange={(val) => {
                setFullName(val)
                setError("")
              }}
              placeholder="Maria Santos"
              autoComplete="name"
            />
          )}

          <InputField
            id="auth-email"
            label="Email Address"
            type="email"
            value={email}
            onChange={(val) => {
              setEmail(val)
              setError("")
            }}
            placeholder="you@example.com"
            autoComplete="email"
          />

          <InputField
            id="auth-password"
            label="Password"
            type="password"
            value={password}
            onChange={(val) => {
              setPassword(val)
              setError("")
            }}
            placeholder="••••••••"
            autoComplete={
              tab === "signin" ? "current-password" : "new-password"
            }
            helper={
              tab === "signup" ? "Must be at least 6 characters" : undefined
            }
          />

          {error && (
            <div
              role="alert"
              className="rounded-xl bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B] border border-[#FADBD8]"
            >
              {error}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="rounded-xl bg-[#E8F8F5] p-3 text-sm font-medium text-[#117864] border border-[#A3E4D7]"
            >
              {infoMessage}
            </div>
          )}

          <div className="mt-2">
            <Button type="submit" disabled={loading}>
              {loading
                ? "Processing..."
                : tab === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </Button>
          </div>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 border-t border-[#D1D9E8] pt-5">
          {onAdmin && (
            <button
              type="button"
              onClick={onAdmin}
              className="text-xs font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Sign in to Administrator Workspace →
            </button>
          )}

        </div>
      </Card>
    </ScreenShell>
  )
}
