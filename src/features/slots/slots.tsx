import type { Slot, SlotStatus } from "../../shared/slot"

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

// ─── Screens ──────────────────────────────────────────────────────────────────

export function SlotList({
  slots,
  onSlotTap,
}: {
  slots: Slot[]
  onSlotTap: (slot: Slot) => void
}) {
  const grouped = groupSlotsByDate(slots)

  return (
    <div>
      <p className="text-2xl font-extrabold text-[#1B3A6B]">Open Slots</p>
      <p className="mb-4 mt-1 text-[17px] leading-relaxed text-[#64748B]">
        Upcoming slots you can volunteer for.
      </p>

      <div className="overflow-hidden rounded-2xl border border-[#D1D9E8] bg-white">
        {slots.length === 0 ? (
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
              No slots scheduled yet
            </p>
            <p className="text-[#64748B] text-[15px] leading-relaxed">
              Your group coordinator hasn't added any upcoming slots. Check back
              soon.
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
                {daySlots.map((slot) => (
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
                ))}
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
  const remaining = slot.totalSpots - slot.filledSpots

  return (
    <div className="min-h-screen bg-white flex flex-col px-5">
      <div className="pt-12 pb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[#1B3A6B] text-[15px] font-medium hover:opacity-70 transition-opacity cursor-pointer"
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
          Back
        </button>
      </div>
      <div className="flex-1 flex flex-col gap-6">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#1B3A6B] leading-tight mb-1">
            Open slot
          </h1>
          <p className="text-[#64748B] text-[16px]">
            Review the details and volunteer if you're free.
          </p>
        </div>
        <SlotDetailCard slot={slot} />
        <div className="flex items-center gap-3 px-1">
          <div className="flex gap-1">
            {Array.from({ length: slot.totalSpots }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${
                  i < slot.filledSpots
                    ? "bg-[#1B3A6B]"
                    : "border-2 border-[#D1D9E8]"
                }`}
              />
            ))}
          </div>
          <p className="text-[#64748B] text-[15px]">
            <span className="font-semibold text-[#1A202C]">
              {slot.filledSpots} of {slot.totalSpots}
            </span>{" "}
            spots filled
            {remaining === 1 && (
              <span className="text-[#C9921A] font-semibold">
                {" "}
                · Last spot!
              </span>
            )}
          </p>
        </div>
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
      <div className="pt-12 pb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[#1B3A6B] text-[15px] font-medium hover:opacity-70 transition-opacity cursor-pointer"
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
          Back
        </button>
      </div>
      <div className="flex-1 flex flex-col gap-6">
        <div>
          <h1 className="text-[26px] font-extrabold text-[#1B3A6B] leading-tight mb-1">
            Your slot
          </h1>
          <p className="text-[#64748B] text-[16px]">
            You've already volunteered for this one.
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
        <div className="flex items-center gap-3 px-1">
          <div className="flex gap-1">
            {Array.from({ length: slot.totalSpots }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${
                  i < slot.filledSpots
                    ? "bg-[#1B3A6B]"
                    : "border-2 border-[#D1D9E8]"
                }`}
              />
            ))}
          </div>
          <p className="text-[#64748B] text-[15px]">
            <span className="font-semibold text-[#1A202C]">
              {slot.filledSpots} of {slot.totalSpots}
            </span>{" "}
            spots filled
          </p>
        </div>
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

export function SlotFilledScreen({ onSeeOthers }: { onSeeOthers: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8 text-center gap-8">
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
  )
}
