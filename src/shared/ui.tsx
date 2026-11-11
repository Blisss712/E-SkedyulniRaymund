import { useState, useEffect } from "react"

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChurchIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="10" fill="#1B3A6B" />
      <path
        d="M20 6v4M18 8h4"
        stroke="#C9921A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="13"
        width="12"
        height="16"
        rx="1"
        stroke="white"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M17 29v-6h6v6"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 18h12" stroke="white" strokeWidth="1.5" />
    </svg>
  )
}

export function ClockIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="30" fill="#FEF3DC" />
      <circle
        cx="32"
        cy="32"
        r="22"
        stroke="#C9921A"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M32 20v12l7 7"
        stroke="#C9921A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-[#F4F6FB] px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#D1D9E8] p-7">
      {children}
    </div>
  )
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const textSize =
    size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl"

  return (
    <div className="flex flex-col items-center gap-3">
      <ChurchIcon />
      <div className="text-center">
        <span
          className={`font-extrabold text-[#1B3A6B] ${textSize} tracking-tight leading-none`}
        >
          E-Skedyul
        </span>
        <p className="text-[#64748B] text-sm font-medium mt-1">
          Parish & Ministry Scheduler
        </p>
      </div>
    </div>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[#64748B] text-[15px] font-medium hover:text-[#1B3A6B] transition-colors mb-6 cursor-pointer"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M11 4L6 9l5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Go back
    </button>
  )
}

// ─── Form Components ──────────────────────────────────────────────────────────

interface ButtonProps {
  children: React.ReactNode

  onClick?: () => void

  variant?: "primary" | "secondary" | "ghost" | "danger" | "tabActive" | "tabInactive"

  size?: "default" | "compact"

  type?: "button" | "submit"

  fullWidth?: boolean

  disabled?: boolean

  className?: string

  style?: React.CSSProperties

  ariaLabel?: string

  ariaPressed?: boolean
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "default",
  type = "button",

  fullWidth = true,
  disabled = false,
  className = "",
  style,
  ariaLabel,
  ariaPressed,
}: ButtonProps) {
  const base =
    "font-bold transition-all duration-150 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none"

  const sizes = {
    default: "min-h-14 px-6 rounded-full text-[17px]",

    compact: "min-h-12 px-3 rounded-xl text-base",
  }

  const variants = {
    primary: "bg-[#1B3A6B] text-white hover:bg-[#142d54] active:scale-[0.98]",

    secondary:
      "bg-white text-[#1B3A6B] border-2 border-[#1B3A6B] hover:bg-[#F4F6FB] active:scale-[0.98]",

    ghost:
      "bg-transparent text-[#1B3A6B] hover:bg-[#E8EDF7] active:scale-[0.98]",

    danger: "bg-[#C0392B] text-white hover:bg-[#9F2F23] active:scale-[0.98]",

    tabActive: "bg-white text-navy shadow-sm",

    tabInactive: "bg-transparent text-muted hover:text-navy",
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${
        fullWidth ? "w-full" : ""
      } ${className}`}
      style={style}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  )
}

interface InputFieldProps {
  label: string

  id: string

  type?: string

  value: string

  onChange: (v: string) => void

  helper?: string

  error?: string

  placeholder?: string

  autoComplete?: string

  /** Earliest value a date/time input may accept. */
  min?: string
}

export function InputField({
  label,
  id,
  type = "text",
  value,
  onChange,
  helper,
  error,
  placeholder,
  autoComplete,
  min,
}: InputFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[#1A202C] font-semibold text-[17px]">
        {label}
      </label>
      {helper && !error && (
        <p className="text-[#64748B] text-[15px] leading-snug">{helper}</p>
      )}
      {error && (
        <p
          role="alert"
          className="text-[#C0392B] text-[15px] font-medium flex items-center gap-1"
        >
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        aria-invalid={!!error}
        className={`w-full min-h-[52px] px-4 text-[17px] rounded-xl border-2 bg-white text-[#1A202C] placeholder-[#94A3B8] transition-colors focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 ${
          error
            ? "border-[#C0392B] bg-[#FDEDEC]"
            : "border-[#D1D9E8] hover:border-[#9BA8C0]"
        }`}
      />
    </div>
  )
}

// ─── useSheetClose ────────────────────────────────────────────────────────────

// Plays the popup sheet's exit animation (see .sheet-* in index.css), then runs `after`.

// Put `data-closing={closing}` on the sheet's outer element.

const SHEET_CLOSE_MS = 200

export function useSheetClose() {
  const [closing, setClosing] = useState(false)

  function close(after: () => void) {
    if (closing) return

    setClosing(true)

    setTimeout(() => {
      after()
      setClosing(false)
    }, SHEET_CLOSE_MS)
  }

  return { closing, close }
}

// ─── useIsDesktop ─────────────────────────────────────────────────────────────

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  )

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024)

    window.addEventListener("resize", handler)

    return () => window.removeEventListener("resize", handler)
  }, [])

  return isDesktop
}
