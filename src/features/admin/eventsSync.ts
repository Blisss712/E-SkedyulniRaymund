export const EVENTS_CHANGED_EVENT = "eskedyul:events-changed"

export function notifyEventsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENTS_CHANGED_EVENT))
  }
}
