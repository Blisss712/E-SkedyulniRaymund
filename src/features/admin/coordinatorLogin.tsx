import { useState } from "react"
import { BackButton, Button, Card, InputField, Logo, ScreenShell } from "../../shared/ui"
import { useAuth } from "../auth/AuthContext"
import type { AuthErrorCode, SocialProvider, UserProfile } from "../auth/types"
import { isSupabaseConfigured } from "../../lib/supabase"
import { FacebookIcon, GoogleIcon } from "../auth/providerIcons"
import { rememberWorkspaceIntent, takeWorkspaceIntent } from "../auth/redirect"

/** Which step of the phone sign-in is showing, if any. */
type PhoneStep = "idle" | "phone" | "code"

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

function providerName(provider: SocialProvider): string {
  return provider === "google" ? "Google" : "Facebook"
}

/**
 * The leader/coordinator sign-in screen.
 *
 * It is deliberately separate from the administrator sign-in: an account only
 * gets in here when an administrator has appointed it to coordinate at least one
 * ministry (see supabase/organization_leaders.sql). The account is an ordinary
 * member account, so it offers the same three ways in as the member screen —
 * Google, Facebook, or a one-time SMS code — plus the email and password set on
 * it.
 *
 * Every route ends at the same rule: the resolved role has to be `leader`. The
 * Google/Facebook round trip re-checks it after the reload (see App.tsx and
 * rememberWorkspaceIntent()); the password and phone forms check it here and end
 * the session again when the account is not an appointed coordinator.
 */
export function CoordinatorLoginScreen({ onBack, onAuthenticated, onAdmin, onForgotPassword, notice = "" }: {
  onBack: () => void
  onAuthenticated: (profile?: UserProfile) => void
  /** Opens the separate administrator sign-in screen. */
  onAdmin?: () => void
  /**
   * Opens the set/reset password screen. Google/Facebook/phone accounts have no
   * password until one is set, so the email form cannot accept them before that.
   */
  onForgotPassword?: (email: string) => void
  /** Why the last Google/Facebook redirect failed, shown as soon as this screen opens. */
  notice?: string
}) {
  const {
    signInAsCoordinator,
    signInWithProvider,
    sendCoordinatorPhoneCode,
    verifyCoordinatorPhoneOtp,
  } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(notice)
  const [errorCode, setErrorCode] = useState<AuthErrorCode | "">("")
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null)

  const [phoneStep, setPhoneStep] = useState<PhoneStep>("idle")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState("")
  const [infoMessage, setInfoMessage] = useState("")

  const accountsAvailable = isSupabaseConfigured

  function clearMessages() {
    setError("")
    setErrorCode("")
    setPhoneError("")
    setInfoMessage("")
  }

  async function signIn(event?: React.FormEvent) {
    event?.preventDefault()
    clearMessages()

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
        setErrorCode(result.code ?? "")
        return
      }
      onAuthenticated(result.profile)
    } finally {
      setLoading(false)
    }
  }

  async function continueWithProvider(provider: SocialProvider) {
    clearMessages()
    setSocialLoading(provider)
    // Remember the workspace choice across the OAuth reload so a coordinator
    // lands back in the coordinator workspace, not on the member dashboard.
    rememberWorkspaceIntent("coordinator")
    const result = await signInWithProvider(provider)
    if (!result.ok) {
      // The provider never left this page, so the pending workspace choice is
      // abandoned; do not let it redirect a later sign-in.
      takeWorkspaceIntent()
      setSocialLoading(null)
      setError(
        result.error ||
          `Unable to open ${providerName(provider)} sign-in. Please try again.`,
      )
    }
  }

  function startPhoneSignIn() {
    clearMessages()
    setPhoneStep("phone")
  }

  function cancelPhoneSignIn() {
    clearMessages()
    setCode("")
    setPhoneStep("idle")
  }

  async function sendCode() {
    clearMessages()
    if (!phone.trim()) {
      setPhoneError("Enter the mobile number on your coordinator account.")
      return
    }

    setPhoneLoading(true)
    const result = await sendCoordinatorPhoneCode(phone)
    setPhoneLoading(false)
    if (!result.ok) {
      setPhoneError(result.error || "Unable to send the verification code.")
      return
    }
    setInfoMessage(result.message || "Verification code sent.")
    setPhoneStep("code")
  }

  async function verifyCode(event?: React.FormEvent) {
    event?.preventDefault()
    clearMessages()

    if (code.trim().length < 6) {
      setPhoneError("Enter the 6-digit verification code.")
      return
    }

    setPhoneLoading(true)
    const result = await verifyCoordinatorPhoneOtp(phone, code)
    setPhoneLoading(false)
    if (!result.ok) {
      setPhoneError(result.error || "Unable to verify the code.")
      return
    }
    onAuthenticated(result.profile)
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

        {phoneStep === "idle" && (
          <>
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

            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={!accountsAvailable || socialLoading !== null || loading}
                onClick={() => void continueWithProvider("google")}
              >
                {socialLoading === "google" ? <Spinner /> : <GoogleIcon />}
                {socialLoading === "google" ? "Opening Google..." : "Continue with Google"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!accountsAvailable || socialLoading !== null || loading}
                onClick={() => void continueWithProvider("facebook")}
              >
                {socialLoading === "facebook" ? <Spinner /> : <FacebookIcon />}
                {socialLoading === "facebook" ? "Opening Facebook..." : "Continue with Facebook"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!accountsAvailable || socialLoading !== null || loading}
                onClick={startPhoneSignIn}
              >
                <PhoneIcon />
                Continue with Phone
              </Button>
              <p className="text-xs leading-relaxed text-[#64748B]">
                Appointed with a Google, Facebook, or mobile-number account? Use that button.
                These accounts have no password until you set one — the email form below can
                then be used too.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-4 rounded-xl bg-red-light p-4 text-sm font-semibold text-red"
              >
                <p>{error}</p>
                {errorCode === "invalid_credentials" && onForgotPassword && (
                  <button
                    type="button"
                    onClick={() => onForgotPassword(email)}
                    className="mt-2 font-bold underline cursor-pointer"
                  >
                    Set or reset the password for this account →
                  </button>
                )}
              </div>
            )}

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#D1D9E8]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                or use email and password
              </span>
              <div className="h-px flex-1 bg-[#D1D9E8]" />
            </div>

            <form onSubmit={signIn} className="flex flex-col gap-5">
              <InputField
                id="coordinator-email"
                label="Coordinator email"
                type="email"
                value={email}
                onChange={value => {
                  setEmail(value)
                  setError("")
                  setErrorCode("")
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
                  setErrorCode("")
                }}
                placeholder="Enter password"
                autoComplete="current-password"
              />

              {onForgotPassword && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onForgotPassword(email)}
                    className="text-sm font-bold text-navy hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || socialLoading !== null || !accountsAvailable}
              >
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
          </>
        )}

        {phoneStep === "phone" && (
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <p className="text-2xl font-bold text-navy">Sign in with phone</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Enter the mobile number on your coordinator account and we'll text you a 6-digit
                verification code.
              </p>
            </div>

            <InputField
              id="coordinator-phone"
              label="Mobile number"
              type="tel"
              value={phone}
              onChange={value => {
                setPhone(value)
                setPhoneError("")
                setInfoMessage("")
              }}
              placeholder="+63 917 123 4567"
              autoComplete="tel"
              helper="Include the country code. This only works for a number already on an appointed account."
            />

            {phoneError && (
              <div
                role="alert"
                className="rounded-xl bg-red-light p-4 text-sm font-semibold text-red"
              >
                {phoneError}
              </div>
            )}

            <Button
              type="button"
              onClick={() => void sendCode()}
              disabled={!accountsAvailable || phoneLoading || !phone.trim()}
            >
              {phoneLoading ? "Sending..." : "Send verification code"}
            </Button>
            <button
              type="button"
              onClick={cancelPhoneSignIn}
              disabled={phoneLoading}
              className="text-sm font-bold text-navy hover:underline cursor-pointer disabled:opacity-50"
            >
              Use a different sign-in method
            </button>
          </div>
        )}

        {phoneStep === "code" && (
          <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-4">
            <div>
              <p className="text-2xl font-bold text-navy">Check your phone</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                We sent a 6-digit code to <span className="font-bold text-navy">{phone}</span>.
                Enter it below to sign in.
              </p>
            </div>

            <InputField
              id="coordinator-phone-code"
              label="Verification code"
              type="text"
              value={code}
              onChange={value => {
                setCode(value.replace(/[^0-9]/g, ""))
                setPhoneError("")
              }}
              placeholder="123456"
              autoComplete="one-time-code"
            />

            {phoneError && (
              <div
                role="alert"
                className="rounded-xl bg-red-light p-4 text-sm font-semibold text-red"
              >
                {phoneError}
              </div>
            )}

            {infoMessage && (
              <div
                role="status"
                className="rounded-xl bg-[#E8F8F5] p-4 text-sm font-semibold text-[#117864]"
              >
                {infoMessage}
              </div>
            )}

            <Button type="submit" disabled={phoneLoading}>
              {phoneLoading ? "Verifying..." : "Verify & sign in"}
            </Button>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={phoneLoading}
                className="text-sm font-bold text-navy hover:underline cursor-pointer disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={cancelPhoneSignIn}
                disabled={phoneLoading}
                className="text-sm font-bold text-navy hover:underline cursor-pointer disabled:opacity-50"
              >
                Use a different number
              </button>
            </div>
          </form>
        )}
      </Card>
      <p className="mt-5 text-center text-sm leading-relaxed text-muted">
        Your access is limited to the ministries you lead. If you have not been appointed yet, ask
        an administrator in the Administrator Workspace → Coordinators.
      </p>
    </ScreenShell>
  )
}
