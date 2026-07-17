import { CalendarClock, Cpu, Radio, Wifi, WifiOff } from "lucide-react"

import { ActivityCard } from "@/components/activity-card"
import SoftAurora from "@/components/jarvis/soft-aurora"
import { SectionCard } from "@/components/section-card"
import { StatusCard } from "@/components/status-card"
import { Button } from "@/components/ui/button"
import { useHealth } from "@/hooks/use-health"
import { useRoutines } from "@/hooks/use-routines"
import { cn } from "@/lib/utils"

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

/**
 * The Voice landing (pre-connect): a cinematic home dashboard. A SoftAurora
 * shader glows behind the hero + Start CTA, with live ambient cards (Mac
 * status, recent activity, active routines) below. One click starts talking.
 */
export function VoiceHome({
  httpBase,
  onStart,
  starting,
  error,
}: {
  httpBase: string
  onStart: () => void
  starting: boolean
  error: string | null
}) {
  const health = useHealth(httpBase)
  const { routines } = useRoutines(httpBase)
  const activeRoutines = routines.filter((r) => r.enabled)

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      {/* Aurora glows behind the hero; tuned to the copper HUD palette. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] opacity-70">
        <SoftAurora
          color1="#f5c89a"
          color2="#d9552e"
          speed={0.5}
          scale={1.4}
          brightness={0.95}
          bandHeight={0.62}
          bandSpread={1.0}
          colorSpeed={0.4}
          mouseInfluence={0.15}
        />
      </div>
      {/* Fade the aurora into the page so cards stay legible. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-linear-to-b from-transparent via-transparent to-background" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-[14vh] pb-8 sm:px-6">
        {/* Hero */}
        <p className="mb-3 animate-in text-sm text-muted-foreground duration-700 fade-in">
          {greeting()}, sir
        </p>
        <h1 className="animate-in text-center text-3xl font-semibold tracking-tight duration-700 fade-in slide-in-from-bottom-2">
          Talk to Jarvis
        </h1>
        <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
          Speak from this browser — or your phone. Jarvis still runs every
          action on your Mac.
        </p>

        <Button
          onClick={onStart}
          disabled={starting}
          size="lg"
          className="mt-6 animate-in gap-2 shadow-lg shadow-primary/20 duration-700 zoom-in-95 fade-in"
        >
          <Radio className="size-4" />
          {starting ? "Connecting…" : "Start conversation"}
        </Button>

        <StatusLine
          ok={health.ok}
          tools={health.tools}
          routines={activeRoutines.length}
          model={health.model}
        />

        {error && (
          <p className="mt-4 max-w-md text-center text-xs text-destructive">
            {error}
            <span className="mt-1 block text-muted-foreground">
              Is the agent running? Start it with{" "}
              <code className="font-mono">python agent.py dev</code> in{" "}
              <code className="font-mono">livekit-agent/</code>.
            </span>
          </p>
        )}

        {/* Ambient dashboard */}
        <div className="mt-10 grid w-full animate-in grid-cols-1 gap-3 duration-700 fade-in slide-in-from-bottom-3 md:grid-cols-3">
          <StatusCard httpBase={httpBase} />
          <ActivityCard httpBase={httpBase} />
          <SectionCard title="Active routines" icon={CalendarClock}>
            {activeRoutines.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active routines. Add one on the Routines page.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {activeRoutines.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full bg-success" />
                    <span className="min-w-0 flex-1 truncate">
                      {r.name || r.prompt}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {r.cron}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function StatusLine({
  ok,
  tools,
  routines,
  model,
}: {
  ok: boolean
  tools?: number
  routines: number
  model?: string
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "flex items-center gap-1",
          ok ? "text-success" : "text-destructive"
        )}
      >
        {ok ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {ok ? "online" : "offline"}
      </span>
      {typeof tools === "number" && (
        <>
          <Dot />
          <span className="flex items-center gap-1">
            <Cpu className="size-3.5" />
            {tools} tools
          </span>
        </>
      )}
      <Dot />
      <span>{routines} active routines</span>
      {model && (
        <>
          <Dot />
          <span className="font-mono">{model.replace(/^claude-/, "")}</span>
        </>
      )}
    </div>
  )
}

const Dot = () => <span className="text-muted-foreground/40">·</span>
