import { AppWindow, Battery, Cpu } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { SectionCard } from "@/components/section-card"
import { useHudData } from "@/hooks/use-hud-data"

export function StatusCard({ httpBase }: { httpBase: string }) {
  const data = useHudData(httpBase)
  return (
    <SectionCard title="Status" icon={Cpu}>
      <div className="flex flex-col gap-2">
        <Row icon={Battery} label="Battery" value={data.battery} />
        <Row icon={AppWindow} label="Focused" value={data.app} />
        <Row logo="chrome" label="Tab" value={data.tab} />
        <Row logo="spotify" label="Playing" value={data.music} />
      </div>
    </SectionCard>
  )
}

function Row({
  icon: Icon,
  logo,
  label,
  value,
}: {
  icon?: LucideIcon
  logo?: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {logo ? (
        <BrandLogo name={logo} className="size-4" />
      ) : Icon ? (
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}
