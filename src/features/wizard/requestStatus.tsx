import { Button } from "../../shared/ui"
import { PENDING_STEPS } from "./data"
import {
  MinistryRequestStatusPill,
  formatMinistryNames,
  requestOutcome,
  type MinistryRequestProgress,
} from "./requestAccess"

/**
 * The body of the "request on its way" screen, shared by the phone and desktop
 * layouts so both say the same thing when one or several ministries are asked
 * for. Each request is reviewed on its own, so a member who ticks three
 * ministries can end up approved by two and refused by one.
 */
export function JoinRequestOutcome({
  progress,
  fallbackName,
  onBack,
  onApproved,
}: {
  progress: MinistryRequestProgress[]
  /** The group name shown when the request list is empty. */
  fallbackName: string
  onBack: () => void
  onApproved: () => void
}) {
  const outcome = requestOutcome(progress)
  const names = progress.length > 0 ? progress.map(item => item.name) : [fallbackName]
  const multiple = names.length > 1
  const isApproved = outcome === "approved"
  const isRejected = outcome === "rejected"
  const isReviewed = outcome === "reviewed"

  const tone = isApproved
    ? "text-[#237A57]"
    : isRejected
      ? "text-[#C0392B]"
      : isReviewed
        ? "text-[#1B3A6B]"
        : "text-[#C9921A]"

  const headline = isApproved
    ? multiple
      ? "Your requests were approved!"
      : "Your request was approved!"
    : isRejected
      ? multiple
        ? "Your requests were not approved"
        : "Your request was not approved"
      : isReviewed
        ? "Your requests were reviewed"
        : multiple
          ? "Your requests are on their way!"
          : "Your request is on its way!"

  const advice = isApproved
    ? "You can now continue to your ministry dashboard."
    : isRejected
      ? "You can start over and submit a new request if you believe this was a mistake."
      : isReviewed
        ? "At least one of your requests was approved. Open the dashboard to see where you serve, and ask your group leader about any request that was not approved."
        : multiple
          ? "Each ministry's leader needs to approve your requests. This usually happens within 1–2 days."
          : "The group leader needs to approve your request. This usually happens within 1–2 days."

  const steps = isApproved
    ? [
        multiple
          ? "Your requests were reviewed by an administrator."
          : "Your request was reviewed by an administrator.",
        "You can continue to your ministry dashboard.",
      ]
    : isRejected
      ? [
          multiple
            ? "Your requests were reviewed by an administrator."
            : "Your request was reviewed by an administrator.",
          "Contact your group leader if you need more information.",
        ]
      : isReviewed
        ? [
            "Your requests were reviewed by an administrator.",
            "Some were approved and some were not. Contact your group leader if you need help.",
          ]
        : multiple
          ? [
              "Your requests were sent to each ministry.",
              "Each leader will review and approve your request.",
            ]
          : PENDING_STEPS

  return (
    <>
      <div className="text-center">
        <h2 className={`text-2xl font-bold mb-2 ${tone}`}>{headline}</h2>
        <p className="text-[#1A202C] text-[17px] leading-relaxed">
          {multiple ? (
            <>
              You've asked to join <strong>{formatMinistryNames(names)}</strong>.
            </>
          ) : (
            <>
              You've asked to join the <strong>{names[0]}</strong> group.
            </>
          )}
        </p>
      </div>

      <div className="bg-[#FEF3DC] border border-[#C9921A]/30 rounded-2xl p-6 w-full">
        <p className="text-[#1A202C] text-[17px] leading-relaxed">{advice}</p>
      </div>

      {multiple && (
        <div className="w-full rounded-2xl border border-[#D1D9E8] bg-white p-4">
          <p className="text-[#64748B] text-[13px] font-semibold uppercase tracking-wide mb-2">
            Your requests
          </p>
          <ul className="flex flex-col gap-2">
            {progress.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-[15px] font-semibold text-[#1A202C]">
                  {item.name}
                </span>
                <MinistryRequestStatusPill status={item.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="w-full">
        <div className="bg-white border border-[#D1D9E8] rounded-xl p-4">
          <p className="text-[#64748B] text-[15px] font-semibold uppercase tracking-wide mb-1">
            What's next?
          </p>
          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li
                key={index}
                className="flex items-start gap-3 text-[15px] text-[#1A202C]"
              >
                <span className="min-w-[24px] h-6 rounded-full bg-[#C9921A]/15 text-[#C9921A] font-bold text-[13px] flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="w-full border-t border-[#D1D9E8] pt-5 flex flex-col gap-3">
        {!isRejected && (
          <Button
            onClick={onApproved}
            variant="primary"
            disabled={!isApproved && !isReviewed}
          >
            {isApproved || isReviewed ? "Continue to dashboard" : "Awaiting approval"}
          </Button>
        )}
        <Button onClick={onBack} variant="ghost">
          ← Start Over
        </Button>
      </div>
    </>
  )
}
