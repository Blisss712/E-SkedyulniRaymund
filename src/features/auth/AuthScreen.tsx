import { useState } from "react"
import {
  BackButton,
  Button,
  Card,
  InputField,
  Logo,
  ScreenShell,
} from "../../shared/ui"
import {
  DEMO_MEMBER_PASSWORD,
  DEMO_MEMBER_USERNAME,
  useAuth,
} from "./AuthContext"
import { type SocialProvider, type AuthErrorCode, type UserProfile } from "./types"
import { isSupabaseConfigured } from "../../lib/supabase"
import { FacebookIcon, GoogleIcon } from "./providerIcons"

type AuthTab = "signin" | "signup"
type PhoneStep = "email" | "phone" | "code"

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
  onCoordinator,
  onForgotPassword,
  onSkip,
  defaultTab = "signin",
  notice = "",
}: {
  onSuccess: (
    profile?: UserProfile,
    mode?: "signin" | "signup",
  ) => void
  onBack: () => void
  onAdmin?: () => void
  /** Opens the separate leader/coordinator sign-in screen. */
  onCoordinator?: () => void
  /**
   * Opens the set/reset password screen with the typed email. This is the way
   * a Google/Facebook account adds a password for email sign-in.
   */
  onForgotPassword?: (email: string) => void
  onSkip?: () => void
  defaultTab?: AuthTab
  /** Why the last Google/Facebook redirect failed, shown as soon as this screen opens. */
  notice?: string
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
  const [error, setError] = useState(notice)
  const [errorCode, setErrorCode] = useState<AuthErrorCode | "">("")
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
    setErrorCode("")
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
        setErrorCode(res.code ?? "")
      } else {
        onSuccess(res.profile, "signin")
      }
    } else {
      const res = await signUpWithEmail(email, password, fullName)
      setLoading(false)
      if (!res.ok) {
        setError(res.error || "Unable to register. Please check your details.")
        setErrorCode(res.code ?? "")
      } else if (res.error) {
        // Confirmation notice message
        setInfoMessage(res.error)
      } else {
        onSuccess(res.profile, "signup")
      }
    }
  }

  async function handleSocial(provider: SocialProvider) {
    setError("")
    setErrorCode("")
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
    if (phoneLoading) return
    setError("")
    setPhoneError("")
    setInfoMessage("")
    setPhoneLoading(true)
    const res = await signInWithPhone(phone)
    setPhoneLoading(false)
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
    setErrorCode("")
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
        {!isSupabaseConfigured && (
          <div className="mb-5 rounded-xl border border-[#C9921A]/30 bg-[#FEF3DC] p-4">
            <p className="text-sm font-bold text-[#C9921A]">
              Member accounts are not connected in this build
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#1A202C]">
              Add <span className="font-mono">VITE_SUPABASE_URL</span> and{" "}
              <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to{" "}
              <span className="font-mono">.env.local</span> (see{" "}
              <span className="font-mono">.env.example</span>) to enable sign in
              and sign up.
            </p>
          </div>
        )}

        <div className="mb-6 flex rounded-xl bg-[#F0F4FA] p-1">
          <button
            type="button"
            onClick={() => switchTab("signin")}
            aria-pressed={tab === "signin"}
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
            aria-pressed={tab === "signup"}
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

              {tab === "signin" && (
                <p className="text-xs leading-relaxed text-[#64748B]">
                  Created your account with Google or Facebook? Use that same
                  button. Those accounts have no password until you set one with
                  "Forgot password?".
                </p>
              )}
            </div>

            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#D1D9E8]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                or continue with email
              </span>
              <div className="h-px flex-1 bg-[#D1D9E8]" />
            </div>

            {!isSupabaseConfigured && tab === "signin" && (
              <p className="mb-4 rounded-xl bg-[#F4F6FB] p-4 text-base leading-relaxed text-[#1B3A6B]">
                Offline demo sign-in:{" "}
                <span className="font-bold">
                  {DEMO_MEMBER_USERNAME} / {DEMO_MEMBER_PASSWORD}
                </span>
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {tab === "signup" && (
                <InputField
                  id="auth-fullname"
                  label="Full Name"
                  value={fullName}
                  onChange={(val) => {
                    setFullName(val)
                    setError("")
                    setErrorCode("")
                  }}
                  placeholder="Maria Santos"
                  autoComplete="name"
                />
              )}

              <InputField
                id="auth-email"
                label={isSupabaseConfigured ? "Email Address" : "Email or demo username"}
                type={isSupabaseConfigured ? "email" : "text"}
                value={email}
                onChange={(val) => {
                  setEmail(val)
                  setError("")
                  setErrorCode("")
                }}
                placeholder={isSupabaseConfigured ? "you@example.com" : DEMO_MEMBER_USERNAME}
                autoComplete={isSupabaseConfigured ? "email" : "username"}
              />

              <InputField
                id="auth-password"
                label="Password"
                type="password"
                value={password}
                onChange={(val) => {
                  setPassword(val)
                  setError("")
                  setErrorCode("")
                }}
                placeholder="••••••••"
                autoComplete={
                  tab === "signin" ? "current-password" : "new-password"
                }
                helper={tab === "signup" ? "Must be at least 6 characters" : undefined}
              />

              {tab === "signin" && onForgotPassword && (
                <div className="-mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onForgotPassword(email)}
                    className="text-sm font-bold text-[#1B3A6B] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B] border border-[#FADBD8]"
                >
                  <p>{error}</p>
                  {tab === "signin" &&
                    errorCode === "invalid_credentials" &&
                    onForgotPassword && (
                      <button
                        type="button"
                        onClick={() => onForgotPassword(email)}
                        className="mt-2 font-bold underline cursor-pointer"
                      >
                        Set a password for this account →
                      </button>
                    )}
                  {tab === "signup" && errorCode === "account_exists" && (
                    <div className="mt-2 flex flex-col items-start gap-1">
                      <button
                        type="button"
                        onClick={() => switchTab("signin")}
                        className="font-bold underline cursor-pointer"
                      >
                        Go to sign in →
                      </button>
                      {onForgotPassword && (
                        <button
                          type="button"
                          onClick={() => onForgotPassword(email)}
                          className="font-bold underline cursor-pointer"
                        >
                          Set a password instead →
                        </button>
                      )}
                    </div>
                  )}
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
          {!isSupabaseConfigured && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Continue as a guest →
            </button>
          )}
          {onAdmin && (
            <button
              type="button"
              onClick={onAdmin}
              className="text-xs font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Administrator sign in →
            </button>
          )}
          {onCoordinator && (
            <button
              type="button"
              onClick={onCoordinator}
              className="text-xs font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Leader / Coordinator sign in →
            </button>
          )}
        </div>
      </Card>
    </ScreenShell>
  )
}
