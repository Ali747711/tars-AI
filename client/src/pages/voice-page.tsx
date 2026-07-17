import { useEffect, useRef, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { TokenSource } from "livekit-client"
import {
  RoomAudioRenderer,
  SessionProvider,
  useSession,
} from "@livekit/components-react"

import { ConversationView } from "@/components/jarvis/conversation-view"
import { VoiceHome } from "@/components/jarvis/voice-home"
import { PageHeader } from "@/components/page-header"
import { useTheme } from "@/components/theme-provider"
import { useHealth } from "@/hooks/use-health"

export function VoicePage({ httpBase }: { httpBase: string }) {
  const health = useHealth(httpBase)

  if (health.livekit === true) return <VoiceRoom httpBase={httpBase} />
  if (health.ok) return <NotConfigured />
  return <Waiting />
}

/**
 * Mounted only once LiveKit is known to be configured: useSession immediately
 * pre-fetches a token to warm the connection, which would otherwise fail
 * noisily against a backend that has no credentials.
 */
function VoiceRoom({ httpBase }: { httpBase: string }) {
  const [tokenSource] = useState(() =>
    TokenSource.endpoint(`${httpBase}/livekit/token`)
  )
  const session = useSession(tokenSource, {
    roomName: "jarvis",
    participantName: "You",
  })

  return (
    <SessionProvider session={session}>
      <VoiceSession session={session} httpBase={httpBase} />
    </SessionProvider>
  )
}

function Waiting() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        Connecting to the backend…
      </p>
    </div>
  )
}

function VoiceSession({
  session,
  httpBase,
}: {
  session: ReturnType<typeof useSession>
  httpBase: string
}) {
  const { theme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  // Resolve "system" to what's actually on the document, so the aura shader
  // blends against the real background. Derived at render — the class is
  // already applied by ThemeProvider before we paint.
  const isDark =
    theme === "dark" ||
    (theme === "system" && document.documentElement.classList.contains("dark"))

  // Leaving the page should hang up rather than keep the mic open. useSession
  // returns a fresh object on every connection-state change, so we hold the
  // latest in a ref and end() only on real unmount — keying the effect on
  // [session] would fire end() mid-connect and tear down the call instantly.
  const sessionRef = useRef(session)
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  useEffect(() => () => void sessionRef.current.end().catch(() => {}), [])

  const start = async () => {
    setError(null)
    setStarting(true)
    try {
      await session.start()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  if (!session.isConnected) {
    return (
      <VoiceHome
        httpBase={httpBase}
        onStart={start}
        starting={starting}
        error={error}
      />
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* ConversationView renders the visualizer + transcript + controls, but
          not audio playback — without this you see the aura and hear nothing. */}
      <RoomAudioRenderer room={session.room} />
      <ConversationView themeMode={isDark ? "dark" : "light"} />
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto p-4 sm:p-6">
      <PageHeader
        title="Voice"
        description="Talk to Jarvis from the browser or your phone."
      />
      <div className="surface rounded-xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert className="size-4 text-chart-3" />
          LiveKit isn’t configured yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Browser voice needs a LiveKit project to relay audio — the terminal
          agent (
          <code className="font-mono text-xs">python agent.py console</code>)
          works without one.
        </p>
        <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Create a free project at{" "}
            <a
              href="https://cloud.livekit.io"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              cloud.livekit.io
            </a>
          </li>
          <li>
            Add <code className="font-mono text-xs">LIVEKIT_URL</code>,{" "}
            <code className="font-mono text-xs">LIVEKIT_API_KEY</code> and{" "}
            <code className="font-mono text-xs">LIVEKIT_API_SECRET</code> to{" "}
            <code className="font-mono text-xs">applescript-mcp/.env</code>
          </li>
          <li>
            Restart the backend, then run the agent with{" "}
            <code className="font-mono text-xs">python agent.py dev</code>
          </li>
        </ol>
      </div>
    </div>
  )
}
