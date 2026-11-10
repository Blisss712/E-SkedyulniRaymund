import { useEffect, useState } from "react"
import {
  BackButton,
  Button,
  Card,
  InputField,
  Logo,
  ScreenShell,
} from "../../shared/ui"
import { useAuth } from "./AuthContext"

type Mode = "request" | "update"

/**
 * Sets a password on an existing account.
 *
 * Supabase creates Google/Facebook accounts without a password, so the email and
 * password form can never sign them in. The recovery link is the supported way
 * to add one: it signs the member into the same account, and this screen saves
 * the password they will use from then on.
 */
export function PasswordResetScreen({
  mode,
  initialEmail = "",
  onBack,
  onDone,
}: {
  mode: Mode
  initialEmail?: string
  onBack: () => void
  onDone: () => void
}) {
  const { user, loading: authLoading, sendPasswordReset, updatePassword } = useAuth()

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")

  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState("")
  const [saved, setSaved] = useState(false)
  /** Set when an expired link needs a fresh email instead of a new password. */
  const [requestAgain, setRequestAgain] = useState(false)

  const accountEmail = user?.email || email

  // The recovery link can be opened while the screen is already mounted; a new
  // link means the old error and "send again" state no longer apply.
  useEffect(() => {
    if (mode === "update") {
      setError("")
      setRequestAgain(false)
    }
  }, [mode])

  async function requestLink(event?: React.FormEvent) {
    event?.preventDefault()
    setError("")

    if (!email.trim() || !email.includes("@")) {
      setError("Enter the email address on your account.")
      return
    }

    setBusy(true)
    const result = await sendPasswordReset(email)
    setBusy(false)

    if (!result.ok) {
      setError(
        result.error || "Unable to send the password email. Please try again.",
      )
      return
    }

    setSentTo(email.trim().toLowerCase())
  }

  async function savePassword(event?: React.FormEvent) {
    event?.preventDefault()
    setError("")

    if (password.length < 6) {
      setError("Use at least 6 characters.")
      return
    }
    if (password !== confirm) {
      setError("The two passwords do not match.")
      return
    }

    setBusy(true)
    const result = await updatePassword(password)
    setBusy(false)

    if (!result.ok) {
      setError(result.error || "Unable to save the new password.")
      return
    }

    setPassword("")
    setConfirm("")
    setSaved(true)
  }

  const showUpdateForm = mode === "update" && !requestAgain && !saved
  const linkExpired = showUpdateForm && !authLoading && !user

  return (
    <ScreenShell>
      <BackButton onClick={onBack} />
      <div className="mb-7 flex justify-center">
        <Logo size="md" />
      </div>

      <Card>
        <div className="border-b border-[#D1D9E8] pb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-[#C9921A]">
            Account access
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1B3A6B]">
            {saved
              ? "Password saved"
              : showUpdateForm
                ? "Choose a new password"
                : sentTo
                  ? "Check your email"
                  : "Set or reset a password"}
          </p>
          <p className="mt-2 text-base leading-relaxed text-[#64748B]">
            {saved
              ? "The same account now has a password. Google and Facebook sign-in still work too."
              : showUpdateForm
                ? "You're signed in from the password link. Set the password you will use with the email sign-in form from now on."
                : sentTo
                  ? "Open the link in the email on this device, then choose a new password."
                  : "Google and Facebook sign-ups start without a password, so they can only sign in with that button. Set one here to use the same account with email and password too."}
          </p>
        </div>

        {authLoading && mode === "update" && !saved && (
          <p role="status" className="mt-6 text-base text-[#64748B]">
            Checking your password link…
          </p>
        )}

        {saved && (
          <div className="mt-6 flex flex-col gap-4">
            <div
              role="status"
              className="rounded-xl border border-[#A3E4D7] bg-[#E8F8F5] p-4 text-sm font-medium text-[#117864]"
            >
              {accountEmail
                ? `Use ${accountEmail} with this password to sign in by email.`
                : "Use the email on the account with this password to sign in by email."}
            </div>
            <Button type="button" onClick={onDone}>
              Continue
            </Button>
          </div>
        )}

        {!saved && sentTo && (
          <div className="mt-6 flex flex-col gap-4">
            <div
              role="status"
              className="rounded-xl border border-[#A3E4D7] bg-[#E8F8F5] p-4 text-sm font-medium text-[#117864]"
            >
              If {sentTo} is on an account, the password link is on its way.
              Check the inbox (and spam folder) and open the newest link on this
              device.
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#FADBD8] bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B]"
              >
                {error}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void requestLink()}
            >
              {busy ? "Sending..." : "Resend the link"}
            </Button>
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Back to sign in →
            </button>
          </div>
        )}

        {!saved && !sentTo && linkExpired && (
          <div className="mt-6 flex flex-col gap-4">
            <div
              role="alert"
              className="rounded-xl border border-[#FADBD8] bg-[#FDEDEC] p-4 text-sm font-medium text-[#C0392B]"
            >
              This password link has expired or was opened in a different
              browser. Send a fresh link, and open it on this device.
            </div>
            <Button type="button" onClick={() => setRequestAgain(true)}>
              Send a new link
            </Button>
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-bold text-[#1B3A6B] hover:underline cursor-pointer"
            >
              Back to sign in →
            </button>
          </div>
        )}

        {!saved && !sentTo && !linkExpired && !authLoading && showUpdateForm && (
          <form
            onSubmit={event => void savePassword(event)}
            className="mt-6 flex flex-col gap-5"
          >
            <div className="rounded-xl border border-[#D1D9E8] bg-[#F4F6FB] p-4 text-sm text-[#64748B]">
              Signed in as{" "}
              <span className="font-bold text-[#1B3A6B]">{accountEmail}</span>
            </div>

            <InputField
              id="password-reset-new"
              label="New password"
              type="password"
              value={password}
              onChange={value => {
                setPassword(value)
                setError("")
              }}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
            <InputField
              id="password-reset-confirm"
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={value => {
                setConfirm(value)
                setError("")
              }}
              placeholder="Type the same password again"
              autoComplete="new-password"
            />

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#FADBD8] bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B]"
              >
                {error}
              </div>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save password"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-[#64748B]">
              After saving, sign in with your email and this password — or keep
              using Google.
            </p>
          </form>
        )}

        {!saved && !sentTo && !linkExpired && !authLoading && !showUpdateForm && (
          <form
            onSubmit={event => void requestLink(event)}
            className="mt-6 flex flex-col gap-5"
          >
            <InputField
              id="password-reset-email"
              label="Account email"
              type="email"
              value={email}
              onChange={value => {
                setEmail(value)
                setError("")
              }}
              placeholder="you@example.com"
              autoComplete="email"
              helper="Use the email on the Google/Facebook or member account."
            />

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#FADBD8] bg-[#FDEDEC] p-3 text-sm font-medium text-[#C0392B]"
              >
                {error}
              </div>
            )}

            <Button type="submit" disabled={busy}>
              {busy ? "Sending..." : "Send password link"}
            </Button>
            <p className="text-center text-xs leading-relaxed text-[#64748B]">
              The link opens this app and keeps the same account: same
              ministries, join requests, and schedule.
            </p>
          </form>
        )}
      </Card>

      <p className="mt-5 text-center text-sm leading-relaxed text-[#64748B]">
        Prefer Google or Facebook? Those buttons on the sign-in screen still work
        — a password is only needed for the email form.
      </p>
    </ScreenShell>
  )
}
