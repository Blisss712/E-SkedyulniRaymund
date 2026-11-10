import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { isSupabaseConfigured } from "../../lib/supabase"
import { useAuth } from "../auth/AuthContext"
import { fetchConversations, subscribeToInbox } from "./api"
import { readDemoConversations } from "./demo"
import type { ChatConversation } from "./types"

type MessagingContextValue = {
  conversations: ChatConversation[]
  loading: boolean
  error: string
  /** Total unread messages across every conversation. */
  unreadTotal: number
  /** Reloads the inbox and resolves with the fresh list. */
  refresh: () => Promise<ChatConversation[]>
}

const MessagingContext = createContext<MessagingContextValue | undefined>(
  undefined,
)

/**
 * The signed-in account's inbox.
 *
 * It lives above the screens so the Messages tab, the admin workspace, and the
 * open chat all agree on unread counts. Realtime subscriptions refresh it when a
 * message arrives or the account is added to an organization's group chat.
 */
export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? ""

  const [conversations, setConversations] = useState<ChatConversation[]>(
    isSupabaseConfigured ? [] : readDemoConversations(),
  )
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState("")

  const refresh = useCallback(async (): Promise<ChatConversation[]> => {
    if (!isSupabaseConfigured) {
      const demo = readDemoConversations()
      setConversations(demo)
      setLoading(false)
      setError("")
      return demo
    }

    if (!userId) {
      setConversations([])
      setLoading(false)
      setError("")
      return []
    }

    try {
      const items = await fetchConversations()
      setConversations(items)
      setError("")
      return items
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load your messages.",
      )
      return []
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Load when the account changes.
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Keep the inbox live while the account is signed in.
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return

    const unsubscribe = subscribeToInbox(userId, () => {
      void refresh()
    })
    // Realtime is the fast path; the timer covers projects where the publication
    // was not extended for some reason.
    const timer = window.setInterval(() => {
      void refresh()
    }, 60_000)

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", refreshWhenVisible)

    return () => {
      unsubscribe()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [userId, refresh])

  const unreadTotal = useMemo(
    () => conversations.reduce((total, item) => total + item.unreadCount, 0),
    [conversations],
  )

  return (
    <MessagingContext.Provider
      value={{ conversations, loading, error, unreadTotal, refresh }}
    >
      {children}
    </MessagingContext.Provider>
  )
}

export function useMessaging() {
  const context = useContext(MessagingContext)
  if (!context) {
    throw new Error("useMessaging must be used within a MessagingProvider")
  }
  return context
}
