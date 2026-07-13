import { AppWindow, Battery, Globe, Music } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { useHudData } from "@/hooks/use-hud-data"

/** Live status readouts polled from the backend, shown beneath the core. */
export function HudWidgets({ httpBase }: { httpBase: string }) {
  const data = useHudData(httpBase)
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 pb-1">
      <Widget icon={Battery} value={data.battery} />
      <Widget icon={AppWindow} value={data.app} />
      <Widget icon={Globe} value={data.tab} />
      <Widget icon={Music} value={data.music} />
    </div>
  )
}

function Widget({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <Icon className="size-3 text-hud-cyan/70" />
      <span className="max-w-[16ch] truncate text-foreground/70">{value}</span>
    </div>
  )
}
