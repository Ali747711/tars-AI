import { BrandLogo } from "@/components/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import type { CoreState } from "@/hooks/use-core-state"
import type { JarvisStatus } from "@/hooks/use-jarvis"
import { cn } from "@/lib/utils"

const SUBTITLE: Record<CoreState, string> = {
  idle: "Ready when you are",
  thinking: "Thinking…",
  listening: "Listening…",
  speaking: "Speaking…",
  "awaiting-auth": "Waiting for your OK",
  connecting: "Connecting…",
  offline: "Offline",
  error: "Something went wrong",
}

export function AppHeader({
  status,
  coreState,
  onOpenTools,
}: {
  status: JarvisStatus
  coreState: CoreState
  onOpenTools: () => void
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
      <BrandLogo name="claude" className="size-7" />
      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-semibold tracking-tight">Jarvis</h1>
        <p className="truncate text-xs text-muted-foreground">{SUBTITLE[coreState]}</p>
      </div>

      <StatusPill status={status} />

      <Button type="button" size="sm" variant="outline" onClick={onOpenTools} className="gap-1.5">
        <BrandLogo name="tools" className="size-4" />
        <span className="hidden sm:inline">Tools</span>
      </Button>
      <ThemeToggle />
    </header>
  )
}

function StatusPill({ status }: { status: JarvisStatus }) {
  const label = status === "open" ? "Online" : status === "connecting" ? "Connecting" : "Offline"
  const dot =
    status === "open" ? "bg-success" : status === "connecting" ? "bg-chart-3" : "bg-destructive"
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:flex">
      <span className={cn("size-1.5 rounded-full", dot, status === "connecting" && "animate-pulse")} />
      {label}
    </div>
  )
}
