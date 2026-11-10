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
import { type SocialProvider, type UserProfile } from "./types"

type AuthTab = "signin" | "signup"
type PhoneStep = "email" | "phone" | "code"

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.14.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.62 23.09 24 18.1 24 12.07z"
      />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-30"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

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
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithProvider,
    signInWithPhone,
    verifyPhoneOtp,
  } = useAuth()
  const [tab, setTab] = useState<AuthTab>(defaultTab)

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")

  const [socialLoading, setSocialLoading] = useState<string | null>(null)

  const [phoneStep, setPhoneStep] = useState<PhoneStep>("email")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState("")

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError("")
    setInfoMessage("")

    if (phoneStep === "code") {
      await handleVerifyCode(e)
      return
    }

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

  async function handleSocial(provider: SocialProvider) {
    setError("")
    setInfoMessage("")
    setSocialLoading(provider)
    const res = await signInWithProvider(provider)
    setSocialLoading(null)
    if (!res.ok) {
      setError(
        res.error ||
          `Unable to continue with ${provider === "google" ? "Google" : "Facebook"}. Please try again.`,
      )
    }
  }

  async function handleSendCode() {
    setError("")
    setPhoneError("")
    setInfoMessage("")
    const res = await signInWithPhone(phone)
    if (!res.ok) {
      setPhoneError(res.error || "Unable to send the verification code.")
      return
    }
    setInfoMessage(res.message || "Verification code sent.")
    setPhoneStep("code")
  }

  async function handleVerifyCode(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setError("")
    setPhoneError("")

    if (code.trim().length < 6) {
      setPhoneError("Enter the 6-digit verification code.")
      return
    }

    setPhoneLoading(true)
    const res = await verifyPhoneOtp(phone, code)
    setPhoneLoading(false)
    if (!res.ok) {
      setPhoneError(res.error || "Unable to verify the code.")
      return
    }
    onSuccess(res.profile)
  }

  function switchTab(next: AuthTab) {
    setTab(next)
    setError("")
    setInfoMessage("")
    setPhoneStep("email")
    setPhoneError("")
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
            onClick={() => switchTab("signin")}
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
            onClick={() => switchTab("signup")}
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
              ? "Sign in with your email or one tap with Google, Facebook, or your phone."
              : "Register your ministry account to set availability and sign up for mass slots."}
          </p>
        </div>

        {phoneStep === "email" && (
          <>
            <div className="mb-5 flex flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={socialLoading !== null}
                onClick={() => void handleSocial("google")}
              >
                {socialLoading === "google" ? <Spinner /> : <GoogleIcon />}
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={socialLoading !== null}
                onClick={() => void handleSocial("facebook")}
              >
                {socialLoading === "facebook" ? <Spinner /> : <FacebookIcon />}
                Continue with Facebook
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={phoneLoading}
                onClick={() => setPhoneStep("phone")}
              >
                <PhoneIcon />
                Continue with Phone
              </Button>
            </div>

            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#D1D9E8]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                or continue with email
              </span>
              <div className="h-px flex-1 bg-[#D1D9E8]" />
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
                helper={tab === "signup" ? "Must be at least 6 characters" : undefined}
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
          </>
        )}

        {phoneStep === "phone" && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-2xl font-bold text-[#1B3A6B]">Sign in with phone</p>
              <p className="mt-1 text-sm text-[#64748B]">
                Enter your mobile number and we'll send you a 6-digit
                verification code via SMS.
              </p>
            </div>

            <InputField
              id="auth-phone"
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(val) => {
                setPhone(val)
                setPhoneError("")
              }}
              placeholder="+63 917 123 4567"
              autoComplete="tel"
            />

            {phoneError && (
              <div
                role="alert"
                className="rounded-xl bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B] border border-[#FADBD8]"
              >
                {phoneError}
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

            <Button
              type="button"
              onClick={() => void handleSendCode()}
              disabled={phoneLoading || !phone.trim()}
            >
              {phoneLoading ? "Sending..." : "Send Verification Code"}
            </Button>
          </div>
        )}

        {phoneStep === "code" && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <div>
              <p className="text-2xl font-bold text-[#1B3A6B]">Check your phone</p>
              <p className="mt-1 text-sm text-[#64748B]">
                We sent a 6-digit code to{" "}
                <span className="font-bold text-[#1B3A6B]">{phone}</span>. Enter it
                below to sign in or create your account.
              </p>
            </div>

            <InputField
              id="auth-phone-code"
              label="Verification Code"
              type="text"
              value={code}
              onChange={(val) => {
                setCode(val.replace(/[^0-9]/g, ""))
                setPhoneError("")
              }}
              placeholder="123456"
              autoComplete="one-time-code"
            />

            {phoneError && (
              <div
                role="alert"
                className="rounded-xl bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B] border border-[#FADBD8]"
              >
                {phoneError}
              </div>
            )}

            <div className="mt-2 flex flex-col gap-3">
              <Button type="submit" disabled={phoneLoading}>
                {phoneLoading ? "Verifying..." : "Verify & Sign In"}
              </Button>
              <button
                type="button"
                onClick={() => void handleSendCode()}
                disabled={phoneLoading}
                className="text-sm font-bold text-[#1B3A6B] hover:underline cursor-pointer disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

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
