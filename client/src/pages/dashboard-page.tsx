import { ArrowRight, Bot, CalendarClock, MessageSquare, Plus, Wrench, Zap } from "lucide-react"

import { ActivityCard } from "@/components/activity-card"
import { PageHeader } from "@/components/page-header"
import { RoutinesCard } from "@/components/routines-card"
import { SectionCard } from "@/components/section-card"
import { StatusCard } from "@/components/status-card"
import { Button } from "@/components/ui/button"
import { useHealth } from "@/hooks/use-health"
import { useLog } from "@/hooks/use-log"
import type { Page } from "@/hooks/use-route"
import { cn } from "@/lib/utils"

export function DashboardPage({
  httpBase,
  onNavigate,
  onOpenTools,
}: {
  httpBase: string
  onNavigate: (page: Page) => void
  onOpenTools: () => void
}) {
  const health = useHealth(httpBase)
  const entries = useLog(httpBase)

  const today = new Date().toDateString()
  const todayEntries = entries.filter((e) => new Date(e.ts).toDateString() === today)
  const toolCounts = new Map<string, number>()
  for (const e of todayEntries)
    for (const s of e.steps ?? []) toolCounts.set(s.tool, (toolCounts.get(s.tool) ?? 0) + 1)
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCount = topTools[0]?.[1] ?? 1

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto p-4 sm:p-6">
      <PageHeader
        title="Dashboard"
        description="Mission control — everything Jarvis is running, at a glance."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onOpenTools} className="gap-1.5">
              <Wrench className="size-3.5" /> Tools
            </Button>
            <Button size="sm" onClick={() => onNavigate("chat")} className="gap-1.5">
              <MessageSquare className="size-3.5" /> Talk to Jarvis
            </Button>
          </div>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 duration-500 animate-in fade-in slide-in-from-bottom-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Backend"
          value={health.ok ? "Online" : "Offline"}
          accent={health.ok ? "text-success" : "text-destructive"}
        />
        <StatTile label="Model" value={health.model?.replace(/^claude-/, "") ?? "—"} small />
        <StatTile label="Tools" value={health.tools ?? "—"} />
        <StatTile label="Sessions" value={health.sessions ?? "—"} />
        <StatTile label="Routines" value={health.routines ?? "—"} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2 md:grid-cols-2 lg:grid-cols-3">
        {/* Today */}
        <SectionCard title="Today" icon={Zap}>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {todayEntries.length}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">interactions</span>
          </p>
          {topTools.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {topTools.map(([tool, count], i) => (
                <div key={tool} className="flex items-center gap-2 text-xs">
                  <span className="w-32 truncate font-mono text-[10px] text-muted-foreground">
                    {tool}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"][i]
                      )}
                      style={{ width: `${Math.max((count / maxCount) * 100, 8)}%` }}
                    />
                  </span>
                  <span className="w-4 text-right tabular-nums text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
          {topTools.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">No tool calls yet today.</p>
          )}
        </SectionCard>

        {/* Quick actions */}
        <SectionCard title="Quick actions" icon={Bot}>
          <div className="flex flex-col gap-1.5">
            <QuickAction
              icon={Plus}
              label="Schedule a routine"
              hint="e.g. morning briefing at 8:45"
              onClick={() => onNavigate("routines")}
            />
            <QuickAction
              icon={CalendarClock}
              label="Review today's activity"
              hint="every command and tool call"
              onClick={() => onNavigate("activity")}
            />
            <QuickAction
              icon={Wrench}
              label="Run a tool directly"
              hint="all connected capabilities"
              onClick={onOpenTools}
            />
          </div>
        </SectionCard>

        <StatusCard httpBase={httpBase} />
        <RoutinesCard httpBase={httpBase} />
        <div className="md:col-span-2 lg:col-span-2">
          <ActivityCard httpBase={httpBase} />
        </div>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  accent,
  small,
}: {
  label: string
  value: string | number
  accent?: string
  small?: boolean
}) {
  return (
    <div className="surface rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate font-semibold tabular-nums tracking-tight",
          small ? "text-sm leading-7" : "text-xl",
          accent
        )}
      >
        {value}
      </p>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Plus
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}
