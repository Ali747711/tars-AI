import { Cpu, LayoutGrid } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { JarvisStatus } from "@/hooks/use-jarvis"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<JarvisStatus, string> = {
  open: "LINK ACTIVE",
  connecting: "UPLINK…",
  closed: "OFFLINE",
}

const STATUS_CLASS: Record<JarvisStatus, string> = {
  open: "text-hud-cyan",
  connecting: "text-hud-amber",
  closed: "text-hud-red",
}

export function HudHeader({
  status,
  onOpenTools,
}: {
  status: JarvisStatus
  onOpenTools?: () => void
}) {
  return (
    <div className="hud-glass flex items-center gap-3 border-x-0 border-t-0 px-4 py-2.5">
      <Cpu className="text-hud-cyan hud-glow-text size-5" />
      <div className="flex-1">
        <h1 className="text-hud-cyan hud-glow-text text-sm font-semibold uppercase tracking-[0.4em]">J.A.R.V.I.S</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Just A Rather Very Intelligent System
        </p>
      </div>
      <div className={cn("font-mono text-[10px] uppercase tracking-widest", STATUS_CLASS[status])}>
        <span className={cn(status === "connecting" && "animate-pulse")}>●</span> {STATUS_LABEL[status]}
      </div>
      {onOpenTools && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onOpenTools}
          className="text-hud-cyan hover:bg-hud-cyan/10"
          title="Tools"
        >
          <LayoutGrid className="size-4" />
        </Button>
      )}
    </div>
  )
}
