import {
  Brain,
  CalendarClock,
  History,
  LayoutDashboard,
  MessageSquare,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { Page } from "@/hooks/use-route"
import { cn } from "@/lib/utils"

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "chat", label: "Chat", icon: MessageSquare },
  { page: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "routines", label: "Routines", icon: CalendarClock },
  { page: "activity", label: "Activity", icon: History },
  { page: "memory", label: "Memory", icon: Brain },
]

/** Icon nav rail. Bottom slot opens the tools palette. */
export function AppSidebar({
  page,
  onNavigate,
  onOpenTools,
}: {
  page: Page
  onNavigate: (page: Page) => void
  onOpenTools: () => void
}) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar/60 py-2">
      {NAV.map(({ page: p, label, icon: Icon }) => (
        <button
          key={p}
          type="button"
          title={label}
          aria-label={label}
          aria-current={page === p ? "page" : undefined}
          onClick={() => onNavigate(p)}
          className={cn(
            "group relative flex size-10 items-center justify-center rounded-lg transition-colors",
            page === p
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
          )}
        >
          {/* active indicator: thin copper bar hugging the rail edge */}
          <span
            className={cn(
              "absolute -left-2 h-5 w-0.5 rounded-full bg-primary transition-opacity",
              page === p ? "opacity-100" : "opacity-0"
            )}
          />
          <Icon className="size-4.5" />
        </button>
      ))}

      <div className="flex-1" />

      <button
        type="button"
        title="Tools"
        aria-label="Tools"
        onClick={onOpenTools}
        className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
      >
        <Wrench className="size-4.5" />
      </button>
    </nav>
  )
}
