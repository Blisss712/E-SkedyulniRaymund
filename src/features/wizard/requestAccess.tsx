import type { JoinRequestStatus } from "../admin/types"
import type { MinistryOption } from "./ministryOptions"

const WARNING = "\u26a0"
const CHECK = "\u2713"

/**
 * The "request access" form: pick the ministries from the parish's active ones
 * instead of typing a join code.
 *
 * A join request is stored against a single organization (organization_id is
 * NOT NULL), so every ministry the member ticks becomes its own request. The
 * list is built from the organizations they are allowed to read.
 */

/** Stable identity for an option; the offline demo list has no organization id. */
function ministryKey(option: MinistryOption) {
  return option.id ?? `name:${option.name}`
}

/** True when the member already ticked this ministry. */
function isMinistrySelected(
  selected: MinistryOption[],
  option: MinistryOption,
) {
  const key = ministryKey(option)
  return selected.some(item => ministryKey(item) === key)
}

/** Ticks the ministry, or unticks it when it was already selected. */
export function toggleMinistry(
  selected: MinistryOption[],
  option: MinistryOption,
) {
  const key = ministryKey(option)
  return isMinistrySelected(selected, option)
    ? selected.filter(item => ministryKey(item) !== key)
    : [...selected, option]
}

/** "Altar Servers", "Altar Servers and Lectors", "A, B and C". */
export function formatMinistryNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** One request the member just sent, and where it stands. */
export type MinistryRequestProgress = {
  name: string
  status: JoinRequestStatus
}

/**
 * The single headline for the "pending" screen. `reviewed` means every request
 * was answered but not all of them the same way.
 */
export function requestOutcome(
  progress: MinistryRequestProgress[],
): JoinRequestStatus | "reviewed" {
  if (progress.length === 0) return "pending"
  if (progress.some(item => item.status === "pending")) return "pending"
  if (progress.every(item => item.status === "approved")) return "approved"
  if (progress.every(item => item.status === "rejected")) return "rejected"
  return "reviewed"
}

/** The little "Pending" / "Approved" badge next to one ministry. */
export function MinistryRequestStatusPill({
  status,
}: {
  status: JoinRequestStatus
}) {
  const label =
    status === "approved"
      ? "Approved"
      : status === "rejected"
        ? "Not approved"
        : "Pending"
  const tone =
    status === "approved"
      ? "bg-[#237A57]/10 text-[#237A57]"
      : status === "rejected"
        ? "bg-[#C0392B]/10 text-[#C0392B]"
        : "bg-[#C9921A]/15 text-[#C9921A]"
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${tone}`}
    >
      {label}
    </span>
  )
}

export function MinistryRequestPicker({
  options,
  loading,
  loadError,
  selected,
  onToggle,
  onSelectAll,
  error,
}: {
  options: MinistryOption[]
  loading: boolean
  loadError: string
  selected: MinistryOption[]
  onToggle: (option: MinistryOption) => void
  onSelectAll: (selectAll: boolean) => void
  error: string
}) {
  const allSelected = options.length > 0 && selected.length === options.length
  const listReady = !loading && !loadError && options.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[#1A202C] font-semibold text-[17px]">Ministry</p>
        {listReady && (
          <button
            type="button"
            onClick={() => onSelectAll(!allSelected)}
            className="text-[14px] font-semibold text-[#1B3A6B] hover:underline cursor-pointer"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <p className="text-[#64748B] text-[15px] leading-snug">
        Choose every ministry you serve in — one, two, or all of them. An
        administrator will review each request.
      </p>

      {error && (
        <p
          role="alert"
          className="text-[#C0392B] text-[15px] font-medium flex items-center gap-1"
        >
          <span aria-hidden="true">{WARNING}</span> {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-[#64748B] text-[15px]">
          Loading ministries…
        </p>
      ) : loadError ? (
        <p role="alert" className="text-[#C0392B] text-[15px] font-medium">
          {loadError}
        </p>
      ) : options.length === 0 ? (
        <p className="text-[#64748B] text-[15px] leading-snug">
          No ministries are open for requests yet. Ask your parish coordinator to
          add your ministry, then try again.
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label="Ministry"
            className="max-h-[280px] overflow-y-auto rounded-xl border-2 border-[#D1D9E8] bg-white"
          >
            {options.map(option => {
              const checked = isMinistrySelected(selected, option)
              return (
                <button
                  key={ministryKey(option)}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggle(option)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    checked ? "bg-[#EFF4FB]" : "hover:bg-[#F4F6FB]"
                  }`}
                >
                  <span>
                    <span className="block text-[16px] font-bold text-[#1A202C]">
                      {option.name}
                    </span>
                    <span className="block text-[14px] text-[#64748B]">
                      {option.category}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] border-2 text-[14px] font-bold ${
                      checked
                        ? "border-[#1B3A6B] bg-[#1B3A6B] text-white"
                        : "border-[#D1D9E8] text-transparent"
                    }`}
                  >
                    {CHECK}
                  </span>
                </button>
              )
            })}
          </div>
          <p role="status" className="text-[14px] text-[#64748B]">
            {selected.length === 0
              ? "Tick at least one ministry to continue."
              : `${selected.length} of ${options.length} selected`}
          </p>
        </>
      )}
    </div>
  )
}
