import type { MinistryOption } from "./ministryOptions"

const WARNING = "\u26a0"
const CHECK = "\u2713"

/**
 * The "request access" form: pick the ministry from the parish's active ones
 * instead of typing a join code.
 *
 * A join request is stored against an organization (organization_id is NOT
 * NULL), so the member has to name the ministry an administrator should add
 * them to. The list is built from the organizations they are allowed to read.
 */
export function MinistryRequestPicker({
  options,
  loading,
  loadError,
  selected,
  onSelect,
  error,
}: {
  options: MinistryOption[]
  loading: boolean
  loadError: string
  selected: MinistryOption | null
  onSelect: (option: MinistryOption) => void
  error: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[#1A202C] font-semibold text-[17px]">Ministry</p>
      <p className="text-[#64748B] text-[15px] leading-snug">
        Choose the ministry you serve in. An administrator will review your
        request.
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
        <div
          role="radiogroup"
          aria-label="Ministry"
          className="max-h-[280px] overflow-y-auto rounded-xl border-2 border-[#D1D9E8] bg-white"
        >
          {options.map(option => {
            const checked =
              selected?.id === option.id && selected?.name === option.name
            return (
              <button
                key={option.id ?? option.name}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onSelect(option)}
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
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 text-[14px] font-bold ${
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
      )}
    </div>
  )
}
