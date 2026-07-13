import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type HudFrameProps = {
  children: ReactNode
  className?: string
  tone?: "cyan" | "gold" | "red"
}

const TONE_CLASS: Record<NonNullable<HudFrameProps["tone"]>, string> = {
  cyan: "border-hud-cyan/60",
  gold: "border-hud-gold/70",
  red: "border-hud-red/70",
}

export function HudFrame({ children, className, tone = "cyan" }: HudFrameProps) {
  const toneClass = TONE_CLASS[tone]

  return (
    <div className={cn("hud-glass relative", className)}>
      <span aria-hidden className={cn("pointer-events-none absolute size-3 top-0 left-0 border-t-2 border-l-2", toneClass)} />
      <span aria-hidden className={cn("pointer-events-none absolute size-3 top-0 right-0 border-t-2 border-r-2", toneClass)} />
      <span aria-hidden className={cn("pointer-events-none absolute size-3 bottom-0 left-0 border-b-2 border-l-2", toneClass)} />
      <span aria-hidden className={cn("pointer-events-none absolute size-3 bottom-0 right-0 border-b-2 border-r-2", toneClass)} />
      {children}
    </div>
  )
}
