import type { Slot, SlotStatus } from "../../shared/slot"
import { BackButton } from "../../shared/ui"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSlotDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatSlotDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

/** The local `YYYY-MM-DD` key, so "today" does not slip a day in UTC+8. */
function todayKey() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

function groupSlotsByDate(slots: Slot[]): { date: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>()

  slots.forEach((s) => {
    if (!map.has(s.date)) map.set(s.date, [])

    map.get(s.date)!.push(s)
  })

  return [...map.entries()].map(([date, slots]) => ({ date, slots }))
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SlotStatusPill({ status }: { status: SlotStatus }) {
  if (status === "serving") {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#1B3A6B] text-white text-[13px] font-semibold whitespace-nowrap">
        You're serving
      </span>
    )
  }

  if (status === "open") {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full border border-[#1B3A6B] bg-white text-[#1B3A6B] text-[13px] font-semibold whitespace-nowrap">
        Open
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#F1F5F9] text-[#475569] text-[13px] font-semibold whitespace-nowrap">
      Filled
    </span>
  )
}

function SlotDetailCard({ slot }: { slot: Slot }) {
  return (
    <div className="border border-[#D1D9E8] rounded-2xl p-5 bg-white">
      <p className="text-[#C9921A] text-[12px] font-bold uppercase tracking-widest mb-2">
        {slot.eventId ? "Event volunteer slot" : "Volunteer slot"}
      </p>
      <p className="text-[#64748B] text-[14px] font-medium mb-1">
        {formatSlotDate(slot.date)}
      </p>
      <p className="text-[#1A202C] text-[22px] font-bold leading-tight mb-1">
        {slot.time}
      </p>
      <p className="text-[#64748B] text-[15px] leading-snug">{slot.massName}</p>
    </div>
  )
}

/** Filled spots as a bar; a slot can have more spots than a row of dots fits. */
function SpotsMeter({ slot }: { slot: Slot }) {
  const percent =
    slot.totalSpots > 0
      ? Math.min(100, Math.round((slot.filledSpots / slot.totalSpots) * 100))
      : 0

  return (
    <div className="space-y-2">
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-[#E8EDF7]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={slot.totalSpots}
        aria-valuenow={slot.filledSpots}
        aria-label={`${slot.filledSpots} of ${slot.totalSpots} spots filled`}
      >
        <div
          className="h-full rounded-full bg-[#1B3A6B] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-[#64748B] text-[15px]">
        <span className="font-semibold text-[#1A202C]">
          {slot.filledSpots} of {slot.totalSpots}
        </span>{" "}
        spots filled
        {slot.totalSpots - slot.filledSpots === 1 && (
          <span className="text-[#C9921A] font-semibold"> · Last spot!</span>
        )}
      </p>
    </div>
  )
}

// ─── Screens ──────────────────────────────────────────────────────────────────

export function SlotList({
  slots,
  onSlotTap,
}: {
  slots: Slot[]
  onSlotTap: (slot: Slot) => void
}) {
  // A slot is an invitation for an upcoming event, so once its day has passed
  // it no longer belongs in "Open Slots" (the Availability timetable keeps the
  // history of the shifts already served).
  const today = todayKey()
  const upcoming = slots.filter(slot => slot.date >= today)
  const grouped = groupSlotsByDate(upcoming)

  return (
    <div>
      <p className="text-2xl font-extrabold text-[#1B3A6B]">Open Slots</p>
      <p className="mb-4 mt-1 text-[17px] leading-relaxed text-[#64748B]">
        Upcoming volunteer slots opened for events, with the spots that are still
        open.
      </p>

      <div className="overflow-hidden rounded-2xl border border-[#D1D9E8] bg-white">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#F4F6FB] flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="4"
                  y="6"
                  width="24"
                  height="22"
                  rx="3"
                  stroke="#94A3B8"
                  strokeWidth="2"
                  fill="none"
                />
                <path
                  d="M4 12h24M10 4v4M22 4v4"
                  stroke="#94A3B8"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-[#1A202C] font-bold text-[18px]">
              No upcoming slots scheduled
            </p>
            <p className="text-[#64748B] text-[15px] leading-relaxed">
              Your group coordinator hasn't opened a volunteer slot for an upcoming
              event yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="px-5 pb-8">
            {grouped.map(({ date, slots: daySlots }, gi) => (
              <div key={date}>
                {gi > 0 && <div className="h-px bg-[#F1F5F9] my-1" />}
                <p className="text-[#64748B] text-[12px] font-bold uppercase tracking-widest pt-5 pb-2">
                  {formatSlotDateShort(date)}
                </p>
                {daySlots.map((slot) => {
                  const remaining = Math.max(0, slot.totalSpots - slot.filledSpots)
                  return (
                    <button
                      key={slot.id}
                      onClick={() => onSlotTap(slot)}
                      className={`w-full flex items-center justify-between gap-3 py-4 border-b border-[#F1F5F9] text-left transition-colors hover:bg-[#F8FAFC] cursor-pointer active:bg-[#F1F5F9]`}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold text-[16px] leading-tight ${
                            slot.status === "filled"
                              ? "text-[#475569]"
                              : "text-[#1A202C]"
                          }`}
                        >
                          {slot.time}
                        </p>
                        <p className="text-[13px] mt-0.5 text-[#64748B]">
                          {slot.massName}
                          {remaining > 0
                            ? ` · ${remaining} ${remaining === 1 ? "spot" : "spots"} left`
                            : " · Full"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <SlotStatusPill status={slot.status} />
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="text-[#D1D9E8]"
                          aria-hidden="true"
                        >
                          <path
                            d="M5 3l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SlotVolunteerScreen({
  slot,
  onVolunteer,
  error,
  onBack,
}: {
  slot: Slot
  onVolunteer: () => void
  error?: string
  onBack: () => void
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col px-5">
      <div className="pt-10 pb-6">
        <BackButton onClick={onBack} label="Back" className="" />
      </div>
      <div className="flex-1 flex flex-col gap-6">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#1B3A6B] leading-tight mb-1">
            Volunteer for this event
          </h1>
          <p className="text-[#64748B] text-[16px]">
            Review the details and take one of the open spots.
          </p>
        </div>
        <SlotDetailCard slot={slot} />
        <div className="rounded-2xl bg-[#F4F6FB] p-4">
          <p className="text-[15px] leading-relaxed text-[#475569]">
            Volunteering puts your name on the volunteer list for{" "}
            <span className="font-semibold text-[#1A202C]">{slot.massName}</span>.
            You can cancel from this screen if your plans change.
          </p>
        </div>
        <SpotsMeter slot={slot} />
      </div>
      <div className="py-8 flex flex-col gap-4">
        {error && <p role="alert" className="text-sm font-medium text-[#C0392B]">{error}</p>}
        <button
          onClick={onVolunteer}
          className="w-full min-h-[56px] rounded-full bg-[#1B3A6B] text-white text-[17px] font-bold hover:bg-[#142d54] active:scale-[0.98] transition-all cursor-pointer"
        >
          Volunteer for this slot
        </button>
        <button
          onClick={onBack}
          className="w-full min-h-[48px] text-[#64748B] text-[16px] font-medium hover:text-[#1B3A6B] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function SlotServingScreen({
  slot,
  onCancelSpot,
  error,
  onBack,
}: {
  slot: Slot
  onCancelSpot: () => void
  error?: string
  onBack: () => void
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col px-5">
      <div className="pt-10 pb-6">
        <BackButton onClick={onBack} label="Back" className="" />
      </div>
      <div className="flex-1 flex flex-col gap-6">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#1B3A6B] leading-tight mb-1">
            You're on the list
          </h1>
          <p className="text-[#64748B] text-[16px]">
            You are serving at {slot.time} {slot.massName}.
          </p>
        </div>
        <div className="border border-[#D1D9E8] rounded-2xl p-5 bg-white">
          <div className="mb-3">
            <SlotStatusPill status="serving" />
          </div>
          <p className="text-[#64748B] text-[14px] font-medium mb-1">
            {formatSlotDate(slot.date)}
          </p>
          <p className="text-[#1A202C] text-[22px] font-bold leading-tight mb-1">
            {slot.time}
          </p>
          <p className="text-[#64748B] text-[15px] leading-snug">
            {slot.massName}
          </p>
        </div>
        <SpotsMeter slot={slot} />
      </div>
      <div className="py-8 flex flex-col gap-4">
        {error && <p role="alert" className="text-sm font-medium text-[#C0392B]">{error}</p>}
        {slot.withinCutoff && (
          <div className="flex items-start gap-2 px-1">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="text-[#C9921A] flex-shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <path
                d="M8 2L14.5 13H1.5L8 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 6.5v3M8 11v.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-[#C9921A] text-[14px] leading-snug">
              This is coming up soon — cancelling this late may need your group
              leader's attention.
            </p>
          </div>
        )}
        <button
          onClick={onCancelSpot}
          className="w-full min-h-[56px] rounded-full bg-white border-2 border-[#1B3A6B] text-[#1B3A6B] text-[17px] font-bold hover:bg-[#F4F6FB] active:scale-[0.98] transition-all cursor-pointer"
        >
          Cancel my spot
        </button>
      </div>
    </div>
  )
}

export function SlotFilledScreen({
  onSeeOthers,
  onBack,
}: {
  onSeeOthers: () => void
  onBack?: () => void
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col px-5">
      {onBack && (
        <div className="pt-10">
          <BackButton onClick={onBack} label="Back" className="" />
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-3 text-center">
        <div className="w-20 h-20 rounded-full bg-[#F1F5F9] flex items-center justify-center">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="18"
              cy="18"
              r="15"
              stroke="#94A3B8"
              strokeWidth="2"
              fill="none"
            />
            <path
              d="M12 18h12"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M18 9v4M18 23v4"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <h1 className="text-[24px] font-extrabold text-[#1A202C] leading-tight mb-3">
            Sorry, this slot just filled up.
          </h1>
          <p className="text-[#64748B] text-[16px] leading-relaxed">
            Someone else took the last spot just before you. Try another open slot
            below.
          </p>
        </div>
        <div className="w-full">
          <button
            onClick={onSeeOthers}
            className="w-full min-h-[56px] rounded-full bg-[#1B3A6B] text-white text-[17px] font-bold hover:bg-[#142d54] active:scale-[0.98] transition-all cursor-pointer"
          >
            See other open slots
          </button>
        </div>
      </div>
    </div>
  )
}
