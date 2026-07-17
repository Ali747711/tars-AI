import { useEffect, useRef, useState } from "react"
import { Mic, Radio, TriangleAlert } from "lucide-react"
import { TokenSource } from "livekit-client"
import {
  RoomAudioRenderer,
  SessionProvider,
  useSession,
} from "@livekit/components-react"

import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01"
import { PageHeader } from "@/components/page-header"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { useHealth } from "@/hooks/use-health"

// The aura shader takes a hex; our copper accent lives in CSS as oklch.
const COPPER = "#d97757"

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
      <VoiceSession session={session} />
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

function VoiceSession({ session }: { session: ReturnType<typeof useSession> }) {
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="relative flex size-16 items-center justify-center">
          <span className="orb-anim absolute inset-0 animate-ping rounded-full bg-primary/15" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-accent">
            <Mic className="size-6 text-primary" />
          </span>
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Talk to Jarvis
          </h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Speak from this browser — or your phone. Jarvis still runs every
            action on your Mac.
          </p>
        </div>
        <Button onClick={start} disabled={starting} className="gap-1.5">
          <Radio className="size-4" />
          {starting ? "Connecting…" : "Start conversation"}
        </Button>
        {error && (
          <p className="max-w-md text-xs text-destructive">
            {error}
            <span className="mt-1 block text-muted-foreground">
              Is the agent running? Start it with{" "}
              <code className="font-mono">python agent.py dev</code> in{" "}
              <code className="font-mono">livekit-agent/</code>.
            </span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      {/* The session view renders the visualizer + transcript + controls, but
          not audio playback — without this you see the aura and hear nothing. */}
      <RoomAudioRenderer room={session.room} />
      <AgentSessionView_01
        themeMode={isDark ? "dark" : "light"}
        audioVisualizerType="aura"
        audioVisualizerColor={COPPER}
        preConnectMessage="Jarvis is listening…"
        supportsVideoInput={false}
        supportsScreenShare={false}
      />
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
